# Textured ravine components

Eleven independent local Tencent Hunyuan3D-2 turbo meshes, finished and textured in Blender 5.0.1. Raw inference is retained in ../raw.

[Blender kit](ravine-atomic-kit.blend) · [Rendered kit preview](kit-preview.png)

| Component | Standard GLB | Browser GLB | Triangles |
|---|---:|---:|---:|
| cliff-face | [2.40 MB](cliff-face.glb) | [357 KB](browser/cliff-face.glb) | 9,600 |
| ledge-top | [2.23 MB](ledge-top.glb) | [280 KB](browser/ledge-top.glb) | 4,896 |
| ledge-edge | [2.06 MB](ledge-edge.glb) | [373 KB](browser/ledge-edge.glb) | 4,896 |
| wide-cave | [2.53 MB](wide-cave.glb) | [498 KB](browser/wide-cave.glb) | 18,240 |
| small-cave | [4.04 MB](small-cave.glb) | [724 KB](browser/small-cave.glb) | 37,204 |
| garden-arch | [2.11 MB](garden-arch.glb) | [330 KB](browser/garden-arch.glb) | 17,556 |
| marble-arch | [2.50 MB](marble-arch.glb) | [380 KB](browser/marble-arch.glb) | 21,812 |
| marble-floor | [2.54 MB](marble-floor.glb) | [347 KB](browser/marble-floor.glb) | 9,600 |
| boulder | [1.14 MB](boulder.glb) | [275 KB](browser/boulder.glb) | 6,000 |
| moss-patch | [2.87 MB](moss-patch.glb) | [641 KB](browser/moss-patch.glb) | 9,600 |
| riverbed | [2.54 MB](riverbed.glb) | [305 KB](browser/riverbed.glb) | 9,600 |

Standard GLBs include PNG textures. Browser variants use Meshopt geometry compression and KTX2 textures, requiring compatible decoders. Total browser download: 4.51 MB.

Panels retain bounded Tencent front relief on shallow straight-backed geometry. Cave and arch alpha masks become real geometry, with smoothed silhouettes and nine geometric opening checks each. Normal maps retain residual relief. The boulder is one connected, repaired Tencent volume with a pixel-level reference projection baked to a UV atlas. Hidden surfaces use neutral stone. These are individual modules; the staged kit is not a completed ravine assembly.

All eleven exported standard GLBs pass closed-mesh, winding, finite-vertex and embedded-texture checks. See [validation](glb-validation.json) and [provenance](verification.json).

Reproduction scripts: tools/assets/generate-modular-shapes.py, ravine-atomic-finish.py, ravine-atomic-review.py and ravine-atomic-pack.py. Component dimensions are authoring targets in metres; GLB is Y up with front +Z. Floors are staged upright for inspection; rotate -90 degrees around X when placing in the scene.
