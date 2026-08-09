import argparse
import json
import os
import sys

import requests

from app import mix, synthesize


def status(backend: str, episode_id: str, secret: str, payload: dict):
    try:
        requests.post(
            f"{backend.rstrip('/')}/internal/audio-status/{episode_id}",
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        ).raise_for_status()
    except Exception as exc:
        print(f"status callback warning: {exc}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", required=True)
    parser.add_argument("--episode", required=True)
    parser.add_argument("--api-name", choices=["synthesize", "mix"], required=True)
    parser.add_argument("--part", default="final")
    args = parser.parse_args()

    secret = os.environ.get("DEEPCAST_CALLBACK_SECRET", "")
    if not secret:
        raise RuntimeError("DEEPCAST_CALLBACK_SECRET is missing")

    backend = args.backend.rstrip("/")
    job_url = f"{backend}/internal/audio-job/{args.episode}/{args.part}"
    headers = {"Authorization": f"Bearer {secret}"}

    if args.api_name == "synthesize":
        status(backend, args.episode, secret, {
            "status": "SYNTHESIZING",
            "progress": 60,
            "message": f"GitHub Actions is synthesizing cloned/stock audio segment {args.part}."
        })
    else:
        status(backend, args.episode, secret, {
            "status": "MIXING",
            "progress": 92,
            "message": "GitHub Actions is running the final FFmpeg mix."
        })

    try:
        response = requests.get(job_url, headers=headers, timeout=60)
        response.raise_for_status()
        payload = response.json()
        payload["sharedSecret"] = secret
        if args.api_name == "mix":
            payload["downloadToken"] = secret
            result = mix(json.dumps(payload))
        else:
            result = synthesize(json.dumps(payload))
        print(result)
    except Exception as exc:
        stage = "mix" if args.api_name == "mix" else f"audio:{args.part}"
        status(backend, args.episode, secret, {
            "status": "FAILED",
            "progress": 92 if args.api_name == "mix" else 60,
            "message": "The TTS/FFmpeg runner failed. Completed segments were preserved.",
            "error": str(exc)[:1500],
            "failedStage": stage,
        })
        raise


if __name__ == "__main__":
    main()
