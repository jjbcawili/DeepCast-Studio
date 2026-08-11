---
title: DeepCast Fish S2-Pro Bridge
emoji: 🐟
colorFrom: blue
colorTo: cyan
sdk: docker
app_port: 7860
suggested_hardware: l4x1
models:
  - fishaudio/s2-pro
---

# DeepCast Fish Audio S2-Pro GPU Bridge

Private DeepCast-compatible wrapper around the official Fish Audio S2-Pro server.

The Docker build pins the Fish Speech source to `v2.0.0-beta`, downloads the official `fishaudio/s2-pro` checkpoint at runtime, launches Fish's official `/v1/tts` server on localhost, and exposes only the DeepCast wrapper on port 7860.

## Privacy and authentication

- The Hugging Face Space is created as **private**.
- Hugging Face private-Space authentication uses the standard `Authorization` bearer token.
- DeepCast application authentication uses a separate `X-DeepCast-Token` header.
- Uploaded reference clips are passed in-memory for synthesis and are not intentionally persisted by the wrapper.

## Endpoints

- `GET /health`
- `POST /synthesize`

`POST /synthesize` accepts `text`, `referenceText`, `pace`, and one `reference` audio upload and returns WAV audio.

## License

Fish Speech source code and S2-Pro model weights are governed by the Fish Audio Research License. This bridge does not relicense or redistribute those upstream assets; deployment downloads them from the official Fish Audio repositories. Review the upstream license before commercial use or redistribution.
