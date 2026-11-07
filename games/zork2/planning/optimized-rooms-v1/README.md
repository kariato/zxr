# Optimized individual room meshes

One self-contained `room.glb` per room, generated from the latest numbered review GLB (or the existing authored room for Bank Entrance, Inside Barrow, and Narrow Tunnel).

Each package has one mesh, one primitive, and one material. Detailed geometry is decimated to at most 40,000 triangles, then source albedo and tangent-space normals are baked into a new UV atlas. Albedo is embedded as a 2048-pixel JPEG; normals are embedded as a 1024-pixel lossless PNG. Narrow Tunnel uses 1024-pixel albedo and 512-pixel normals to remain smaller than its already compact source. Six rooms also embed an emissive map to preserve source glow. Atmospheric mist rooms retain an unlit material. Room coordinates are preserved.

The original authoring assets are untouched. The standalone `color.png` and `normal.png` files are full-resolution bake intermediates; the smaller runtime maps are embedded in `room.glb`. They are not extra runtime dependencies.

`manifest.json` records source and output hashes, triangle counts, sizes, and bake settings. `audit.json` verifies all packages. `source-interior.png`, `optimized-interior.png`, and the comparison sheets provide matched-camera visual checks. Structural validation does not certify every viewpoint or gameplay state.

These are flattened room assets: source prop geometry is included in the single mesh. They are not yet replacements for the game's independently state-controlled objects. Original source identities remain available in the authoring files for subsequent runtime integration.

Rebuild or resume:

    out/asset-tools/blender-env/bin/python tools/assets/optimize-room-batch.py
    out/asset-tools/blender-env/bin/python tools/assets/review-optimized-batch.py
    out/asset-tools/blender-env/bin/python tools/assets/audit-optimized-rooms.py

Source asset licensing and attribution continue to apply; see the original source directories recorded in each manifest.

Published package: the repository retains the self-contained GLBs, per-room manifests, audit and comparison sheets. Full-resolution bake intermediates, logs, and earlier authoring experiments remain in the authoring checkout. The published browser catalogue preserves the review camera positions.
