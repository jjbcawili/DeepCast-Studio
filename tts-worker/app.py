import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import requests
import soundfile as sf
import gradio as gr
from kokoro import KPipeline
from chatterbox_engine import download_reference, synthesize_chatterbox
from engine_adapters import (
    synthesize_dia2_dialogue,
    synthesize_f5,
    synthesize_fish_s2,
    synthesize_gpu_bridge,
    synthesize_orpheus,
)

SAMPLE_RATE = 24000
SHARED_SECRET = os.environ.get("TTS_SHARED_SECRET", "")
_PIPELINES = {}
REFERENCE_ENGINES = {"chatterbox-nano", "chatterbox-turbo", "f5-tts", "fish-s2", "dia2"}
SUPPORTED_ENGINES = REFERENCE_ENGINES | {"groq-orpheus", "kokoro"}


def pipeline_for(voice: str):
    code = "b" if str(voice).startswith("b") else "a"
    if code not in _PIPELINES:
        _PIPELINES[code] = KPipeline(lang_code=code)
    return _PIPELINES[code]


def safe_voice(voice: str, fallback: str):
    value = str(voice or "").strip()
    return value if re.match(r"^[ab][fm]_[a-z0-9_]+$", value) else fallback


def speed_for(pace: str):
    p = str(pace or "").lower()
    if p == "slow":
        return 0.92
    if p == "fast":
        return 1.08
    return 1.0


def synth_text(text: str, voice: str, pace: str):
    chunks = []
    generator = pipeline_for(voice)(text.strip(), voice=voice, speed=speed_for(pace), split_pattern=r"\n+")
    for _, _, audio in generator:
        arr = audio.numpy() if hasattr(audio, "numpy") else np.asarray(audio)
        chunks.append(arr.astype(np.float32))
    if not chunks:
        return np.zeros(int(SAMPLE_RATE * 0.25), dtype=np.float32)
    return np.concatenate(chunks)


def stereo_turn(audio: np.ndarray, pan: float):
    pan = max(-1.0, min(1.0, float(pan)))
    angle = (pan + 1.0) * np.pi / 4.0
    gain = np.sqrt(2.0)
    left = audio * np.cos(angle) * gain
    right = audio * np.sin(angle) * gain
    return np.clip(np.stack([left, right], axis=1), -1.0, 1.0).astype(np.float32)


def standard_stereo(audio: np.ndarray):
    return np.stack([audio, audio], axis=1).astype(np.float32)


def resample_audio(audio: np.ndarray, source_rate: int):
    if int(source_rate) == SAMPLE_RATE:
        return audio.astype(np.float32)
    duration = len(audio) / float(source_rate)
    if duration <= 0:
        return np.zeros(int(SAMPLE_RATE * 0.25), dtype=np.float32)
    old_x = np.linspace(0.0, duration, num=len(audio), endpoint=False)
    new_len = max(1, int(round(duration * SAMPLE_RATE)))
    new_x = np.linspace(0.0, duration, num=new_len, endpoint=False)
    return np.interp(new_x, old_x, audio).astype(np.float32)


def engine_for(config: dict):
    value = str(config.get("ttsEngine") or os.environ.get("DEEPCAST_TTS_ENGINE") or "chatterbox-nano").strip().lower()
    return value if value in SUPPORTED_ENGINES else "chatterbox-nano"


def parse_dialogue(script: str, host1: dict, host2: dict):
    name1 = str(host1.get("name") or "Jiro").strip()
    name2 = str(host2.get("name") or "Sharpay").strip()
    turns = []
    current = None
    buffer = []
    for raw in str(script).splitlines():
        line = raw.strip()
        if not line:
            continue
        matched = None
        for who in (name1, name2):
            prefix = f"{who}:"
            if line.lower().startswith(prefix.lower()):
                matched = who
                content = line[len(prefix):].strip()
                break
        if matched:
            if current and buffer:
                turns.append((current, " ".join(buffer)))
            current, buffer = matched, [content]
        elif current:
            buffer.append(line)
    if current and buffer:
        turns.append((current, " ".join(buffer)))
    if not turns:
        turns = [(name1, str(script))]
    return turns


