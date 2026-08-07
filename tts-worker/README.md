# DeepCast hosted Kokoro + FFmpeg worker

This folder supports two compute modes so DeepCast does **not** need a home PC or laptop for TTS/mixing. The primary no-payment lane is the public repository’s standard GitHub-hosted Actions runner. The Gradio service remains an optional fallback.

## Why this worker exists

The browser submits an episode and leaves. Cloudflare Queues owns orchestration. This hosted worker does only compute-heavy audio steps:

1. Kokoro synthesizes Jiro/Sharpay dialogue segments with separate stock voices.
2. Host turns are rendered into real stereo; Spatial Stereo applies restrained left/right host panning, while Standard Stereo keeps both hosts centered. FFmpeg then converts each segment to consistent 44.1 kHz MP3.
3. FFmpeg concatenates the finished segments.
4. The worker streams the result back to the Cloudflare callback; Cloudflare stores it in R2.

The worker never needs the user's browser to remain open.

## Required callback secret

- GitHub Actions repository secret `DEEPCAST_CALLBACK_SECRET` — must exactly match Cloudflare `TTS_SHARED_SECRET`.
- Optional Gradio deployment may continue to expose `TTS_SHARED_SECRET` directly in its environment.

## Cloudflare / GitHub variables

- `GITHUB_REPO=jjbcawili/DeepCast-Studio`
- `GITHUB_AUDIO_WORKFLOW=deepcast-audio.yml`
- `GITHUB_AUDIO_REF=main`
- Cloudflare secret `GITHUB_ACTIONS_TOKEN` with Actions: write for this repository
- `PUBLIC_BASE_URL=https://<your-deepcast-worker>.workers.dev`
- optional `KOKORO_SPACE_URL` / `HF_TOKEN` only for the older hosted-Gradio fallback

## Limits / honesty

- This implements **Kokoro stock voices**, not cloned ElevenLabs Jiro/Sharpay voices.
- XTTS/Fish Speech are later lanes and require authorized voice samples plus more compute.
- The current mix is real stereo, including the Spatial Stereo host-panning mode. Surround and Dolby Atmos stay disabled in the UI until a genuine multichannel / licensed Atmos encode path exists; the app does not fake those labels.
- GitHub-hosted runners can queue or fail. The workflow posts a terminal failure back to the episode shell; already-uploaded audio segments remain in R2, so manual retry targets only missing work.
- A public repository is required for the no-billed-minutes GitHub Actions lane. If the repository becomes private, GitHub plan minute limits apply.
