# Selectively reduced scene

Open `ice-and-lava-passage-reduced-v2.blend` to adjust the unapplied Collapse Decimate modifier (ratio 0.2) or paint the `Simplify broad surfaces - editable` vertex group. High weights encourage more simplification. Automatic weights favor broad smooth surfaces and protect sharper bends; they are geometry-based, not semantic glacier/chimney masks.

| Count | Original | Reduced |
| --- | ---: | ---: |
| Mesh vertices before export splits | 143,120 | 28,628 |
| Triangles | 286,228 | 57,244 |
| GLB POSITION entries (UV/normal splits) | 852,564 | 171,649 |
| GLB bytes | 32,619,460 | 8,082,372 |

The GLB evaluates the modifier. It was reimported and its triangle count checked. Front/back renders retain the broad room silhouettes, chimney, exits and glacier shape at the review camera distance. Fine floor/wall geometry is reduced; player-height and device performance remain untested. Existing fused glacier and single-reference texture stretching remain.

Original colored Blender file is hash-verified unchanged. Reproduce with `tools/assets/ice-lava-scene-decimate.py` in the installed bpy environment. `verification.json` records counts and file hashes. Tencent license and notice remain in `../mesh-v1/`.
