# ZXR Depth-Guided Decomposed Scene → GLB Pipeline (`scene-to-glb`)

Turns 4 cardinal room reference images (`N / E / S / W`) + a lightweight object
list (`scene-spec.json`) into a walkable, skybox-backed, WebXR-ready `room.glb`
whose terrain elevations and 3D object placements come directly from the
reference images' depth maps.

## Pipeline Stages

```
4 Reference Views (N/E/S/W) + scene-spec.json
  │
  ├─ Stage 1: depth_estimate.py        → metric depth maps (Depth Pro / Depth Anything V2 / heuristic)
  ├─ Stage 2: segment_and_inpaint.py   → alpha-masked hero cutouts (crops/*.png) + clean empty room views
  ├─ Stage 3: depth_to_layout.py       → unified 3D terrain heightfield (terrain.npy) + exact 3D object coords
  ├─ Stage 4: generate_heroes.py       → local MLX Hunyuan3D-2 Turbo 3D meshes per hero cutout (heroes/*.glb)
  └─ Stage 5: assemble_scene.py        → Blender assembly (terrain + placed heroes + ZIL anchors + skybox)
                                         → room.glb + gltfpack room-browser.glb + review-4view.png
```

## Quick Start

Run the full pipeline (uses local `out/asset-tools/shape-env` + Blender + `gltfpack`):

```sh
node tools/assets/scene-to-glb/run_scene.mjs \
  games/zork2/planning/scene-to-glb-prototype/shallow-ford/scene-spec.json \
  --render-review --compress
```

Fast layout-only preview (skips Hunyuan3D hero generation and places depth-sized proxy volumes):

```sh
node tools/assets/scene-to-glb/run_scene.mjs \
  games/zork2/planning/scene-to-glb-prototype/shallow-ford/scene-spec.json \
  --skip-hunyuan --render-review --compress
```

## Upgrading Stage 1 Depth Accuracy (Recommended)

By default `--depth-backend auto` checks for **Depth Anything V2** (`transformers` + `torch`)
or **Apple Depth Pro** (`depth_pro`) in `out/asset-tools/shape-env`, and falls back
to a fast geometric depth estimator so the pipeline runs out of the box with zero
extra downloads.

To enable neural metric depth on Apple Silicon (MPS):

```sh
out/asset-tools/shape-env/bin/pip install torch transformers accelerate
```

Then re-run `run_scene.mjs` — Stage 1 automatically switches to
`depth-anything/Depth-Anything-V2-Metric-Indoor-Base-hf` (cached in `out/asset-tools/hf-cache`).
