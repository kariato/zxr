# Reusable ravine assets and scene preview

The current visual prototype is [assembled-v3](../games/zork2/planning/scenes/lower-ravine/assembled-v3/README.md). It uses the [eleven-part kit](../games/zork2/planning/scenes/lower-ravine/atomic-parts-v2/README.md), retaining the image prompts, references, raw Tencent inference, finished textured GLBs, normal maps and editable Blender sources. GLB and Blender files use Git LFS; fetch them with `git lfs pull` after cloning.

The scene has narrow chipped ledges, an 18–20 metre drop to the river, 10 metre side passages, and a 12 metre river-source passage. Continuous terrain replaces rectangular floor tiles. Reference textures are blended at opposite edges and mapped continuously. Reusable cave and arch surrounds retain real openings.

The preview animates the water geometry and shading with traveling waves. The exported GLB contains a static water surface; the wave shader lives in `tools/assets/ravine-jagged-preview/viewer.js`. This is a visual prototype, without gameplay, navigation or collision integration. It does not replace the room in the main app.

## Build the current preview

After installing the repository's Node dependencies:

```sh
node tools/assets/build-ravine-jagged.mjs
python3 -m http.server 4199 --bind 127.0.0.1 --directory out/ravine-jagged
```

Open `http://127.0.0.1:4199/`. Use **Ledge & drop**, **Tunnel**, and **River** to inspect the scene, and **Water motion** to pause or resume waves. Vite bundles the local Three.js, Meshopt and Basis decoders. The builder copies the tracked decoder license notices into the output.

## Regenerate assets

- `generate-modular-shapes.py`: local Tencent Hunyuan3D-2 turbo inference from the kit manifest, retaining input hashes and raw GLBs; needs the local MLX environment and weights.
- `ravine-atomic-finish.py`: Blender finishing, reference projection, residual normal maps and boulder texture baking. It checks closed meshes and cave openings.
- `ravine-atomic-review.py` and `ravine-atomic-pack.py`: standalone GLB renders and compressed browser variants.
- `ravine-jagged-assemble.py`: Blender scene assembly and previews. Pass `--refresh` to rebuild this revision. Blender's Python environment needs NumPy, Pillow, SciPy and the repository helper `modular_mesh_utils.py`.

Compress the rebuilt scene with the installed gltfpack tool:

```sh
out/asset-tools/assetfurnace/vendor/gltfpack/gltfpack -i games/zork2/planning/scenes/lower-ravine/assembled-v3/ravine.glb -o games/zork2/planning/scenes/lower-ravine/assembled-v3/ravine-browser.glb -cc -tc color -tu normal -tq 8 -kn -ke -vp 16 -vt 16 -si 0.3 -se 0.005 -slb
```

## Validation

The kit includes source hashes, GLB checks, mesh dimensions and reference provenance. The current scene's `runtime-verification.json` records a successful browser load, one water surface, six clear entrances, five clear deep passages, and no WebGL errors. `wave-verification.json` records image differences from a fixed-view animation check: the moving surface changed, and the paused surface remained identical. Blender overview and depth renders are saved with the scene.

The source reference and Tencent license/notice files are retained. Surface textures are reference projections; hidden geometry uses neutral stone. No learned reconstruction of unseen textures is claimed.
