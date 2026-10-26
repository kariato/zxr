# Shared environment concept

Status: concept image for review; no runtime or existing model changes.

Current concept: [concept-v2.png](concept-v2.png). The corrected image has one continuous north-south bridge. Its rear doorway suggests the lair but does not fully expose a separate chamber; the existing lair still needs to be merged behind that doorway. The generated flame accents are illustrative lighting, not a source requirement to add permanent fires.

The first draft (`concept-v1-draft.png`) is retained for comparison only: it incorrectly adds an east-west crossing bridge and does not expose the lair interior. Do not model those features from this draft.

The five rooms share a connected environment. North is the rear of the concept; south is the foreground. This layout follows `reference/zork2/2dungeon.zil`, lines 431–566.

```text
                      Dragon's Lair
                            |
Bank exit — Fresco Room — Dragon Room — crack to Ledge Tunnel
                            |
                       Stone Bridge
                    (chasm, water below)
                            |
Glacier exit —          Cool Room
                              \
                               southeast exit to Carousel
```

The north doorway from Dragon Room remains conditional on ICE-MELTED. The environment must not bake a dragon or a permanent obstruction into that doorway. Bridge DOWN and unspecified CROSS refusals remain controlled by the source game.

## Visual requirements

- Dragon Room: scorched cavern, rubble, scratched floor; paved west-to-south path, smoky north tunnel and small east crack.
- Dragon's Lair: flame-scarred rock behind its blackened southern doorway. Reuse the existing lair when assembling models; the concept does not authorize replacing it.
- Fresco Room: east-west passage, dragon-battle and rescue murals with the protagonists blackened and cracked by heat.
- Stone Bridge: broad, ruined but traversable stone bridge, impressive masonry over deep water-bearing chasm; continuous deck between both banks.
- Cool Room: damp misty south landing, cold narrow west passage and twisty southeast exit.

Characters, movable treasures and source-controlled objects remain separate. Neighboring bank, ravine, glacier and carousel interiors are outside this scene.

## Modeling constraints

The concept communicates layout and appearance; it is not a texture atlas. Do not repeat the previous single-image projection across an entire walkable environment. Preserve Tencent geometry when generated; use separate hidden walking planes and Blender collections. Any manual visual repairs belong in Blender and must preserve the user's edits. Do not replace player-height perspective with an elevated art-preview camera.

## Image provenance

Generated with the built-in image generation tool using all five existing `assets/rooms/*/reference-v1.png` room images as visual references. The full generation prompt is saved alongside the concept.
