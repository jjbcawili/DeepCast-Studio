---
title: DeepCast Dia2 Bridge
emoji: 🎙️
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
suggested_hardware: l4x1
models:
  - nari-labs/Dia2-2B
---

# DeepCast Dia2 GPU Bridge

Private DeepCast-compatible HTTP bridge for Nari Labs Dia2. It supports both single-speaker conditioned synthesis and native two-speaker segment generation with separate speaker-prefix WAV files.

The service does not persist reference audio. DeepCast sends the reference clips only for the authenticated synthesis request.

## Endpoints

- `GET /health`
- `POST /synthesize`

Production deployment sets `DEEPCAST_DIA2_TOKEN` as a Space secret. DeepCast sends its own shared token in `X-DeepCast-Token`; a Hugging Face bearer token can remain in the standard `Authorization` header when the Space itself is private.

Dia2 is limited to roughly two minutes per generation. The bridge therefore chunks longer DeepCast segments while preserving `[S1]` and `[S2]` speaker tags.
