import io
import os
import re
from pathlib import Path

import numpy as np
import requests
import soundfile as sf

ORPHEUS_VOICES = {"autumn", "diana", "hannah", "austin", "daniel", "troy"}
_F5 = None


def _mono(audio):
    arr = np.asarray(audio, dtype=np.float32)
    if arr.ndim == 2:
        arr = arr.mean(axis=1)
    return arr.astype(np.float32)


def _pace_value(pace: str) -> float:
    p = str(pace or "").lower()
    if p == "slow":
        return 0.92
    if p == "fast":
        return 1.08
    return 1.0


def _orpheus_direction(style: str) -> str:
    value = str(style or "").lower()
    if value == "expressive":
        return "expressive"
    if value == "warm":
        return "warm"
    if value == "dry":
        return "deadpan"
    if value == "dramatic":
        return "dramatic"
    return ""


def _split_for_orpheus(text: str, max_chars: int = 170):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if not clean:
        return []
    sentences = re.split(r"(?<=[.!?;:])\s+", clean)
    chunks = []
    current = ""
    for sentence in sentences:
        words = sentence.split()
        for word in words:
            candidate = f"{current} {word}".strip()
            if len(candidate) <= max_chars:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = word
    if current:
        chunks.append(current)
    return chunks


def synthesize_orpheus(text: str, voice: str, style: str = "", pace: str = ""):
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Groq Orpheus is selected but GROQ_API_KEY is not configured.")
    selected = str(voice or "").strip().lower()
    if selected not in ORPHEUS_VOICES:
        selected = "daniel"
    direction = _orpheus_direction(style)
    parts = []
    rate = 24000
    for chunk in _split_for_orpheus(text):
        spoken = f"[{direction}] {chunk}" if direction else chunk
        # Groq currently caps Orpheus input at 200 characters.
        spoken = spoken[:200]
        response = requests.post(
            "https://api.groq.com/openai/v1/audio/speech",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "canopylabs/orpheus-v1-english",
                "input": spoken,
                "voice": selected,
                "response_format": "wav",
            },
            timeout=120,
        )
        if not response.ok:
            raise RuntimeError(f"Groq Orpheus failed ({response.status_code}): {response.text[:400]}")
        audio, rate = sf.read(io.BytesIO(response.content), dtype="float32")
        parts.append(_mono(audio))
        parts.append(np.zeros(int(rate * 0.08), dtype=np.float32))
    if not parts:
        return np.zeros(int(rate * 0.25), dtype=np.float32), rate
    return np.concatenate(parts), rate


def synthesize_f5(text: str, reference_path: Path, reference_text: str = "", pace: str = ""):
    global _F5
    try:
        from f5_tts.api import F5TTS
    except ImportError as exc:
        raise RuntimeError("F5-TTS is selected but its optional runtime was not installed.") from exc
    if _F5 is None:
        # GitHub's current DeepCast runner is CPU-only. This works as an experimental
        # alternate lane, but a GPU endpoint is preferable for long episodes.
        _F5 = F5TTS(model="F5TTS_v1_Base", device="cpu")
    wav, rate, _ = _F5.infer(
        ref_file=str(reference_path),
        ref_text=str(reference_text or ""),
        gen_text=str(text or ""),
        speed=_pace_value(pace),
        seed=None,
    )
    if wav is None:
        raise RuntimeError("F5-TTS returned no waveform.")
    return _mono(wav), int(rate)


def synthesize_gpu_bridge(engine: str, text: str, reference_path: Path, config: dict):
    if engine == "fish-s2":
        url_key, token_key = "DEEPCAST_FISH_S2_URL", "DEEPCAST_FISH_S2_TOKEN"
    elif engine == "dia2":
        url_key, token_key = "DEEPCAST_DIA2_URL", "DEEPCAST_DIA2_TOKEN"
    else:
        raise RuntimeError(f"Unknown GPU bridge engine: {engine}")

    endpoint = os.environ.get(url_key, "").strip()
    if not endpoint:
        raise RuntimeError(
            f"{engine} is wired in DeepCast but no GPU endpoint is configured. "
            f"Set {url_key} before selecting this engine."
        )

    headers = {}
    token = os.environ.get(token_key, "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    with Path(reference_path).open("rb") as handle:
        response = requests.post(
            endpoint,
            headers=headers,
            data={
                "engine": engine,
                "text": str(text or ""),
                "referenceText": str(config.get("voiceReferenceText") or ""),
                "style": str(config.get("style") or ""),
                "pace": str(config.get("pace") or ""),
                "accent": str(config.get("accent") or ""),
            },
            files={"reference": ("reference.wav", handle, "audio/wav")},
            timeout=600,
        )

    if not response.ok:
        raise RuntimeError(f"{engine} GPU bridge failed ({response.status_code}): {response.text[:500]}")

    content_type = response.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        payload = response.json()
        import base64
        encoded = payload.get("audioBase64") or payload.get("audio")
        if not encoded:
            raise RuntimeError(f"{engine} GPU bridge returned JSON without audio.")
        raw = base64.b64decode(encoded)
        audio, rate = sf.read(io.BytesIO(raw), dtype="float32")
    else:
        audio, rate = sf.read(io.BytesIO(response.content), dtype="float32")
    return _mono(audio), int(rate)
