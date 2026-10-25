# Narrow Tunnel image-to-mesh experiment

Generated 2026-10-25 at Mark's request using the working Tencent Hunyuan3D-Swift/MLX pipeline. The raw diorama remains a review artifact. Mark subsequently requested implementation, commit and publication; the finished room is `src/prototype/assets/narrow-tunnel-room-v1.glb`.

The source describes the southern mouth of the narrow tunnel overlooking a wide cavern, high phosphorescent moss, steep crumbly ravine walls, a small stream below, and a wooden footbridge to the south. NORTH returns to the barrow; SOUTH and CROSS lead toward FOOT-BRIDGE. DOWN is refused. The cutaway diorama framing is an artistic reconstruction aid, not an additional source room or exit.

`reference.png` was generated with the built-in imagegen tool, requesting transparency. The complete prompt is in `reference.prompt.txt`. Reference SHA-256: `f68fe02231c47ed6a51a27ff26864bda5df645dad8342688067d150077a27046`. The image remains local for mesh inference; no hosted 3D service was used.

Hunyuan used the existing local turbo weights, eight steps, guidance 5, seed 42, a 256 octree and 8-bit DiT/DINO quantization. Full pipeline and weight revisions are recorded in `out/asset-production/narrow-tunnel-v1/candidate.json`. Generation and finishing took 94.25 seconds including model loading. The raw mesh has 525,318 triangles; the simplified candidate has 30,000 triangles, one material, one embedded 1024px texture and a size of 4,670,128 bytes. Height is an artistic 12 metres; uniformly scaled bounds are approximately 23.82 × 12 × 20.52 metres, not source measurements or accepted gameplay dimensions.

## Review

The tunnel arch, cavern recess, bridge and central ravine remain recognizable. The bridge and rocks belong to one fused reconstructed diorama. Several spurious thin surfaces cross the ravine; stone detail is softened. Front-projected colour stretches on horizontal and oblique faces, and the inferred back uses approximate row-median colour. This is not a learned Hunyuan texture-paint pass. The model is **not accepted as a walkable room**: passage clearance, independent bridge/stream interaction targets and accurate ravine depth have not been established. No game-state bindings were changed.

GLB payload audit passed: finite vertex attributes and transforms, valid triangle indices and one valid embedded texture. Blender imported and rendered the actual mesh from front, side and back; the packed authoring scene is saved alongside it. Repository typecheck and headless boundaries passed. Browser review confirmed the GLB loads and renders. Headset review has not occurred.

## Files and reproduction

Ignored outputs are in `out/asset-production/narrow-tunnel-v1/`: `raw.glb`, `candidate.glb`, `candidate.json`, `audit.json`, `review-front.png`, `review-side.png`, `review-back.png` and `narrow-tunnel-v1.blend`.

```sh
HF_HUB_OFFLINE=1 out/asset-tools/shape-env/bin/python tools/assets/narrow-tunnel-generate.py
out/asset-tools/shape-env/bin/python tools/assets/audit.py out/asset-production/narrow-tunnel-v1/candidate.glb
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/narrow-tunnel-review.py
npm run dev -- --port 5181
```

Open `http://127.0.0.1:5181/tests-e2e/fixtures/narrow-tunnel-mesh.html` to orbit the model and compare it with the source image. Generation needs Metal GPU access outside a restricted sandbox. The runner retains the raw mesh for finishing experiments and verifies hashes before reusing an existing candidate.

The generator retains the existing Hunyuan custom licence recorded in `docs/image-to-3d-review.md`. The finished room carries the project's Hunyuan notice and licence; the raw candidate is not bundled.

## Playable room finishing

`tools/assets/narrow-tunnel-assemble.py` turns the candidate toward the source's southern bridge view, removes fused ribbons from the ravine, opens a head-height passage through the reconstructed solid, and adds a level near-bank floor. The visible rock shape still comes from Hunyuan. Interior UVs reuse a stone-only patch from the generated reference because the original front projection streaks when seen from inside. The malformed bridge is replaced with separate wooden planks, combined into one mesh; the small stream and high phosphorescent moss are separate authored surfaces.

Walking stays inside a 2.4 × 5 metre near-bank area; the arrival camera stands at its southern end. Nine longitudinal clearance rays sample three widths/heights, and a separate eye-height ray checks the view toward the bridge. These are geometry checks, not a headset acceptance test. North/south/cross/down remain source-engine movement attempts. The fused scenery is not the object authority: hit targets exist only for currently observed bridge, chasm, stream and moss identities. The old environment is the loading/failure fallback, and model resources are released when leaving the room or entering darkness.

Finished authoring files, arrival render, GLB audit and assembly measurements are in `out/asset-production/narrow-tunnel-room-v1/`. Regenerate with the existing Blender Python environment:

```sh
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/narrow-tunnel-assemble.py
```
