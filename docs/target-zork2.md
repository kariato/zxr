# Target game: Zork II

Zork II: The Wizard of Frobozz is the first game ZXR is built against. The engine is done when Zork II plays start to finish on desktop, tablet and a WebXR headset from one build, and is published on itch.io.

Zork I was ruled out because it has already been ported. Zork II is a good test because it uses nearly every ZIL feature: actors who act on their own, timed events, a robot that takes orders, a riddle answered in words, light and darkness, a balloon, and a maze.

## Source and license

- Source: [historicalsource/zork2](https://github.com/historicalsource/zork2), vendored unchanged in [reference/zork2](../reference/zork2) (see its [PROVENANCE.md](../reference/zork2/PROVENANCE.md)).
- License: MIT, Copyright (c) 2025 Microsoft (released November 2025).
- The MIT license covers the code only. It does not cover the Zork trademark, so the itch.io page title and art must not depend on the Zork name until permission is confirmed.
- The upstream README says there is no known way to compile the source back into a finished story file. ZXR does not need to: it reads the `.zil` source directly, and uses the original `COMPILED/zork2.z3` only as the reference for tests.

## What we are porting

Measured from the vendored source.

| Item | Count | Where |
|---|---|---|
| ZIL source | 11,978 lines in 11 files | `2dungeon.zil`, `2actions.zil`, shared `g*.zil` library |
| Rooms | 86 | `2dungeon.zil` (about 29 lit) |
| Objects | 165 | 147 in `2dungeon.zil`, 18 global objects in `gglobals.zil` |
| Routines | 441 | 176 in `2actions.zil`, 189 in `gverbs.zil`, 42 in `gparser.zil`, the rest library |
| Syntax lines | 267 | `gsyntax.zil`, plus 74 `SYNONYM` lines |
| Constants and globals | 91 and 164 | across the source |
| Timed events (interrupts) | 24 | `I-WIZARD`, `I-DRAGON`, `I-BALLOON`, `I-PRINCESS` and others |
| Macros | 15 `DEFMAC`, 3 `DEFINE` | `gmacros.zil` (`TELL`, `VERB?`, `PROB`, `ENABLE`...) |
| Actors | 10 | Cerberus, dragon, genie, gnome, Gnome of Zurich, princess, robot, serpent, unicorn, wizard |
| Reference story file | `COMPILED/zork2.z3` | Runs in any Z-machine interpreter; our ground truth |

## Hard spots for an options interface

- **The riddle** reads the raw parser buffer (`P-LEXV`) for the word "WELL". Options cannot hand the player the answer, so it needs a typed or spoken answer, or a knowledge-gated option that only appears once the player has seen the clue.
- **The robot** takes commands through `WINNER` ("robot, push the button"). Options must be able to address another actor.
- **Random events** (the wizard's spells, the dragon, combat rolls) mean transcripts can only be compared exactly where no randomness is involved; elsewhere we compare state.
- **The maze and darkness** need a presentation that does not reveal more than the text does.

## How we test against the original

1. Record golden transcripts by playing `COMPILED/zork2.z3` in a scripted Z-machine interpreter (dfrotz or ifvms) with a fixed seed. Store them in `reference/transcripts/`.
2. Run the same commands through the ZXR engine and compare at two levels: exact text for steps with no random element, and world-state checks (location, inventory, flags, score) where randomness is involved.
3. A walkthrough coverage test proves the full game can be finished by picking options only.
4. Every intentional difference from the original is written down in `games/zork2/ledger.md`.

## Release plan on itch.io

- Publish as an HTML5 game: a zip of the Vite build with `index.html` at the root, run in itch.io's iframe.
- Desktop and tablet modes work inside the iframe.
- It is not confirmed that itch.io's iframe allows WebXR immersive sessions (forum requests since 2020 have had no answer). The fallback is a "Play in VR" button that opens the same build on GitHub Pages in its own tab.
- A text-only version can be released earlier, after phase 5 of the [build plan](build-plan.md), if Mark wants.
- Credits: the original Infocom authors, the MIT notice for the source, ZXR's own license, and notes on any generated assets.
