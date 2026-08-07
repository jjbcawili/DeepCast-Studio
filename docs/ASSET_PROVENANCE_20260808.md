# DeepCast UI Asset Provenance - 2026-08-08

## Corrected recovery finding

The Projects and Workspace title art was not missing from the ChatGPT Library. It was stored inside approved/repaired DeepCast asset ZIP packages rather than under the live deployment WebP filenames as standalone Library items.

## Authoritative Library recovery package

`DeepCast_UI_Assets_TRUE_TRANSPARENT_PNG_SVG_UPDATED.zip`

Contains:

- `PNG/DeepCast_Generate_DeepDive_Button_Transparent_4K.png`
- `PNG/DeepCast_Projects_Title_Transparent_4K.png`
- `PNG/DeepCast_Workspace_Title_Transparent_4K.png`
- `SVG/DeepCast_Generate_DeepDive_Button_Transparent_4K.svg`
- `SVG/DeepCast_Projects_Title_Transparent_4K.svg`
- `SVG/DeepCast_Workspace_Title_Transparent_4K.svg`
- `QA/Transparency_Verification.json`
- `QA/Transparency_Verification.txt`

The same files are carried in the later complete approved PNG and SVG asset packs.

## Verified PNG transparency

| Asset | Dimensions | Alpha | Transparent pixels | PNG SHA-256 |
| --- | --- | --- | ---: | --- |
| Projects | 3838 x 1183 | RGBA, 0-255 | 78.5018% | `6cb01236cb028879691e39eb3d0009d9048247a5bd2d75a272a5afc5fec72527` |
| Workspace | 3807 x 1278 | RGBA, 0-255 | 81.2481% | `1d6deaa1ea4dd7ae6dcf94f0a2c15b56dec1ab89601b1b2476d516ca348e01ea` |
| Generate DeepDive | 3840 x 977 | RGBA, 0-255 | 5.4566% | `81cceaf0d5ababd2ac7f09a86bfdfbccf9561e7246949231b842670bd871dd32` |

All four corner alpha values are zero for all three PNGs. Hidden RGB under fully transparent pixels was cleared to black by the approved transparency-repair package.

## Verified SVG SHA-256

- Projects: `00b3bc3a3bec071e5dd9c589aa17b3a1ea375f4e98abb595ce66cb0f7c434392`
- Workspace: `4a5289a6780316aff6a4bf64888f6e08bba1339c09ebf972c21e9147e32c6d00`
- Generate DeepDive: `1a4bf3b29fc3bfe6b7cad3039457f102b7e53ff0a442fe00698e4894941db092`

## Deployment mapping

The live web app uses:

- `/assets/DeepCast_Projects_Title_Transparent_4K.webp`
- `/assets/DeepCast_Workspace_Title_Transparent_4K.webp`

The GitHub source mirror keeps those deployment paths under `public/assets/`.
