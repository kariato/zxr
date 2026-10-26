# Walking surfaces merged with the retained Tencent scenes

[Garden Blender merge](garden-with-hidden-floors.blend) · [Ravine Blender merge](ravine-with-hidden-floors.blend) · [Floor data](surfaces.json) · [Sampling verification](verification.json) · [Blender preservation checks](blender-verification.json)

The garden uses its retained mesh-v2 GLB; the ravine uses its retained mesh-v2 GLB, before the mesh-v4 rear-material changes. Both visual input files are read-only. Their vertex positions, polygon topology and UVs are unchanged during the Blender merge, and their original file SHA-256 values are verified before and after. The runtime loads these same original visual GLBs directly.

Four garden and five ravine rooms have separate hidden walking meshes. Their vertices are sampled by downward triangle intersection against the retained visual geometry. The generator filters steep faces, low headroom, discontinuities and disconnected pieces. Grid spacing is 0.2 metres. Vertices are within rounding tolerance of the source mesh; triangle-centre deviation is limited to 0.06 metres. These are bounded local walking patches, not continuous routes between game rooms or a complete character physics system.

Formal Garden's origin moved off a raised steep surface onto the nearby flat path. End of Ledge's origin moved off the nearly vertical tunnel face onto the ledge in front of it. Runtime uses normal perspective views, a 1.6-metre eye height, drag-to-look and WASD/touch walking. Movement follows floor height and stops at unsupported edges or excessive steps. Source Movement attempts remains authoritative at room transitions. Tiny Room and Dreary Room interiors remain deferred. Overview remains an optional inspection control, never the arrival view.

The visual assets still use single-view projected textures, which can stretch at eye level. Mapping hidden floors fixes support and placement; it does not repair the retained visual mesh or its textures. [Eye-height comparison findings](texture-diagnosis.md) document that full-resolution geometry alone does not repair this projection. No orthographic camera workaround or replacement architecture is part of this merge.

Reproduce:

```sh
out/asset-tools/shape-env/bin/python tools/assets/map-walking-surfaces.py
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/merge-walking-surfaces.py
```

The generator also writes `src/prototype/walking-surfaces.generated.ts`, exactly matching surfaces.json. Blender files keep the added floors in their own wireframe collection, hidden from render. The source Tencent licence and notices remain alongside each original visual asset.
