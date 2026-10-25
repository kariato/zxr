# Opening cavern

All five rooms share the retained cavern environment. The original GLB is extended with a path, shallow ford, rock walls and an enclosed branching tunnel. The proposed room images supply material-colour patches; source observations control water interaction and tunnel darkness.

## Rooms

- [Narrow Tunnel (`NARROW-TUNNEL`)](NARROW-TUNNEL/README.md)
- [Foot Bridge (`FOOT-BRIDGE`)](FOOT-BRIDGE/README.md)
- [Great Cavern (`GREAT-CAVERN`)](GREAT-CAVERN/README.md)
- [Shallow Ford (`SHALLOW-FORD`)](SHALLOW-FORD/README.md)
- [Dark Tunnel (`DARK-TUNNEL`)](DARK-TUNNEL/README.md)

[All scene groups](../README.md) · [Grouping review](../../../../../docs/scene-grouping-review.md)

## Implemented shared scene

All five rooms now use the same retained cavern environment. The original Hunyuan tunnel/bridge GLB is extended with authored 3D geometry in `src/prototype/opening-cavern.ts`. Shallow Ford and Dark Tunnel use rock, pebbled-bed and dusty-ground UV patches from their proposed reference images. The references guide appearance; the source descriptions and transitions determine the layout.

| Room | Shared-world origin (X, Y, Z metres) | Source connections |
| --- | --- | --- |
| Narrow Tunnel | 0, 0, 0 | NORTH → Barrow; SOUTH/CROSS → Foot Bridge |
| Foot Bridge | 0, 0.69, 6.9 | NORTH → Narrow Tunnel; SOUTH → Great Cavern |
| Great Cavern | 0, 1, 12 | NE → Foot Bridge; SW → Shallow Ford |
| Shallow Ford | −12, 1, 20 | NORTH → Great Cavern; SOUTH/CROSS → Dark Tunnel |
| Dark Tunnel | −12, 1, 29 | NE → Shallow Ford; SW → Stream Path; SE → North End of Garden |

World coordinates are authoring estimates, not source measurements. Source compass labels remain authoritative at every turn; physical movement within the view does not itself commit an exit. SOUTH/CROSS at the ford share one physical water crossing. The tunnel has an open northeast return, a wider southwest corridor and a narrower southeast branch. It contains decorative leaves and twigs, without adding collectible objects.

The scene and its observation-bound targets are removed in darkness. The reference image's hypothetical authoring light does not light Dark Tunnel during gameplay. Re-entering with source light reloads the scene; moving among lit member rooms retains it. Water interaction uses the observed `GLOBAL-WATER` identity only.

Implementation provenance is recorded in [runtime-reference-use.json](runtime-reference-use.json). The original reference, prompt, source and approval records remain unchanged.
