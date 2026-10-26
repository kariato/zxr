# Lower Ravine — artwork-preserving refinement

[Updated overview](review-overview.png) · [Slight angle](review-slight-angle.png) · [Marble Hall](review-marble-hall.png) · [High path](review-stream-path.png) · [Upper entrance](review-entrance.png)

[Blender scene](lower-ravine-v4.blend) · [GLB](lower-ravine-v4.glb) · [Refinement record](refinement.json) · [Verification](verification.json) · [GLB audit](glb-audit.json)

This revision retains the original Tencent mesh from [v2](../mesh-v2/README.md). Vertex positions, topology and front-visible artwork UVs remain unchanged; preservation hashes are recorded. Rear-facing surfaces occluded from the artwork view use a small stone patch from the existing Deep Ford room reference instead of stretched scene imagery. No replacement primitive architecture is included.

Five source-room markers are surface-sampled from the actual mesh. Five small support guides are hidden from render and omitted from the GLB; they are authoring aids, not validated runtime collision. Updated overview, room detail, entrance and slightly rotated review cameras show the actual textured mesh. The packed concept reference is hidden from render. The entrance is retained, while Tiny Room and Dreary Room interiors remain deferred.

The original single-view relief geometry still distorts at other angles. The close-ups use the artwork projection angle and do not establish first-person readiness. The original refinement record describes the visual-review stage. The model is now integrated as an elevated room preview; see [runtime integration](runtime-integration.json). The five lit exteriors share the existing cavern skybox; the garden panorama remains garden-only. Source Movement attempts controls room transitions, while Ravine overview and Recenter view are turn-free. WASD is disabled for these elevated previews. This does not assert finished first-person collision or headset acceptance.

Rebuild with `out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/ravine-refine.py`. Verify with `tools/assets/ravine-refine-verify.py` in the same runtime, then run the existing `tools/assets/audit.py` against the GLB in the shape environment. Original geometry retains the [Tencent license](TENCENT-HUNYUAN-3D-2.0-LICENSE.txt) and [notice](HUNYUAN-NOTICE.txt), copied verbatim.
