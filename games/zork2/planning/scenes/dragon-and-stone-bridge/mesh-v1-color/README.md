# Colored manual-editing draft

`dragon-and-stone-bridge-color-v1.blend` contains the original Tencent shape with editable projected UVs and the packed `concept-v2.png` image. `dragon-and-stone-bridge-color-v1.glb` embeds the same color texture. Front and back renders show actual geometry.

Vertex positions and polygon indices are checked before and after coloring. No denoising, cleanup, decimation, displacement or topology edits are applied. The untextured originals remain in `../mesh-v1/`.

Color uses a 35-degree single-reference projection, not learned multiview painting. Side, back and player-height views can stretch or repeat the image; manual texture work remains necessary. The shallow relief and inferred solid chasm surfaces remain unchanged. Native model units; no game integration, lair merge or walking planes yet.

Reproduce using the installed bpy Python environment with `tools/assets/dragon-scene-color.py`. `verification.json` records preservation checks and output hashes. Tencent license and notice are retained in `../mesh-v1/`.
