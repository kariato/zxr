# Volcano shared environment draft

Created 2026-10-26. Built-in ImageGen concept: [concept-v1.png](concept-v1.png), with [exact prompt](concept-v1.prompt.txt). This is an authoring draft, not runtime integration.

The selected reconstruction reference is [concept-v2.png](concept-v2.png), a built-in ImageGen background extraction with [exact edit prompt](concept-v2.prompt.txt). Its alpha channel removes the outer backdrop and sky. The first generated `mesh-v1/` and colored `mesh-v1-color/` are retained as rejected attempts: they reconstructed the opaque background as a large rectangular slab. Use the second mesh attempt for continued authoring.

## Source topology

Source declarations: `reference/zork2/2dungeon.zil:582–593,1302–1402`. Dynamic room descriptions: `reference/zork2/2actions.zil:384–397,500–510`.

- Volcano Bottom has a north exit to Lava Room. The volcano is dormant, illuminated from the cone above.
- VAIR-1 through VAIR-4 are four airborne engine rooms, not four physical floors. The first two elevations are approximately 100 and 200 feet above the bottom.
- Narrow Ledge is on the west wall halfway up; south leads to Library, which has gnawed shelving.
- Volcano View is on the east wall, between the west ledges in elevation. It is too narrow for balloon landing. Its east exit reaches Lava Tube.
- Wide Ledge is on the west wall, with the rim about 200 feet above it. Its south door leads to Dusty Room. That doorway can become blocked by rubble.
- Dusty Room's rusty wall box and changing door must be separate source-driven props. Gnome exits are conditional and must not become permanently visible doorways.
- Lava Tube connects down to Ice Room, up to Volcano View and south through a high crack to Cobwebby Corridor. It is a tight vertical chimney, not an ordinary staircase.

North is rear of concept, west left and east right. The caldera shell is shown cut away for authoring. The library and dusty room are side attachments; their exact footprint is an authoring estimate. The concept places the north bottom opening, staggered ledges and east chimney legibly. It does not prove the precise direction or continuity of short side passages. The thin east viewing shelf requires width review; it must not become a balloon landing. Human scale and source height relationships must be set manually after generation.

## Asset boundaries

Characters, balloon, books, safe and treasures are omitted from the generated environment. Preserve all 11 source room identities. Do not infer movement options from model geometry, interpolate between rooms as new gameplay, or spend turns on animation. The source engine owns landing, balloon altitude, gnome exits, explosion and rubble state.

The direct Tencent shape is retained unchanged. The colored copy uses a packed reference image and editable single-view UV projection; this is not learned multiview painting. Side/back projection may repeat or stretch. The reduced copy uses curvature-based Decimate weights, which protect sharper geometry and simplify broad surfaces more. Those weights are editable and are not semantic room masks.

Before integration: inspect the hollow shaft, ledge clearance, chimney and side rooms; split mutable geometry, set physical scale and room cameras, map hidden walking surfaces, and review source-controlled visibility. No walkability, device performance or headset acceptance is asserted by these drafts.
