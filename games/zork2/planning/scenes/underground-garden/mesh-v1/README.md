# Underground Garden — generated Blender scene v1

- [Open the Blender scene](underground-garden-v1.blend)
- [Generated GLB export](underground-garden-v1.glb)
- [Overview render](review-overview.png), [three-quarter render](review-three-quarter.png), [back render](review-back.png)
- [Combined source concept](../concept-v1/reference.png)

Created from the combined four-room image with the existing local Tencent Hunyuan3D-2 turbo model via Hunyuan3D-Swift/MLX. The original inference has 396,214 triangles; the review mesh has 60,000. The raw shape and first candidate remain in ignored `out/asset-production/underground-garden-v1/` for further finishing.

The `.blend` is self-contained with packed image textures, the original concept, a lighting rig, an overview camera, side/back cameras, and four nested source-room collections. Each collection contains an estimated surface marker, exact source exit metadata, and an inspection camera. The geometry is one shared fused reconstruction; the collections do not claim separately segmented room meshes. Connection curves are viewport-only authoring guides.

## Material finishing and review

The generic front projection visibly striped the broad garden floor. The saved scene uses a 35-degree elevated projection including depth, aligned to the concept's overview. This makes the overview substantially clearer. The three-quarter and back views expose stretched texture, softened topiary, incomplete surfaces and inferred openings. The gazebo and creature silhouettes are not clean independently modeled assets. These remain finishing work before gameplay or VR use.

All preview images render actual generated geometry, with the packed reference empty hidden from render. Source room markers are not validated spawn points; scale is an authoring estimate. The physical source room identities, light state and interactions remain unchanged in the game.

The final export has 60,000 triangles, one material and one embedded 1536×1024 reference texture. GLB payload checks passed. The saved `.blend` was reopened successfully; its four room collections, packed material texture, mesh count, triangle count and active camera passed verification. See [verification.json](verification.json), [GLB audit](glb-audit.json), [inference provenance](generation.json) and [scene metadata](scene.json). The inference hash in `generation.json` identifies the initial candidate; final deliverable hashes are in `verification.json`.

## Reproduction

Run from the repository root using the existing local runtimes:

```sh
HF_HUB_OFFLINE=1 out/asset-tools/shape-env/bin/python tools/assets/garden-generate.py
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/garden-blender.py
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/garden-verify.py
out/asset-tools/shape-env/bin/python tools/assets/audit.py games/zork2/planning/scenes/underground-garden/mesh-v1/underground-garden-v1.glb
```

The [Tencent Hunyuan licence](TENCENT-HUNYUAN-3D-2.0-LICENSE.txt) and [existing project notice](HUNYUAN-NOTICE.txt) are retained with the generated deliverable.
