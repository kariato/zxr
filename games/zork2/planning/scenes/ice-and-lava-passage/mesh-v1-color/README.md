# Colored manual-editing draft

`ice-and-lava-passage-color-v1.blend` contains the preserved Tencent geometry, editable projected UVs and packed concept image. The sibling GLB embeds the same color texture. `verification.json` confirms vertex positions, polygon indices and the original GLB are unchanged.

Front/back renders were inspected. The front broadly matches the concept; the back repeats and stretches the reference, especially across walls and the glacier. This is single-image planar projection, not learned multiview paint. Ice remains fused to stone. Manual geometry and texture authoring are required before runtime integration.

Reproduce using `tools/assets/ice-lava-scene-color.py` in the installed bpy environment. The original untextured files and Tencent license/notice remain in `../mesh-v1/`.
