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

## Interpreter and trace contract

`ifvms` **1.1.6** is locked by npm integrity hashes. `tools/reference/runner.ts` supplies a headless V3 host and instruments its JIT at instruction boundaries. All game instructions, text decoding, tokenization, calls, object operations, and Quetzal serialization use the pinned interpreter. The host supplies input, output, one in-memory save slot, and deterministic randomness. The interpreter and its internal modules are tooling only; they are deliberately not part of `src/engine`.

The RNG is MT19937 with CPython integer seeding and `getrandbits` rejection sampling, for unsigned 32-bit seeds. `RANDOM(n)` returns 1..n; negative n reseeds with -n and returns zero. `RANDOM(0)` restarts the configured seed rather than using entropy. Restart resets the RNG; save/restore also restores its state. These are explicit reference-host settings, not proposed ZXR runtime rules. The engine will eventually consume the recorded results as a random tape for conformance, rather than assuming that its normal RNG matches this interpreter.

Every RANDOM entry includes the signed range, result, reseed if applicable, byte PC, routine name, complete routine-name stack, input index, and parser/game classification. Classification follows the call stack, including calls from the parser into shared helpers. Input indices start at zero; -1 means startup. Transcript segment zero is startup; segment n+1 follows command n. Prompt responses are inputs too. One input can produce multiple parser returns or clock ticks.

Checkpoints are taken after PARSER returns and stores `P-WON`, after MAIN-LOOP-1 returns (including CLOCKER where applicable), at every READ suspension, and at FINISH/QUIT. PARSER checkpoints include both match tables, `P-SYNTAX`, and relevant parser globals. READ captures the current routine and call path, so YES? and FINISH prompts can be distinguished from ordinary input.

Snapshots store initial dynamic memory as base64, then contiguous changed-byte patches `[offset, hex]` and a hash of the complete reconstructed dynamic memory. This includes every object, attribute, property, global, parser table, and clock slot, without deciding prematurely what to exclude. `tools/reference/state.ts` reconstructs and verifies these bytes and exposes a V3 object/global/clock decoder. Checkpoints also record current locals, routine stack, score, moves, and random-log position. They are comparison evidence, not resumable VM saves. The later semantic projection must still name property values, decode strings, and review exclusions as specified in compatibility semantics.

The V3 header advertises variable-pitch text, no status window, and no split screen. Status-line calls are ignored; normal printed text is retained, with CR converted to LF and no wrapping or timestamps. Stream selection/command recording are unsupported and fail explicitly. Save/restore uses the upstream Quetzal code and a single in-memory slot. Browser storage, real files, audio and rendering are outside this runner.

## Provenance and licenses

The walkthrough is copied unchanged from [avwohl/zwalker](https://github.com/avwohl/zwalker/blob/edc8113b4133646dffd1b227e68e2127113b7918/walkthroughs/zork2_verified_400.txt), commit `edc8113b4133646dffd1b227e68e2127113b7918`. That repository distributes its material under GPL version 3; its license is preserved in `scripts/WALKTHROUGH-GPL-3.0.txt`. The focused command fixtures adapt its setup prefixes; their added branches were executed and recorded here. Keep the GPL notice with this fixture data, including traces that embed those command sequences. The recorded game text and generated disassembly retain the source game's MIT notice in `zork2/LICENSE`. ZXR's independently written runner and application code retain the root Apache 2.0 license. No zwalker interpreter or replay code was copied.

The disassembly was produced by txd from [ecliptik/ztools](https://github.com/ecliptik/ztools/tree/73eb4bdc8d711f92728bfd4aa295fd76774cadc0), commit `73eb4bdc8d711f92728bfd4aa295fd76774cadc0`. Only its generated output is stored, not the tool's source or binary. Its input and invocation are recorded in `audit.json` and the audit note. `ifvms` reports MIT licensing; its original dependency notices remain in the npm package. None of these tooling dependencies ships in the web bundle.
