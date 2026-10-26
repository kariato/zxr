# Dragon and stone bridge

Scorched cavern, lair behind its blackened doorway, fresco passage, a ruined stone bridge across the chasm, and a misty landing. Reuse the existing lair. The stone bridge needs different geometry from the wooden Foot Bridge. Dragon access remains conditional.

## Rooms

[Shared environment concept and connections](scene-concept.md)

## Generated mesh

[Colored Blender and GLB draft](mesh-v1-color/): reference colors added for manual editing, with the original Tencent vertex positions and faces preserved. The packed image and projected UVs are editable. Side/back texture projection remains approximate.

The [mesh-v1 folder](mesh-v1/) contains the untouched Tencent shape GLB and an editable Blender project with separate review cameras and lights. The mesh is untextured and in native model units. It has no geometry cleanup, decimation or projected reference texture. Inspect the shape before setting game scale, merging the existing lair, or mapping hidden walking planes.

Reproduce with `HF_HUB_OFFLINE=1 out/asset-tools/shape-env/bin/python tools/assets/dragon-scene-generate.py`, then run `tools/assets/dragon-scene-blender.py` with the installed bpy Python environment. Generation records retain the reference hash, model settings, counts and output hash. Blender verification checks that assembly leaves imported geometry and UVs unchanged.

- [Dragon Room (`DRAGON-ROOM`)](DRAGON-ROOM/README.md)
- [Dragon's Lair (`DRAGON-LAIR`)](DRAGON-LAIR/README.md)
- [Fresco Room (`FRESCO-ROOM`)](FRESCO-ROOM/README.md)
- [Stone Bridge (`STONE-BRIDGE`)](STONE-BRIDGE/README.md)
- [Cool Room (`COOL-ROOM`)](COOL-ROOM/README.md)

[All scene groups](../README.md) · [Grouping review](../../../../../docs/scene-grouping-review.md)
