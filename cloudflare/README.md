# DeepCast background backend

This directory is the source for the **new durable background-generation service** prepared on 2026-08-08. It replaces the old model where `/api/generate-podcast` kept one browser/SSE request open until a long script + TTS job finished.

## Architecture

`DeepCast Site → short POST /api/episodes → D1 episode shell → Cloudflare Queue → Workers AI script → optional Groq web research/fallback → GitHub Actions Kokoro/FFmpeg runner → R2 → episode page polling`

A browser tab is no longer the job runner. Every accepted generation has a persistent episode record and progress/event history.

## Free-tier guardrails

- `MAX_DAILY_EPISODES` defaults to `3` per verified Firebase UID.
- Queue consumer retries are bounded (`max_retries = 2`).
- Failed work becomes a terminal `FAILED` episode state instead of retrying forever.
- Manual retry requeues only incomplete segments for the failed stage; completed script/audio segments are preserved.
- `audio_queued` and `mix_queued` D1 guards prevent concurrent completions from double-enqueueing expensive work.

## Identity / authorization

Firebase ID tokens are verified inside the Worker against the configured Firebase project. D1 episode rows carry the verified Firebase UID, and owner checks run server-side before reading or changing an episode.

## Research and script engines

- Primary script engine: Cloudflare Workers AI (`@cf/qwen/qwen3-30b-a3b-fp8` by default).
- Optional Groq fallback: used only when `GROQ_API_KEY` is configured and Workers AI fails.
- Optional episode web research: one bounded `groq/compound-mini` research pass when the Studio web-search toggle is enabled and a Groq key is configured. If unavailable, the episode continues with provided sources instead of failing the entire job.

## Audio

The queue primarily dispatches the companion `.github/workflows/deepcast-audio.yml` workflow. Because this repository is public, standard GitHub-hosted Actions runners can provide the on-demand Linux machine for Kokoro and FFmpeg without a home PC. Each segment uploads back to R2; completed segments are preserved, and the final FFmpeg mix runs only after every segment is present. The older Gradio/Space path remains optional fallback code, not the required no-payment lane.

## Deployment

Copy `wrangler.example.toml` to `wrangler.toml`, create the D1/R2/Queue resources, apply `migrations/0001_background_jobs.sql`, then set deployment secrets. Never commit real secrets.


## GitHub Actions audio runner secrets

- Cloudflare secret `GITHUB_ACTIONS_TOKEN`: fine-grained token restricted to this repository with **Actions: write** so the Worker can dispatch `deepcast-audio.yml`.
- GitHub Actions repository secret `DEEPCAST_CALLBACK_SECRET`: must equal Cloudflare `TTS_SHARED_SECRET`. It authorizes the ephemeral runner to fetch job payloads and upload audio callbacks without exposing the secret in workflow inputs or source.

The workflow uses only `contents: read`; its callback authority comes from the repository secret.
