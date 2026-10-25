# Opening barrow natural stone experiment

Local US-only Hunyuan prototype, ready for visual review. Original skybox and opening camera retained; ordinary game rendering is unchanged.

Preview: http://127.0.0.1:5181/tests-e2e/fixtures/barrow-natural.html. Open the scene and switch between Original geometry and Generated rock experiment. The fixture uses an isolated temporary save store. Switching geometry consumes no source turn; south reaches Narrow Tunnel in one turn and north returns in another.

Three transparent references (arch, boulder, ledge) were generated with built-in ImageGen; each folder preserves the exact prompt and provenance. Hunyuan3D-Swift/MLX generated the meshes locally with Hunyuan 2.0 turbo weights. `tools/assets/barrow-generate.py`, `barrow-prepare.py` and `barrow-assemble.py` reproduce generation, stone projection and Blender assembly respectively. The general `generate.py` default texturing remains unchanged for other assets.

Outputs in ignored `out/asset-production/barrow-natural-v1/`:

- `barrow-natural-v1.glb`: 4,013,588 bytes, 17,461 triangles counting instances (9,861 unique), six materials and three embedded 1024px textures.
- `barrow-natural-v1.blend`: packed authoring scene, skybox and opening camera.
- `assembly.json`: hashes, geometry clearance checks and provenance.

The GLB contains physical dressing; the game keeps its skybox separate. Six rock placements reuse two meshes. The tunnel has a 1.92m clear opening and 5.5m corridor; nine sampled rays at three lateral positions and heights pass. Texture coverage is approximate three-axis reference projection, not a learned multiview paint pass. Corridor, floor and clearance corrections are authored in Blender.

Verification: GLB audit passed, production build passed, 13 targeted tests passed, and source south/north transitions verified in the browser. Lifecycle tests cover fallback, resource disposal and a late load after leaving the room. Before/after screenshots are in `out/prototype/barrow-natural-v1/`. Headset performance and human approval remain open.
