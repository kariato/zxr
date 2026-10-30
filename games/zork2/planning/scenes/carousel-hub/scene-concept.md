# Carousel hub environment draft

Created 2026-10-26 using built-in ImageGen. [Selected concept](concept-v1.png) · [exact prompt](concept-v1.prompt.txt). Transparent exterior alpha was checked before generation. Authoring draft only; no runtime integration.

## Source layout and movement

Source declarations: `reference/zork2/2dungeon.zil:632–639,1253–1266`. Disorientation routine: `reference/zork2/2actions.zil:54–87`.

Carousel Room is a large circular hall with a high ceiling lost in gloom and eight identical passages. Its source destinations are N Marble Hall, NE Stream Path, E Topiary Room, SE Riddle Room, S Menhir Room, SW Cobwebby Corridor, W Room 8 and NW Cool Room. Other environments are outside this shared asset. Room 8 is a small rough-rock chamber at the end of a short western crawl; its sole east exit returns to the hub. A crudely chiseled numeral 8 belongs on its wall as a separate readable detail.

When CAROUSEL-FLIP-FLAG is false, source WALK can change the requested direction using its own RNG, with special handling for WEST and OUT. Presentation must dispatch the engine's offered movement and show the resulting observed room; physical heading does not guarantee a destination. Do not add a visible spinning platform or machinery, independently reroll directions, spend turns on animation, or turn the eight passage mouths into eight always-reachable physical triggers.

## Concept and model boundaries

The concept has eight radial passages and the small west chamber. North is back; west is left. The high ceiling and tunnel roofs are omitted for the cutaway authoring view; runtime needs enclosing overhead scenery and appropriate darkness. Passage stubs do not disclose neighboring environments. Stone floor rings are ordinary paving, not a rotating mechanism or additional clue.

Eight matching entrance silhouettes must be checked and normalized during manual authoring. The generated mesh may close or soften arch openings, turn crawl walls into solid surfaces or lose ceiling clearance. Concept visibility is not proof of traversability. Add the numeral 8 separately using source text so it remains accurate and readable; do not use projected accidental texture as the authoritative inscription.

The direct Tencent shape is retained unchanged in native inference units. The colored copy packs the concept and uses editable single-reference UV projection at 60 degrees; side/back stretching is expected. The reduced copy uses curvature weights with an unapplied Decimate modifier. Those weights are editable geometry heuristics, not semantic passage masks. Before integration: set scale, open passages, validate eight entrances and the crawl, add ceiling/inscription, map room viewpoints and hidden walking surfaces, and preserve source movement/lighting. No device performance or gameplay integration is asserted.
