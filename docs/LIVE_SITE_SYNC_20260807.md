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

Recovered from the restored repository:

- Blue DeepCast alternate title SVG.
- Blue DeepDive standalone title SVG.
- Full historical approved DeepCast SVG asset pack.

Recovered from ChatGPT Library on 2026-08-08:

- `DeepCast_Projects_Title_Transparent_4K.png`
- `DeepCast_Projects_Title_Transparent_4K.svg`
- `DeepCast_Workspace_Title_Transparent_4K.png`
- `DeepCast_Workspace_Title_Transparent_4K.svg`
- `DeepCast_Generate_DeepDive_Button_Transparent_4K.png`
- `DeepCast_Generate_DeepDive_Button_Transparent_4K.svg`

The controlling recovery package is `DeepCast_UI_Assets_TRUE_TRANSPARENT_PNG_SVG_UPDATED.zip`; the same UI files are also carried into the later COMPLETE APPROVED PNG/SVG packs. The package's transparency QA confirms RGBA PNGs with fully transparent pixels and transparent corners, plus SVG canvases without a background rectangle.

The current web app requests deployment-name WebP variants for Projects and Workspace. Those public deployment files are recovered into `public/assets/` from the live app so the source mirror uses the same paths as production.

## Important limits

This source sync is evidence-based. The public ChatGPT Site does not expose its complete editable deployment source, secret store, or unpublished server configuration. No claim is made that this repository is byte-identical to every private deployment file.
