# Phase 2 progress: compatibility, symbols and world metadata

Steps **2.0–2.2 are complete**. The compatibility candidate was presented for review, then Mark instructed “next” on 2026-10-21; that authorizes continuing with its contracts. The preceding committed implementation is `6c0f85f`; the compatibility, symbol and world work remains uncommitted. Steps 2.3–2.10 have not started.

The accepted [compatibility specification](compat-semantics.md) gives concrete contracts for the six draft obligations, backed by `reference/semantics-inventory.json` and `reference/semantics-probes.json`.

| Obligation | Evidence and decision |
|---|---|
| Spoken/actor input | Exact V3 byte/word units, quoted token positions and continuation flags from twelve binary scenarios; preserve actor context until the next fresh input. |
| Parser output | All ten P-ITBL fields, eight syntax bytes, counted match tables and explicit global ownership. ACT?, V?, W? and lexical syntax identity are distinct. MANY can occupy the indirect slot. |
| Primitives | All 439 active routines, including argument initializers, contain 70 executable operation names. An independently declared contract rejects added/removed names. Debug stream operations fail explicitly. |
| Header | Ten literal-base-zero AST sites in five routines: release/serial, transcript flag and fixed-font flag. General computed accesses still need symbol/segment validation. |
| Conformance exclusions | Every one of 168 globals classified; 21 named scratch exclusions with reasons, sixteen parser buffers and three protocol references checked separately. Mutable gameplay table contents remain included. |
| Numbers | Retain original object/global/property/flag/action numbering and dictionary order. Byte representations make generic handles unsafe; dictionary values are relocated addresses, string values are handles. |

The evidence changes three important assumptions in the draft:

- PARSER does not preassign PRSO/PRSI. The first TAKE LAMP returns with PRSO=0 but LAMP in P-PRSO. ITAKE-CHECK can subsequently change PRSO during implicit taking. Directional parsing retains the previous syntax pointer.
- READ overwrites the records it emits, leaving unused lexical bytes intact. SOUTH after TAKE ALL retains ALL beyond the live count. Clearing the entire buffer would change compatibility state.
- Quoted speech can continue after the first action. SAY HELLO outside a consuming handler performs SAY then HELLO, costing two moves. Robot commands perform a zero-move TELL pass before their action; a refused/cancelled continuation must not force a second pass.

The wand scenario consumes FLOAT through P-CONT. The riddle scenarios distinguish ANSWER WELL (REPLY) from ANSWER "WELL" (ANSWER). Other scenarios cover implicit taking, the pseudo-object's truncated encoded short name, nested YES? input, and transcript-header writes.

The proposed contract also resolves the runtime-facing gaps in review round three: primitive saves include complete interpreter continuations; host completions have operation identity; replay embeds restore payloads; the semantic build hash includes initial world/layout and ABI; non-clock mutable tables are compared; and rollback restores all state to the latest exposed boundary. These are specification decisions with future runtime acceptance checks, not working engine features.

## Step 2.1: symbol table and name resolution

`src/zil/symbols.ts` is the headless implementation. It receives a loaded/expanded program and an injected numbering layout; it reads no files and imports no reference interpreter. `analyzeSymbols()` returns declarations, every resolved use with a full source span and access mode, routine/local scopes, and accumulated diagnostics. Unknown names, invalid writes/calls, cross-kind duplicates, duplicate locals/defaults, malformed bindings, unknown metadata names, bad reference numbering and constant cycles fail explicitly.

`tools/zil/symbols.ts` supplies the reference-assisted layout and a reproducible `reference/symbol-table.json`. It contains 439 routines, 86 rooms, 165 objects, 168 globals, 30 named properties, 32 attributes, 148 actions, 135 lexical verbs, 18 prepositions, 141 adjective codes and 689 dictionary entries. All **11,901 uses resolve with zero diagnostics**, including argument defaults, object metadata, exits, syntax declarations and table initializers. A reference record does not create a missing source declaration: deleting a global or routine is still an error.

