# ZXR

ZXR is a language and engine for interactive fiction in 3D and XR. It takes a game written in ZIL, the language Infocom used for Zork, and cross-compiles it into ZXR so that each room becomes a 3D place you can walk around, and typed commands become options you pick.

Games are written entirely in JSON, logic included, and run on a headless TypeScript engine. The current build plays as text in desktop and tablet browsers and in a terminal. A hand-built 3D prototype now presents the barrow, narrow tunnel and foot bridge using that same engine, with WebXR controller menus available on supported browsers. Full scene artwork will use GLB files (binary glTF) and baked Blender animation clips. See [prototype controls and limits](docs/prototype.md).

The first target is **Zork II**, whose source Microsoft released under the MIT license in 2025. The goal is a full Zork II playable in XR and published on itch.io.

> Status: phases 0–4 and steps 5.1–5.4 are complete. The source compiles into a validated bundle, and the headless engine completes the 400-point solve, all twelve area scripts and a random death/recovery run using explicit structured actions and the original random log. `npm run replay:check` verifies exact text, typed state and RNG call sites; [phase 3 evidence](docs/phase-3.md#completed-reference-replay-acceptance-39) names the reviewed typed-input normalizations. [Phase 4](docs/phase-4.md) now has action ranking, pure scope/observations, staged actor/object selection and a vocabulary picker for special inputs. Step 4.4's automated checks pass; the human tablet check passed by user report on 2026-10-23. Saved knowledge gates now adjust placement without removing actions; ranked menus now expose the full remainder through “more.” Plain action labels now cover menus and staged choices. Browser and terminal text players are implemented; `npm run options:check` verifies 1,868 offered choices across 17 scripts, including full-score victory, alternate puzzle orders and save/death recovery. Saves now use v2 with remembered object names; older bundles/saves require a fresh build/game. See [bundle usage](docs/bundles.md).

The [phase 5.1 conformance runner](docs/phase-5.md) checks all 75 golden scripts: 9,568 inputs and 29,207 checkpoints, including parser-return and post-clock states. Run `node bin/zxr.ts check --conformance` or `npm run conformance:check`. One exact V-PLAY source/binary text difference is recorded explicitly in the ledger; all other comparisons remain strict. The 5.2 fix-or-ledger review covers the ledger entries and is checked before conformance runs. Step 5.3 adds IndexedDB autosave and named checkpoints, preserving the original SAVE/RESTORE continuation. Browser saves recover after reload; file import/export remains available. Step 5.4 adds portable replay bundles with step/play/pause/speed controls and a state-hash check at every accepted input. Step 5.5 has deterministic fuzz tooling and automatic sharded CI, with ambiguous object/actor offerings, a CLIMB overread, unsupported debug offerings and the offered `$VERIFY` schema fixed. The full 10,000-game hosted campaign remains unverified; see the [findings](docs/phase-5.md#deterministic-fuzzing-55-acceptance-still-open). Step 5.6 publishes the capability inventory below; step 5.5’s full hosted acceptance remains open.

## Current capabilities

Phase 6 implementation now has [a complete review set](games/zork2/planning/review/README.md): 86 room plans, 165 source-identity briefs and 135 label sets covering 267 action families plus five decisions. The original 22 approvals are retained; review of the remaining 364 records and editor refinement are deferred by Mark's direction so development can prioritize a working prototype. The [local review editor](http://127.0.0.1:5181/authoring.html) remains available. Run `npm run phase6:check` for content coverage, or add `-- --complete` to require all current records to be approved. Builds load only approved records and labels, without an API key. The procedural prototype is a separate hand-built slice; GLB generation and actual headset/device acceptance remain later work.

<!-- capabilities:start -->
Implementation inventory for **Pinned Zork II release 63 / serial 860811**. Also available in the player under **Debug: capabilities**. Status describes implementation scope, not a guarantee of every possible playthrough. No gameplay operation is silently stubbed: unsupported stream operations fail explicitly.

| Capability | Status | Scope and limits |
|---|---|---|
| ZIL compilation | supported | Pinned Zork II source compiles into a validated JSON bundle. General MDL macros and source-only numbering for arbitrary games are outside the supported target. [Evidence](docs/phase-2.md). |
| Headless game execution | supported | Translated routines, 16-bit arithmetic, allocation-checked memory, object tree, clock, nested input and owned seeded RNG. The 400-point solve and 75 golden scripts pass; this is bounded evidence, not proof of every possible playthrough. [Evidence](docs/phase-5.md). |
| Option-based text play | supported | Browser and terminal players offer staged objects, actors, multiple objects, ALL and dictionary words. Finish completes a valid shorter sentence; Cancel clears an uncommitted sentence without a turn. [Evidence](docs/phase-4.md). |
| Saves and replay | supported | IndexedDB autosave and named checkpoints, portable save files, source SAVE/RESTORE continuations and hash-checked replay. Browser storage is origin/profile-local and may fail; file import/export remains available. [Evidence](docs/phase-5.md). |
| Original typed input | adapted | Structured choices replace scanning and noun resolution. AGAIN/OOPS, orphan clarification, arbitrary typed commands and numeric/debug input are excluded from player menus. Quoted speech uses selected dictionary words. [Evidence](games/zork2/ledger.md). |
| DIRIN / DIROUT streams | unsupported | Debug stream verbs are not offered. Reached stream operations raise explicit runtime errors; no silent no-op or success stub is provided. [Evidence](docs/compat-semantics.md). |
| VERIFY and randomness | adapted | VERIFY checks the validated semantic bundle rather than a Z-machine disk checksum (HOST-001). Native xorshift32-v1 differs from reference MT19937; conformance uses the original random tape (RNG-001). [Evidence](games/zork2/ledger.md). |
| Source and binary differences | adapted | SRC-013 preserves the empty V-PLAY source string instead of the binary’s stray prefix, with one exact full-text exception. SRC-014 corrects the CLIMB synonym overread. Other guarded normalizations and host/input differences are enumerated in the rules ledger; state and RNG conformance remain strict. [Evidence](games/zork2/ledger.md). |
| Full fuzz acceptance | unverified | Deterministic fuzzing, state/purity checks, shuffled-key checks and sharded CI are implemented. Local smoke runs pass; the required 10,000-game hosted campaign has not been verified. [Evidence](docs/phase-5.md#deterministic-fuzzing-55-acceptance-still-open). |
| Hosted deployment acceptance | unverified | Local production build and browser checks pass. Hosted CI/Pages acceptance remains open; no hosted deployment or headset compatibility is certified. [Evidence](docs/phase-0.md). |
| Scene planning, assets and 3D/XR | planned | LLM scene plans, Blender/GLB generation, desktop 3D and WebXR presentation are future phases. The current playable presenter is text. [Evidence](docs/build-plan.md). |
| Actor audio | planned | Pre-baked non-movement action text and locally generated Python TTS audio are intended. Runtime speech recognition is outside the design; audio generation and playback are not implemented. [Evidence](docs/design.md). |
<!-- capabilities:end -->

## Development

Use Node 24 (`nvm use`), then:

```sh
npm ci
npm run dev
```

Verify with `npm run typecheck`, `npm test`, `npm run zil:check`, `npm run semantics:check`, `npm run symbols:check`, `npm run world:check`, `npm run conformance:check`, `npm run reference:check`, `npm run reference:audit -- --check`, and `npm run build`. For browser checks, run `npx playwright install chromium firefox` once, then `npm run test:browser`.

Run `npx --package=. zxr check reference/zork2` to read, load, expand and resolve the game's symbols. `zxr check entry.zil` checks another entry file and reports source locations for reader or macro errors. The vendored Zork II entry also checks 11,901 symbol references using the pinned numbering layout and validates room/object metadata. Use `zxr check --symbols path/to/zork2-copy` to apply those checks to a source copy. Other entries retain reader/macro checks; source-only numbering is deferred. The `compile` command produces verified bundles. Start the browser player with `npm run dev`, or use `node bin/zxr.ts play` for numbered terminal choices. `node bin/zxr.ts play out/zork2.zxb --save out/my-save.json` loads a compiled bundle with an explicit save path.

The [phase 1 implementation note](docs/phase-1.md) explains the reader, finite compile-time evaluator, pinned macro ports and audit limits. The [phase 0 note](docs/phase-0.md) records dependency pins and the remaining hosted CI/Pages check. The [reference corpus guide](reference/README.md) explains the 75 fixtures: a 400-point victory and coverage of all 50 compiled death sites and 23 interrupts.

[Phase 2 progress](docs/phase-2.md) records the accepted compatibility contract, symbol table, diagnostics and source/compiler findings. Generated [world metadata](games/zork2/world.zxr.json) and its [provenance](games/zork2/PROVENANCE.md) are checked against the original assembly and binary. Use `npm run world:check` to verify it or `npm run world:record` to intentionally regenerate it. Exit byte encoding is complete; current engine work is tracked in the phase 3 progress note.

## Documents

| Document | What it covers |
|---|---|
| [Design](docs/design.md) | The language, the cross-compiler, scenes and hotspots, the runtime, options instead of a parser, platforms |
| [Build plan](docs/build-plan.md) | Twelve phases (0 to 11) with small steps, completion checks and gates |
| [Target: Zork II](docs/target-zork2.md) | What is being ported, the hard spots, how it is tested, the itch.io release |
| [Compatibility semantics](docs/compat-semantics.md) | Values, memory, parser/continuation fields, saves, host boundaries and conformance |
| [Reference audit](docs/reference-audit.md) | Source/binary correspondence, twenty source checks, compile-time branches and limits |
| [Rules ledger](games/zork2/ledger.md) | Source/build differences and reference-host settings |

## How it works

1. **ZIL front end (no LLM).** Reads the `.zil` source and translates rooms, objects, syntax and routines into ZXR JSON one to one. The result already plays as a text game and is checked against the original with transcript tests.
2. **LLM scene planner.** Reads each room's descriptions and objects and writes a scene plan, asset briefs and option labels. These are JSON too, reviewed and editable by a person, and cached.
3. **Asset builder.** Turns briefs into GLB files with Blender Python generators.
4. **Engine and presenters.** The headless engine owns the world. It runs ZIL's own main loop, with each picked option standing in for the parser, so timing follows the original. Presenters draw it as text, as 3D on desktop and tablet, or in WebXR.

The LLM never writes game logic. The rules are translated exactly and proven before any 3D work begins.

## Related work

ZXR follows the architecture of [rougeXR](https://github.com/kariato/rougeXR), which wraps Rogue in the same kind of browser engine for desktop, touch and WebXR: a headless engine contract, observations for the renderer, seeded replay, and a Blender-to-GLB asset pipeline.

## Repository layout

```
src/                application shell, headless ZIL reader/loader, game engine
tools/reference/    original-story runner, instrumentation and audit
reference/          unchanged Zork II source, command fixtures and golden traces
games/zork2/        rules ledger, scene and asset-brief placeholders
tests/              tooling and boundary checks
tests-e2e/          Chromium and Firefox shell checks
docs/               design, build plan, compatibility semantics, audit and phase notes
```

The layout the code will grow into is in the [build plan](docs/build-plan.md#repository-layout).

## License

ZXR is licensed under the Apache License 2.0; see [LICENSE](LICENSE). Adapted rougeXR storage utilities retain their [BSD-2-Clause notice](src/persistence/ROUGEXR-LICENSE.txt), also included in browser builds. The Zork II source, generated world metadata, canonical macro definitions and expanded ZIL samples retain the game's MIT notice; see [ZIL fixture provenance](tests/fixtures/zil/README.md). The reference walkthrough and derived command fixtures retain GPL-3.0 notices separately; see [reference provenance](reference/README.md#provenance-and-licenses). Reference tools and fixtures are not bundled in the browser build. Zork is a trademark of its owner and is not covered by these licenses. The generated 3D models in the prototype (barrow dressing, narrow tunnel, princess, chest, lamp and sword) are machine-generated outputs of Tencent Hunyuan 3D 2.0. They are **not** under the Apache License, and they are available only outside the European Union, the United Kingdom and South Korea, under the [Tencent Hunyuan 3D 2.0 Community License](src/prototype/assets/TENCENT-HUNYUAN-3D-2.0-LICENSE.txt); see the [notice](src/prototype/assets/HUNYUAN-NOTICE.txt).
