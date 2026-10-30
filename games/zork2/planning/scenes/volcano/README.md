# Volcano

Especially strong reuse: one tall caldera seen from its bottom, four balloon elevations and three ledges. Library and Dusty Room are enclosed side chambers; Lava Tube is the adjoining vertical chimney. Maintain source landing rules, height differences, gnome exits and changing ledge/safe state. Prefer modular interior attachments to one giant detailed mesh.

## Rooms

[Concept and source/state constraints](scene-concept.md) · [Concept image](concept-v1.png) · [Exact ImageGen prompt](concept-v1.prompt.txt)

## Generated authoring drafts

- `mesh-v2/`: direct untouched Tencent shape GLB and Blender scene, with front/back geometry renders.
- `mesh-v2-color/`: packed reference image, editable projected UVs and colored GLB/Blender files.
- `mesh-v3-reduced/`: selective reduction with an unapplied Decimate modifier and editable curvature weights.

Reproduce with `tools/assets/volcano-scene-generate.py` in the local shape environment, then `volcano-scene-blender.py`, `volcano-scene-color.py` and `volcano-scene-decimate.py` in the installed bpy environment. JSON verification records generation settings, hashes, counts and source preservation. Native inference units; runtime integration remains pending.

- [Volcano Bottom (`VOLCANO-BOTTOM`)](VOLCANO-BOTTOM/README.md)
- [Volcano Core (`VAIR-1`)](VAIR-1/README.md)
- [Volcano Near Small Ledge (`VAIR-2`)](VAIR-2/README.md)
- [Volcano by Viewing Ledge (`VAIR-3`)](VAIR-3/README.md)
- [Volcano Near Wide Ledge (`VAIR-4`)](VAIR-4/README.md)
- [Narrow Ledge (`LEDGE-1`)](LEDGE-1/README.md)
- [Wide Ledge (`LEDGE-2`)](LEDGE-2/README.md)
- [Volcano View (`VOLCANO-VIEW`)](VOLCANO-VIEW/README.md)
- [Library (`LIBRARY`)](LIBRARY/README.md)
- [Dusty Room (`SAFE-ROOM`)](SAFE-ROOM/README.md)
- [Lava Tube (`LAVA-TUBE`)](LAVA-TUBE/README.md)

[All scene groups](../README.md) · [Grouping review](../../../../../docs/scene-grouping-review.md)
