# Reference corpus

This is development and conformance data. The browser shell does not bundle the story, interpreter, fixtures, or walkthrough.

## Run

Use Node 24 and `npm ci` at the repository root:

```sh
npm run reference:check
npm run reference:audit -- --check
npm run reference:check -- death-5496
```

`check` runs every selected script twice, compares the complete results, verifies each memory checkpoint's SHA-256, and compares both the trace and readable transcript to the checked-in baseline. For the complete corpus it also checks coverage of **all 50 compiled death call sites and all 23 interrupt routines**. Coverage means a site/routine executed; it does not mean every possible branch or timer interleaving was exercised.

After reviewing a deliberate baseline change:

```sh
npm run reference:record
npm run reference:audit
```

Record a separate command file without changing the golden corpus:

```sh
npm run reference:record -- --commands my-commands.txt --out /tmp/my-run.json.gz --seed 2
```

Commands are printable ASCII, one per line. Empty lines and lines beginning with `#` are comments, except the game's `#random N` command. The harness rejects overlong input rather than silently truncating it. It throws on unsupported host I/O and on an instruction limit instead of hanging.

## Files and coverage

- `zork2/`: unchanged MIT source and story, pinned by `PROVENANCE.md`.
- `scripts/walkthrough.txt`: 386-command, 400-point victory route. Seed **2** is an interpreter setting. It finishes in 419 moves with `WON-FLAG` true and zero deaths. The upstream route is preserved verbatim, including a few failed or ambiguous inputs; their actual parser responses are part of the reference evidence.
- `scripts/fixtures.json`: 75 fixtures: one complete walkthrough, 12 area scripts, 50 death scripts, three additional timer scripts, and nine special cases. Robot commands are also covered by the area/robot script. A fixture's `prefix` replays that many walkthrough commands from a fresh boot before its short command list; no world state is patched to arrange a scenario.
- `transcripts/*.txt`: readable output for each script's focused portion. Setup prefixes are identified in the header. Existing prompts come from the original story.
- `transcripts/*.json.gz`: the entire run, including setup, exact command sequence, interpreter settings, transcript segments, random log, and lossless snapshots. Gzip keeps repeated setup data small. Decompress with `gzip -dc` or Node's `gunzipSync`.
- `coverage.json`: fixture IDs for each interrupt and each death instruction address, with assembly locations.
- `audit.json`, `spot-checks.json`, `disassembly/`: reproducible source/binary evidence; see [the audit](../docs/reference-audit.md).
- `semantics-inventory.json`: conservative inventory of all active expanded operations, direct-call helper classification, header accesses and conformance-global policies. `semantics-probes.json`: twelve focused original-binary scenarios, each run twice, with token bytes/word indices, P-ITBL, syntax, operands and header flags. Run `npm run semantics:check`; `semantics:record` intentionally regenerates only these two artifacts. Their specification is accepted for implementation; they do not implement the ZXR compiler or engine.

- `symbol-table.json`: step 2.1 names, numbering namespaces, local scopes, source positions, a hash of all 11,901 resolved uses, and the guarded SRC-006 and SRC-011 normalizations. `npm run symbols:check` verifies it; `symbols:record` intentionally updates it. Dictionary entry ordering is checked against all 689 encoded words in the binary; oracle addresses are evidence rather than allocated runtime addresses.

- `world-audit.json`, `world-spot-checks.json`: steps 2.2–2.3 check all room/object metadata and 220 encoded exit properties against assembly and initial story bytes, plus ten room and ten object source examples. `npm run world:check` verifies the generated `games/zork2/world.zxr.json`; `world:record` intentionally regenerates it and its audit. Exit byte comparisons link string and routine relocations to oracle addresses; the separate memory artifact links them to shared string handles. The generated world has its own MIT notice and provenance in `games/zork2/`.

- `vocabulary-audit.json`: step 2.4 checks exact ordered syntax bytes in all 135 lexical tables, all 689 dictionary roles, 148 action/preaction dispatch pairs and 18 preposition entries against assembly and raw story data. Active synonyms, buzz words and directions are checked against source evidence. `npm run vocabulary:check` validates the generated `games/zork2/vocabulary.zxr.json` and audit; `vocabulary:record` intentionally regenerates both. Runtime dictionary packing and memory allocation are checked by `memory:check`.

- `logic-core.json`: step 2.5 structural lowering audit for all 439 routines, per-routine IR hashes and all 5,109 deferred sites. `npm run logic:check` checks operation conservation and the deterministic report; `logic:record` intentionally regenerates it. Four hand-authored routine trees are under `tests/fixtures/logic/`. This is partial IR evidence, not executable game logic or runtime conformance.

- `logic-operations.json`: step 2.6 audit for all 439 routines (including 189 verb-library and 176 game-action routines), operation conservation, string-use coverage, host suspension sites and explicit unsupported debug-stream sites. `npm run operations:check` checks it and `games/zork2/strings.zxr.json`; `operations:record` intentionally regenerates both. All 1,341 nonempty pool entries match assembly text; metadata text also retains the world audit's original-binary check. The remaining 656 sites are memory operations/dictionary addresses for step 2.7. Execution and suspension behavior still require phase 3.

