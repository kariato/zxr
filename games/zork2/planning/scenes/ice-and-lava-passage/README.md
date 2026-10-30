# Ice and lava passage

Shared ancient lava hall/passage with a glacier and a state-dependent melted opening. Could join the dragon or volcano environment later; keep its ice, steam and opening mutable rather than baked into a static mesh.

## Rooms

[Concept, source topology and state constraints](scene-concept.md) · [Concept image](concept-v1.png) · [Exact built-in ImageGen prompt](concept-v1.prompt.txt)

## Generated draft

[Selectively reduced version](mesh-v2-reduced/): 57,244 triangles (80% reduction), with an adjustable Decimate modifier and editable curvature-based weights. Original full-resolution files retained.

The `mesh-v1/` directory holds the direct Tencent Hunyuan shape GLB and an editable Blender project with front/back review renders. `mesh-v1-color/` holds the colored Blender/GLB copy, packed concept image and editable projected UVs. Geometry is retained unchanged; the glacier still requires separation before source-driven integration.

Reproduce with `HF_HUB_OFFLINE=1 out/asset-tools/shape-env/bin/python tools/assets/ice-lava-scene-generate.py`, then run `tools/assets/ice-lava-scene-blender.py` and `tools/assets/ice-lava-scene-color.py` in the installed bpy environment. Generation and verification JSON files record hashes, mesh counts and preservation checks. Native model units; no walkability or runtime integration asserted.

- [Ice Room (`GLACIER-ROOM`)](GLACIER-ROOM/README.md)
- [Lava Room (`LAVA-ROOM`)](LAVA-ROOM/README.md)

[All scene groups](../README.md) · [Grouping review](../../../../../docs/scene-grouping-review.md)