Number domains are explicit:

- Objects use the original `.OBJECT` order, starting at 1; globals use 16 plus `.GVAR` index. PRSA actions (V?) and lexical verb-table codes (ACT?) are separate symbols. VERBOSE's action is legitimately zero; attribute zero is also valid.
- Routines use stable IDs starting at 1 in audited assembly order; zero remains the false routine. These are ZXR IDs rather than bytecode pointers.
- Dictionary entries carry a stable one-based index and an oracle address. Their runtime numeric address stays unallocated (`number: null`) until the memory-layout step. An independent V3 encoder compares all 689 `.ZWORD` encodings to the binary at their inferred addresses. Words cannot accidentally become dictionary ordinals at runtime.
- Locals have deterministic slots and required/optional/AUX/block kinds. Defaults resolve earlier bindings; a nested block can shadow an outer local without leaking it. Bare variable names and dot/comma loads have distinct reference modes. Constant arithmetic wraps after each operation, supports forward aliases, and rejects cycles, zero divisors and mismatches with audited numeric constants.

The manifest stores the definitions/scopes and a hash of the complete resolved-use stream rather than duplicating all spans in a large artifact. The full use stream is available from the headless API. It is not compiled logic, an allocated memory image or a `.zxb` bundle.

### Findings recorded while resolving names

**SRC-006:** DREARY-ROOM-FCN ends with `(T <PCHECK> <RFALSE>)` outside its COND. Generic executable-list semantics would conceal a source/compiler interpretation issue. The binary/assembly target clearly calls PCHECK and returns false after the look branch. `tools/zil/reference-program.ts` normalizes exactly that routine's trailing list to an unconditional PROG, preserving source positions and normalization metadata. A complete expanded-routine hash and assembly anchor guard the rule. Tests prove changed source is rejected and arbitrary executable lists remain unsupported. This is an explicit compatibility rule, not a modification of the vendored source or a claim about the unavailable original compiler.

**SRC-007:** ITABLE NONE 180 reserves 180 words (360 bytes), while C-TABLELEN=180 counts the byte range the clock scans. Match tables reserve 50 words (100 bytes); P-OCLAUSE reserves 100 words. The phase 2.0 candidate incorrectly described NONE 180 as a 180-byte allocation. The specification is corrected before any memory image exists. Table emission and byte-for-byte checks remain step 2.7.

`zxr check reference/zork2` now includes symbol checks automatically. `zxr check --symbols path/to/zork2-copy` applies the same reference numbering to a source copy and reports absolute file/line/column plus a caret. Other entries retain reader/macro checks; self-assigned numbering remains deferred. `compile` and `play` still exit nonzero with explicit unimplemented messages. CI runs the symbol audit and the packaged CLI.

## Step 2.2: room/object JSON

`src/zil/world.ts` generates `games/zork2/world.zxr.json` directly from source declarations and resolved symbols. It is explicitly tagged `stage: "metadata"`; it is not a playable bundle. The 251 entities are ordered by their fixed object IDs and include the original declaration/property source spans.

Each entity has its physical parent, short name from DESC, numbered flags and typed properties. Text fields include LDESC, FDESC and TEXT; numeric fields include SIZE, CAPACITY, VALUE, VTYPE and STRENGTH; handler fields preserve ACTION, DESCFCN, CONTFCN and ADVFCN. Synonyms retain dictionary indices, adjectives retain their byte codes, local GLOBAL lists retain object references, and PSEUDO entries retain word/handler pairs. No additional pseudo entities are invented. Numeric TVALUE is supported if its numbering layout declares it; this Zork II source has no TVALUE declaration.

