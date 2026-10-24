# Original pilot review

**Full set:** [386 current planning records](../review/README.md) now cover all rooms and source identities. The 364 additions are pending review; the 22 original records below retain Mark's approval.

These are **22 concrete drafts authored by Codex in this chat**, using the approved [style bible](../style-bible.md), [barrow visual guide](../visual-guides/inside-barrow-v1/concept.png) and fresh source context. No Claude API, key or simulated provider response was used. Every record has validated assistant provenance, source/style/image input identity and draft status. The exact model ID is not reported and is recorded as null.

**Approved by Mark in this chat on 2026-10-23.** The [approved manifest](../approved/manifest.json) selects the exact approved copies of all 22 records. The draft originals linked below are retained unchanged for comparison. The approval covers these planning documents; rendered GLBs and device checks remain future work.

## Eight rooms

| Draft | Proposed appearance | Proposed size (metres) |
|---|---|---|
| [Inside the Barrow](scene-plan_INSIDE-BARROW.json) | Enclosed faceted earth/stone chamber, one sword lying flat, one unlit brass lantern, narrow southern tunnel and distant glow. The shut entrance is a blocked OUT attempt. | 6 × 3 × 7 |
| [Formal Garden](scene-plan_FORMAL-GARDEN.json) | Underground garden, high dim moss light, crushed white-stone path, hedges and flower beds, western gap and distant northern structure. No sky or permanently placed unicorn. | 14 × 8 × 18 |
| [Narrow Tunnel](scene-plan_NARROW-TUNNEL.json) | Moss-lit underground cavern opening, steep ravine, stream below and wooden bridge ahead; NORTH meets the barrow portal. SOUTH/CROSS share the bridge approach; DOWN is refused. | 14 × 10 × 16 |
| [Foot Bridge](scene-plan_FOOT-BRIDGE.json) | Crude, sturdy wooden bridge over the ravine, north/south path; no invented DOWN or CROSS route. | 6 × 10 × 6 |
| [Great Cavern](scene-plan_GREAT-CAVERN.json) | Limestone cavern with high moss light, stalactites and stalagmites; NE and SW paths retain source directions. | 16 × 12 × 18 |
| [Shallow Ford](scene-plan_SHALLOW-FORD.json) | Dim cavern bank, shallow water crossing and smoothed southern tunnel entrance; SOUTH/CROSS share one route. | 10 × 6 × 10 |
| [Dark Tunnel](scene-plan_DARK-TUNNEL.json) | Smooth, dusty tunnel with twig/leaf debris, NE return, wider SW branch and narrower SE branch. Source darkness controls all visual disclosure. | 10 × 3.5 × 12 |
| [Tiny Room](scene-plan_TINY-ROOM.json) | Small ravine-side chamber, massive oak door to the north, barred window in the door, bolt lock, keyhole and thin metal lid, plus a precarious downward climb. | 4 × 2.8 × 4 |

Dimensions and positions are art proposals, not game rules. NORTH and IN in the tiny room refer to **one physical door**; IN is an alternate menu choice, not a second overlapping physical hotspot. Window inspection still uses the source routine; a view through it must not expose unobserved contents of the adjoining room.

## Eleven reusable asset briefs

- [Sword](asset-brief_SWORD.json): flat resting geometry, restrained Elvish workmanship, no invented readable runes or magical glow.
- [Brass lantern](asset-brief_LAMP.json): idle is unlit; light/flicker comes from observed ONBIT state.
- [Moss](asset-brief_MOSS.json): dim overhead garden patches, not additional collectible objects.
- [Oak door](asset-brief_PDOOR.json): massive panel, fixed frame and bolt-lock housing, with openings/attachment sockets for the separate components.
- [Barred window](asset-brief_PWINDOW.json): a door insert looking into the adjoining room, not an exterior window or traversable passage.
- [Keyhole](asset-brief_KEYHOLE-1.json): tiny lock-face insert, with a generous invisible selection volume permitted later.
- [Metal lid](asset-brief_LID-1.json): distinct open/closed poses, physically covering the keyhole when shut.
- [Bridge](asset-brief_BRIDGE.json): one shared wooden footbridge brief for the two new rooms; source uses of this alias elsewhere still need appearance review.
- [Chasm](asset-brief_CHASM.json): separate steep banks and a deep void, with no invented descent or walkable bottom.
- [Stream](asset-brief_STREAM.json): narrow water ribbon below the ravine bank, following source context.
- [Ford water](asset-brief_GLOBAL-WATER.json): shallow water surface bound to GLOBAL-WATER; other uses of this source alias still need their own appearance review.

