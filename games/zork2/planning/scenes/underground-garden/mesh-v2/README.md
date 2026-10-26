# Underground Garden v2 — embedded skybox

- [Self-contained GLB](underground-garden-v2.glb)
- [Packed Blender scene](underground-garden-v2.blend)
- [Overview preview](review-overview.png) and [three-quarter preview](review-three-quarter.png)

Adds the existing moss-lit cave-garden panorama to the [v1 generated garden](../mesh-v1/README.md). The original garden geometry and source room markers are preserved. The previous revision remains available.

## Skybox and export

The Blender world uses the packed equirectangular garden panorama. An inward-facing sphere carries the same packed image into GLB because standard glTF cannot serialize Blender world nodes. Its material uses `KHR_materials_unlit`, so viewer lighting does not darken the panorama. The skybox node's extras identify its role, image hash and exclusion from walk bounds. Both garden and panorama textures are embedded in the GLB; no external image files are needed.

The GLB includes all four source-room markers with their exit metadata and seven inspection cameras. Select **Overview - generated mesh** in viewers that support saved cameras. Viewers that automatically fit every mesh may initially frame the entire skybox sphere; use the garden bounds in [scene.json](scene.json) when implementing camera framing. The existing inferred-garden geometry and texture limitations remain as described in v1.

## Verification

The `.blend` was reopened and its packed world texture and inward sphere checked. The GLB was reimported into Blender successfully. Its unlit skybox material, two embedded images, four source-room markers, seven cameras, finite vertex data and triangle indices passed verification. It contains 60,000 garden triangles plus 3,968 skybox triangles, with two materials. See [verification.json](verification.json) and [glb-audit.json](glb-audit.json). Final hashes and panorama provenance are in [scene.json](scene.json).

Reproduce from the repository root:

```sh
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/garden-skybox.py
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/garden-verify.py --revision v2
out/asset-tools/shape-env/bin/python tools/assets/audit.py games/zork2/planning/scenes/underground-garden/mesh-v2/underground-garden-v2.glb
```

The [existing Tencent licence](TENCENT-HUNYUAN-3D-2.0-LICENSE.txt) and [project notice](HUNYUAN-NOTICE.txt) accompany the generated garden.
