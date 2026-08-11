import io
import os
import re
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from dia2 import Dia2, GenerationConfig, SamplingConfig

MODEL_ID = os.environ.get("DIA2_MODEL_ID", "nari-labs/Dia2-2B")
AUTH_TOKEN = os.environ.get("DEEPCAST_DIA2_TOKEN", "").strip()
_MODEL = None

app = FastAPI(title="DeepCast Dia2 GPU Bridge", version="1.0.0")


def _authorize(value: str | None):
    if AUTH_TOKEN and value != AUTH_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")


def _model():
    global _MODEL
    if _MODEL is None:
        if not torch.cuda.is_available():
            raise RuntimeError("Dia2 requires CUDA for the production DeepCast bridge.")
        _MODEL = Dia2.from_repo(MODEL_ID, device="cuda", dtype="bfloat16")
    return _MODEL


def _single_script(text: str):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    return f"[S1] {clean}"


def _split_dialogue(script: str, max_chars: int = 1400):
    lines = [line.strip() for line in str(script or "").splitlines() if line.strip()]
    if not lines:
        return []
    chunks, current = [], []
    length = 0
    for line in lines:
        if current and length + len(line) + 1 > max_chars:
            chunks.append("\n".join(current))
            current, length = [], 0
        current.append(line)
        length += len(line) + 1
    if current:
        chunks.append("\n".join(current))
    return chunks


def _save_upload(upload: UploadFile, path: Path):
    upload.file.seek(0)
    with path.open("wb") as handle:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)


def _render(chunks, prefix1: Path, prefix2: Path | None, cfg_scale: float, temperature: float):
    dia = _model()
    config = GenerationConfig(
        cfg_scale=float(cfg_scale),
        text=SamplingConfig(temperature=0.6, top_k=50),
        audio=SamplingConfig(temperature=float(temperature), top_k=50),
        use_cuda_graph=True,
    )
    pieces = []
    rate = 24000
    for chunk in chunks:
        result = dia.generate(
            chunk,
            config=config,
            output_wav=None,
            verbose=False,
            prefix_speaker_1=str(prefix1),
            prefix_speaker_2=str(prefix2) if prefix2 else None,
            include_prefix=False,
        )
        wav = result.waveform.detach().float().cpu().numpy()
        if wav.ndim > 1:
            wav = wav.squeeze()
        pieces.append(wav.astype(np.float32))
        rate = int(result.sample_rate)
        pieces.append(np.zeros(int(rate * 0.12), dtype=np.float32))
    if not pieces:
        pieces = [np.zeros(int(rate * 0.25), dtype=np.float32)]
    audio = np.concatenate(pieces)
    out = io.BytesIO()
    sf.write(out, audio, rate, format="WAV", subtype="PCM_16")
    return out.getvalue()


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "dia2",
        "model": MODEL_ID,
        "cuda": bool(torch.cuda.is_available()),
        "nativeDialogue": True,
        "maxModelWindow": "about 2 minutes per generation; DeepCast bridge chunks longer segments",
    }


@app.post("/synthesize")
def synthesize(
    x_deepcast_token: str | None = Header(default=None),
    script: str = Form(default=""),
    text: str = Form(default=""),
    cfgScale: float = Form(default=6.0),
    temperature: float = Form(default=0.8),
    reference: UploadFile | None = File(default=None),
    reference1: UploadFile | None = File(default=None),
    reference2: UploadFile | None = File(default=None),
):
    _authorize(x_deepcast_token)
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        if script.strip():
            if not reference1 or not reference2:
                raise HTTPException(status_code=422, detail="Dia2 native dialogue requires reference1 and reference2.")
            ref1, ref2 = root / "speaker1.wav", root / "speaker2.wav"
            _save_upload(reference1, ref1)
            _save_upload(reference2, ref2)
            chunks = _split_dialogue(script)
            raw = _render(chunks, ref1, ref2, cfgScale, temperature)
        else:
            if not text.strip() or not reference:
                raise HTTPException(status_code=422, detail="Single-speaker Dia2 requires text and reference.")
            ref1 = root / "speaker1.wav"
            _save_upload(reference, ref1)
            chunks = _split_dialogue(_single_script(text))
            raw = _render(chunks, ref1, None, cfgScale, temperature)
    return Response(content=raw, media_type="audio/wav")
