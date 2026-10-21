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
| Routines | 439 active | The phase 1 manifest replaces the earlier line-based count of 441 and lists inactive/commented forms |
| Syntax entries | 269 active | `gsyntax.zil`, plus 75 active `SYNONYM` forms; verified against assembly data |
| Constants and globals | 91 and 164 | across the source |
| Timed events (interrupts) | 23 active | Raw source also has an unused duplicate I-LANTERN in `crufty.zil`; see [the audit](reference-audit.md) |
| Macros | 15 `DEFMAC`, 3 `DEFINE` | `gmacros.zil` (`TELL`, `VERB?`, `PROB`, `ENABLE`...) |
| Actors | 10 | Cerberus, dragon, genie, gnome, Gnome of Zurich, princess, robot, serpent, unicorn, wizard |
| Reference story file | `COMPILED/zork2.z3` | Runs in any Z-machine interpreter; our ground truth |

## Hard spots for an options interface

- **The riddle** reads the raw parser buffer (`P-LEXV`) for the word "WELL", and **the wand** stores the spoken spell word from `P-LEXV` (`V-INCANT`). Options cannot hand the player these answers. The current proposal (not yet accepted, to be playtested) is a word picker over the game's own vocabulary (about 690 words), which writes the chosen word into `P-LEXV`.
- **The robot** takes commands through `WINNER` ("robot, push the button"). Options carry an actor, so `TAKE/1:ROBOT:CAGE` is a different option from `TAKE/1:PLAYER:CAGE`, and a robot command runs as the original's two passes (`TELL ROBOT`, then the command).
- **Implicit taking and pseudo-objects.** Using an object you are not holding takes it first ("(Taken)") in the same turn, and room features such as the Tea Room's hole share one `PSEUDO-OBJECT`. The parser adapter keeps both behaviours (see [compat-semantics.md](compat-semantics.md#the-parser-adapter)).
- **Random events** (the wizard's spells, the dragon, combat rolls) are compared exactly by replaying the reference interpreter's recorded random draws in the engine.
- **Quit, restart and the end of the game** ask yes/no or restart/restore/quit questions inside a routine. These become pending decisions in the engine.
- **The maze and darkness** need a presentation that does not reveal more than the text does.

## How we test against the original

1. Establish that the vendored source matches the story file (build plan step 0.8). The evidence is good: the build log `zork2.chart` ends at release 63, 92,524 bytes, which is exactly `COMPILED/zork2.z3` (release 63, serial 860811, SHA-256 `3ae7d5558943e9721f3e4b273c8a7faec1a03a604e1ae4ee1cde472c21cb24ac`), and `zork2.zip` in the source folder is byte-identical to it. The compiler's `.zap` assembly output is also vendored and is checked against a disassembly of the story file.
2. Record golden transcripts by playing `COMPILED/zork2.z3` in a pinned, instrumented JavaScript Z-machine interpreter that also logs every random draw and a state snapshot after each input. Store them in `reference/transcripts/`.
3. Run the same commands through the ZXR engine with the recorded random draws (draws the original parser made while guessing objects are marked and skipped), and compare text and a semantic state projection at four checkpoints: parser return, completed action, a prompt inside a routine, and game end. The projection and its reviewed exclusions are defined in [compat-semantics.md](compat-semantics.md#conformance-projection).
4. Coverage tests prove the full game can be finished by picking options only, in more than one solve order, after restoring a save, and after a death.
5. Every intentional difference from the original is written down in `games/zork2/ledger.md`.

## Release plan on itch.io

- Publish as an HTML5 game: a zip of the Vite build with `index.html` at the root, run in itch.io's iframe.
- Desktop and tablet modes work inside the iframe.
- It is not confirmed that itch.io's iframe allows WebXR immersive sessions (forum requests since 2020 have had no answer). The fallback is a "Play in VR" button that opens the same build on GitHub Pages in its own tab.
- A text-only version can be released earlier, after phase 5 of the [build plan](build-plan.md), if Mark wants.
- Credits: the original Infocom authors, the MIT notice for the source, ZXR's own license, and notes on any generated assets.
