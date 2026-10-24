# Generated Zork II planning context

Offline authoring data derived from the pinned source. This contains spoilers; do not load it into player observations or the runtime UI.

`npm run contexts:check` verifies these files against a fresh compile. `npm run contexts:record` deliberately regenerates them. Neither command calls an LLM or runs gameplay routines.

Room files link to `objects.json` and `routines.json` by stable source names. Text fragments and effects are possible branches, not a reconstructed description. Routine source retains the guards. Dynamic calls and targets remain explicit. Portable/actor/script-moved objects are conservative potential arrivals, not proven reachability or initial scenery.

Room light flags describe declarations before GO; RLANDBIT does not imply outdoors. Conditional/computed exits, concealed objects and mutable features require source review before geometry is approved. See [phase 6](../../../../docs/phase-6.md).

Generated source text retains the Zork II MIT licence in `LICENSE-MIT.txt`. No planner approval is recorded by generation.

| Room | Initial nested objects | Source routines/helpers |
|---|---:|---:|
| [Aquarium Room](aquarium-room.json) | 2 | 5 |
| [Bank Entrance](bank-entrance.json) | 0 | 0 |
| [Dingy Closet](cage-room.json) | 2 | 16 |
| [Carousel Room](carousel-room.json) | 2 | 5 |
| [Cerberus Room](cerberus-room.json) | 1 | 5 |
| [Cobwebby Corridor](cobwebby-corridor.json) | 1 | 5 |
| [Cool Room](cool-room.json) | 0 | 2 |
| [Crypt Anteroom](crypt-anteroom.json) | 0 | 4 |
| [Crypt](crypt-room.json) | 2 | 15 |
| [Dark Tunnel](dark-tunnel.json) | 0 | 0 |
| [Room of Red Mist](dead-palantir-1.json) | 0 | 14 |
| [Room of Blue Mist](dead-palantir-2.json) | 0 | 14 |
| [Room of White Mist](dead-palantir-3.json) | 0 | 14 |
| [Room of Black Mist](dead-palantir-4.json) | 0 | 13 |
| [Deep Ford](deep-ford.json) | 0 | 13 |
| [Safety Depository](depository.json) | 3 | 20 |
| [Oddly-angled Room](diamond-1.json) | 0 | 6 |
| [Oddly-angled Room](diamond-2.json) | 0 | 6 |
| [Oddly-angled Room](diamond-3.json) | 0 | 6 |
| [Oddly-angled Room](diamond-4.json) | 0 | 6 |
| [Oddly-angled Room](diamond-5.json) | 0 | 7 |
| [Oddly-angled Room](diamond-6.json) | 0 | 6 |
| [Oddly-angled Room](diamond-7.json) | 0 | 6 |
| [Oddly-angled Room](diamond-8.json) | 0 | 6 |
| [Oddly-angled Room](diamond-9.json) | 0 | 6 |
| [Dragon's Lair](dragon-lair.json) | 3 | 9 |
| [Dragon Room](dragon-room.json) | 1 | 8 |
| [Dreary Room](dreary-room.json) | 6 | 24 |
| [Foot Bridge](foot-bridge.json) | 0 | 3 |
| [Formal Garden](formal-garden.json) | 0 | 5 |
| [Fresco Room](fresco-room.json) | 0 | 0 |
| [North End of Garden](garden-north.json) | 0 | 10 |
| [Gazebo](gazebo-room.json) | 6 | 9 |
| [Ice Room](glacier-room.json) | 1 | 2 |
| [Great Cavern](great-cavern.json) | 0 | 2 |
| [Guarded Room](guardian-room.json) | 1 | 7 |
| [Murky Room](in-aquarium.json) | 1 | 12 |
| [Cage](in-cage.json) | 0 | 4 |
| [Inside the Barrow](inside-barrow.json) | 2 | 4 |
| [Kennel](kennel.json) | 1 | 2 |
| [Lava Room](lava-room.json) | 1 | 0 |
| [Lava Tube](lava-tube.json) | 0 | 3 |
| [Narrow Ledge](ledge-1.json) | 2 | 0 |
| [Wide Ledge](ledge-2.json) | 1 | 1 |
| [End of Ledge](ledge-tunnel.json) | 0 | 0 |
| [Library](library.json) | 5 | 2 |
| [Machine Room](machine-room.json) | 3 | 1 |
| [Low Room](magnet-room.json) | 2 | 5 |
| [Marble Hall](marble-hall.json) | 1 | 2 |
| [Menhir Room](menhir-room.json) | 0 | 3 |
| [Narrow Tunnel](narrow-tunnel.json) | 0 | 5 |
| [Chairman's Office](office.json) | 1 | 0 |
| [Pearl Room](pearl-room.json) | 1 | 0 |
| [Pentagram Room](pentagram-room.json) | 1 | 27 |
| [Pool Room](pool-room.json) | 4 | 8 |
| [Posts Room](posts-room.json) | 1 | 2 |
| [Ledge in Ravine](ravine-ledge.json) | 0 | 1 |
| [Riddle Room](riddle-room.json) | 1 | 5 |
| [Room 8](room-8.json) | 1 | 3 |
| [Dusty Room](safe-room.json) | 4 | 3 |
| [Shallow Ford](shallow-ford.json) | 0 | 11 |
| [Small Room](small-room.json) | 0 | 12 |
| [Stairway](stairway-top.json) | 0 | 1 |
| [Stone Bridge](stone-bridge.json) | 0 | 3 |
| [Path Near Stream](stream-path.json) | 0 | 4 |
| [Tea Room](tea-room.json) | 5 | 6 |
| [East Teller's Room](teller-east.json) | 0 | 1 |
| [West Teller's Room](teller-west.json) | 0 | 1 |
| [Tiny Room](tiny-room.json) | 2 | 21 |
| [Topiary](topiary-room.json) | 1 | 7 |
| [Trophy Room](trophy-room.json) | 6 | 4 |
| [Volcano Core](vair-1.json) | 0 | 0 |
| [Volcano Near Small Ledge](vair-2.json) | 0 | 0 |
| [Volcano by Viewing Ledge](vair-3.json) | 0 | 0 |
| [Volcano Near Wide Ledge](vair-4.json) | 0 | 0 |
| [Vault](vault.json) | 1 | 13 |
| [East Viewing Room](viewing-east.json) | 0 | 12 |
| [West Viewing Room](viewing-west.json) | 0 | 12 |
| [Volcano Bottom](volcano-bottom.json) | 4 | 5 |
| [Volcano View](volcano-view.json) | 0 | 0 |
| [Circular Room](well-bottom.json) | 2 | 9 |
| [Top of Well](well-top.json) | 1 | 10 |
| [Wizard's Quarters](wizards-quarters.json) | 0 | 1 |
| [Wizard's Workshop](wizards-workshop.json) | 0 | 4 |
| [Wizard's Workroom](workbench-room.json) | 5 | 13 |
| [Landing](zork3.json) | 0 | 3 |