Missing properties stay missing. The file separately includes all 31 property defaults (SIZE=5, other defaults zero). An explicit zero ACTION remains a present property with a null routine; explicit SIZE=0 remains zero. Compilation does not run GO: ADVENTURER initially has no parent, the wall-direction SIZE patches have not run, and BUCKET's VTYPE is still zero. `(IN TO ROOMS)` on the special ROOMS object is a direction property, not self-containment. GLOBAL lists describe local parser scope and never move objects into those rooms.

The **220 exit declarations** are retained in `pendingExits` with canonical source text, direction identity and spans. Step 2.3 will encode them; translated runtime code cannot consume this intermediate declaration view. Globals/tables, memory allocation, sibling order, string interning and logic translation are later steps. JSON Schema/bundle validation remains step 2.10.

`tools/zil/world.ts` independently checks every entity's parent and attribute bits, all **795 non-exit properties**, all **251 short names**, and all **31 defaults** against the supplied assembly and raw story bytes before GO. It compares values by their actual operand domain: dictionary addresses, routine packed addresses, object IDs, byte adjective codes or decoded text. It checks matching names/IDs and property lengths/order. All **175 metadata text properties** are decoded with pinned ifvms and compared to source-derived text and assembly strings. The audit is stored in `reference/world-audit.json`; `reference/world-spot-checks.json` supplies hand-authored expectations for ten rooms and ten objects, including the machine-room sign's indentation, implicit defaults, vehicle fields and pseudo features. Both checks run before recording artifacts.

**SRC-008:** physical newlines in source strings are formatting, folded to spaces; `|` supplies an actual newline and suppresses an immediately following physical formatting newline. Other spaces, intentional single-space strings, explicit blank lines and sign indentation are preserved. `src/zil/text.ts` implements the rule for reuse by routine translation. This corrects the earlier draft and is verified against all metadata strings, rather than treating source line wrapping as game output.

The core rejects malformed metadata, duplicate flags/properties, containment cycles, unknown handlers and properties, and V3 properties outside 1..8 bytes. The independent audit's mutation checks cover parents, flags, names, numeric/text values, dictionary indices, routine IDs, local GLOBAL references, defaults and counts. `zxr check` now runs this metadata pass alongside reference-assisted symbols, while `world:record` writes the two generated artifacts and `world:check` verifies them without writing.

## Reproduce

```sh
npm run typecheck
npm test
npm run semantics:check
npm run symbols:check
npm run world:check
npm run zil:check
npm run reference:audit -- --check
npm run build
```

Validation: 125 tests pass, including compatibility evidence, symbol/scoping/constant checks, guarded normalization, all dictionary encodings, CLI error positions and source-copy symbol errors. Each of the twelve probes reproduces identically in two fresh original-story runs. They compare checked-in observations and independently asserted critical values, rather than claiming generated JSON is a compiler correctness proof. Existing reference tests still exercise the maximum-score walkthrough and source/binary audit. No browser behavior changed; browser checks remain those from phase 1.

The operation scan is conservative, not an interprocedural reachability/alias proof. Parser classification includes transitive direct callees; indirect references must be resolved and validated in phase 2.8. Source/assembly samples from phase 1 remain the evaluation/control-flow evidence; phase 3 must execute every primitive and lifecycle contract against the oracle. Exit encoding, vocabulary generation, runtime schemas, memory layout, routine translation and `.zxb` packing remain phase 2.3–2.10 work.

## Status and provenance

The instruction to proceed closes the step 2.0 gate. Steps 2.1–2.2 are verified; **step 2.3, exit property encoding, is next**. The specification does not certify the later runtime.

The vendored source and all 75 phase 0 golden fixtures are unchanged. New tooling is Apache-2.0. The generated world metadata and inventories derive source facts/snippets from the pinned MIT source; its MIT notice is in `reference/zork2/LICENSE`. Probes use setup prefixes from the existing GPL-3.0 walkthrough, retain their prefix indices and are covered by the same reference-data provenance and GPL notice described in `reference/README.md`. None of these artifacts enters the browser bundle.
