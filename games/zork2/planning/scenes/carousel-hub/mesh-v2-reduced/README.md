# Selectively reduced carousel hub

`carousel-hub-reduced-v2.blend` keeps the source mesh, editable curvature weights and an unapplied Decimate modifier at ratio 0.1. High weights simplify broad surfaces more; lower weights protect sharper geometry. The GLB evaluates the modifier.

| Count | Original | Reduced |
| --- | ---: | ---: |
| Mesh vertices before export splits | 99,924 | 9,983 |
| Triangles | 199,868 | 19,986 |
| GLB POSITION entries | 591,953 | 59,877 |
| GLB bytes | 23,596,032 | 4,291,096 |

Exported triangle count verified by GLB reimport. Source Blender hash is unchanged. Front/back reduced renders were inspected: the circular hall, radial passages and west chamber remain recognizable, with coarser small edges. Existing partly closed archways, shallow walls and projected texture stretching/repetition remain. Eight matching open mouths, crawl clearance, enclosing ceiling and numeral 8 need manual authoring. Source-controlled disorientation remains authoritative; no runtime integration or device acceptance is asserted.

See `verification.json` for hashes/counts and `../scene-concept.md` for source constraints. Tencent license and notice are in `../mesh-v1/`.
