# Live Site Source Synchronization

## Current status

This record began as the 2026-08-07 reconstruction handoff. It is retained for provenance, but the reconstructed frontend is no longer the active repository root.

The root frontend was subsequently replaced with the exact source checkout used by the current DeepCast Studio ChatGPT Site. The former reconstructed Vite application is preserved in `legacy-reconstructed-site/`.

## Authoritative source mapping

| Component | Repository location | Release surface |
| --- | --- | --- |
| Current DeepCast frontend | `app/`, `lib/`, `public/` | ChatGPT Sites |
| Cloudflare episode backend | `cloudflare/` | Cloudflare Workers, Queues, D1, R2, Workers AI |
| Chatterbox and FFmpeg runner | `tts-worker/` | Compatible hosted compute service |
| Reconstructed historical frontend | `legacy-reconstructed-site/` | Reference only |

## Current provider state

The active audio path uses Chatterbox Turbo/Nano with authorized voice references and FFmpeg. Earlier Gemini TTS/Orus/Achernar documentation is historical and must not be used as the current production configuration.

## Deployment boundary

GitHub is the source and recovery repository. Updating GitHub alone does not publish the ChatGPT Site or Cloudflare services; each release surface must be deployed and verified separately.
