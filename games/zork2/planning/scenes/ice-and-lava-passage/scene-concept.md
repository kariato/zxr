# Ice and lava passage concept

Draft created 2026-10-26 with the built-in image generation tool. Exact prompt: [concept-v1.prompt.txt](concept-v1.prompt.txt). Selected artwork: [concept-v1.png](concept-v1.png).

The two source rooms share an ancient solidified-lava environment. North is rear, east right, west left and south foreground in the concept. The larger Ice Room is east of the smaller Lava Room. Ice blocks their connecting passage in the initial state. The Ice Room has a large east exit to Cool Room and a jumble of rocks below the upward Lava Tube. Lava Room exits south to Volcano Bottom. Neighboring rooms are outside this draft.

Source anchors: `reference/zork2/2dungeon.zil:568–578,1404–1413,1889–1896`; `reference/zork2/2actions.zil:2370–2389,2504–2542`. The hall is worn smooth by a glacier; the source does not require a river of molten lava. The concept's warm highlights are illustrative review lighting, not additional permanent fires or puzzle objects.

`ICE-MELTED` controls westward travel from Ice Room. After melting, the source describes a damp, scorched, steam-filled west passage. Steam, glacier visibility, lighting and access must follow engine observations. Do not let animation advance turns or resolve the puzzle.

The generated shape is an untouched single-image reconstruction, in native inference units. It may fuse ice, rubble and walls. Before runtime integration, separate the glacier into a mutable element, inspect the revealed passage and chimney, set scale and room viewpoints, and map hidden walking surfaces. The concept requests separation but does not establish that the generator supplies it.

Concept review: room placement, eastern passage and upward chimney are readable. The ice is concentrated in the connecting neck; the source says it fills the western half of Ice Room, so its footprint needs expansion during manual authoring. The warm chimney interior is illustrative light. The frozen concept does not show the later steam-filled passage.

The colored copy uses editable single-view UV projection, with the image packed in Blender. Side and back texture stretching remains possible. No geometry cleanup, decimation, vertex displacement or topology repair is applied. This is a manual-editing draft; no runtime bindings or puzzle rules are changed.
