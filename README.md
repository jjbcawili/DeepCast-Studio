# DeepCast Studio

Canonical GitHub source mirror and recovery repository for **DeepCast Studio**, the AI-hosted entertainment podcast workspace currently served at `https://deepcast-studio.jjbcawili.chatgpt.site`.

## Current source sync

This repository was restored on 2026-08-07 and then synchronized against the current live web app plus the strongest recoverable project evidence. The restored Git history and approved asset pack were preserved.

The current source sync includes:

- Home dashboard with Projects, Recent Deep Dives, search/sort/filter controls, and workspace statistics.
- Projects workspace with creation, search, sort, and grid/list views.
- Deep Dives library with search and view modes.
- Studio builder with prompt/focus, TXT/MD script guidance upload, project source selection, episode-only web research, four episode formats, 15/30/45/60 minute runtimes, configurable Jiro and Sharpay hosts, all 30 Gemini TTS voices, producer instructions, background-music controls, cover-art modes, output controls, and the Studio Master Console.
- Chat workspace with optional Google Search grounding and returned source links.
- Light/dark appearance support, fixed frosted header, responsive mobile navigation, and static background behavior.
- Gemini 3.6 Flash for current text/script generation and Gemini 3.1 Flash TTS Preview for current speech generation, with segmented synthesis and retry handling for transient TTS failures.
- The restored Git history preserves the earlier ElevenLabs implementation as historical provenance; the current runtime source uses Gemini TTS.

See [`docs/LIVE_SITE_SYNC_20260807.md`](docs/LIVE_SITE_SYNC_20260807.md) and [`docs/ASSET_PROVENANCE_20260808.md`](docs/ASSET_PROVENANCE_20260808.md).

## Current model defaults

```text
Text / research: gemini-3.6-flash
Speech:          gemini-3.1-flash-tts-preview
Jiro voice:      Orus
Sharpay voice:   Achernar
```

The Gemini TTS catalog exposes 30 supported prebuilt voices. Web Search is optional and uses Gemini Google Search grounding when enabled.

## Run locally

```bash
npm ci
cp .env.example .env.local
# Add GEMINI_API_KEY to .env.local
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run lint
npm run build
npm start
```

GitHub Actions runs `npm ci`, TypeScript linting, and the production build on `main` pushes and pull requests.

## Deployment boundaries

- The live ChatGPT Site is a separate deployment surface. A GitHub commit does **not** by itself publish the ChatGPT Site.
- Production secrets, Google OAuth credentials, Cloudflare secrets, and private tokens must stay in deployment secret stores and must never be committed.
- The restored repository contains the historical approved DeepCast SVG asset pack and active blue DeepCast/DeepDive title art.
- The approved Projects and Workspace title-art originals were recovered from the ChatGPT Library package `DeepCast_UI_Assets_TRUE_TRANSPARENT_PNG_SVG_UPDATED.zip`. The package contains PNG and SVG originals with verified real transparency; deployment-name WebP copies are recovered into `public/assets/` for the current UI.

## Project boundary

DeepCast Studio is separate from the **Taylor Swift Deep Dive — Audio Overview Project** unless the owner explicitly authorizes a cross-project package.
