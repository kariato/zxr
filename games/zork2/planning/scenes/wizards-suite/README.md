# Wizard's suite

One suite of connected chambers with distinct dressing: guarded entrance, workbench, trophy wall, pentagram, aquarium and quarters. Murky Room is a viewpoint inside that aquarium. Keep guarded doors and aquarium contents/state separate from the building shell.

## Rooms

[Concept and source/state constraints](scene-concept.md) · [Concept artwork](concept-v1.png) · [Exact built-in ImageGen prompt](concept-v1.prompt.txt)

## Generated authoring drafts

- `mesh-v1/`: untouched Tencent shape GLB, Blender scene and actual front/back geometry renders.
- `mesh-v1-color/`: editable projected UVs, packed concept and colored GLB/Blender copy.
- `mesh-v2-reduced/`: curvature-weighted reduction with an adjustable Decimate modifier.

Reproduce with `tools/assets/wizards-suite-scene-generate.py` in the local shape environment, followed by `wizards-suite-scene-blender.py`, `wizards-suite-scene-color.py` and `wizards-suite-scene-decimate.py` in the installed bpy environment. Verification JSON records settings, hashes, mesh counts and source preservation. Native inference units; runtime integration remains pending.

- [Guarded Room (`GUARDIAN-ROOM`)](GUARDIAN-ROOM/README.md)
- [Wizard's Workshop (`WIZARDS-WORKSHOP`)](WIZARDS-WORKSHOP/README.md)
- [Wizard's Workroom (`WORKBENCH-ROOM`)](WORKBENCH-ROOM/README.md)
- [Trophy Room (`TROPHY-ROOM`)](TROPHY-ROOM/README.md)
- [Pentagram Room (`PENTAGRAM-ROOM`)](PENTAGRAM-ROOM/README.md)
- [Aquarium Room (`AQUARIUM-ROOM`)](AQUARIUM-ROOM/README.md)
- [Murky Room (`IN-AQUARIUM`)](IN-AQUARIUM/README.md)
- [Wizard's Quarters (`WIZARDS-QUARTERS`)](WIZARDS-QUARTERS/README.md)

[All scene groups](../README.md) · [Grouping review](../../../../../docs/scene-grouping-review.md)
