# DeepCast hosted Kokoro + FFmpeg worker

This folder is designed for a personal Hugging Face Gradio Space so DeepCast does **not** need a home PC or laptop for TTS/mixing.

## Why this worker exists

The browser submits an episode and leaves. Cloudflare Queues owns orchestration. This hosted worker does only compute-heavy audio steps:

1. Kokoro synthesizes Jiro/Sharpay dialogue segments with separate stock voices.
2. Host turns are rendered into real stereo; Spatial Stereo applies restrained left/right host panning, while Standard Stereo keeps both hosts centered. FFmpeg then converts each segment to consistent 44.1 kHz MP3.
3. FFmpeg concatenates the finished segments.
4. The worker streams the result back to the Cloudflare callback; Cloudflare stores it in R2.

The worker never needs the user's browser to remain open.

## Required Space secret

- `TTS_SHARED_SECRET` — must exactly match the Cloudflare Worker secret of the same name.

## Cloudflare variables

- `KOKORO_SPACE_URL=https://<your-space>.hf.space`
- `PUBLIC_BASE_URL=https://<your-deepcast-worker>.workers.dev`
- optional `HF_TOKEN` if your Space/API configuration requires it

## Limits / honesty

- This implements **Kokoro stock voices**, not cloned ElevenLabs Jiro/Sharpay voices.
- XTTS/Fish Speech are later lanes and require authorized voice samples plus more compute.
- The current mix is real stereo, including the Spatial Stereo host-panning mode. Surround and Dolby Atmos stay disabled in the UI until a genuine multichannel / licensed Atmos encode path exists; the app does not fake those labels.
- Free hosted compute can sleep, queue, or rate-limit. Cloudflare records that failure in the episode shell so only the failed step needs a retry.
