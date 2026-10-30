# Selectively reduced wizard's suite

`wizards-suite-reduced-v2.blend` retains the full source mesh, editable curvature weights and an unapplied Decimate modifier at ratio 0.1. The GLB evaluates the modifier. Higher weights simplify broad smooth areas more; lower weights protect sharper geometry. These are automatic geometry weights, not hand-painted semantic masks.

| Count | Original | Reduced |
| --- | ---: | ---: |
| Mesh vertices before export splits | 180,415 | 18,032 |
| Triangles | 360,850 | 36,084 |
| GLB POSITION entries | 1,069,636 | 108,069 |
| GLB bytes | 40,849,152 | 6,181,812 |

Reimport verified the actual exported triangle count; source Blender hash is unchanged. Front/back renders were inspected: room partitions and workbench survive at review distance, with coarser small details. Doorway recesses are still closed in places, the north entrance exit is absent, and the projected texture repeats on the back. These existing draft limitations require manual authoring before integration. Mutable puzzle props remain separate future work. No runtime or headset acceptance asserted.

See `verification.json` for hashes/counts and `../scene-concept.md` for source constraints. Tencent license/notice are retained in `../mesh-v1/`.
