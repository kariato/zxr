# Underground Garden — whole-scene concept v1

[Open the combined image](reference.png). Generated with the built-in imagegen tool from all four existing proposed room images, the complete approved style bible, source room descriptions and exact exits.

The image uses an elevated view from the southern end looking north. The topiary occupies the foreground, the Formal Garden the middle, and Garden North with its rosebed and single white gazebo the far end. Gazebo Room is the interior of that same building, with its tea table visible through the open sides. The main garden path skirts the rosebed.

## Reviewed connections

```text
                         Dark Tunnel
                              |
                    North End of Garden ── IN/OUT ── Gazebo
                              |
Stream Path ── WEST ── Formal Garden
                              |
Carousel Room ── WEST ── Topiary
```

NORTH/SOUTH connect the three garden areas. The two WEST exits remain distinct: a small plain hedge gap from Formal Garden, and a rose-covered arbor into a tunnel from Topiary. The northern opening is nearly overgrown. The view shows the garden-side openings without reconstructing the neighboring rooms.

## Source and visual review

- Read the four declarations in `reference/zork2/2dungeon.zil:281–352`, the hedge description, and garden/unicorn routines in `2actions.zil:2622` onward.
- Used all four selected room references from the room-image manifest. The image is a new combined composition, preserving those original images.
- Preserved the subterranean garden, moss-lit roof, hedge enclosure, crushed-white-stone path, rosebed, open gazebo and animal/human topiary.
- Omitted the unsupported pond/waterfall visible in the individual gazebo reference and any permanently present living unicorn or puzzle reward. The unicorn sculpture remains part of the topiary.
- This is a draft environment reference. It does not approve a mesh or alter runtime rooms, lighting, exits or source state.

The [complete prompt](reference.prompt.txt), [source review and four reference hashes](source-review.json), and [image provenance and visual review](reference.json) are retained alongside the unmodified generated PNG.
