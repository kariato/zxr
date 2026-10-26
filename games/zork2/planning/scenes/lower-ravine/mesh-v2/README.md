# Lower Ravine exterior model with upper entrance

[Blender scene](lower-ravine-v2.blend) · [GLB](lower-ravine-v2.glb) · [Overview](review-overview.png) · [Side view](review-three-quarter.png) · [Back view](review-back.png)

The working local Tencent Hunyuan3D-2 turbo / Hunyuan3D-Swift MLX pipeline reconstructed the [exterior v2 reference](../exterior-concept-v2/README.md). The scene covers Path Near Stream, Marble Hall, Deep Ford, Ledge in Ravine and End of Ledge. The upper shelf includes a dark entrance mouth into Tiny Room. Tiny Room and Dreary Room interiors and their shared wooden puzzle door are deferred.

The packed Blender project includes the actual inferred mesh, five source room collections with approximate surface markers and inspection cameras, an exterior entrance boundary marker, hidden adjacency guides, and three review cameras. The GLB includes mesh, five room markers, entrance marker, custom metadata and the embedded reference texture. The original reference is hidden from renders: previews show actual reconstructed geometry.

This is a draft fused reconstruction, 60,000 triangles, one material and one 1536×1024 texture. Elevated 35-degree planar projection improves the overview but stretches on side/back surfaces. Hidden surfaces, passage clearance, the ford and climb need manual finishing and collision work. The small entrance is visually represented, not a validated traversable portal. No interior room geometry or puzzle-door assets have been authored. Dimensions are an authoring estimate; the source engine retains room/exits, darkness, object visibility and turn authority. No runtime integration or skybox assignment in this pass.

[Generation record](generation.json) records original candidate provenance. [Scene record](scene.json) describes final projection, markers and cameras. [Verification](verification.json) confirms the packed Blender file reopens, all five room collections exist, both deferred interior collections are absent, GLB metadata/embedded image survive export, and the GLB reimports. [GLB audit](glb-audit.json) validates geometry, transforms, indices and textures. Final file sizes and hashes are in verification.json.

Reproduce from repository root:

```sh
HF_HUB_OFFLINE=1 out/asset-tools/shape-env/bin/python tools/assets/ravine-generate.py
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/ravine-blender.py
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/ravine-verify.py
```

Use `tools/assets/ravine-export.py` to export the saved scene without repeating renders. Shape generation uses the existing local weights and Metal runtime. Blender assembly uses the existing bpy runtime.

Generated geometry retains the [Tencent Hunyuan 3D 2.0 Community License](TENCENT-HUNYUAN-3D-2.0-LICENSE.txt) and [existing notice](HUNYUAN-NOTICE.txt), copied byte-for-byte from the project's canonical files. The existing pipeline's US-only prototype scope remains recorded in generation.json.