The source object tree remains authoritative. Door-component visual parenting is an overlay concern: the window, keyhole and lid must follow the moving door panel without rewriting their source parents. The draft [scene bindings](../scene-bindings.json) now explicitly attach these components to proposed panel sockets and make IN an alias of NORTH. `npm run scenes:check` checks these bindings against the exact plan hashes. The open/closed and light-state bindings now use the filtered appearance query; actual GLB sockets, clip contents and occlusion remain to be verified in 7.2/7.4. The door frame stays fixed. Do not duplicate component geometry in both the door brief and each insert.

| Checked state binding; mesh validation still pending | Behaviour |
|---|---|
| Observed PDOOR OPENBIT | Choose door `open`/`closed` clip; the source lock/refusal rules still decide which actions succeed. |
| Observed LID-1 OPENBIT | Choose lid `open`/`closed` clip; the closed lid occludes the keyhole. |
| Observed LAMP ONBIT and light availability | Enable lantern emission/flicker only when on; no baked light source in the initial barrow model. |
| Room lighting | Use the dark rig in darkness; the tiny-room lit rig is available only after the engine reports light, never merely because its GLB loaded. |

The barrow and narrow tunnel have one checked continuous portal in a proposed shared room group. The footbridge remains a transition. Grouping is a draft geometry proposal, not an implemented combined GLB; only active-room observations may expose objects. The sword currently requires only its resting pose, so a failed attack cannot cause a speculative successful swing.

The new cavern/ford/tunnel rooms remain transitions: their source compass connections are not forced into a continuous straight map, and dark-tunnel geometry must stay hidden without engine-reported light. Cavern formations remain decorative kit geometry with existing source pseudo-interactions in the menu; no new collectible objects or physical pseudo hotspots are installed.

## Labels

[TAKE](label-set_TAKE.json), [LIGHT](label-set_LIGHT.json) and [SAY](label-set_SAY.json) provide **16 draft strings** across their source syntax families and source YES/NO/FINISH decisions. They distinguish burning something with a tool from switching on a lamp. `TAKE:4` retains the source's unusual noun-bound stand-up syntax; its label preserves the operand without changing the handler. Speech remains selected vocabulary words. These drafts do not install puzzle gates or replace the current player labels yet.

## Review boundary

`npm run planner:check` validates every draft against current inputs. The exact reviewed versions are now selected through the approved manifest and included in the production overlay. Their plan approval is separate from the earlier style-image approval; new or edited drafts are not automatically approved. Later 6.5 checks, device measurements and actual GLB review remain necessary. Nothing here is presented as a rendered or playable 3D scene.

`npm run scenes:check` checks the current review candidates together and writes `out/planner/consistency.json`, reporting missing rooms and unresolved observed state bindings. `npm run scenes:check -- --complete` is the stricter acceptance command; all-room content coverage now passes, while `phase6:check -- --complete` still requires approval of the 364 new records. All five previously reported pilot state/event gaps are now resolved or, for the speculative sword swing, removed from the current brief. The existing menu offers movement attempts that can be refused, so a listed direction alone cannot disclose a hidden doorway. A visible source door can now supply a crossing target only while its observed open state is true. Other conditional and computed passage geometry stays suppressed until a safe observed binding exists; source movement choices remain available through the menu.

For future reviews, after approval of an exact draft, the explicit `planner approve ... --reviewer Mark` operation selects its hash-named approved record; commit that record and the manifest together. Keep generation/import separate from approval. Changes to source, style, prompt, schema or the selected visual reference make affected draft identities stale and require revalidation/review.
