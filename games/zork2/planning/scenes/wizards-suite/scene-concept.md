# Wizard's suite environment draft

Created 2026-10-26 with built-in ImageGen. Selected [concept-v1.png](concept-v1.png), [exact prompt](concept-v1.prompt.txt). Transparent exterior alpha was checked before shape generation. Draft only; no runtime integration.

## Source topology

Room/object declarations: `reference/zork2/2dungeon.zil:957–1251`. Dynamic entrance/workshop descriptions: `reference/zork2/2actions.zil:3010–3043`; changing quarters: `3822–3853`.

North is rear and east is right in the cutaway concept. The main north row is Aquarium Room — Workroom — Workshop from west to east. South of those are Quarters, Pentagram Room and Trophy Room respectively. Guarded Room is north of Workshop, with a north exit to Cobwebby Corridor. The guarded south door controls access to Workshop. The three south chambers are dead ends with only their north exits; there are no lateral connections among them.

IN-AQUARIUM is a distinct engine viewpoint inside the huge aquarium, not an additional building room. The aquarium occupies the northern half of Aquarium Room. Its shell, water, serpent, sand and sphere require separate source-controlled presentation. The empty north space in this concept reserves its footprint; it is not permission to omit the aquarium from the eventual room.

## Mutable elements and props

- Keep WIZ-DOOR and its guardian head separate. Open state and guardian behavior follow the source.
- Workbench is heavy dark wood bound with iron. Ruby, sapphire and diamond stands form a triangle; stands, spheres and arcana remain separate from the generated shell.
- Trophy exhibits, labels and the cabinet's intact/broken states are separate assets. Use source text for readable content rather than generated writing.
- Pentagram is black chalk with a black center circle, added as a separate decal/mesh. Do not bake a glowing symbol or active demon into the floor.
- Quarters changes description using source RNG during LOOK/FLASH. Preserve the source output and RNG calls; presentation must not independently reroll its furnishings. The concept shows a neutral shell, not one permanently chosen description.
- Concept candles are authoring illumination. Runtime darkness and visibility remain tied to source observations.

## Concept review and integration work

The concept shows seven rooms and the three north-only south-room doorways. It omits the guarded room's north exit stub; author that source connection manually. Decorative wall niches in Aquarium Room are not exits. The aquarium reserve may need enlargement. Workroom/workshop lateral openings need clearance checks after reconstruction. The workbench is fused environment geometry in this draft; split it if required for placement or interaction. Furnishing, room proportions and masonry are authoring estimates.

The direct Tencent shape is preserved unchanged. The colored copy packs the concept and uses editable single-view UV projection, with possible side/back repetition and stretching. The reduced copy keeps an unapplied Decimate modifier and editable curvature weights; these protect sharper geometry but are not semantic room masks. Manual doorway cleanup, physical scale, room cameras, hidden walking floors and mutable asset assembly remain before integration. No gameplay rules, source bindings or saves are changed.
