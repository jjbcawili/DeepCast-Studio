# DeepCast Studio background-job repair — 2026-08-08

## Status

Source repair prepared against the restored canonical GitHub repository. This document does **not** claim that the ChatGPT Site, Cloudflare Worker, or hosted Kokoro service is deployed merely because the source exists in GitHub.

## Root cause addressed

The prior Studio kept a single `/api/generate-podcast` browser request and SSE reader alive while outline, script, and TTS work ran. Long iPhone/Safari sessions could therefore be cancelled when the request timed out, the browser slept, connectivity changed, or the tab lifecycle changed.

The repair changes the contract:

1. Pressing **Generate Audio** creates a local episode shell immediately.
2. Studio clears and navigates to that episode immediately.
3. A short authenticated POST submits the episode to the background backend.
4. D1 owns status/progress/history and Cloudflare Queues own generation steps.
5. The episode page polls status. Closing or leaving the page does not cancel the background job.
6. Failed stages preserve completed segments and require bounded/manual retry instead of endless automatic retries.

## Episode states

`SUBMITTING → QUEUED → SCRIPTING → AUDIO_QUEUED → SYNTHESIZING → MIXING → COMPLETE`

Terminal/error states: `FAILED`, `CANCELLED`. A `SCRIPT_READY` state is supported by the client/API contract for future script-first workflows.

## Free/no-PC compute lane

- Cloudflare Workers AI: script generation.
- Groq Free: optional fallback and optional single-pass web research when a free API key is configured.
- Hugging Face personal ZeroGPU Gradio Space: intended hosted Kokoro + FFmpeg worker, so no home PC/laptop needs to stay on.
- D1: episode/job state.
- R2: audio objects.
- Cloudflare Queues: durable orchestration.

The included `tts-worker/` source is deployment-ready source, not proof that a Hugging Face Space has already been provisioned. The current chat tool surface has no Hugging Face account/deployment connector.

## Login

Firebase Auth client support is included for Google, email/password, anonymous Guest, verification, reset password, and sign-out. The backend verifies Firebase ID tokens and applies server-side episode ownership checks.

A visible **Sign in with ChatGPT** action is included, but it only activates when the Site/runtime exposes a supported server-side ChatGPT sign-in handoff via `CHATGPT_SIGN_IN_URL`. The source deliberately does not invent an undocumented OAuth endpoint.

## UI repair

- Higher-contrast dark and light palettes.
- Improved placeholder, muted-text, input, card, status, and modal readability.
- Current recovered title artwork is used for Home Projects, Deep Dives, and Workspace sections instead of adding redundant section-title copy below the art.
- Header greets an authenticated user by display name when available, then email, then Guest.

## Audio honesty

Kokoro provides stock voices, not cloned ElevenLabs Jiro/Sharpay voices. The hosted worker supports Standard Stereo and a real restrained Spatial Stereo host-panning mode. Surround and Dolby Atmos remain disabled until a genuine multichannel/licensed Atmos path exists.

## Deployment dependencies still required

1. Provision/configure the Cloudflare D1 database, R2 bucket, Queue, Worker bindings, and secrets.
2. Provision the free hosted Kokoro/FFmpeg Space and set `KOKORO_SPACE_URL` + shared secret.
3. Configure Firebase Authentication providers in the Firebase console (Google, Email/Password, Anonymous).
4. Point the Site server at `DEEPCAST_BACKEND_URL`; configure `CHATGPT_SIGN_IN_URL` only if the Sites runtime provides a supported handoff.
5. Publish through the ChatGPT Sites editor/runtime. GitHub commits alone do not publish the Site.
