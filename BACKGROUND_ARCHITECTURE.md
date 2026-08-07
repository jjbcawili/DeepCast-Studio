# DeepCast Studio Background Episode Architecture

Generate Audio no longer keeps a long AI/TTS job attached to the browser request.

## Production flow

1. Studio sends `POST /api/episodes` to the Cloudflare Worker.
2. D1 creates an episode shell immediately, including submitted/failed/cancelled jobs.
3. Studio clears and navigates to `/deep-dives/:episodeId` after the shell is accepted.
4. Cloudflare Queue generates outline and script sections with Workers AI.
5. Worker sends `repository_dispatch` to GitHub Actions.
6. GitHub Actions runs Kokoro TTS and FFmpeg, uploads segment audio + MP3/WAV/M4A to R2, and reports progress back to the Worker.
7. Episode page polls D1-backed state and owns progress, errors, retry controls and downloads.

## GitHub Actions restoration

GitHub Actions is intentionally restored as the remote no-PC Kokoro/FFmpeg runner for the current single-user deployment. The architecture keeps it behind a durable Cloudflare job boundary so browser cancellation does not cancel the episode. The runner is replaceable later without changing the Studio/Episode contract.

## Required Cloudflare bindings

- D1: `DB`
- R2: `AUDIO`
- Queue producer/consumer: `EPISODE_QUEUE`
- Workers AI: `AI`

Worker secrets/vars:
- `GITHUB_REPOSITORY=jjbcawili/DeepCast-Studio`
- `GITHUB_ACTIONS_TOKEN`
- `RUNNER_CALLBACK_SECRET`
- `ALLOWED_ORIGIN`

GitHub Actions secrets:
- `DEEPCAST_BACKGROUND_API`
- `DEEPCAST_RUNNER_CALLBACK_SECRET`
- `R2_ENDPOINT_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

Optional GitHub variables:
- `KOKORO_JIRO_VOICE` default `am_michael`
- `KOKORO_SHARPAY_VOICE` default `af_heart`
