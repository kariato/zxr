# Selectively reduced volcano draft

`volcano-reduced-v3.blend` retains the source mesh, editable curvature weights and an unapplied Collapse Decimate modifier at ratio 0.1. High weights encourage more reduction on broad surfaces; lower weights protect sharper edges. These automatic weights are not semantic ledge masks. Paint the vertex group to tune specific areas.

| Count | Original | Reduced |
| --- | ---: | ---: |
| Mesh vertices before export splits | 287,036 | 28,703 |
| Triangles | 574,072 | 57,406 |
| GLB POSITION entries | 1,715,642 | 172,164 |
| GLB bytes | 64,373,516 | 8,782,224 |

The GLB evaluates the modifier. Its triangle count was verified after reimport. Source Blender hash is unchanged. Front/back renders retain the broad caldera and ledge silhouettes at the review distance; fine rock and ledge edges become coarser. Existing fused rooms, incomplete chimney, cutaway rim and projected texture repetition remain. This is an authoring draft with no gameplay integration or measured device acceptance.

See `verification.json` for hashes/counts and `../scene-concept.md` for source constraints. Tencent license and notice are in `../mesh-v2/`.
