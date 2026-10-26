# Untouched Tencent shape draft

- `dragon-and-stone-bridge-v1.glb`: direct pipeline output, 233,391 vertices and 466,662 triangles, 8,401,424 bytes.
- `dragon-and-stone-bridge-v1.blend`: imported mesh with separate authoring cameras and lights; no mesh edits or projected texture.
- `review-front.png` / `review-back.png`: actual untextured mesh renders, not the concept image.
- `generation.json` / `blender-verification.json`: settings, hashes and assembly verification.

Visual review: the broad layout and central bridge are recognizable, but much of the reconstruction is shallow relief. The open bridge arches and a fully separated rear lair are not faithfully reconstructed. The lower chasm includes inferred solid surfaces. This is a manual editing starting point, not a validated traversable scene.

The model is in native inference units, with no UV texture atlas or learned paint. No decimation, component deletion, topology repair, reference projection, vertex displacement or physical scaling was applied. Existing lair merging, room origins, hidden walking planes and runtime integration remain pending.

The sibling license and notice apply to the generated geometry. See `../scene-concept.md` for source topology and reproduction notes in `../README.md`.
