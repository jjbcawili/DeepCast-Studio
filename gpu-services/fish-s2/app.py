import base64
import os
import subprocess
import time
from pathlib import Path

import requests
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

FISH_LOCAL_URL = os.environ.get("FISH_LOCAL_URL", "http://127.0.0.1:8080").rstrip("/")
DEEPCAST_TOKEN = os.environ.get("DEEPCAST_FISH_S2_TOKEN", "").strip()
FISH_LOCAL_API_KEY = os.environ.get("FISH_LOCAL_API_KEY", "deepcast-local-fish").strip()

app = FastAPI(title="DeepCast Fish S2-Pro GPU Bridge", version="1.0.0")


def _authorize(value: str | None):
    if DEEPCAST_TOKEN and value != DEEPCAST_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")


def _local_headers():
    return {"Authorization": f"Bearer {FISH_LOCAL_API_KEY}", "Content-Type": "application/json"}


def _wait_for_local(timeout: int = 600):
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        try:
            response = requests.get(f"{FISH_LOCAL_URL}/v1/health", headers={"Authorization": f"Bearer {FISH_LOCAL_API_KEY}"}, timeout=5)
            if response.ok:
                return
            last = f"HTTP {response.status_code}: {response.text[:200]}"
        except Exception as exc:
            last = str(exc)
        time.sleep(2)
    raise RuntimeError(f"Fish S2-Pro local server did not become healthy: {last}")


@app.on_event("startup")
def verify_local_server():
    _wait_for_local()


@app.get("/health")
def health():
    try:
        response = requests.get(f"{FISH_LOCAL_URL}/v1/health", headers={"Authorization": f"Bearer {FISH_LOCAL_API_KEY}"}, timeout=10)
        return {"ok": response.ok, "engine": "fish-s2", "model": "s2-pro", "localStatus": response.status_code}
    except Exception as exc:
        return {"ok": False, "engine": "fish-s2", "model": "s2-pro", "error": str(exc)[:300]}


@app.post("/synthesize")
def synthesize(
    x_deepcast_token: str | None = Header(default=None),
    text: str = Form(...),
    referenceText: str = Form(default=""),
    pace: str = Form(default="Conversational"),
    reference: UploadFile = File(...),
):
    _authorize(x_deepcast_token)
    spoken = str(text or "").strip()
    if not spoken:
        raise HTTPException(status_code=422, detail="Text is required.")
    ref_text = str(referenceText or "").strip()
    if not ref_text:
        raise HTTPException(status_code=422, detail="Fish S2-Pro self-hosted bridge requires the reference transcript.")

    reference.file.seek(0)
    raw_reference = reference.file.read()
    if not raw_reference:
        raise HTTPException(status_code=422, detail="Reference audio is empty.")

    pace_value = {"measured": 0.92, "slow": 0.92, "up-tempo": 1.08, "rapid fire": 1.12, "fast": 1.08}.get(str(pace or "").lower(), 1.0)
    payload = {
        "text": spoken,
        "format": "wav",
        "references": [{"audio": base64.b64encode(raw_reference).decode("ascii"), "text": ref_text}],
        "normalize": True,
        "streaming": False,
        "max_new_tokens": 2048,
        "chunk_length": 200,
        "top_p": 0.8,
        "repetition_penalty": 1.1,
        "temperature": 0.8,
    }

    response = requests.post(f"{FISH_LOCAL_URL}/v1/tts", headers=_local_headers(), json=payload, timeout=900)
    if not response.ok:
        raise HTTPException(status_code=502, detail=f"Fish S2-Pro server failed ({response.status_code}): {response.text[:500]}")

    # Fish's current API emits audio bytes for non-streaming WAV responses.
    return Response(content=response.content, media_type="audio/wav", headers={"X-DeepCast-Pace": str(pace_value)})