def dia2_dialogue_script(script: str, host1: dict, host2: dict):
    name1 = str(host1.get("name") or "Jiro").strip().lower()
    lines = []
    for who, text in parse_dialogue(script, host1, host2):
        tag = "[S1]" if who.lower() == name1 else "[S2]"
        lines.append(f"{tag} {text}")
    return "\n".join(lines)


def require_secret(payload: dict):
    if not SHARED_SECRET or payload.get("sharedSecret") != SHARED_SECRET:
        raise ValueError("Unauthorized TTS worker request")


def upload(path: Path, callback_url: str):
    mime = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav"}.get(path.suffix.lower(), "application/octet-stream")
    with path.open("rb") as handle:
        r = requests.put(callback_url, data=handle, headers={"Authorization": f"Bearer {SHARED_SECRET}", "Content-Type": mime}, timeout=180)
    r.raise_for_status()


def synthesize(payload_json: str) -> str:
    payload = json.loads(payload_json)
    require_secret(payload)
    host1, host2 = payload.get("host1") or {}, payload.get("host2") or {}
    voice1 = safe_voice(host1.get("voice"), "am_michael")
    voice2 = safe_voice(host2.get("voice"), "af_heart")
    turns = parse_dialogue(payload.get("script") or "", host1, host2)
    pieces = []
    spatial = str(payload.get("audioOutput") or "Spatial Stereo").lower().startswith("spatial")
    turn_gap = np.zeros((int(SAMPLE_RATE * 0.18), 2), dtype=np.float32)
    secret = str(payload.get("sharedSecret") or SHARED_SECRET)
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        references = {}
        for slot, config in (("host1", host1), ("host2", host2)):
            engine = engine_for(config)
            if engine in REFERENCE_ENGINES:
                source = td_path / f"{slot}-reference-source"
                wav_ref = td_path / f"{slot}-reference.wav"
                download_reference(str(config.get("voiceReferenceUrl") or ""), secret, source)
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-ac", "1", "-ar", str(SAMPLE_RATE), "-t", "20", str(wav_ref)],
                    check=True,
                )
                references[slot] = wav_ref

        engine1, engine2 = engine_for(host1), engine_for(host2)
        if engine1 == "dia2" and engine2 == "dia2":
            # Dia2 is a native two-speaker model. Generate the whole segment together
            # rather than destroying its dialogue context one turn at a time.
            mono, rate = synthesize_dia2_dialogue(
                dia2_dialogue_script(payload.get("script") or "", host1, host2),
                references["host1"],
                references["host2"],
                host1,
                host2,
            )
            mono = resample_audio(mono, rate)
            pieces.append(standard_stereo(mono))
        else:
            for who, turn_text in turns:
                is_host1 = who.lower() == str(host1.get("name") or "Jiro").lower()
                config = host1 if is_host1 else host2
                slot = "host1" if is_host1 else "host2"
                engine = engine_for(config)

                if engine.startswith("chatterbox"):
                    mono, rate = synthesize_chatterbox(turn_text, engine, references[slot])
                    mono = resample_audio(mono, rate)
                elif engine == "f5-tts":
                    mono, rate = synthesize_f5(
                        turn_text,
                        references[slot],
                        config.get("voiceReferenceText") or "",
                        config.get("pace") or "Medium",
                    )
                    mono = resample_audio(mono, rate)
                elif engine == "fish-s2":
                    mono, rate = synthesize_fish_s2(turn_text, references[slot], config)
                    mono = resample_audio(mono, rate)
                elif engine == "dia2":
                    # Mixed-engine episodes can still use the bridge in single-speaker mode.
                    mono, rate = synthesize_gpu_bridge("dia2", turn_text, references[slot], config)
                    mono = resample_audio(mono, rate)
                elif engine == "groq-orpheus":
                    mono, rate = synthesize_orpheus(
                        turn_text,
                        config.get("voice") or ("daniel" if is_host1 else "hannah"),
                        config.get("style") or "",
                        config.get("pace") or "Medium",
                    )
                    mono = resample_audio(mono, rate)
                else:
                    voice = voice1 if is_host1 else voice2
                    mono = synth_text(turn_text, voice, config.get("pace") or "Medium")

                turn = stereo_turn(mono, -0.16 if is_host1 else 0.16) if spatial else standard_stereo(mono)
                pieces.append(turn)
                pieces.append(turn_gap)

        audio = np.concatenate(pieces, axis=0) if pieces else turn_gap
        wav = td_path / "segment.wav"
        mp3 = td_path / "segment.mp3"
        sf.write(wav, audio, SAMPLE_RATE, subtype="PCM_16")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ar", "44100", "-b:a", "128k", str(mp3)], check=True)
        upload(mp3, payload["callbackUrl"])
    return json.dumps({"ok": True, "segmentIndex": payload.get("segmentIndex"), "engines": [engine_for(host1), engine_for(host2)]})


