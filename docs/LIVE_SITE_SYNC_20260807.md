# Live Site Sync - 2026-08-07

## Purpose

Record the source changes used to bring the restored `jjbcawili/DeepCast-Studio` repository substantially in line with the current `deepcast-studio.jjbcawili.chatgpt.site` web app.

## Verified live routes and visible contract

The current live site exposes:

- `/` - Home dashboard, project/deep-dive empty states, search/sort/filter controls, and workspace statistics.
- `/projects` - Project workspace, create workspace action, search, sort, filter, and view controls.
- `/deep-dives` - Audio library, Studio entry point, search, sort, filter, and grid/list/compact views.
- `/studio` - DeepCast Studio builder and Master Console.
- `/chat` - Entertainment research chat with optional web search.

## Studio contract synchronized

- Episode title and prompt/focus.
- Script/transcript guidance plus TXT/MD upload.
- Guided Adaptation / Follow Closely.
- Allow Verified Additions.
- Deep Dive / Debate / Brief / Critique formats.
- 15 / 30 / 45 / 60 minute runtime choices.
- Independent or project-attached generation.
- Project sources, pasted source material, Google Drive surface, and episode-only web research.
- Jiro and Sharpay host editing.
- 30 Gemini TTS voices; Jiro defaults to Orus and Sharpay defaults to Achernar.
- Director note, style, pace, accent, banter, and voice preview controls.
- Producer instructions.
- Background-music and cover-art controls.
- Spatial/Stereo/Mono selection with WAV/MP3/M4A UI lanes.
- Master Console outline, generated script, segment audio, music/track-cue, and export sections.

## Current AI model defaults

- `gemini-3.6-flash` for text/research/script generation.
- `gemini-3.1-flash-tts-preview` for speech generation.
- Google Search grounding is wired when the user enables web search.
- Gemini TTS requests are chunked by episode segment and use three-attempt exponential-backoff retry handling for transient no-audio/5xx failures.

## Asset state

Recovered and reusable from the restored repository:

- Blue DeepCast alternate title SVG.
- Blue DeepDive standalone title SVG.
- Full historical approved DeepCast SVG asset pack.

Observed on the live deployment but original source not recoverable from available storage:

- `/assets/DeepCast_Projects_Title_Transparent_4K.webp`
- `/assets/DeepCast_Workspace_Title_Transparent_4K.webp`

The source references those live filenames and falls back to text if the files are not present in a standalone clone.

## Important limits

This source sync is evidence-based. The public ChatGPT Site does not expose its complete editable deployment source, secret store, or unpublished server configuration. No claim is made that this commit is byte-identical to the private live deployment.
