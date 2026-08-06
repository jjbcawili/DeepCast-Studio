# DeepCast Studio

DeepCast Studio is an AI-hosted podcast generator for entertainment, music-industry, and pop-culture deep dives. It creates two-host conversations featuring **Jiro** and **Sharpay**, generates scripts from source material and episode direction, and renders podcast audio through ElevenLabs.

## Live application

**Current ChatGPT Site:** https://deepcast-studio.jjbcawili.chatgpt.site

> **Source-sync note:** This repository contains the latest source snapshot currently checked into GitHub. The ChatGPT Site deployment is maintained separately and is not automatically mirrored back into this repository. Do not assume that the repository and the live site are identical without a fresh source comparison.

## Current repository stack

- React 19 and TypeScript
- Vite
- Express
- Google Gemini for outline and script generation
- ElevenLabs Text-to-Dialogue using `eleven_v3`
- `eleven_multilingual_v2` fallback
- Deterministic generation seeds
- Default hosts: Jiro and Sharpay

## Run locally

### Prerequisites

- Node.js 20 or newer
- Gemini API key
- ElevenLabs API key

### Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open the local URL printed by the server, normally `http://localhost:3000`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Generates podcast outlines and scripts. |
| `ELEVENLABS_API_KEY` | Yes | Generates voice previews and final dialogue audio. |
| `JIRO_ELEVENLABS_VOICE_ID` | No | Overrides Jiro's default ElevenLabs voice ID. |
| `SHARPAY_ELEVENLABS_VOICE_ID` | No | Overrides Sharpay's default ElevenLabs voice ID. |
| `APP_URL` | No | Public application URL used by integrations or callbacks. |
| `PORT` | No | Local or production server port. Defaults to `3000`. |

Never commit real API keys or production secrets.

## Commands

```bash
npm run dev      # Start the development server
npm run lint     # Run TypeScript checks
npm run build    # Build the client and server
npm start        # Run the production build
npm run clean    # Remove generated build output
```

## Project boundary

DeepCast Studio is the application project. It remains separate from the **Taylor Swift Deep Dive — Audio Overview Project** unless an explicit cross-project change is approved.