def mix(payload_json: str) -> str:
    payload = json.loads(payload_json)
    require_secret(payload)
    urls = payload.get("segmentUrls") or []
    if not urls:
        raise ValueError("No segment URLs supplied")
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        files = []
        headers = {"Authorization": f"Bearer {payload.get('downloadToken') or SHARED_SECRET}"}
        for i, url in enumerate(urls):
            target = td_path / f"segment-{i:03d}.mp3"
            with requests.get(url, headers=headers, stream=True, timeout=180) as r:
                r.raise_for_status()
                with target.open("wb") as f:
                    for chunk in r.iter_content(1024 * 1024):
                        if chunk:
                            f.write(chunk)
            files.append(target)
        concat = td_path / "concat.txt"
        concat.write_text("\n".join(f"file '{p.as_posix()}'" for p in files), encoding="utf-8")
        joined = td_path / "joined.mp3"
        fmt = str(payload.get("downloadFormat") or "mp3").lower()
        if fmt not in {"mp3", "m4a", "wav"}:
            fmt = "mp3"
        final = td_path / f"final.{fmt}"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(joined)], check=True)
        # Reliable stereo export. Dolby/true Atmos requires a dedicated licensed encode path, so we never fake that label.
        if fmt == "wav":
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(final)]
        elif fmt == "m4a":
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined), "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "160k", str(final)]
        else:
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined), "-ac", "2", "-ar", "44100", "-b:a", "128k", str(final)]
        subprocess.run(cmd, check=True)
        upload(final, payload["callbackUrl"])
    return json.dumps({"ok": True, "format": fmt, "mix": "stereo"})


def preview(payload_json: str) -> str:
    payload = json.loads(payload_json)
    require_secret(payload)
    voice = safe_voice(payload.get("voice"), "af_heart")
    text = str(payload.get("text") or "Welcome to DeepCast Studio. Let’s build something worth listening to.")[:350]
    audio = synth_text(text, voice, payload.get("pace") or "Medium")
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "preview.wav"
        mp3 = Path(td) / "preview.mp3"
        sf.write(wav, audio, SAMPLE_RATE, subtype="PCM_16")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "2", "-ar", "44100", "-b:a", "96k", str(mp3)], check=True)
        import base64
        encoded = base64.b64encode(mp3.read_bytes()).decode("ascii")
    return json.dumps({"ok": True, "mimeType": "audio/mpeg", "audio": encoded, "voice": voice})


with gr.Blocks(title="DeepCast Multi-Engine TTS + FFmpeg Worker") as app:
    gr.Markdown("# DeepCast Multi-Engine TTS + FFmpeg Worker\nPrivate API worker for DeepCast Studio.")
    gr.api(synthesize, api_name="synthesize")
    gr.api(mix, api_name="mix")
    gr.api(preview, api_name="preview")

if __name__ == "__main__":
    app.queue(default_concurrency_limit=1, max_size=12).launch(server_name="0.0.0.0", server_port=7860)
