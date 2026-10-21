# Phase 0 source-to-binary audit

The supplied release-63 story is a useful compatibility reference. The available compiler output has the same **439 routine headers and all 7,139 opcode names in the same order**, with binary instruction offsets independently decoded. Twenty source routines were checked against their assembly. There is one unresolved build-metadata discrepancy around PREDGEN and the release ID, recorded in [the ledger](../games/zork2/ledger.md).

## Reproduce the checked evidence

```sh
npm ci
npm run reference:audit -- --check
npm run reference:check
```

`reference/audit.json` records SHA-256 for every vendored `.zil` and `.zap`, the story and generated disassembly. `--check` computes these again and compares the complete audit record. Without `--check`, the command intentionally replaces the record. The source itself is never modified.

The story's SHA-256 is `3ae7d5558943e9721f3e4b273c8a7faec1a03a604e1ae4ee1cde472c21cb24ac`. The checked header is Z-machine version 3, release **63**, serial **860811**, with a valid checksum and **92,524 bytes**. The final `zork2.chart` row gives release 63, 92,524 bytes, 251 objects, 168 globals and 689 vocabulary entries. `zork2.zip` is byte-for-byte identical to `COMPILED/zork2.z3`; despite its extension it is a story image, not an archive.

## Disassembly comparison

The checked-in `reference/disassembly/zork2.txd.txt` was generated from that exact story with txd at `ecliptik/ztools` commit `73eb4bdc8d711f92728bfd4aa295fd76774cadc0`:

```sh
txd -a -n -w 200 reference/zork2/COMPILED/zork2.z3 > reference/disassembly/zork2.txd.txt
```

The original C tool was built locally with a C compiler; it is not required by CI. The generated output's hash is pinned. The routine order follows the story's `.INSERT` list: gmacros, 2dungeon, gglobals, gclock, gmain, gparser, gverbs, 2actions. gsyntax defines data rather than routine bodies. Each .FUNCT is paired with its disassembled routine, validating the local count and every opcode with an explicit ZAP-to-Z-machine name mapping. The audit also decodes every instruction again from the binary using pinned ifvms, checks its opcode number against an independent V3 opcode-name table, and checks each following instruction offset. The comparison passes with no differences. This mapping provides exact routine names and addresses for reference instrumentation.

This establishes a strong correspondence with the supplied compiler output; it does **not** prove that rebuilding the source would reproduce the binary. Operand values, string contents and static data are not exhaustively diffed. Routine-level local counts, complete opcode sequences and instruction offsets are checked, while operands and control flow are sampled in the following source reviews. The fixture transcripts and full-memory snapshots provide additional behavioral evidence; they do not remove that audit limit.

## Twenty source/assembly checks

The reviewed findings and exact anchors are stored in `reference/spot-checks.json`; the audit verifies those anchors remain inside each named source and assembly routine. Source comments, macros and conditional compilation must be interpreted rather than compared as raw text.

| Routines | Checks |
|---|---|
| ZPROB, RANDOM-ELEMENT, PICK-ONE | Probability bounds, table indexing, entry swaps and persistent cursor updates |
| QUEUE, INT, CLOCKER | Six-byte slots, descending allocation, ordered ticking, decrement-before-call, move increment |
| MAIN-LOOP, MAIN-LOOP-1 | Parser result, match-table loop, M-END, CLOCKER and meta-verb exclusions |
| PARSER | Match-table reset, actor/HERE/LIT maintenance, continuation paths and fresh READ |
| YES?, V-QUIT, V-RESTART | Nested input, affirmative token checks, actual quit/restart opcodes |
| I-SPHERE, I-SAFE, I-LEDGE | Poison timing, collapse scheduling, separate balloon/on-foot death branches |
| BUCKET-FCN, CAKE-FCN, SPHERE-FCN | Water/vehicle movement, 100-tick timer, size changes, actor versus player deaths |
| ZORK3-FCN, JIGS-UP | Wand requirement, victory flag/FINISH, score penalty, possession redistribution and red-mist afterlife |

## Compile-time branches and inventory

`ZORK-NUMBER=2` is explicit in `zork2.zil` and agrees with the absence of the Zork III cleft scheduling and special grue-lair branches. PERFORM's assembly follows the PREDGEN variant: the guard against updating `P-IT-OBJECT` while `PRSI=IT` is present, and debug DD-APPLY dispatch is absent. A release-63 header does not prove that PREDGEN was absent. The source's conditional `ID 0` and the binary header cannot be fully reconciled without the original build driver; the ledger instructs the port to follow the supplied binary for that metadata.

There are 251 objects including rooms, 168 global slots, 439 active routines, **23** active I-* interrupt routines, and **50** compiled calls to JIGS-UP. The earlier source totals were line-based scans and include unused crufty/debug code; the phase 1 reader now records all 456 routine forms, including comments/inactive branches, and explains the seventeen excluded forms in `reference/active-program.json`. In particular, the 24th I-* declaration is the duplicate I-LANTERN in `crufty.zil`, which is not inserted. The old design count of 24 timed events has been corrected to 23 active interrupts.

All 50 compiled death call sites and all 23 interrupt routines execute in the 75-fixture corpus. The complete walkthrough reaches 400/400, WON-FLAG set, 419 moves, no deaths, and the FINISH prompt. This coverage counts instruction/routine execution, not exhaustive branch or interleaving coverage. No source/binary gameplay discrepancy was established by these checks. Any later discrepancy must still be investigated and classified in the ledger.
