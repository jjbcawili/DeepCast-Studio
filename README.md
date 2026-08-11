# DeepCast Studio

Authoritative source repository for the production DeepCast Studio web application at [deepcast-studio.jjbcawili.chatgpt.site](https://deepcast-studio.jjbcawili.chatgpt.site).

## Source status

The root application now contains the actual ChatGPT Sites frontend used by production. The earlier reconstructed Vite implementation is retained under `legacy-reconstructed-site/` for history and reference; it is not the active frontend.

The repository contains three runtime layers:

- **Sites frontend (`app/`, `lib/`, `public/`)** — current responsive DeepCast interface, projects, Studio, episode pages, consoles, source tools, theme system, playback, downloads, and background-job adapter.
- **Cloudflare backend (`cloudflare/`)** — durable episode jobs using Queues, D1, R2, Workers AI, optional Groq, progress callbacks, retries, and recovery.
- **Hosted audio worker (`tts-worker/`)** — Chatterbox Turbo/Nano reference-conditioned synthesis and FFmpeg assembly.

## Current generation flow

```text
DeepCast Site
  -> Cloudflare episode API
  -> Queue + D1 progress state
  -> Workers AI / optional Groq script generation
  -> hosted Chatterbox Turbo or Nano voice synthesis
  -> FFmpeg mix/export
  -> R2 playback and download
```

Generation runs as a background job, so it is not tied to an open Safari tab. The frontend polls compact progress snapshots and fetches the full episode payload after completion or failure.

## Voice system

- Active TTS family: Chatterbox Turbo and Chatterbox Nano.
- Jiro and Sharpay use user-provided, authorized voice-reference recordings when cloning is enabled.
- Gemini voice names such as Orus and Achernar are historical and are not the current speaker defaults.
- FFmpeg creates the finished episode and requested audio output.

## Frontend development

Requirements: Node.js `>=22.13.0` and npm.

```bash
npm ci
npm run dev
```

Production validation:

```bash
npm run build
npm run validate:artifact
```

Do not commit production secrets. The Sites deployment must configure `DEEPCAST_BACKEND_URL` and any frontend-to-backend authentication values through its environment settings.

## Cloudflare backend

See [`cloudflare/README.md`](cloudflare/README.md). Production requires:

- D1 database and applied migrations
- R2 audio bucket
- Cloudflare Queue producer and consumer
- Workers AI binding
- hosted TTS worker URL
- shared TTS secret
- optional Groq credentials

## Chatterbox/FFmpeg worker

See [`tts-worker/README.md`](tts-worker/README.md). The worker must run on a compatible hosted compute service; it cannot execute heavyweight Chatterbox inference inside an ordinary browser request or standard Cloudflare Worker.

## Branch and deployment boundaries

- `main` is the combined authoritative repository: actual Sites frontend plus the Cloudflare and TTS backend sources.
- `live-sites-v80` remains a historical synchronization branch and should not be treated as newer than `main` after this migration.
- A GitHub commit does not automatically publish the ChatGPT Site. Sites deployment and Cloudflare deployment remain separate release actions.

## Project boundary

DeepCast Studio is separate from the **Taylor Swift Deep Dive — Audio Overview Project** unless the owner explicitly authorizes a cross-project package.
