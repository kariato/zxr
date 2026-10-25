# Cavern backdrop v1

`cavern-skybox-v1.png`: a new 1774×887 (2:1) equirectangular panorama, generated with the built-in image-generation tool on 2026-10-24 for Mark's request for more detailed caverns. The complete generation prompt is in `cavern-skybox-v1.prompt.txt`. SHA-256: `51744b1ba72e65729a7d4353771819eea522e1e642308c82f09b370a031c6438`.

It follows the existing low-poly fantasy style and depicts distant natural rock only. Doors, routes, props, actors, text, streams and source-controlled light sources are excluded. Foreground geometry and source-controlled lighting remain separate. A detailed moss mesh awaits the room art pass; no floating ceiling patches or permanent painted glow are added. The texture is a prototype art proposal, not a newly human-approved planning record; the existing approved style/concept and their hashes are unchanged.

The original tool output was copied without edits or resizing. Approximately 2 MB transfers on the first cavern visit; it is reused for tunnel and bridge backgrounds during the session. The PNG decodes to roughly 6 MB of RGB/RGBA data before Three.js's renderer-side cube conversion and mipmaps. Actual GPU/device performance still needs measurement. This panorama supplies colour only, not environment lighting or walkable geometry. Background stereoscopy/parallax comes from foreground 3D rocks and the bridge; painted distant rock cannot provide correct near-field depth. Future room art should replace any decorative terrain that conflicts with source descriptions.

## Barrow backdrop v1

`barrow-skybox-v1.png` is a separate 1774×887 (2:1) panorama generated with the built-in imagegen tool on 2026-10-24 for Mark's first-room redesign. The unmodified tool output is approximately 2.6 MB. The full prompt is saved in `barrow-skybox-v1.prompt.txt`. SHA-256: `6e9170a01abb1861954718f451e884925344c7ebf5506c0004d02f8da8b98931`.

It depicts a warm underground stone chamber with no props, characters, doors, tunnels, text or clues. Eight real low rocks supply foreground depth and suggest the bounded floor, while source objects and the south exit marker remain separate targets. The painted walls and ceiling supply distant colour without positional parallax. It loads on the first lit barrow visit and is cached independently from the cavern image; only the current visible room's panorama is applied. It is a prototype asset, not an approved planning-manifest record.

## Dragon's Lair backdrop v1

`lair-skybox-v1.png` is an unmodified 1774×887 (2:1) panorama generated with the built-in imagegen tool on 2026-10-24. The full prompt is in `lair-skybox-v1.prompt.txt`. SHA-256: `0effface58434010b02def1a64d300315124bc16f8434cbba4a7ce66a2fdd8b6`. Approximately 3 MB transfers on the first visible lair visit and is cached separately from the other room images. It depicts flame-scarred stone and distant debris, without people, monsters, chest, props, exits or text. The princess, chest, doorway, foreground rocks and floor are separate geometry. It is a prototype asset, not an approved planning record. The same distant-parallax and real-device measurement limitations apply as to the other panoramas.
