# Princess reference and local model experiment

Created 2026-10-24 on the 24 GB Apple M4 Mac mini.

- `reference-v1.png`: generated full-body A-pose reference, with alpha.
- `reference-v1.prompt.txt`: exact image-generation prompt. Generated using the built-in image tool, not a local image model.
- The draft `princess-v1.glb` candidate ships in the public prototype by Mark's decision on 2026-10-24 (see `src/prototype/assets/README.md`); it remains an unapproved draft.

The local candidate is `out/asset-tools/princess/princess-v1.glb` (ignored by Git). View it while the development server is running at `/tests-e2e/fixtures/princess-model.html`. The GLB is self-contained and can also be opened in Blender or another glTF viewer. A fresh checkout will not contain this local candidate.

For the animated **in-scene audition**, open `/tests-e2e/fixtures/dragon-lair.html?princess=animated` and choose **Explore the lair**. Idle plays automatically; **Preview princess gesture** plays the four-second body gesture and returns to idle. **Princess close-up** and **Recenter view** change only the camera. This is a standing-pose local preview, whereas the opening source description has her seated. The shared presenter accepts an explicit model URL, retains the procedural fallback if loading fails, releases animation/texture resources on room changes, and renders the actor only when the engine exposes a visible princess. Normal play does not request this restricted model.

## Actual pipeline

1. Hunyuan3D-2 shape generation using the community Hunyuan3D-Swift Python/MLX implementation. Model: `tencent/Hunyuan3D-2/hunyuan3d-dit-v2-0-turbo`, revision `9cd649ba6913f7a852e3286bad86bfa9a2d83dcf`. FP16 weights; DiT and DINO quantized to 8 bits; 8 inference steps; guidance 5; seed 42; 256 octree with sparse decoding. Shape inference reported 55.4 seconds, excluding initial imports and model loading. Raw output: 229,604 triangles.
2. Trimesh/fast-simplification reduction to approximately 10,000 triangles. Set standing height to 1.65 metres. Front-facing colour projected from the reference into one 1024-square atlas. Back and sides use approximate colour swatches; **no learned texture-paint model was run**.
3. SkinTokens auto-rigging using AssetFurnace's portable MPS patch. First one-beam result rejected for skeleton errors. Second five-beam pass produced 29 bones in about 29 seconds of rig processing, excluding startup/model load. Sampling was not seeded, so repeating this pass can produce a different skeleton.
4. Blender 5.0.1 finishing: collapse six redundant chest/pelvis/heel helpers, reparent both leg chains to the hips while preserving rest transforms, transfer helper weights, normalize and limit to four weights per vertex, weld coincident geometry and smooth shading. Keep learned body positions and skinning. Add two authored four-second body clips (`Idle`, `Talk`). They are simple procedural gestures, not captured or AI-generated actor motion. No face rig, morph targets, lip-sync, fingers, walking or seated animation.

The local generation, preparation, rigging and finishing logs/scripts are in `out/asset-tools/princess/`. Those environments and model weights are authoring tools only and are not shipped to players.

## Measured export

| Property | Result |
|---|---:|
| Triangles | 9,960 |
| Skeleton joints | 23 |
| Maximum influences per vertex | 4 |
| Materials | 1 |
| Embedded texture | 1024 × 1024 |
| Height | 1.65 m |
| Animation clips | 2 × 4 seconds |
| GLB size | 1,041,936 bytes |
| SHA-256 | `a0b4ca75d85c6ae020b942eaf7f878c9c428df06177e38431faf933ec8c30c6c` |

Binary audit checked finite positions, weights and animation values; nonnegative normalized weights; valid joint indices; no second influence set; increasing animation key times; embedded image dimensions. Browser review checked loading, front, face, back, clip selection and pause controls. This is not a headset performance or animation acceptance test. Garment/shoulder deformation, topology and back/side appearance still need refinement. Keep the current procedural lair character until a replacement is accepted.

## Sources and licence boundary

- [Hunyuan3D-Swift](https://github.com/ZimengXiong/Hunyuan3D-Swift), code revision `292331f4d26ddb80b9dcea6bcb5629ff82f12b82`, MIT runtime.
- [Hunyuan3D-2 weights](https://huggingface.co/tencent/Hunyuan3D-2), **custom Tencent community licence**, not an unrestricted open-source licence. Its [licence](https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE) restricts use/display of outputs outside its defined territory, which excludes the EU, UK and South Korea. Consequently this candidate stays local and is **not a default worldwide-distributable ZXR asset**. Mark chose on 2026-10-24 to publish it on GitHub Pages anyway; resolve this limitation or regenerate before any wider release.
- [SkinTokens](https://github.com/VAST-AI-Research/SkinTokens), MIT, code revision `273b691d35989d71cd17ff2895fdc735097b92d1`; checkpoints from `VAST-AI/SkinTokens`, revision `79736cad0fd84de384d5eede659b4ebd24effe33`.
- [AssetFurnace](https://github.com/Bingeljell/image-to-3dlab), code revision `418f63274d2fd03bc177ec75dd52b75dd31858e2`, portable SkinTokens patch. Its local Blender service was changed to bind to `127.0.0.1` only and stopped after inference.

The reference image was not uploaded to a hosted 3D service. Hunyuan shape generation and SkinTokens inference ran locally. Do not describe the combined pipeline as wholly MIT/open source: the generator's weight/output terms differ from the MIT runtime and rigger.