## Interpreter and trace contract

`ifvms` **1.1.6** is locked by npm integrity hashes. `tools/reference/runner.ts` supplies a headless V3 host and instruments its JIT at instruction boundaries. All game instructions, text decoding, tokenization, calls, object operations, and Quetzal serialization use the pinned interpreter. The host supplies input, output, one in-memory save slot, and deterministic randomness. The interpreter and its internal modules are tooling only; they are deliberately not part of `src/engine`.

The RNG is MT19937 with CPython integer seeding and `getrandbits` rejection sampling, for unsigned 32-bit seeds. `RANDOM(n)` returns 1..n; negative n reseeds with -n and returns zero. `RANDOM(0)` restarts the configured seed rather than using entropy. Restart resets the RNG; save/restore also restores its state. These are explicit reference-host settings, not proposed ZXR runtime rules. The engine will eventually consume the recorded results as a random tape for conformance, rather than assuming that its normal RNG matches this interpreter.

Every RANDOM entry includes the signed range, result, reseed if applicable, byte PC, routine name, complete routine-name stack, input index, and parser/game classification. Classification follows the call stack, including calls from the parser into shared helpers. Input indices start at zero; -1 means startup. Transcript segment zero is startup; segment n+1 follows command n. Prompt responses are inputs too. One input can produce multiple parser returns or clock ticks.

Checkpoints are taken after PARSER returns and stores `P-WON`, after MAIN-LOOP-1 returns (including CLOCKER where applicable), at every READ suspension, and at FINISH/QUIT. PARSER checkpoints include both match tables, `P-SYNTAX`, and relevant parser globals. READ captures the current routine and call path, so YES? and FINISH prompts can be distinguished from ordinary input.

Snapshots store initial dynamic memory as base64, then contiguous changed-byte patches `[offset, hex]` and a hash of the complete reconstructed dynamic memory. This includes every object, attribute, property, global, parser table, and clock slot, without deciding prematurely what to exclude. `tools/reference/state.ts` reconstructs and verifies these bytes and exposes a V3 object/global/clock decoder. Checkpoints also record current locals, routine stack, score, moves, and random-log position. They are comparison evidence, not resumable VM saves. The later semantic projection must still name property values, decode strings, and review exclusions as specified in compatibility semantics.

The V3 header advertises variable-pitch text, no status window, and no split screen. Status-line calls are ignored; normal printed text is retained, with CR converted to LF and no wrapping or timestamps. Stream selection/command recording are unsupported and fail explicitly. Save/restore uses the upstream Quetzal code and a single in-memory slot. Browser storage, real files, audio and rendering are outside this runner.

## Provenance and licenses

The walkthrough is copied unchanged from [avwohl/zwalker](https://github.com/avwohl/zwalker/blob/edc8113b4133646dffd1b227e68e2127113b7918/walkthroughs/zork2_verified_400.txt), commit `edc8113b4133646dffd1b227e68e2127113b7918`. That repository distributes its material under GPL version 3; its license is preserved in `scripts/WALKTHROUGH-GPL-3.0.txt`. The focused command fixtures and `semantics-probes.json` scenarios adapt its setup prefixes; their added branches were executed and recorded here. Keep the GPL notice with this fixture data, including traces that embed those command sequences. The recorded game text, source snippets/facts in `semantics-inventory.json` and `symbol-table.json`, and generated disassembly retain the source game's MIT notice in `zork2/LICENSE`. ZXR's independently written runner and application code retain the root Apache 2.0 license. No zwalker interpreter or replay code was copied.

The disassembly was produced by txd from [ecliptik/ztools](https://github.com/ecliptik/ztools/tree/73eb4bdc8d711f92728bfd4aa295fd76774cadc0), commit `73eb4bdc8d711f92728bfd4aa295fd76774cadc0`. Only its generated output is stored, not the tool's source or binary. Its input and invocation are recorded in `audit.json` and the audit note. `ifvms` reports MIT licensing; its original dependency notices remain in the npm package. None of these tooling dependencies ships in the web bundle.

- `memory-audit.json`: step 2.7 validates the complete generated `games/zork2/memory.zxr.json` against original assembly and story bytes after typed relocation. It checks all 168 globals, 45 source tables/1,523 cells, 251 object trees and short names, 1,015 properties, all 689 seven-byte dictionary entries, syntax/dispatch tables, release/serial, and the fully linked 439-routine IR hash. All short names decode identically; 142 also have identical encoding bytes. ZXR uses no abbreviations. `memory:check` verifies; `memory:record` intentionally regenerates. Header bytecode entry point, checksum and abbreviation pointer are zero because this is a data image for JSON execution. Runtime memory/conformance checks remain phase 3.
