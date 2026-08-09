from pathlib import Path

import numpy as np
import requests
import torch
from chatterbox.tts_turbo import ChatterboxTurboTTS

_MODELS = {}


def model_for(engine: str):
    name = str(engine or "chatterbox-nano").strip().lower()
    if name not in {"chatterbox-nano", "chatterbox-turbo"}:
        raise ValueError(f"Unsupported Chatterbox engine: {name}")
    if name not in _MODELS:
        if name == "chatterbox-nano":
            _MODELS[name] = ChatterboxTurboTTS.from_pretrained(device="cpu", nano=True)
        else:
            _MODELS[name] = ChatterboxTurboTTS.from_pretrained(device="cpu")
    return _MODELS[name]


def download_reference(url: str, secret: str, target: Path) -> Path:
    if not url:
        raise ValueError("Chatterbox voice reference URL is missing")
    headers = {"Authorization": f"Bearer {secret}"} if secret else {}
    with requests.get(url, headers=headers, stream=True, timeout=180) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    handle.write(chunk)
    return target


def synthesize_chatterbox(text: str, engine: str, reference_wav: Path):
    model = model_for(engine)
    with torch.inference_mode():
        wav = model.generate(str(text).strip(), audio_prompt_path=str(reference_wav))
    audio = wav.detach().cpu().float().numpy()
    if audio.ndim == 2:
        audio = audio[0] if audio.shape[0] == 1 else audio.mean(axis=0)
    return np.asarray(audio, dtype=np.float32), int(model.sr)
