# Cavern backdrop v1

`cavern-skybox-v1.png`: a new 1774×887 (2:1) equirectangular panorama, generated with the built-in image-generation tool on 2026-10-24 for Mark's request for more detailed caverns. The complete generation prompt is in `cavern-skybox-v1.prompt.txt`. SHA-256: `51744b1ba72e65729a7d4353771819eea522e1e642308c82f09b370a031c6438`.

It follows the existing low-poly fantasy style and depicts distant natural rock only. Doors, routes, props, actors, text, streams and source-controlled light sources are excluded. Foreground geometry and source-controlled lighting remain separate. A detailed moss mesh awaits the room art pass; no floating ceiling patches or permanent painted glow are added. The texture is a prototype art proposal, not a newly human-approved planning record; the existing approved style/concept and their hashes are unchanged.

The original tool output was copied without edits or resizing. Approximately 2 MB transfers on the first cavern visit; it is reused for tunnel and bridge backgrounds during the session. The PNG decodes to roughly 6 MB of RGB/RGBA data before Three.js's renderer-side cube conversion and mipmaps. Actual GPU/device performance still needs measurement. This panorama supplies colour only, not environment lighting or walkable geometry. Background stereoscopy/parallax comes from foreground 3D rocks and the bridge; painted distant rock cannot provide correct near-field depth. Future room art should replace any decorative terrain that conflicts with source descriptions.

## Barrow backdrop v1

`barrow-skybox-v1.png` is a separate 1774×887 (2:1) panorama generated with the built-in imagegen tool on 2026-10-24 for Mark's first-room redesign. The unmodified tool output is approximately 2.6 MB. The full prompt is saved in `barrow-skybox-v1.prompt.txt`. SHA-256: `6e9170a01abb1861954718f451e884925344c7ebf5506c0004d02f8da8b98931`.

It depicts a warm underground stone chamber with no props, characters, doors, tunnels, text or clues. Eight real low rocks supply foreground depth and suggest the bounded floor, while source objects and the south exit marker remain separate targets. The painted walls and ceiling supply distant colour without positional parallax. It loads on the first lit barrow visit and is cached independently from the cavern image; only the current visible room's panorama is applied. It is a prototype asset, not an approved planning-manifest record.

## Dragon's Lair backdrop v1

`lair-skybox-v1.png` is an unmodified 1774×887 (2:1) panorama generated with the built-in imagegen tool on 2026-10-24. The full prompt is in `lair-skybox-v1.prompt.txt`. SHA-256: `0effface58434010b02def1a64d300315124bc16f8434cbba4a7ce66a2fdd8b6`. Approximately 3 MB transfers on the first visible lair visit and is cached separately from the other room images. It depicts flame-scarred stone and distant debris, without people, monsters, chest, props, exits or text. The princess, chest, doorway, foreground rocks and floor are separate geometry. It is a prototype asset, not an approved planning record. The same distant-parallax and real-device measurement limitations apply as to the other panoramas.

## Shared cavern: Narrow Tunnel and Foot Bridge

`narrow-tunnel-room-v1.glb` is the finished second room, generated locally with Hunyuan3D-2 turbo from a built-in ImageGen reference. The generated rock diorama is rotated into the arrival view, clipped around a clear near-bank walking area, and textured with stone grain from that reference. The fused bridge is replaced with authored planks; the stream and high moss are separate authored surfaces. The original room geometry remains the loading/failure fallback. Model visibility follows lit source observations; source movement and object actions remain authoritative.

Narrow Tunnel and Foot Bridge reuse this exact GLB. `cavern-scene.ts` maps each source room to an origin in the shared environment: the tunnel uses the near bank; the bridge uses deck height with its centre at scene Z=6.9m. Moving between those rooms retains the loaded model and changes its origin, camera, walking bounds, exit markers and observation-bound interaction targets. Foot Bridge uses an eight-metre walking area on the existing deck. No second asset or overlapping procedural bridge is added. Leaving these rooms or entering darkness disposes the shared model. A model can span several source rooms without merging their identities, actions or progression.

The asset has 25,938 triangles, four materials, one embedded 512px texture and a size of 1,197,532 bytes. SHA-256: `975601012fcca29e5e2741aafca355778c8e96553f4787ece13329fcc140a080`. The committed `narrow-tunnel-room-v1.json` records source-candidate provenance, sampled clearance and the arrival sightline. See [the image, prompt and finishing workflow](../../../games/zork2/assets/experiments/narrow-tunnel-v1/README.md). Mark requested implementation and public publication on 2026-10-25 under the existing Hunyuan notice and licence. A headset playtest remains outstanding.

## Barrow dressing v2

