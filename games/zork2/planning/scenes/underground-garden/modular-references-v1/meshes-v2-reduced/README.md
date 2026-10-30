# Individually decimated garden models

Eight standalone GLBs with reduced geometry and smooth normals, plus an editable assembled Blender file. Originals remain in `../meshes-v1/`; earlier scenes are unchanged. Each standalone model is centered at its move/scale root, with its assembly scale retained.

| Model | Vertices | Triangles |
| --- | ---: | ---: |
| [garden-shell](garden-shell.glb) | 56,553 | 113,031 |
| [dragon](dragon.glb) | 19,618 | 39,184 |
| [unicorn](unicorn.glb) | 19,588 | 39,208 |
| [serpent](serpent.glb) | 19,611 | 39,190 |
| [dog](dog.glb) | 19,672 | 39,158 |
| [woman-violet](woman-violet.glb) | 19,603 | 39,193 |
| [woman-rose](woman-rose.glb) | 19,601 | 39,197 |
| [gazebo](gazebo.glb) | 39,042 | 78,440 |

Total: 213,288 vertices and 426,601 triangles. Exported vertex counts match native mesh counts. All eight files were reimported and their triangle counts and materials checked. Sampled surface deviation from the previous reduced meshes is below 0.1% of each model's bounding-box diagonal. Sampling does not exhaustively verify every fine detail. See `verification.json`.

Open [editable scene](garden-models-reduced-v2.blend).
