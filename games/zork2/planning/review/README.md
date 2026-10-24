# Phase 6 review index

The full current set contains **386 planning records**: 86 room plans, 165 source-identity briefs and 135 label sets containing 267 source-family strings and five decision labels. **22 records are approved; 364 new records await review.**

Open [the local editor](http://127.0.0.1:5181/authoring.html) after starting `npm run dev -- --port 5181 --strictPort`. It shows changed fields, edits JSON, persists field locks and applies re-plans without overwriting locks. Approval always names a reviewer and selects an exact version.

The original eight-room pilot has detailed placement. New room profiles are source-backed first-pass art/staging proposals with explicit conservative transitions; they are not rendered GLBs. Dimensions, placeholder swatches, grid staging and alias variants need human art review before asset generation. Abstract/parser/global actor proxies explicitly request no independent body. A brief is not evidence that its prop can reach a room.

All concealed, mutable and destructible source bodies remain separate from static shell parts. Conditional/computed exits without safely observed state are explicitly menu-only; the planner does not carve hidden passages into walls. Existing source menu actions remain available. The six existing knowledge rules are unchanged; [gate review](../gate-proposals.json) proposes no additional rules.

## Review workflow

1. Filter the editor by room, asset or label group. Compare source context and draft; original approvals remain selected.
2. Save edits with JSON-pointer locks such as `/description` or `/sizeMetres`. Array locks are positional; lock a whole collection when its ordering matters.
3. Paste a new proposal and use **Apply re-plan with locks**. Removed locked fields or source-invalid proposals fail.
4. After reviewing the saved record, enter your name and approve that exact version. New edits return to draft; the old approval is retained until replaced.
5. Run `npm run phase6:check`. The stricter `npm run phase6:check -- --complete` additionally requires every current record to be approved.

The authoring diagram uses an isolated source world and the filtered appearance query. Crypt controls exercise real DIM-DOOR INVISIBLE state; this is a disclosure test, not a solution of the crypt puzzle. Darkness clears the diagram. GLB generation and real-device acceptance belong to later phases.

## Rooms

| Record | Approval | Evidence |
|---|---|---|
| [AQUARIUM-ROOM](../drafts/scene-plan_AQUARIUM-ROOM.json) | Needs review | [source context](../context/aquarium-room.json) |
| [BANK-ENTRANCE](../drafts/scene-plan_BANK-ENTRANCE.json) | Needs review | [source context](../context/bank-entrance.json) |
| [CAGE-ROOM](../drafts/scene-plan_CAGE-ROOM.json) | Needs review | [source context](../context/cage-room.json) |
| [CAROUSEL-ROOM](../drafts/scene-plan_CAROUSEL-ROOM.json) | Needs review | [source context](../context/carousel-room.json) |
| [CERBERUS-ROOM](../drafts/scene-plan_CERBERUS-ROOM.json) | Needs review | [source context](../context/cerberus-room.json) |
| [COBWEBBY-CORRIDOR](../drafts/scene-plan_COBWEBBY-CORRIDOR.json) | Needs review | [source context](../context/cobwebby-corridor.json) |
| [COOL-ROOM](../drafts/scene-plan_COOL-ROOM.json) | Needs review | [source context](../context/cool-room.json) |
| [CRYPT-ANTEROOM](../drafts/scene-plan_CRYPT-ANTEROOM.json) | Needs review | [source context](../context/crypt-anteroom.json) |
| [CRYPT-ROOM](../drafts/scene-plan_CRYPT-ROOM.json) | Needs review | [source context](../context/crypt-room.json) |
| [DARK-TUNNEL](../drafts/scene-plan_DARK-TUNNEL.json) | Approved | [source context](../context/dark-tunnel.json) |
| [DEAD-PALANTIR-1](../drafts/scene-plan_DEAD-PALANTIR-1.json) | Needs review | [source context](../context/dead-palantir-1.json) |
| [DEAD-PALANTIR-2](../drafts/scene-plan_DEAD-PALANTIR-2.json) | Needs review | [source context](../context/dead-palantir-2.json) |
| [DEAD-PALANTIR-3](../drafts/scene-plan_DEAD-PALANTIR-3.json) | Needs review | [source context](../context/dead-palantir-3.json) |
| [DEAD-PALANTIR-4](../drafts/scene-plan_DEAD-PALANTIR-4.json) | Needs review | [source context](../context/dead-palantir-4.json) |
| [DEEP-FORD](../drafts/scene-plan_DEEP-FORD.json) | Needs review | [source context](../context/deep-ford.json) |
| [DEPOSITORY](../drafts/scene-plan_DEPOSITORY.json) | Needs review | [source context](../context/depository.json) |
| [DIAMOND-1](../drafts/scene-plan_DIAMOND-1.json) | Needs review | [source context](../context/diamond-1.json) |
| [DIAMOND-2](../drafts/scene-plan_DIAMOND-2.json) | Needs review | [source context](../context/diamond-2.json) |
| [DIAMOND-3](../drafts/scene-plan_DIAMOND-3.json) | Needs review | [source context](../context/diamond-3.json) |
| [DIAMOND-4](../drafts/scene-plan_DIAMOND-4.json) | Needs review | [source context](../context/diamond-4.json) |
| [DIAMOND-5](../drafts/scene-plan_DIAMOND-5.json) | Needs review | [source context](../context/diamond-5.json) |
| [DIAMOND-6](../drafts/scene-plan_DIAMOND-6.json) | Needs review | [source context](../context/diamond-6.json) |
| [DIAMOND-7](../drafts/scene-plan_DIAMOND-7.json) | Needs review | [source context](../context/diamond-7.json) |
| [DIAMOND-8](../drafts/scene-plan_DIAMOND-8.json) | Needs review | [source context](../context/diamond-8.json) |
| [DIAMOND-9](../drafts/scene-plan_DIAMOND-9.json) | Needs review | [source context](../context/diamond-9.json) |
| [DRAGON-LAIR](../drafts/scene-plan_DRAGON-LAIR.json) | Needs review | [source context](../context/dragon-lair.json) |
| [DRAGON-ROOM](../drafts/scene-plan_DRAGON-ROOM.json) | Needs review | [source context](../context/dragon-room.json) |
| [DREARY-ROOM](../drafts/scene-plan_DREARY-ROOM.json) | Needs review | [source context](../context/dreary-room.json) |
| [FOOT-BRIDGE](../drafts/scene-plan_FOOT-BRIDGE.json) | Approved | [source context](../context/foot-bridge.json) |
| [FORMAL-GARDEN](../drafts/scene-plan_FORMAL-GARDEN.json) | Approved | [source context](../context/formal-garden.json) |
| [FRESCO-ROOM](../drafts/scene-plan_FRESCO-ROOM.json) | Needs review | [source context](../context/fresco-room.json) |
| [GARDEN-NORTH](../drafts/scene-plan_GARDEN-NORTH.json) | Needs review | [source context](../context/garden-north.json) |
| [GAZEBO-ROOM](../drafts/scene-plan_GAZEBO-ROOM.json) | Needs review | [source context](../context/gazebo-room.json) |
| [GLACIER-ROOM](../drafts/scene-plan_GLACIER-ROOM.json) | Needs review | [source context](../context/glacier-room.json) |
| [GREAT-CAVERN](../drafts/scene-plan_GREAT-CAVERN.json) | Approved | [source context](../context/great-cavern.json) |
| [GUARDIAN-ROOM](../drafts/scene-plan_GUARDIAN-ROOM.json) | Needs review | [source context](../context/guardian-room.json) |
| [IN-AQUARIUM](../drafts/scene-plan_IN-AQUARIUM.json) | Needs review | [source context](../context/in-aquarium.json) |
| [IN-CAGE](../drafts/scene-plan_IN-CAGE.json) | Needs review | [source context](../context/in-cage.json) |
| [INSIDE-BARROW](../drafts/scene-plan_INSIDE-BARROW.json) | Approved | [source context](../context/inside-barrow.json) |
| [KENNEL](../drafts/scene-plan_KENNEL.json) | Needs review | [source context](../context/kennel.json) |
| [LAVA-ROOM](../drafts/scene-plan_LAVA-ROOM.json) | Needs review | [source context](../context/lava-room.json) |
| [LAVA-TUBE](../drafts/scene-plan_LAVA-TUBE.json) | Needs review | [source context](../context/lava-tube.json) |
| [LEDGE-1](../drafts/scene-plan_LEDGE-1.json) | Needs review | [source context](../context/ledge-1.json) |
| [LEDGE-2](../drafts/scene-plan_LEDGE-2.json) | Needs review | [source context](../context/ledge-2.json) |
| [LEDGE-TUNNEL](../drafts/scene-plan_LEDGE-TUNNEL.json) | Needs review | [source context](../context/ledge-tunnel.json) |
| [LIBRARY](../drafts/scene-plan_LIBRARY.json) | Needs review | [source context](../context/library.json) |
| [MACHINE-ROOM](../drafts/scene-plan_MACHINE-ROOM.json) | Needs review | [source context](../context/machine-room.json) |
| [MAGNET-ROOM](../drafts/scene-plan_MAGNET-ROOM.json) | Needs review | [source context](../context/magnet-room.json) |
| [MARBLE-HALL](../drafts/scene-plan_MARBLE-HALL.json) | Needs review | [source context](../context/marble-hall.json) |
| [MENHIR-ROOM](../drafts/scene-plan_MENHIR-ROOM.json) | Needs review | [source context](../context/menhir-room.json) |
| [NARROW-TUNNEL](../drafts/scene-plan_NARROW-TUNNEL.json) | Approved | [source context](../context/narrow-tunnel.json) |
| [OFFICE](../drafts/scene-plan_OFFICE.json) | Needs review | [source context](../context/office.json) |
| [PEARL-ROOM](../drafts/scene-plan_PEARL-ROOM.json) | Needs review | [source context](../context/pearl-room.json) |
| [PENTAGRAM-ROOM](../drafts/scene-plan_PENTAGRAM-ROOM.json) | Needs review | [source context](../context/pentagram-room.json) |
| [POOL-ROOM](../drafts/scene-plan_POOL-ROOM.json) | Needs review | [source context](../context/pool-room.json) |
| [POSTS-ROOM](../drafts/scene-plan_POSTS-ROOM.json) | Needs review | [source context](../context/posts-room.json) |
| [RAVINE-LEDGE](../drafts/scene-plan_RAVINE-LEDGE.json) | Needs review | [source context](../context/ravine-ledge.json) |
| [RIDDLE-ROOM](../drafts/scene-plan_RIDDLE-ROOM.json) | Needs review | [source context](../context/riddle-room.json) |
| [ROOM-8](../drafts/scene-plan_ROOM-8.json) | Needs review | [source context](../context/room-8.json) |
| [SAFE-ROOM](../drafts/scene-plan_SAFE-ROOM.json) | Needs review | [source context](../context/safe-room.json) |
| [SHALLOW-FORD](../drafts/scene-plan_SHALLOW-FORD.json) | Approved | [source context](../context/shallow-ford.json) |
| [SMALL-ROOM](../drafts/scene-plan_SMALL-ROOM.json) | Needs review | [source context](../context/small-room.json) |
| [STAIRWAY-TOP](../drafts/scene-plan_STAIRWAY-TOP.json) | Needs review | [source context](../context/stairway-top.json) |
| [STONE-BRIDGE](../drafts/scene-plan_STONE-BRIDGE.json) | Needs review | [source context](../context/stone-bridge.json) |
| [STREAM-PATH](../drafts/scene-plan_STREAM-PATH.json) | Needs review | [source context](../context/stream-path.json) |
| [TEA-ROOM](../drafts/scene-plan_TEA-ROOM.json) | Needs review | [source context](../context/tea-room.json) |
| [TELLER-EAST](../drafts/scene-plan_TELLER-EAST.json) | Needs review | [source context](../context/teller-east.json) |
| [TELLER-WEST](../drafts/scene-plan_TELLER-WEST.json) | Needs review | [source context](../context/teller-west.json) |
| [TINY-ROOM](../drafts/scene-plan_TINY-ROOM.json) | Approved | [source context](../context/tiny-room.json) |
| [TOPIARY-ROOM](../drafts/scene-plan_TOPIARY-ROOM.json) | Needs review | [source context](../context/topiary-room.json) |
| [TROPHY-ROOM](../drafts/scene-plan_TROPHY-ROOM.json) | Needs review | [source context](../context/trophy-room.json) |
| [VAIR-1](../drafts/scene-plan_VAIR-1.json) | Needs review | [source context](../context/vair-1.json) |
| [VAIR-2](../drafts/scene-plan_VAIR-2.json) | Needs review | [source context](../context/vair-2.json) |
| [VAIR-3](../drafts/scene-plan_VAIR-3.json) | Needs review | [source context](../context/vair-3.json) |
| [VAIR-4](../drafts/scene-plan_VAIR-4.json) | Needs review | [source context](../context/vair-4.json) |
| [VAULT](../drafts/scene-plan_VAULT.json) | Needs review | [source context](../context/vault.json) |
| [VIEWING-EAST](../drafts/scene-plan_VIEWING-EAST.json) | Needs review | [source context](../context/viewing-east.json) |
| [VIEWING-WEST](../drafts/scene-plan_VIEWING-WEST.json) | Needs review | [source context](../context/viewing-west.json) |
| [VOLCANO-BOTTOM](../drafts/scene-plan_VOLCANO-BOTTOM.json) | Needs review | [source context](../context/volcano-bottom.json) |
| [VOLCANO-VIEW](../drafts/scene-plan_VOLCANO-VIEW.json) | Needs review | [source context](../context/volcano-view.json) |
| [WELL-BOTTOM](../drafts/scene-plan_WELL-BOTTOM.json) | Needs review | [source context](../context/well-bottom.json) |
| [WELL-TOP](../drafts/scene-plan_WELL-TOP.json) | Needs review | [source context](../context/well-top.json) |
| [WIZARDS-QUARTERS](../drafts/scene-plan_WIZARDS-QUARTERS.json) | Needs review | [source context](../context/wizards-quarters.json) |
| [WIZARDS-WORKSHOP](../drafts/scene-plan_WIZARDS-WORKSHOP.json) | Needs review | [source context](../context/wizards-workshop.json) |
| [WORKBENCH-ROOM](../drafts/scene-plan_WORKBENCH-ROOM.json) | Needs review | [source context](../context/workbench-room.json) |
| [ZORK3](../drafts/scene-plan_ZORK3.json) | Needs review | [source context](../context/zork3.json) |

## Source identities

| Record | Approval | Evidence |
|---|---|---|
| [ADVENTURER](../drafts/asset-brief_ADVENTURER.json) | Needs review | [source catalogue](../context/objects.json) |
| [ALICE-TABLE](../drafts/asset-brief_ALICE-TABLE.json) | Needs review | [source catalogue](../context/objects.json) |
| [AQUARIUM](../drafts/asset-brief_AQUARIUM.json) | Needs review | [source catalogue](../context/objects.json) |
| [ARCANA](../drafts/asset-brief_ARCANA.json) | Needs review | [source catalogue](../context/objects.json) |
| [BALLOON](../drafts/asset-brief_BALLOON.json) | Needs review | [source catalogue](../context/objects.json) |
| [BALLOON-LABEL](../drafts/asset-brief_BALLOON-LABEL.json) | Needs review | [source catalogue](../context/objects.json) |
| [BANK-BROCHURE](../drafts/asset-brief_BANK-BROCHURE.json) | Needs review | [source catalogue](../context/objects.json) |
| [BAT](../drafts/asset-brief_BAT.json) | Needs review | [source catalogue](../context/objects.json) |
| [BILLS](../drafts/asset-brief_BILLS.json) | Needs review | [source catalogue](../context/objects.json) |
| [BLESSINGS](../drafts/asset-brief_BLESSINGS.json) | Needs review | [source catalogue](../context/objects.json) |
| [BLUE-BOOK](../drafts/asset-brief_BLUE-BOOK.json) | Needs review | [source catalogue](../context/objects.json) |
| [BLUE-ICING](../drafts/asset-brief_BLUE-ICING.json) | Needs review | [source catalogue](../context/objects.json) |
| [BOTTOM-ETCHINGS](../drafts/asset-brief_BOTTOM-ETCHINGS.json) | Needs review | [source catalogue](../context/objects.json) |
| [BRAIDED-WIRE](../drafts/asset-brief_BRAIDED-WIRE.json) | Needs review | [source catalogue](../context/objects.json) |
| [BRICK](../drafts/asset-brief_BRICK.json) | Needs review | [source catalogue](../context/objects.json) |
| [BRIDGE](../drafts/asset-brief_BRIDGE.json) | Approved | [source catalogue](../context/objects.json) |
| [BROKEN-CASE](../drafts/asset-brief_BROKEN-CASE.json) | Needs review | [source catalogue](../context/objects.json) |
| [BROKEN-LAMP](../drafts/asset-brief_BROKEN-LAMP.json) | Needs review | [source catalogue](../context/objects.json) |
| [BUCKET](../drafts/asset-brief_BUCKET.json) | Needs review | [source catalogue](../context/objects.json) |
| [CAGE](../drafts/asset-brief_CAGE.json) | Needs review | [source catalogue](../context/objects.json) |
| [CANDY](../drafts/asset-brief_CANDY.json) | Needs review | [source catalogue](../context/objects.json) |
| [CARD](../drafts/asset-brief_CARD.json) | Needs review | [source catalogue](../context/objects.json) |
| [CERBERUS](../drafts/asset-brief_CERBERUS.json) | Needs review | [source catalogue](../context/objects.json) |
| [CHASM](../drafts/asset-brief_CHASM.json) | Approved | [source catalogue](../context/objects.json) |
| [CHEST](../drafts/asset-brief_CHEST.json) | Needs review | [source catalogue](../context/objects.json) |
| [CLOTH-BAG](../drafts/asset-brief_CLOTH-BAG.json) | Needs review | [source catalogue](../context/objects.json) |
| [COIN](../drafts/asset-brief_COIN.json) | Needs review | [source catalogue](../context/objects.json) |
| [COLLAR](../drafts/asset-brief_COLLAR.json) | Needs review | [source catalogue](../context/objects.json) |
| [COMPASS](../drafts/asset-brief_COMPASS.json) | Needs review | [source catalogue](../context/objects.json) |
| [CROWN](../drafts/asset-brief_CROWN.json) | Needs review | [source catalogue](../context/objects.json) |
| [CRYPT](../drafts/asset-brief_CRYPT.json) | Needs review | [source catalogue](../context/objects.json) |
| [CRYPT-DOOR](../drafts/asset-brief_CRYPT-DOOR.json) | Needs review | [source catalogue](../context/objects.json) |
| [CUBE](../drafts/asset-brief_CUBE.json) | Needs review | [source catalogue](../context/objects.json) |
| [CURTAIN](../drafts/asset-brief_CURTAIN.json) | Needs review | [source catalogue](../context/objects.json) |
| [DEAD-BALLOON](../drafts/asset-brief_DEAD-BALLOON.json) | Needs review | [source catalogue](../context/objects.json) |
| [DEAD-DRAGON](../drafts/asset-brief_DEAD-DRAGON.json) | Needs review | [source catalogue](../context/objects.json) |
| [DEAD-SERPENT](../drafts/asset-brief_DEAD-SERPENT.json) | Needs review | [source catalogue](../context/objects.json) |
| [DEGREE](../drafts/asset-brief_DEGREE.json) | Needs review | [source catalogue](../context/objects.json) |
| [DEPOSIT-BOX](../drafts/asset-brief_DEPOSIT-BOX.json) | Needs review | [source catalogue](../context/objects.json) |
| [DIM-DOOR](../drafts/asset-brief_DIM-DOOR.json) | Needs review | [source catalogue](../context/objects.json) |
| [DOOR-KEEPER](../drafts/asset-brief_DOOR-KEEPER.json) | Needs review | [source catalogue](../context/objects.json) |
| [DRAGON](../drafts/asset-brief_DRAGON.json) | Needs review | [source catalogue](../context/objects.json) |
| [DWINDOW](../drafts/asset-brief_DWINDOW.json) | Needs review | [source catalogue](../context/objects.json) |
| [EAST-WALL](../drafts/asset-brief_EAST-WALL.json) | Needs review | [source catalogue](../context/objects.json) |
| [EAT-ME-CAKE](../drafts/asset-brief_EAT-ME-CAKE.json) | Needs review | [source catalogue](../context/objects.json) |
| [EXPLOSION](../drafts/asset-brief_EXPLOSION.json) | Needs review | [source catalogue](../context/objects.json) |
| [FLASK](../drafts/asset-brief_FLASK.json) | Needs review | [source catalogue](../context/objects.json) |
| [FOOTPAD](../drafts/asset-brief_FOOTPAD.json) | Needs review | [source catalogue](../context/objects.json) |
| [FUSE](../drafts/asset-brief_FUSE.json) | Needs review | [source catalogue](../context/objects.json) |
| [GAZEBO](../drafts/asset-brief_GAZEBO.json) | Needs review | [source catalogue](../context/objects.json) |
| [GAZEBO-TABLE](../drafts/asset-brief_GAZEBO-TABLE.json) | Needs review | [source catalogue](../context/objects.json) |
| [GENIE](../drafts/asset-brief_GENIE.json) | Needs review | [source catalogue](../context/objects.json) |
| [GLOBAL-CERBERUS](../drafts/asset-brief_GLOBAL-CERBERUS.json) | Needs review | [source catalogue](../context/objects.json) |
| [GLOBAL-MENHIR](../drafts/asset-brief_GLOBAL-MENHIR.json) | Needs review | [source catalogue](../context/objects.json) |
| [GLOBAL-OBJECTS](../drafts/asset-brief_GLOBAL-OBJECTS.json) | Needs review | [source catalogue](../context/objects.json) |
| [GLOBAL-PALANTIR](../drafts/asset-brief_GLOBAL-PALANTIR.json) | Needs review | [source catalogue](../context/objects.json) |
| [GLOBAL-PRINCESS](../drafts/asset-brief_GLOBAL-PRINCESS.json) | Needs review | [source catalogue](../context/objects.json) |
| [GLOBAL-UNICORN](../drafts/asset-brief_GLOBAL-UNICORN.json) | Needs review | [source catalogue](../context/objects.json) |
| [GLOBAL-WATER](../drafts/asset-brief_GLOBAL-WATER.json) | Approved | [source catalogue](../context/objects.json) |
| [GLOBAL-WIZARD-CASE](../drafts/asset-brief_GLOBAL-WIZARD-CASE.json) | Needs review | [source catalogue](../context/objects.json) |
| [GNOME](../drafts/asset-brief_GNOME.json) | Needs review | [source catalogue](../context/objects.json) |
| [GNOME-OF-ZURICH](../drafts/asset-brief_GNOME-OF-ZURICH.json) | Needs review | [source catalogue](../context/objects.json) |
| [GOLD-KEY](../drafts/asset-brief_GOLD-KEY.json) | Needs review | [source catalogue](../context/objects.json) |
| [GREEN-BOOK](../drafts/asset-brief_GREEN-BOOK.json) | Needs review | [source catalogue](../context/objects.json) |
| [GROUND](../drafts/asset-brief_GROUND.json) | Needs review | [source catalogue](../context/objects.json) |
| [GRUE](../drafts/asset-brief_GRUE.json) | Needs review | [source catalogue](../context/objects.json) |
| [HANDS](../drafts/asset-brief_HANDS.json) | Needs review | [source catalogue](../context/objects.json) |
| [HEADS](../drafts/asset-brief_HEADS.json) | Needs review | [source catalogue](../context/objects.json) |
| [HEDGES](../drafts/asset-brief_HEDGES.json) | Needs review | [source catalogue](../context/objects.json) |
| [HOOK-1](../drafts/asset-brief_HOOK-1.json) | Needs review | [source catalogue](../context/objects.json) |
| [HOOK-2](../drafts/asset-brief_HOOK-2.json) | Needs review | [source catalogue](../context/objects.json) |
| [ICE](../drafts/asset-brief_ICE.json) | Needs review | [source catalogue](../context/objects.json) |
| [INTNUM](../drafts/asset-brief_INTNUM.json) | Needs review | [source catalogue](../context/objects.json) |
| [IRON-BOX](../drafts/asset-brief_IRON-BOX.json) | Needs review | [source catalogue](../context/objects.json) |
| [IT](../drafts/asset-brief_IT.json) | Needs review | [source catalogue](../context/objects.json) |
| [KEY](../drafts/asset-brief_KEY.json) | Needs review | [source catalogue](../context/objects.json) |
| [KEYHOLE-1](../drafts/asset-brief_KEYHOLE-1.json) | Approved | [source catalogue](../context/objects.json) |
| [KEYHOLE-2](../drafts/asset-brief_KEYHOLE-2.json) | Needs review | [source catalogue](../context/objects.json) |
| [LAMP](../drafts/asset-brief_LAMP.json) | Approved | [source catalogue](../context/objects.json) |
| [LEAK](../drafts/asset-brief_LEAK.json) | Needs review | [source catalogue](../context/objects.json) |
| [LETTER-OPENER](../drafts/asset-brief_LETTER-OPENER.json) | Needs review | [source catalogue](../context/objects.json) |
| [LID-1](../drafts/asset-brief_LID-1.json) | Approved | [source catalogue](../context/objects.json) |
| [LID-2](../drafts/asset-brief_LID-2.json) | Needs review | [source catalogue](../context/objects.json) |
| [LOCAL-GLOBALS](../drafts/asset-brief_LOCAL-GLOBALS.json) | Needs review | [source catalogue](../context/objects.json) |
| [LUNGS](../drafts/asset-brief_LUNGS.json) | Needs review | [source catalogue](../context/objects.json) |
| [MANGLED-CAGE](../drafts/asset-brief_MANGLED-CAGE.json) | Needs review | [source catalogue](../context/objects.json) |
| [MATCH](../drafts/asset-brief_MATCH.json) | Needs review | [source catalogue](../context/objects.json) |
| [ME](../drafts/asset-brief_ME.json) | Needs review | [source catalogue](../context/objects.json) |
| [MENHIR](../drafts/asset-brief_MENHIR.json) | Needs review | [source catalogue](../context/objects.json) |
| [MOSS](../drafts/asset-brief_MOSS.json) | Approved | [source catalogue](../context/objects.json) |
| [NEWSPAPER](../drafts/asset-brief_NEWSPAPER.json) | Needs review | [source catalogue](../context/objects.json) |
| [NORTH-WALL](../drafts/asset-brief_NORTH-WALL.json) | Needs review | [source catalogue](../context/objects.json) |
| [NOT-HERE-OBJECT](../drafts/asset-brief_NOT-HERE-OBJECT.json) | Needs review | [source catalogue](../context/objects.json) |
| [ORANGE-ICING](../drafts/asset-brief_ORANGE-ICING.json) | Needs review | [source catalogue](../context/objects.json) |
| [PALANTIR-1](../drafts/asset-brief_PALANTIR-1.json) | Needs review | [source catalogue](../context/objects.json) |
| [PALANTIR-2](../drafts/asset-brief_PALANTIR-2.json) | Needs review | [source catalogue](../context/objects.json) |
| [PALANTIR-3](../drafts/asset-brief_PALANTIR-3.json) | Needs review | [source catalogue](../context/objects.json) |
| [PALANTIR-4](../drafts/asset-brief_PALANTIR-4.json) | Needs review | [source catalogue](../context/objects.json) |
| [PATHOBJ](../drafts/asset-brief_PATHOBJ.json) | Needs review | [source catalogue](../context/objects.json) |
| [PCRACK](../drafts/asset-brief_PCRACK.json) | Needs review | [source catalogue](../context/objects.json) |
| [PDOOR](../drafts/asset-brief_PDOOR.json) | Approved | [source catalogue](../context/objects.json) |
| [PEARL](../drafts/asset-brief_PEARL.json) | Needs review | [source catalogue](../context/objects.json) |
| [PENTAGRAM](../drafts/asset-brief_PENTAGRAM.json) | Needs review | [source catalogue](../context/objects.json) |
| [PLACE-MAT](../drafts/asset-brief_PLACE-MAT.json) | Needs review | [source catalogue](../context/objects.json) |
| [POOL](../drafts/asset-brief_POOL.json) | Needs review | [source catalogue](../context/objects.json) |
| [PORTRAIT](../drafts/asset-brief_PORTRAIT.json) | Needs review | [source catalogue](../context/objects.json) |
| [POSTS](../drafts/asset-brief_POSTS.json) | Needs review | [source catalogue](../context/objects.json) |
| [PRINCESS](../drafts/asset-brief_PRINCESS.json) | Needs review | [source catalogue](../context/objects.json) |
| [PSEUDO-OBJECT](../drafts/asset-brief_PSEUDO-OBJECT.json) | Needs review | [source catalogue](../context/objects.json) |
| [PTABLE](../drafts/asset-brief_PTABLE.json) | Needs review | [source catalogue](../context/objects.json) |
| [PURPLE-BOOK](../drafts/asset-brief_PURPLE-BOOK.json) | Needs review | [source catalogue](../context/objects.json) |
| [PWINDOW](../drafts/asset-brief_PWINDOW.json) | Approved | [source catalogue](../context/objects.json) |
| [RECEPTACLE](../drafts/asset-brief_RECEPTACLE.json) | Needs review | [source catalogue](../context/objects.json) |
| [RED-ICING](../drafts/asset-brief_RED-ICING.json) | Needs review | [source catalogue](../context/objects.json) |
| [REPELLENT](../drafts/asset-brief_REPELLENT.json) | Needs review | [source catalogue](../context/objects.json) |
| [RIBBON](../drafts/asset-brief_RIBBON.json) | Needs review | [source catalogue](../context/objects.json) |
| [RIDDLE-DOOR](../drafts/asset-brief_RIDDLE-DOOR.json) | Needs review | [source catalogue](../context/objects.json) |
| [ROBOT](../drafts/asset-brief_ROBOT.json) | Needs review | [source catalogue](../context/objects.json) |
| [ROBOT-LABEL](../drafts/asset-brief_ROBOT-LABEL.json) | Needs review | [source catalogue](../context/objects.json) |
| [ROOMS](../drafts/asset-brief_ROOMS.json) | Needs review | [source catalogue](../context/objects.json) |
| [ROSE](../drafts/asset-brief_ROSE.json) | Needs review | [source catalogue](../context/objects.json) |
| [ROSE-BUSH](../drafts/asset-brief_ROSE-BUSH.json) | Needs review | [source catalogue](../context/objects.json) |
| [ROUND-BUTTON](../drafts/asset-brief_ROUND-BUTTON.json) | Needs review | [source catalogue](../context/objects.json) |
| [RUBY](../drafts/asset-brief_RUBY.json) | Needs review | [source catalogue](../context/objects.json) |
| [SAFE](../drafts/asset-brief_SAFE.json) | Needs review | [source catalogue](../context/objects.json) |
| [SAILOR](../drafts/asset-brief_SAILOR.json) | Needs review | [source catalogue](../context/objects.json) |
| [SALTY-WATER](../drafts/asset-brief_SALTY-WATER.json) | Needs review | [source catalogue](../context/objects.json) |
| [SERPENT](../drafts/asset-brief_SERPENT.json) | Needs review | [source catalogue](../context/objects.json) |
| [SEWL](../drafts/asset-brief_SEWL.json) | Needs review | [source catalogue](../context/objects.json) |
| [SLOT](../drafts/asset-brief_SLOT.json) | Needs review | [source catalogue](../context/objects.json) |
| [SNWL](../drafts/asset-brief_SNWL.json) | Needs review | [source catalogue](../context/objects.json) |
| [SOUTH-WALL](../drafts/asset-brief_SOUTH-WALL.json) | Needs review | [source catalogue](../context/objects.json) |
| [SQUARE-BUTTON](../drafts/asset-brief_SQUARE-BUTTON.json) | Needs review | [source catalogue](../context/objects.json) |
| [SSWL](../drafts/asset-brief_SSWL.json) | Needs review | [source catalogue](../context/objects.json) |
| [STAIRS](../drafts/asset-brief_STAIRS.json) | Needs review | [source catalogue](../context/objects.json) |
| [STAMP](../drafts/asset-brief_STAMP.json) | Needs review | [source catalogue](../context/objects.json) |
| [STAND-1](../drafts/asset-brief_STAND-1.json) | Needs review | [source catalogue](../context/objects.json) |
| [STAND-2](../drafts/asset-brief_STAND-2.json) | Needs review | [source catalogue](../context/objects.json) |
| [STAND-3](../drafts/asset-brief_STAND-3.json) | Needs review | [source catalogue](../context/objects.json) |
| [STAND-4](../drafts/asset-brief_STAND-4.json) | Needs review | [source catalogue](../context/objects.json) |
| [STATUETTE](../drafts/asset-brief_STATUETTE.json) | Needs review | [source catalogue](../context/objects.json) |
| [STREAM](../drafts/asset-brief_STREAM.json) | Approved | [source catalogue](../context/objects.json) |
| [SWORD](../drafts/asset-brief_SWORD.json) | Approved | [source catalogue](../context/objects.json) |
| [SWWL](../drafts/asset-brief_SWWL.json) | Needs review | [source catalogue](../context/objects.json) |
| [TEAPOT](../drafts/asset-brief_TEAPOT.json) | Needs review | [source catalogue](../context/objects.json) |
| [TOP-ETCHINGS](../drafts/asset-brief_TOP-ETCHINGS.json) | Needs review | [source catalogue](../context/objects.json) |
| [TRIANGULAR-BUTTON](../drafts/asset-brief_TRIANGULAR-BUTTON.json) | Needs review | [source catalogue](../context/objects.json) |
| [TROPHY-BOTTLES](../drafts/asset-brief_TROPHY-BOTTLES.json) | Needs review | [source catalogue](../context/objects.json) |
| [TROPHY-SWORD](../drafts/asset-brief_TROPHY-SWORD.json) | Needs review | [source catalogue](../context/objects.json) |
| [TUNNEL](../drafts/asset-brief_TUNNEL.json) | Needs review | [source catalogue](../context/objects.json) |
| [UNICORN](../drafts/asset-brief_UNICORN.json) | Needs review | [source catalogue](../context/objects.json) |
| [VIOLIN](../drafts/asset-brief_VIOLIN.json) | Needs review | [source catalogue](../context/objects.json) |
| [WAND](../drafts/asset-brief_WAND.json) | Needs review | [source catalogue](../context/objects.json) |
| [WANDS](../drafts/asset-brief_WANDS.json) | Needs review | [source catalogue](../context/objects.json) |
| [WARNING-LABEL](../drafts/asset-brief_WARNING-LABEL.json) | Needs review | [source catalogue](../context/objects.json) |
| [WATER](../drafts/asset-brief_WATER.json) | Needs review | [source catalogue](../context/objects.json) |
| [WELL](../drafts/asset-brief_WELL.json) | Needs review | [source catalogue](../context/objects.json) |
| [WEST-WALL](../drafts/asset-brief_WEST-WALL.json) | Needs review | [source catalogue](../context/objects.json) |
| [WHITE-BOOK](../drafts/asset-brief_WHITE-BOOK.json) | Needs review | [source catalogue](../context/objects.json) |
| [WISH](../drafts/asset-brief_WISH.json) | Needs review | [source catalogue](../context/objects.json) |
| [WIZ-DOOR](../drafts/asset-brief_WIZ-DOOR.json) | Needs review | [source catalogue](../context/objects.json) |
| [WIZARD](../drafts/asset-brief_WIZARD.json) | Needs review | [source catalogue](../context/objects.json) |
| [WIZARD-CASE](../drafts/asset-brief_WIZARD-CASE.json) | Needs review | [source catalogue](../context/objects.json) |
| [WORKBENCH](../drafts/asset-brief_WORKBENCH.json) | Needs review | [source catalogue](../context/objects.json) |
| [ZORKMID](../drafts/asset-brief_ZORKMID.json) | Needs review | [source catalogue](../context/objects.json) |

## Action labels

| Record | Approval | Evidence |
|---|---|---|
| [#COMMAND](../drafts/label-set_%23COMMAND.json) | Needs review | [syntax identity](../context/routines.json) |
| [#RANDOM](../drafts/label-set_%23RANDOM.json) | Needs review | [syntax identity](../context/routines.json) |
| [#RECORD](../drafts/label-set_%23RECORD.json) | Needs review | [syntax identity](../context/routines.json) |
| [#UNRECORD](../drafts/label-set_%23UNRECORD.json) | Needs review | [syntax identity](../context/routines.json) |
| [$VERIFY](../drafts/label-set_%24VERIFY.json) | Needs review | [syntax identity](../context/routines.json) |
| [ACTIVATE](../drafts/label-set_ACTIVATE.json) | Needs review | [syntax identity](../context/routines.json) |
| [ANSWER](../drafts/label-set_ANSWER.json) | Needs review | [syntax identity](../context/routines.json) |
| [APPLY](../drafts/label-set_APPLY.json) | Needs review | [syntax identity](../context/routines.json) |
| [ATTACK](../drafts/label-set_ATTACK.json) | Needs review | [syntax identity](../context/routines.json) |
| [BACK](../drafts/label-set_BACK.json) | Needs review | [syntax identity](../context/routines.json) |
| [BLAST](../drafts/label-set_BLAST.json) | Needs review | [syntax identity](../context/routines.json) |
| [BLOW](../drafts/label-set_BLOW.json) | Needs review | [syntax identity](../context/routines.json) |
| [BOARD](../drafts/label-set_BOARD.json) | Needs review | [syntax identity](../context/routines.json) |
| [BRIEF](../drafts/label-set_BRIEF.json) | Needs review | [syntax identity](../context/routines.json) |
| [BRUSH](../drafts/label-set_BRUSH.json) | Needs review | [syntax identity](../context/routines.json) |
| [BUG](../drafts/label-set_BUG.json) | Needs review | [syntax identity](../context/routines.json) |
| [BURN](../drafts/label-set_BURN.json) | Needs review | [syntax identity](../context/routines.json) |
| [CHOMP](../drafts/label-set_CHOMP.json) | Needs review | [syntax identity](../context/routines.json) |
| [CLIMB](../drafts/label-set_CLIMB.json) | Needs review | [syntax identity](../context/routines.json) |
| [CLOSE](../drafts/label-set_CLOSE.json) | Needs review | [syntax identity](../context/routines.json) |
| [COMMAND](../drafts/label-set_COMMAND.json) | Needs review | [syntax identity](../context/routines.json) |
| [COUNT](../drafts/label-set_COUNT.json) | Needs review | [syntax identity](../context/routines.json) |
| [CROSS](../drafts/label-set_CROSS.json) | Needs review | [syntax identity](../context/routines.json) |
| [CURSE](../drafts/label-set_CURSE.json) | Needs review | [syntax identity](../context/routines.json) |
| [CUT](../drafts/label-set_CUT.json) | Needs review | [syntax identity](../context/routines.json) |
| [DEFLATE](../drafts/label-set_DEFLATE.json) | Needs review | [syntax identity](../context/routines.json) |
| [DESTROY](../drafts/label-set_DESTROY.json) | Needs review | [syntax identity](../context/routines.json) |
| [DIAGNOSE](../drafts/label-set_DIAGNOSE.json) | Needs review | [syntax identity](../context/routines.json) |
| [DIG](../drafts/label-set_DIG.json) | Needs review | [syntax identity](../context/routines.json) |
| [DISEMBARK](../drafts/label-set_DISEMBARK.json) | Needs review | [syntax identity](../context/routines.json) |
| [DISENCHANT](../drafts/label-set_DISENCHANT.json) | Needs review | [syntax identity](../context/routines.json) |
| [DRINK](../drafts/label-set_DRINK.json) | Needs review | [syntax identity](../context/routines.json) |
| [DROP](../drafts/label-set_DROP.json) | Needs review | [syntax identity](../context/routines.json) |
| [EAT](../drafts/label-set_EAT.json) | Needs review | [syntax identity](../context/routines.json) |
| [ECHO](../drafts/label-set_ECHO.json) | Needs review | [syntax identity](../context/routines.json) |
| [ENCHANT](../drafts/label-set_ENCHANT.json) | Needs review | [syntax identity](../context/routines.json) |
| [ENTER](../drafts/label-set_ENTER.json) | Needs review | [syntax identity](../context/routines.json) |
| [EXAMINE](../drafts/label-set_EXAMINE.json) | Needs review | [syntax identity](../context/routines.json) |
| [EXIT](../drafts/label-set_EXIT.json) | Needs review | [syntax identity](../context/routines.json) |
| [EXORCISE](../drafts/label-set_EXORCISE.json) | Needs review | [syntax identity](../context/routines.json) |
| [EXTINGUISH](../drafts/label-set_EXTINGUISH.json) | Needs review | [syntax identity](../context/routines.json) |
| [FILL](../drafts/label-set_FILL.json) | Needs review | [syntax identity](../context/routines.json) |
| [FIND](../drafts/label-set_FIND.json) | Needs review | [syntax identity](../context/routines.json) |
| [FOLLOW](../drafts/label-set_FOLLOW.json) | Needs review | [syntax identity](../context/routines.json) |
| [FROBOZZ](../drafts/label-set_FROBOZZ.json) | Needs review | [syntax identity](../context/routines.json) |
| [GIVE](../drafts/label-set_GIVE.json) | Needs review | [syntax identity](../context/routines.json) |
| [HATCH](../drafts/label-set_HATCH.json) | Needs review | [syntax identity](../context/routines.json) |
| [HELLO](../drafts/label-set_HELLO.json) | Needs review | [syntax identity](../context/routines.json) |
| [INCANT](../drafts/label-set_INCANT.json) | Needs review | [syntax identity](../context/routines.json) |
| [INFLAT](../drafts/label-set_INFLAT.json) | Needs review | [syntax identity](../context/routines.json) |
| [INVENTORY](../drafts/label-set_INVENTORY.json) | Needs review | [syntax identity](../context/routines.json) |
| [JUMP](../drafts/label-set_JUMP.json) | Needs review | [syntax identity](../context/routines.json) |
| [KICK](../drafts/label-set_KICK.json) | Needs review | [syntax identity](../context/routines.json) |
| [KILL](../drafts/label-set_KILL.json) | Needs review | [syntax identity](../context/routines.json) |
| [KISS](../drafts/label-set_KISS.json) | Needs review | [syntax identity](../context/routines.json) |
| [KNOCK](../drafts/label-set_KNOCK.json) | Needs review | [syntax identity](../context/routines.json) |
| [LAUNCH](../drafts/label-set_LAUNCH.json) | Needs review | [syntax identity](../context/routines.json) |
| [LEAN](../drafts/label-set_LEAN.json) | Needs review | [syntax identity](../context/routines.json) |
| [LEAVE](../drafts/label-set_LEAVE.json) | Needs review | [syntax identity](../context/routines.json) |
| [LIGHT](../drafts/label-set_LIGHT.json) | Approved | [syntax identity](../context/routines.json) |
| [LISTEN](../drafts/label-set_LISTEN.json) | Needs review | [syntax identity](../context/routines.json) |
| [LOCK](../drafts/label-set_LOCK.json) | Needs review | [syntax identity](../context/routines.json) |
| [LOOK](../drafts/label-set_LOOK.json) | Needs review | [syntax identity](../context/routines.json) |
| [LOWER](../drafts/label-set_LOWER.json) | Needs review | [syntax identity](../context/routines.json) |
| [LUBRICATE](../drafts/label-set_LUBRICATE.json) | Needs review | [syntax identity](../context/routines.json) |
| [MAKE](../drafts/label-set_MAKE.json) | Needs review | [syntax identity](../context/routines.json) |
| [MELT](../drafts/label-set_MELT.json) | Needs review | [syntax identity](../context/routines.json) |
| [MOVE](../drafts/label-set_MOVE.json) | Needs review | [syntax identity](../context/routines.json) |
| [MUMBLE](../drafts/label-set_MUMBLE.json) | Needs review | [syntax identity](../context/routines.json) |
| [ODYSSEUS](../drafts/label-set_ODYSSEUS.json) | Needs review | [syntax identity](../context/routines.json) |
| [OPEN](../drafts/label-set_OPEN.json) | Needs review | [syntax identity](../context/routines.json) |
| [PICK](../drafts/label-set_PICK.json) | Needs review | [syntax identity](../context/routines.json) |
| [PLAY](../drafts/label-set_PLAY.json) | Needs review | [syntax identity](../context/routines.json) |
| [PLUG](../drafts/label-set_PLUG.json) | Needs review | [syntax identity](../context/routines.json) |
| [PLUGH](../drafts/label-set_PLUGH.json) | Needs review | [syntax identity](../context/routines.json) |
| [POKE](../drafts/label-set_POKE.json) | Needs review | [syntax identity](../context/routines.json) |
| [POUR](../drafts/label-set_POUR.json) | Needs review | [syntax identity](../context/routines.json) |
| [PRAY](../drafts/label-set_PRAY.json) | Needs review | [syntax identity](../context/routines.json) |
| [PULL](../drafts/label-set_PULL.json) | Needs review | [syntax identity](../context/routines.json) |
| [PUMP](../drafts/label-set_PUMP.json) | Needs review | [syntax identity](../context/routines.json) |
| [PUNCTURE](../drafts/label-set_PUNCTURE.json) | Needs review | [syntax identity](../context/routines.json) |
| [PUSH](../drafts/label-set_PUSH.json) | Needs review | [syntax identity](../context/routines.json) |
| [PUT](../drafts/label-set_PUT.json) | Needs review | [syntax identity](../context/routines.json) |
| [QUIT](../drafts/label-set_QUIT.json) | Needs review | [syntax identity](../context/routines.json) |
| [RAISE](../drafts/label-set_RAISE.json) | Needs review | [syntax identity](../context/routines.json) |
| [RAPE](../drafts/label-set_RAPE.json) | Needs review | [syntax identity](../context/routines.json) |
| [READ](../drafts/label-set_READ.json) | Needs review | [syntax identity](../context/routines.json) |
| [REPENT](../drafts/label-set_REPENT.json) | Needs review | [syntax identity](../context/routines.json) |
| [RESTART](../drafts/label-set_RESTART.json) | Needs review | [syntax identity](../context/routines.json) |
| [RESTORE](../drafts/label-set_RESTORE.json) | Needs review | [syntax identity](../context/routines.json) |
| [RING](../drafts/label-set_RING.json) | Needs review | [syntax identity](../context/routines.json) |
| [ROLL](../drafts/label-set_ROLL.json) | Needs review | [syntax identity](../context/routines.json) |
| [RUB](../drafts/label-set_RUB.json) | Needs review | [syntax identity](../context/routines.json) |
| [SAVE](../drafts/label-set_SAVE.json) | Needs review | [syntax identity](../context/routines.json) |
| [SAY](../drafts/label-set_SAY.json) | Approved | [syntax identity](../context/routines.json) |
| [SCORE](../drafts/label-set_SCORE.json) | Needs review | [syntax identity](../context/routines.json) |
| [SCRIPT](../drafts/label-set_SCRIPT.json) | Needs review | [syntax identity](../context/routines.json) |
| [SEARCH](../drafts/label-set_SEARCH.json) | Needs review | [syntax identity](../context/routines.json) |
| [SEND](../drafts/label-set_SEND.json) | Needs review | [syntax identity](../context/routines.json) |
| [SHAKE](../drafts/label-set_SHAKE.json) | Needs review | [syntax identity](../context/routines.json) |
| [SKIP](../drafts/label-set_SKIP.json) | Needs review | [syntax identity](../context/routines.json) |
| [SLIDE](../drafts/label-set_SLIDE.json) | Needs review | [syntax identity](../context/routines.json) |
| [SMELL](../drafts/label-set_SMELL.json) | Needs review | [syntax identity](../context/routines.json) |
| [SPIN](../drafts/label-set_SPIN.json) | Needs review | [syntax identity](../context/routines.json) |
| [SPRAY](../drafts/label-set_SPRAY.json) | Needs review | [syntax identity](../context/routines.json) |
| [SQUEEZE](../drafts/label-set_SQUEEZE.json) | Needs review | [syntax identity](../context/routines.json) |
| [STAB](../drafts/label-set_STAB.json) | Needs review | [syntax identity](../context/routines.json) |
| [STAND](../drafts/label-set_STAND.json) | Needs review | [syntax identity](../context/routines.json) |
| [STAY](../drafts/label-set_STAY.json) | Needs review | [syntax identity](../context/routines.json) |
| [STRIKE](../drafts/label-set_STRIKE.json) | Needs review | [syntax identity](../context/routines.json) |
| [SUPER](../drafts/label-set_SUPER.json) | Needs review | [syntax identity](../context/routines.json) |
| [SWIM](../drafts/label-set_SWIM.json) | Needs review | [syntax identity](../context/routines.json) |
| [SWING](../drafts/label-set_SWING.json) | Needs review | [syntax identity](../context/routines.json) |
| [TAKE](../drafts/label-set_TAKE.json) | Approved | [syntax identity](../context/routines.json) |
| [TALK](../drafts/label-set_TALK.json) | Needs review | [syntax identity](../context/routines.json) |
| [TELL](../drafts/label-set_TELL.json) | Needs review | [syntax identity](../context/routines.json) |
| [THROW](../drafts/label-set_THROW.json) | Needs review | [syntax identity](../context/routines.json) |
| [TIE](../drafts/label-set_TIE.json) | Needs review | [syntax identity](../context/routines.json) |
| [TREASURE](../drafts/label-set_TREASURE.json) | Needs review | [syntax identity](../context/routines.json) |
| [TURN](../drafts/label-set_TURN.json) | Needs review | [syntax identity](../context/routines.json) |
| [UNLOCK](../drafts/label-set_UNLOCK.json) | Needs review | [syntax identity](../context/routines.json) |
| [UNSCRIPT](../drafts/label-set_UNSCRIPT.json) | Needs review | [syntax identity](../context/routines.json) |
| [UNTIE](../drafts/label-set_UNTIE.json) | Needs review | [syntax identity](../context/routines.json) |
| [VERBOSE](../drafts/label-set_VERBOSE.json) | Needs review | [syntax identity](../context/routines.json) |
| [VERSION](../drafts/label-set_VERSION.json) | Needs review | [syntax identity](../context/routines.json) |
| [WAIT](../drafts/label-set_WAIT.json) | Needs review | [syntax identity](../context/routines.json) |
| [WAKE](../drafts/label-set_WAKE.json) | Needs review | [syntax identity](../context/routines.json) |
| [WALK](../drafts/label-set_WALK.json) | Needs review | [syntax identity](../context/routines.json) |
| [WAVE](../drafts/label-set_WAVE.json) | Needs review | [syntax identity](../context/routines.json) |
| [WEAR](../drafts/label-set_WEAR.json) | Needs review | [syntax identity](../context/routines.json) |
| [WIN](../drafts/label-set_WIN.json) | Needs review | [syntax identity](../context/routines.json) |
| [WIND](../drafts/label-set_WIND.json) | Needs review | [syntax identity](../context/routines.json) |
| [WISH](../drafts/label-set_WISH.json) | Needs review | [syntax identity](../context/routines.json) |
| [YELL](../drafts/label-set_YELL.json) | Needs review | [syntax identity](../context/routines.json) |
| [ZORK](../drafts/label-set_ZORK.json) | Needs review | [syntax identity](../context/routines.json) |