`barrow-natural-v2.glb` is the blended barrow entrance, cave floor and rock assembly from `out/asset-production/barrow-natural-v2/`, copied unmodified (6.3 MB, 40,751 triangles). SHA-256: `5cad8e7826c394769da53f57016aeca6a54dbd192a286479127fedd11869fff8`. Rock meshes were generated locally with Hunyuan3D 2.0 turbo weights from built-in ImageGen references; see [the experiment](../../../games/zork2/assets/experiments/barrow-natural-v1/README.md) and [blending review](../../../docs/barrow-blend-review.md). Mark chose to ship it on the public prototype on 2026-10-24 despite the Hunyuan licence's US-only prototype scope; revisit before any wider release. It loads only on lit barrow visits; the procedural barrow remains the loading and failure fallback.

## Generated princess and props v1

Mark chose on 2026-10-24 to ship these draft Hunyuan3D candidates in the public prototype, under the same licence caveat as the barrow dressing. Each is copied unmodified from ignored `out/`; the procedural shape remains the loading/failure fallback and automated browsers keep the procedural shapes.

| File | Source | SHA-256 |
|---|---|---|
| `princess-v1.glb` | `out/asset-tools/princess/princess-v1.glb`; 9,960 triangles, `Idle`/`Talk` clips. See [princess notes](../../../games/zork2/assets/characters/princess/README.md). | `a0b4ca75d85c6ae020b942eaf7f878c9c428df06177e38431faf933ec8c30c6c` |
| `chest-v1.glb` | `out/asset-production/asset_chest/animated.glb`; split body and hinged lid. The lid follows the engine's open state; contents remain separate objects. | `c7a5fe28f8b4a6f6f8fabbb0ea1a7a0461dea6be12906defc3cc4a58dca906a8` |
| `lamp-v1.glb` | `out/asset-production/asset_lamp/candidate.glb`; the engine's on state still supplies the light. | `3e0172ea267a69507ec65e836e87f7975743ed6e1b85a613d1bd4a956fc79ed6` |
| `sword-v1.glb` | `out/asset-production/asset_sword/candidate.glb`. | `176f0ef5693c0afce3f473b46f9ba888d3a3e036c29c471c7f4696bc3cbccae5` |

## Shared movable objects

`movable-props.json` records 39 current Hunyuan portable-object exports, including the three files above and 36 files in `props/`. `tools/assets/sync-movable-props.py` copies the current candidate for each source `TAKEBIT` prop, preferring a finished or animated export only when it references that candidate's hash. It validates source/brief hashes and output bytes; raw and rejected meshes are never selected. The sword already matches its latest selected candidate. Re-run with `--check` to verify the shipping files against local production outputs.

`movable-props.generated.ts` and `movable-props.ts` provide one identity-to-model registry for all rooms. GLB URLs are emitted by Vite and fetched only when their objects are observed. Both automated and normal browsers use portable generated models; the larger princess and barrow keep their existing automated-renderer fallback. Source take, drop, inventory, room transitions, concealment, darkness and save restoration determine whether a model appears. No room contains a permanently baked duplicate of a portable model. Rooms without environment geometry display observed objects against the empty background, with walking disabled and the missing artwork noted; this is not a completed room scene.

Seven portable identities still have no generated export: ruby, stamp, statuette, teapot, violin, wand and white book. These keep simple temporary shapes. Most containers have static generated exteriors; only the finished chest has its source-controlled hinge binding. The registry does not invent new lid animations or reveal concealed contents. The original source actions and text remain authoritative.

All four remain `draft` review records with front-projected colour and approximate backs/sides. The princess is a standing pose, whereas the source opening has her seated.

## Opening Cavern extensions

The five-room Opening Cavern environment retains the existing GLB and adds authored geometry in `opening-cavern.ts`. The Shallow Ford and Dark Tunnel reference PNGs supply selected UV patches for rock, ground and dusty floor materials. The ford has a shallow water plane over a pebbled bed; the tunnel has open 3D passages, enclosing rock walls, decorative leaves and twigs. These are authored extensions, not newly inferred Hunyuan meshes. Reference inputs and hashes, room origins and source connections are recorded in the [scene directory](../../../games/zork2/planning/scenes/opening-cavern/README.md). Extensions, textures and instancing buffers are disposed with the shared model when leaving the family or entering darkness. Dark Tunnel uses no cavern panorama and appears only when the source observation is lit.

## Underground Garden integration

The [modular topiary garden v3](../../../games/zork2/assets/scenes/underground-garden/README.md) supplies six hedge sculptures centered on separate islands and the smaller textured gazebo. Vite emits its hashed URL for Pages. The model, packed unlit sky sphere and textures persist across the four lit source rooms. Walking floors and room origins are sampled from the new shell and gazebo. `garden-scene.ts` aligns interaction targets, prevents fog/depth writing on the skybox, and releases every unique resource when leaving the family or entering darkness. The garden panorama is also cached as a native loading/error background.
