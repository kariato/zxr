# Eye-height texture diagnosis

Local comparison renders under `out/asset-production/raw-mesh-comparison/` compare the existing 60,000-triangle garden mesh with the untouched 396,214-triangle Tencent raw output. The raw comparison uses object transforms for placement and adds the same existing reference-image projection as the simplified mesh; it performs no decimation, smoothing, remeshing or vertex edits. It does not modify a project visual asset.

Both renderings still show similar eye-height texture stretching. This comparison uses our single-view projected colour in both cases; it is not a test of native Tencent texture painting. More polygons alone do not repair that projection. A proper UV/multiview texture bake onto unchanged geometry remains necessary for better first-person appearance.

The hidden floor work addresses support, local movement and incorrect spawn placement only. It does not claim to repair this visible texture issue, and runtime does not substitute an art-preview camera to conceal it.
