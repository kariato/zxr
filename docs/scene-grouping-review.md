# Zork II scene grouping review

Reviewed against `reference/zork2/2dungeon.zil` and relevant room/action routines in `2actions.zil`, 2026-10-25. This is an authoring proposal, not a change to approved scene plans, runtime bindings, or gameplay. All 86 source room identities are accounted for below, including alternate-scale, airborne, interior, and mist rooms.

One authored environment can contain several room viewpoints. Each viewpoint must still use the source engine's current room, lighting, observed objects, actions, and movement result. A shared asset does not imply an always-open route, visible neighboring puzzle state, or seamless physical travel.

| Proposed environment | Source rooms | Reuse and boundaries |
| --- | --- | --- |
| [Opening cavern](../games/zork2/planning/scenes/opening-cavern/README.md) | NARROW-TUNNEL, FOOT-BRIDGE, GREAT-CAVERN, SHALLOW-FORD, DARK-TUNNEL | All five share the retained cavern environment. The original GLB is extended with reference-textured ford, rock walls and an enclosed branching tunnel. Source observations control water interaction and tunnel darkness. |
| [Underground garden](../games/zork2/planning/scenes/underground-garden/README.md) | GARDEN-NORTH, GAZEBO-ROOM, FORMAL-GARDEN, TOPIARY-ROOM | Strong single-scene candidate: one garden from north to south, gazebo within the rosebed, gravel paths and topiary, hedges obscuring cave walls, glowing moss overhead. Gazebo interior uses the same structure. |
| [Lower ravine and cliff rooms](../games/zork2/planning/scenes/lower-ravine/README.md) | STREAM-PATH, MARBLE-HALL, DEEP-FORD, RAVINE-LEDGE, LEDGE-TUNNEL, TINY-ROOM, DREARY-ROOM | One ravine at multiple elevations, with an adjoining ruined hall and two cliff chambers. Share rock and stream scenery with the opening cavern where useful, but extend the model to provide the actual ledges, deep ford, climb and halls. Marble Hall's secret connection and the Tiny/Dreary shared door require state-controlled boundaries. |
| [Dragon and stone bridge](../games/zork2/planning/scenes/dragon-and-stone-bridge/README.md) | DRAGON-ROOM, DRAGON-LAIR, FRESCO-ROOM, STONE-BRIDGE, COOL-ROOM | Scorched cavern, lair behind its blackened doorway, fresco passage, a ruined stone bridge across the chasm, and a misty landing. Reuse the existing lair. The stone bridge needs different geometry from the wooden Foot Bridge. Dragon access remains conditional. |
| [Ice and lava passage](../games/zork2/planning/scenes/ice-and-lava-passage/README.md) | GLACIER-ROOM, LAVA-ROOM | Shared ancient lava hall/passage with a glacier and a state-dependent melted opening. Could join the dragon or volcano environment later; keep its ice, steam and opening mutable rather than baked into a static mesh. |
| [Volcano](../games/zork2/planning/scenes/volcano/README.md) | VOLCANO-BOTTOM, VAIR-1, VAIR-2, VAIR-3, VAIR-4, LEDGE-1, LEDGE-2, VOLCANO-VIEW, LIBRARY, SAFE-ROOM, LAVA-TUBE | Especially strong reuse: one tall caldera seen from its bottom, four balloon elevations and three ledges. Library and Dusty Room are enclosed side chambers; Lava Tube is the adjoining vertical chimney. Maintain source landing rules, height differences, gnome exits and changing ledge/safe state. Prefer modular interior attachments to one giant detailed mesh. |
| [Wizard's suite](../games/zork2/planning/scenes/wizards-suite/README.md) | GUARDIAN-ROOM, WIZARDS-WORKSHOP, WORKBENCH-ROOM, TROPHY-ROOM, PENTAGRAM-ROOM, AQUARIUM-ROOM, IN-AQUARIUM, WIZARDS-QUARTERS | One suite of connected chambers with distinct dressing: guarded entrance, workbench, trophy wall, pentagram, aquarium and quarters. Murky Room is a viewpoint inside that aquarium. Keep guarded doors and aquarium contents/state separate from the building shell. |
| [Carousel hub](../games/zork2/planning/scenes/carousel-hub/README.md) | CAROUSEL-ROOM, ROOM-8 | One central circular hall and its small western crawl chamber. Its eight identical passage mouths can reuse geometry. Do not make physical direction alone determine an exit: carousel movement is deliberately disorienting and source-controlled. Other regions attach through passages. |
| [Quarry and stair](../games/zork2/planning/scenes/quarry-and-stair/README.md) | MENHIR-ROOM, KENNEL, STAIRWAY-TOP | Quarry, side kennel, and marble stair approach. One complex with a movable menhir controlling the kennel opening. The menhir must be a separate state-driven element. |
| [Oddly-angled maze](../games/zork2/planning/scenes/oddly-angled-maze/README.md) | DIAMOND-1 through DIAMOND-9 | One reusable glassy chamber kit instantiated for nine source rooms, with window and central stair variants. Strong model reuse; source puzzle movement must remain authoritative rather than treating the nine rooms as an ordinary walkable grid. |
| [Crypt](../games/zork2/planning/scenes/crypt/README.md) | CERBERUS-ROOM, CRYPT-ANTEROOM, CRYPT-ROOM, ZORK3 | Gateway, relief-lined anteroom, crypt and final landing. One tomb complex with controlled dog, marble door and secret-door boundaries. Do not expose the hidden landing before the source reveals it; it can remain a separately loaded attachment. |
| [Well and Wonderland](../games/zork2/planning/scenes/well-and-wonderland/README.md) | RIDDLE-ROOM, PEARL-ROOM, WELL-BOTTOM, WELL-TOP, TEA-ROOM, POSTS-ROOM, POOL-ROOM | One approach and vertical well with rooms at the top. Tea Room and Posts Room are two scales of the same space: shrinking makes the table's legs and underside become posts and a roof. Pool Room extends the small-scale view through the mouse-sized opening. Share room geometry, but keep carried objects, object visibility and engine identities independent of environmental scaling. The riddle door remains conditional. |
| [Machinery wing](../games/zork2/planning/scenes/machinery-wing/README.md) | MAGNET-ROOM, MACHINE-ROOM, CAGE-ROOM, IN-CAGE | Low circular approach, machinery hall, adjoining closet and viewpoint inside the steel cage. Strong enclosed complex; buttons, cage state and computed magnetic exits require engine-driven presentation. Could attach to the Wonderland environment rather than force both into a single export. |
| [Bank](../games/zork2/planning/scenes/bank/README.md) | BANK-ENTRANCE, TELLER-WEST, TELLER-EAST, VIEWING-WEST, VIEWING-EAST, SMALL-ROOM, VAULT, DEPOSITORY, OFFICE | One bank architectural kit, mirrored teller/viewing wings, depository and office. High asset reuse, but magical walls and computed returns make a conventional continuous floor plan unsuitable. Small Room and Vault can be isolated scene cells using the same kit, reached through source-controlled transitions. |
| [Palantir mist](../games/zork2/planning/scenes/palantir-mist/README.md) | DEAD-PALANTIR-1, DEAD-PALANTIR-2, DEAD-PALANTIR-3, DEAD-PALANTIR-4 | One reusable mist environment with red, blue, white and black variants and source-controlled sphere appearances/transitions. It need not occupy a place in the ordinary dungeon's physical model. |
| [Barrow entrance](../games/zork2/planning/scenes/barrow-entrance/README.md) | INSIDE-BARROW | Existing distinct entrance environment. Can share tunnel materials and an adjoining passage, but retains its own dressing and atmosphere. |
| [Cobwebbed connector](../games/zork2/planning/scenes/cobwebbed-connector/README.md) | COBWEBBY-CORRIDOR | A winding connector between the carousel, guarded room and high crack into Lava Tube. Reuse cave corridor modules; decide which neighboring scene owns the connector based on loading/visibility, without merging the whole dungeon. |

## Scene directory structure

The authoring hierarchy is in [games/zork2/planning/scenes](../games/zork2/planning/scenes/README.md). Each group contains its source-room directories. Scene READMEs describe shared work; room READMEs link to the existing context and plans. The hierarchy preserves all 86 source room identities.

```text
scenes/
├── opening-cavern/
│   ├── NARROW-TUNNEL/
│   ├── FOOT-BRIDGE/
│   ├── GREAT-CAVERN/
│   ├── SHALLOW-FORD/
│   └── DARK-TUNNEL/
├── underground-garden/
│   ├── GARDEN-NORTH/
│   ├── GAZEBO-ROOM/
│   ├── FORMAL-GARDEN/
│   └── TOPIARY-ROOM/
├── lower-ravine/
│   ├── STREAM-PATH/
│   ├── MARBLE-HALL/
│   ├── DEEP-FORD/
│   ├── RAVINE-LEDGE/
│   ├── LEDGE-TUNNEL/
│   ├── TINY-ROOM/
│   └── DREARY-ROOM/
├── dragon-and-stone-bridge/
│   ├── DRAGON-ROOM/
│   ├── DRAGON-LAIR/
│   ├── FRESCO-ROOM/
│   ├── STONE-BRIDGE/
│   └── COOL-ROOM/
├── ice-and-lava-passage/
│   ├── GLACIER-ROOM/
│   └── LAVA-ROOM/
├── volcano/
│   ├── VOLCANO-BOTTOM/
│   ├── VAIR-1/
│   ├── VAIR-2/
│   ├── VAIR-3/
│   ├── VAIR-4/
│   ├── LEDGE-1/
│   ├── LEDGE-2/
│   ├── VOLCANO-VIEW/
│   ├── LIBRARY/
│   ├── SAFE-ROOM/
│   └── LAVA-TUBE/
├── wizards-suite/
│   ├── GUARDIAN-ROOM/
│   ├── WIZARDS-WORKSHOP/
│   ├── WORKBENCH-ROOM/
│   ├── TROPHY-ROOM/
│   ├── PENTAGRAM-ROOM/
│   ├── AQUARIUM-ROOM/
│   ├── IN-AQUARIUM/
│   └── WIZARDS-QUARTERS/
├── carousel-hub/
│   ├── CAROUSEL-ROOM/
│   └── ROOM-8/
├── quarry-and-stair/
│   ├── MENHIR-ROOM/
│   ├── KENNEL/
│   └── STAIRWAY-TOP/
├── oddly-angled-maze/
│   ├── DIAMOND-1/
│   ├── DIAMOND-2/
│   ├── DIAMOND-3/
│   ├── DIAMOND-4/
│   ├── DIAMOND-5/
│   ├── DIAMOND-6/
│   ├── DIAMOND-7/
│   ├── DIAMOND-8/
│   └── DIAMOND-9/
├── crypt/
│   ├── CERBERUS-ROOM/
│   ├── CRYPT-ANTEROOM/
│   ├── CRYPT-ROOM/
│   └── ZORK3/
├── well-and-wonderland/
│   ├── RIDDLE-ROOM/
│   ├── PEARL-ROOM/
│   ├── WELL-BOTTOM/
│   ├── WELL-TOP/
│   ├── TEA-ROOM/
│   ├── POSTS-ROOM/
│   └── POOL-ROOM/
├── machinery-wing/
│   ├── MAGNET-ROOM/
│   ├── MACHINE-ROOM/
│   ├── CAGE-ROOM/
│   └── IN-CAGE/
├── bank/
│   ├── BANK-ENTRANCE/
│   ├── TELLER-WEST/
│   ├── TELLER-EAST/
│   ├── VIEWING-WEST/
│   ├── VIEWING-EAST/
│   ├── SMALL-ROOM/
│   ├── VAULT/
│   ├── DEPOSITORY/
│   └── OFFICE/
├── palantir-mist/
│   ├── DEAD-PALANTIR-1/
│   ├── DEAD-PALANTIR-2/
│   ├── DEAD-PALANTIR-3/
│   └── DEAD-PALANTIR-4/
├── barrow-entrance/
│   └── INSIDE-BARROW/
└── cobwebbed-connector/
    └── COBWEBBY-CORRIDOR/
```

## Suggested production order

1. Opening Cavern is implemented through Shallow Ford and Dark Tunnel; continue visual and headset review as needed.
2. Build the four-room garden as the next complete shared environment.
3. Extend the ravine with the deep ford, ledges and cliff chambers.
4. Build the dragon/stone-bridge complex around the existing lair.
5. Create the volcano as one major vertical environment; its multiple elevations give unusually high reuse.
6. Follow with the wizard suite, bank kit, well/Wonderland and remaining groups according to gameplay priorities.

The 17 rows are planning groups, not a target of exactly 17 GLBs. Large spaces benefit from a common environment plus independently loaded interiors and movable/stateful elements. Repeated maze or bank rooms benefit from one reusable kit even when they cannot share a continuous physical layout. Keep authored scene scale and performance review separate from preserving the source room graph.

## Source anchors

- Opening cavern/garden/ravine/dragon: `2dungeon.zil:191–465`; stone bridge, ice and lava tube: `526–610`.
- Quarry, maze and crypt: `2dungeon.zil:641–953`; menhir state: `2actions.zil:2849`; maze movement: `2actions.zil:2204`; crypt light/door state: `2actions.zil:608`.
- Wizard suite: `2dungeon.zil:957–1251`; carousel exits: `2actions.zil:54`.
- Volcano: `2dungeon.zil:1302–1415`; well/Wonderland/machinery: `1420–1555`; actual Tea Room to Posts Room size change: `2actions.zil:892`.
- Bank: `2dungeon.zil:1559–1680`, with computed/magical transition routines in `2actions.zil:1359` onward.
- Tiny/Dreary shared door: `2dungeon.zil:1702–1723`, `2actions.zil:1541`; mist rooms: `2dungeon.zil:2658–2692`.
