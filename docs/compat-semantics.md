# ZXR compatibility semantics v1

2026-10-21 · Mark Davey

This document defines what translated ZIL code sees. The step 2.0 candidate was presented for review; Mark authorized proceeding with “next” on 2026-10-21. Steps 2.1–2.10 resolve symbols and emit world/vocabulary data, a shared string pool, a linked memory image, routine IR, parser partition and semantic source maps and validated bundles against this contract. This version supersedes conflicting shorthand in the design and build plan. Its compatibility ABI is `zxr-zork2-semantics-v1`; changes to these rules require an ABI change and conformance checks.

Evidence is reproducible with `npm run semantics:check`. [The inventory](../reference/semantics-inventory.json) covers all 439 active routines, argument initializers included, and all 70 runtime operation names. This is a conservative superset of reachability, not a proof that every branch executes. Type declarations, object comments and quoted data are not executable operations. [Twelve binary probes](../reference/semantics-probes.json) record the parser boundaries, input buffers, continuation flags, syntax bytes and header flags from the pinned release 63 binary. Every probe is run twice. These are oracle observations, not tests of an implemented ZXR engine.

**The rule:** where Z-machine version 3 behaviour is observable by Zork II's code, ZXR reproduces it. Where it is not observable, ZXR is free to do something simpler. Everything here can be implemented in TypeScript without running Z-machine bytecode.

## Values

- Every value is a 16-bit pattern. Arithmetic and numeric comparison (`+`, `-`, `*`, `/`, `MOD`, `L?`, `G?`) treat it as signed: results wrap to 16 bits, and division and modulo truncate toward zero. Division or modulo by zero is a runtime error (see Errors).
- When a value is used as a byte address (a table, a `GETPT` result, a dictionary word), it is read as unsigned 0 to 65535. The engine never sign-extends an address into a negative JavaScript index.
- `BAND`, `BOR`, `BCOM` work on the unsigned bit pattern.
- False is 0. Everything else is true. `<>` and `<RFALSE>` produce 0; `T` and `<RTRUE>` produce 1. `M-FATAL` is 2, as defined in `gmain.zil`.
- Objects, rooms, routines, globals, words, properties and strings are all numbers at run time (see Numbering and Strings). JSON names are only the source form.

## Evaluation order

- Arguments are evaluated left to right, once each.
- `AND` and `OR` short-circuit and return the deciding value, not just 0 or 1.
- `COND` clauses run in order; a clause with no body returns its test's value.
- A routine that falls off its end returns the value of its last expression.
- Core IR assigns lexical locals numeric variable slots 1..15, separately from global variable numbers 16+. All selected routines fit (maximum twelve slots); exceeding this bootstrap limit is a compilation error. Bare local/global names produce variable numbers, dot loads a local, and comma selects the global symbol namespace even when a local shadows the name.
- Missing optional arguments use their declared defaults; a supplied zero is supplied, not missing. AUX initializers run in source order after parameters; unspecified locals start at zero. Defaults and block bindings can read earlier bindings. `#DECL` is compile-time type information, never an evaluated expression.
- `RETURN` exits the nearest `PROG`/`REPEAT`, or the routine if no block encloses it; omitted value is 1. `AGAIN` restarts the nearest explicit block, or the implicit routine body when no block encloses it (GO ends this way). It retains that activation's bindings rather than reinitializing locals or creating a new call frame. The GO assembly's final JUMP targets its first body instruction, `?FCN`. `RTRUE`, `RFALSE` and `RSTACK` exit the routine across every block. A frame has its own operand stack for `PUSH`/`RSTACK`; RFATAL therefore returns 2 across macro-generated blocks.
- Output and statement-only mutations yield 1 when the ZIL compiler needs a value. Do not return the mutated object's number or a JavaScript `undefined`. `PROG` returns its last expression; an empty statement block returns 1. A failed `COND` returns 0. The assembly's `OBJ-FOUND`, `FIXED-FONT-ON`, `TAKE-CHECK`, `QUEUE`, and `DO-WALK` distinguish these cases. The twenty phase 1 expansion samples remain required source/assembly evidence; they do not substitute for phase 3 runtime tests.

## One memory image

All addressable game state lives in one big-endian byte array of at most 64 KB, laid out like a version 3 story file's dynamic and static memory: the header, the global variables table, the object table (attributes, parent, sibling, child, property-table address), property tables, the syntax and action tables, the vocabulary, and every `TABLE`, `LTABLE` and `ITABLE`. The engine's typed views (the object tree, flags, the exit graph) are accessors over this array, never separate copies, so a raw `PUT` and a `MOVE` can never disagree.

- **Globals:** `SETG`, `,GLOBAL` and `VALUE` all read and write the globals table, so a global's number (used by `CEXIT` exits) and its value stay coherent.
- **Tables:** a table value is the byte address of its first element. `GET t n` reads the word at `t + 2n`, `GETB t n` the byte at `t + n`; `PUT` and `PUTB` write the same places. Bytes and words alias, as in the original.
- **`REST t n`** returns `t + n`; omitted `n` defaults to one byte (SRC-010). Two pointers compare equal with `==?` exactly when they are the same address, which is what `INT` in `gclock.zil` relies on.
- **Layout is ZXR's own.** The compiler assigns addresses; relocation must preserve byte layouts, alignments, interior offsets and aliases. Relocation is a compiler obligation, not a license to assign arbitrary handles to tables. Immutable string text can live outside this array; its word handles are a separate operand domain. Encoded dictionary text and mutable object short names remain in the byte image.
- Every allocation has a declared base, byte length, mutability and typed field layout. `GET`/`GETB` are unsigned reads; signedness is applied by the consuming operation. Writes to static segments, out-of-range accesses and address arithmetic overflow error rather than silently wrapping or extending an array. One-past-end addresses can be formed for loop comparisons. An access must fit wholly within one allocation whose closed pointer range contains its evaluated base. At adjacent boundaries the same numeric address can also be the following allocation base; there is no hidden pointer provenance (SRC-012). Padding is never dereferenced. Unaligned word accesses are permitted within a segment. `REST`/`BACK` count bytes; `PUT` counts words.
- `TABLE` emits source elements in order, words unless `#BYTE` changes that element's width. `LTABLE` prefixes a length word; byte/length variants use the declared width. `ITABLE` expands its explicit size/pattern/flags: LEXV has two header bytes followed by word/byte/byte records, `(BYTE LENGTH)` has a length byte then zero bytes, and `ITABLE NONE 180` reserves 180 words (360 bytes). C-TABLELEN=180 is the clock's used byte range, not the allocation size; ITABLE NONE 50 match tables likewise reserve 100 bytes. Sizes refer to the form's declared units, not universally words. Any constructor/flag combination outside the inventoried game is a compilation error until specified. Nested tables are separate allocations with relocations. Default property words, action/preaction/syntax tables and vocabulary allocations also have field layouts.
- **The header:** the bytes Zork II reads or writes are reproduced. `V-VERSION` reads the release number (word 1, value 63) and serial (bytes 18 to 23, `860811`). `V-SCRIPT` and `V-UNSCRIPT` set and clear bit 0 of word 8 (the transcript flag), which the presenter reads to turn a transcript on or off. `FIXED-FONT-ON/OFF` also set/clear bit 1 of word 8. These ten AST sites in five routines are the complete literal-base-zero inventory (including nested GETs). The serial loop covers byte offsets 18 through 23 inclusive. There are no other literal-base header accesses in the selected program. Computed memory access still needs symbol/segment validation; this scan is not arbitrary pointer data-flow analysis. Restart/restore preserve the current low two bits of header word 8, as the V3 host does; other game bytes come from the new/saved image. Initialize the remaining header with valid layout pointers and reference metadata, not a zero placeholder.
- **Routines stored in tables:** a routine reference is stored as its routine number, and `APPLY` of a word calls the routine with that number. 0 is the false routine.

## Strings

Strings are values too. Zork II stores them in tables (`LAMP-TABLE` holds the lamp's dimming messages, printed by `LIGHT-INT` after a `GET`), in properties (`TEXT` for readable objects, read by `V-READ`), and assigns new ones at run time (`PUTP ,CERBERUS ,P?LDESC ...`).

- Every runtime string literal is interned by decoded text in deterministic active expanded-program traversal order, with handles 1..65535 (zero reserved); overflow is a compilation error. Its runtime value is the handle, never a byte address. `PRINT` resolves that handle; raw GET on a string handle is invalid. Do not infer a word's reference type from its numeric value: an integer may coincide with a handle or object number. Field layouts and expression operand roles supply that type.
- The shared pool includes routine/default literals, global/table strings, LDESC/FDESC/TEXT and exit messages. Binding section markers, DECL metadata and dictionary word spellings are not runtime text. DESC remains an encoded mutable object short name for PRINTD, separate from string handles. Step 2.6 emits these handles; step 2.7 links table/property/exit words to them and assigns dictionary byte addresses.
- `PRINT` prints the string with a given number, `PRINTI` prints an inline literal, `PRINTB` prints a vocabulary word from its dictionary address, `PRINTC` prints one character, `PRINTD` prints an object's short name, `PRINTN` prints a signed number. `TELL` expands to these, including `PRINT` for any dynamic expression.
- Decode ZIL vertical bars to LF and literal escaped characters as the reader specifies. Physical source newlines fold to spaces; a physical newline immediately after a vertical bar is formatting and is suppressed. Preserve other spacing, including indentation after an explicit newline and an intentional single-space string. The world audit checks all 175 metadata text properties against assembly and binary; the earlier candidate's instruction to preserve physical source newlines was incorrect. The pool stores Unicode, but PRINTC uses the supported ZSCII character mapping (13 means newline). PRINTB decodes the dictionary's four encoded text bytes, which may truncate a long source word; PRINTD decodes mutable object short-name bytes. Neither substitutes a friendly JSON label. Presenters wrap lines.
- Saves store string numbers. A save is only accepted by the build that made it (see Saves), so numbers never need translating.

## Objects and properties

- **Attributes:** 32 per object, using audited `.zap` values (attribute zero is the high bit of the first byte). Source traversal order alone is not the bootstrap numbering rule.
- **Tree:** parent, first child and next sibling, with `MOVE` putting the object first among its new siblings.
- **Property tables** use the version 3 layout: a size byte (length and number) followed by the data. `GETPT` returns the address of the data, `PTSIZE` returns its length, `GETP` reads a byte or the first word of a longer property, and a missing property returns the default from the `PROPDEF` defaults table. `PUTP` writes only existing one-/two-byte properties; missing or incompatible lengths error. PTSIZE 0 is 0; NEXTP obj 0 returns the highest property number, then follows descending property order to zero. An object has a short-name word count and encoded name immediately before its property entries. Preserve the PSEUDO-OBJECT layout: GLOBAL-CHECK copies two dictionary words to five bytes before its ACTION data, so an unrelated string handle cannot replace that name.
- **Exits are properties.** Each direction is a property whose length tells `V-WALK` the exit kind: `UEXIT` (plain), `NEXIT` (blocked with a message), `FEXIT` (routine), `CEXIT` (conditional on a global, whose number is stored in the property and read with `VALUE`) and `DEXIT` (conditional on a door). The front end encodes them with the original lengths and the field offsets defined as constants in `gverbs.zil` (`REXIT`, `UEXIT`, `NEXIT`, `FEXIT`, `CEXIT`, `DEXIT` and their field offsets).
- **Exit payload layout:** UEXIT is one destination-object byte. NEXIT is one big-endian string word. FEXIT is a big-endian routine word followed by a zero byte. CEXIT is destination byte, global variable-number byte, then a string word (zero when no ELSE). DEXIT is destination byte, door-object byte, string word, then a zero byte. Padding is part of PTSIZE and must remain present. During front-end lowering, strings have zero placeholder words and explicit text relocations; routine words contain stable ZXR IDs. Shared string handles are assigned when building memory in step 2.7. For oracle byte comparison only, the audit links text to the original packed string address and routines to original packed routine addresses; these addresses are not emitted as runtime IDs.
- **Readable views** such as `"exits": { "down": { "to": "CELLAR", "if": ... } }` are generated from the memory image for tools, the scene planner and the option builder. Translated code never reads them.

## Numbering

Zork II is bootstrapped in a **reference-assisted mode**: where code can observe a number, ZXR uses the number recovered from the vendored `.zap` files and checked against `zork2.z3` in the phase 0.8 audit.

- Objects and rooms keep the original compiler's order, so anything that prints, compares or orders by object number behaves the same.
- Verbs (`V?`), actions (`ACT?`), prepositions (`PR?`), properties (`P?`) and attributes keep their `.zap` values.
- A vocabulary entry has a stable source ID, but `W?WORD` evaluates to its **relocated byte address**, not its ordinal. Preserve reference dictionary order, seven-byte entries (four text bytes plus three role bytes), and alias roles. ACT? is the lexical verb-table number, V? the dispatched action, and PR? the preposition code: these are distinct namespaces. A syntax identity includes the lexical table and row; an action alone cannot select it.
- Global variable numbers are 16 + index in the `.GVAR` order, not byte offsets or source declaration order. `VALUE` uses that number; CEXIT stores it as a byte. Routine references use stable compiler-assigned word IDs with an explicit ID-to-routine map and zero as false; they are not addresses in the data image.
- Objects retain all 251 original IDs, each fitting one byte; source constants, properties and exit encodings consume these numbers. Inspection found no numeric range test or arithmetic over object IDs requiring a new ordering rule beyond identity and tree order. That does not justify simplification: raw byte table/property layouts and future conformance expose the representation. Reference numbering remains mandatory for this bootstrap.
- A later **self-assigned mode** will number everything from the source alone, for ZIL games that ship without assembly output or a compiled story file. That mode is not needed for Zork II and is not scheduled yet.

## The parser adapter

`PARSER` is replaced, but only its middle: reading the input, looking up words, parsing clauses and resolving noun phrases to objects (`CLAUSE`, `SNARF-OBJECTS`, `GET-OBJECT`, `ORPHAN` and their helpers). Its start and its end are kept, because `MAIN-LOOP-1` depends on what they leave behind. The adapter is a hand-written ZIL-level routine, recorded in the ledger, that runs in place of `PARSER` when an option is executed.

### 1. Prologue (kept from `PARSER`)

The two context tests are sequential, not an if/otherwise rewrite. First copy P-ITBL to P-OTBL if P-OFLAG is false and clear all ten P-ITBL words. Save prior WINNER/P-MERGED in locals; clear P-ADVERB, P-MERGED, P-END-ON-PREP and the counts (only) of P-PRSO/P-PRSI/P-BUTS. If QUOTE-FLAG is false and WINNER differs from PLAYER, restore WINNER=PLAYER, HERE=META-LOC PLAYER and recompute LIT.

Then select entry mode:

| Mode | Context and buffers |
|---|---|
| Fresh option | The original fresh READ arm sets WINNER=PLAYER and QUOTE-FLAG=0; sets HERE=LOC WINNER only if that location lacks VEHBIT; recomputes LIT; emits the normal newline/prompt. Fill the input buffers for the canonical command at that READ boundary. |
| Internal continuation | Take PTR=P-CONT, retain WINNER/HERE/LIT/quote state and existing token bytes, then clear P-CONT. Preserve the original conditional newline behavior. No fresh READ and no reset to PLAYER. |
| Reserve/AGAIN/OOPS | Not public options. Adapter must enter with RESERVE-PTR=0 and cannot accept these lexical modes; reject an unsupported continuation rather than guessing. |

`PLAYER` means the object in that global (ADVENTURER), not a separately numbered object.

V3 READ retains capacity bytes, writes lowercase command bytes starting at P-INBUF+1 followed by zero, and overwrites only the emitted parse records plus the word-count byte. It **does not clear unused records**. P-INBUF capacity is 120 (at most 119 text bytes); P-LEXV capacity is 59 records. Its byte 0 is capacity, byte 1 is current count. Record i, zero-based, is at byte 2+4i: dictionary address word, token-length byte, text-offset byte. Text offsets start at 1. As word offsets, dictionary words are at 1,3,5,...; P-CONT is one of these **word indices**, not an address. Unknown dictionary words have address zero while length/text remain available. Keep bounds checks for the text, token count and all writes. READ inside YES?/FINISH follows the same overwrite rule.

The `ordinary-and-all` probe shows SOUTH retaining ALL in its second unused record. At TAKE LAMP's first parser return PRSO is still zero. Clearing either value would falsify the reference checkpoint.

### 2. Resolution (replaces the middle of `PARSER`)

The option already names everything the parser would have worked out. The adapter writes it into the same tables `MAIN-LOOP-1` reads:

- **Verb and syntax.** `PRSA` is the action number. `P-SYNTAX` is set to the address of the exact syntax entry the option names. Every `act` option carries a syntax id, which is the one-based index of the line within its lexical verb's syntax table (byte offset `1 + (id - 1) * 8`, after the count byte). The compiler prepends syntax declarations, so the emitted table reverses their source order; the option builder chooses it with the same rule `SYNTAX-CHECK` uses (the first line whose prepositions and object count match), so a given verb, preposition and object count always maps to one id. `P-ITBL` gets the verb word and the noun-clause pointers that `MAIN-LOOP-1` and `MANY-CHECK` read.
- **Objects.** `P-PRSO` and `P-PRSI` are filled as match tables: the count at `P-MATCHLEN`, then the objects. `PRSO` and `PRSI` are **not** pre-filled or cleared. MAIN-LOOP-1 sets them during dispatch; ITAKE-CHECK can set PRSO during implicit acquisition. Preserve these stale scalars at the parser-return checkpoint. A multi-object option (`TAKE ALL`, `DROP` of several things) fills `P-PRSO` with every object, in the order `GET-OBJECT` would have listed them (object-tree order), and an "all" option also writes `W?ALL` as the first word of the noun clause, because `MAIN-LOOP-1`'s multiple-object exceptions test for it.
- **Pseudo-objects.** A room feature such as the Tea Room's hole is one shared `PSEUDO-OBJECT` whose action and name are swapped in by `GLOBAL-CHECK` for the word the player typed. An option names such a feature as `{ pseudo: { room, word } }`. At this step, and only here, the adapter does what `GLOBAL-CHECK`'s pseudo branch does: `PUTP ,PSEUDO-OBJECT ,P?ACTION` to that room's handler for that word, writes the word into the object's name, and puts `PSEUDO-OBJECT` in the match table. `options()` never does this.
- **Movement.** A `walk` option does exactly what `PARSER` does for a direction: `PRSA` is `V?WALK`, `PRSO` and `P-WALK-DIR` are the direction's property number, `AGAIN-DIR` is set, `P-OFLAG` is cleared, and the adapter returns the direction number (truthy, not normalized to 1) without the checks below. For every other option it clears `P-WALK-DIR` and `AGAIN-DIR`.
- **Predefined dialogue choices.** Players select pre-baked action text; there is no speech recognition or speech-to-text. The internal `say` action represents the authored words attached to a selected dialogue/puzzle choice. A `say` option writes its words into `P-LEXV` and sets `P-CONT` and `QUOTE-FLAG` the way `PARSER` leaves them after a quoted phrase such as `ANSWER "WELL"`: `RIDDLE-ROOM-FCN` checks the word at `P-CONT` and the one after it, and `V-INCANT` stores the word at `P-CONT` in `SPELL-USED`. For canonical `answer "well"`, word indices 1/3/5/7 hold ANSWER/QUOTE/WELL/QUOTE; P-CONT=5, QUOTE-FLAG=1, and P-LEXV's count has been changed to 2 by PARSER (remaining tokens after the opening quote, including the closing quote). `answer "a well"` has A/WELL at indices 5/7 and count 3. This is why the riddle checks P-CONT and P-CONT+2. Canonical spoken commands always use quotes; unquoted ANSWER WELL selects the REPLY syntax instead. V-INCANT consumes the first dictionary word at P-CONT and clears continuation. Unknown quoted words retain dictionary zero. Do not turn SAY HELLO into an unconditional one-pass action: outside the riddle/wand, SAY leaves the HELLO continuation live. The `speech-say` probe executes SAY then HELLO, counting **two** moves for one input. Continue until the translated loop needs fresh input, suspends for a decision/host, or terminates; honor routines that cancel continuation.

### Complete adapter field contract

All P-ITBL offsets below count words; noun endpoints are byte addresses into P-LEXV, with the end exclusive. Empty fields are zero. P-VERBN points to P-VTBL, not a dictionary word. P-VTBL starts with the verb's dictionary word, then length and text offset bytes for WORD-PRINT. An inferred comma/TELL command has P-VERBN=0. P-VERB is ACT?; PRSA is the row's V? action. A syntax reference is `{lexicalTable, row}` resolved to an eight-byte row: object count, prep1, prep2, find1, find2, scope1, scope2, action. Number rows in actual compiled table order, not source order (phase 1 compared multisets only).

| P-ITBL word | Name | Value |
|---|---|---|
| 0 | P-VERB | Lexical ACT? code |
| 1 | P-VERBN | P-VTBL, or zero for inferred TELL |
| 2, 3 | P-PREP1, P-PREP1N | First PR? code and its W? dictionary address |
| 4, 5 | P-PREP2, P-PREP2N | Second PR? code and its W? dictionary address |
| 6, 7 | P-NC1, P-NC1L | Start and exclusive end of direct noun clause |
| 8, 9 | P-NC2, P-NC2L | Start and exclusive end of indirect noun clause |

The canonical token spelling is chosen by the compiler from source vocabulary/syntax and recorded in vocabulary JSON; no LLM selects it. An explicit object option can use a distinguishing adjective plus synonym. All offsets/lengths refer to this spelling. ALL must be the first dictionary word at P-NC1; P-GETFLAGS=P-ALL (1), otherwise zero. Fill both counted match tables in reference tree search order, including a MANY indirect slot such as SGIVE. The action API must allow an array/ALL in either syntax-authorized slot; never silently retain only the first indirect match. Unsupported simultaneous multiplicity must be rejected explicitly.

Adapter writes, beyond the kept prologue/epilogue:

| Fields | Rule |
|---|---|
| PRSA, P-SYNTAX | Exact row's action/address for non-walk; walk sets WALK and retains prior P-SYNTAX (the parser's fast path bypasses syntax selection). |
| P-NCN, P-GETFLAGS, P-NUMBER | Number of noun clauses, ALL flag or zero, zero (numeric debug excluded). |
| P-NAM, P-ADJ | Zero after explicit resolution, as GET-OBJECT leaves them. Do not bypass original LIT?/search effects in the kept prologue. |
| P-OFLAG, RESERVE-PTR, P-MERGED | Zero for complete explicit options; no orphan or reserve mode. |
| P-WALK-DIR, AGAIN-DIR | Direction property number for walk, zero otherwise. |
| P-CONT, QUOTE-FLAG | Exact quote/actor/continuation values above; ordinary fresh input leaves zero. Do not clear them unconditionally at command completion. |
| P-PRSO, P-PRSI, P-BUTS | Reset counts; write selected matches, retain unused cells. P-BUTS stays empty for the supported explicit options. |
| P-WON | Store adapter result at original PARSER return point. Failed MANY/TAKE checks are game-level parse failures, not protocol rejections. |
| P-IT-OBJECT | Preserve and let translated PERFORM/THIS-IS-IT update it; it is persistent pronoun context. |
| PRSO, PRSI, HERE, WINNER, LIT | Only writes from kept prologue, movement fast path, implicit taking, and translated routines. No synthetic dispatch preassignment. |
| P-MULT, P-NOT-HERE | Owned by MAIN-LOOP-1, never precomputed by the adapter. |
| Remaining parser scan fields | Explicit scratch policy below; no invented semantic values. |

Source consumers and their exact locations are in `parserConsumers` in the inventory. The completed step 2.8 partition, retained helper closures and direct/transitive may-effects are in `games/zork2/parser.zxr.json`; exact consumer/READ sites and plans are in `games/zork2/parser-ledger.md`. Argument aliases are conservatively substituted through calls, and unknown memory bases remain explicit. No claim of a complete interprocedural alias analysis is made here. P-LEXV/P-CONT game consumers include RIDDLE-ROOM-FCN, V-INCANT and V-SAY; resets also occur in verb/game handlers and must remain translated. READ sites are PARSER, YES?, FINISH. All other parser routines are classified conservatively, with transitive direct callees of action helpers kept. First-class references to replaced routines and unclassified APPLY domains fail compilation. Runtime dispatch must also reject unknown/removed numeric IDs. Every translated routine is prohibited during options queries.

### 3. Epilogue (kept from `PARSER`)

The adapter ends the way `PARSER` does, by calling the translated `MANY-CHECK` and `TAKE-CHECK` and returning their result:

- `MANY-CHECK` refuses several objects where the syntax does not allow them.
- `TAKE-CHECK` runs `ITAKE-CHECK` for each slot whose syntax has `HAVE` or `TAKE`. This can pick the object up and print "(Taken)", or print "You don't have the X." and fail, all within the same command and the same clock tick, exactly as typed input would.
- If the adapter returns false, `MAIN-LOOP-1` treats it as a failed parse: no action, no clock tick, `P-CONT` cleared. These outcomes are ordinary resolved results with their text, not protocol errors.

### Commands to another actor

In the original, "robot, go east" is two passes through `MAIN-LOOP-1`: `TELL ROBOT`, whose `V-TELL` sets `WINNER` to the robot and `HERE` to the robot's location (and `TELL` costs no clock tick), then "go east" parsed with the robot as `WINNER`. An actor option does the same within one `execute()`: the adapter first produces `TELL <actor>` with `P-CONT` and `QUOTE-FLAG` set, then, on the second pass, takes the continuation branch of the prologue (no context reset) and resolves the command for the actor. Only perform the second pass if the translated TELL actually leaves a continuation; a refusal/cancellation stops it. For canonical `robot, go east`, records at word indices 1/3/5/7 are ROBOT/THEN/GO/EAST (the parser rewrites comma to THEN). First return: P-CONT=5, QUOTE-FLAG=1, WINNER=PLAYER. After V-TELL, WINNER=ROBOT and HERE=LOC ROBOT; the second parser return has P-CONT=0, QUOTE-FLAG=0, PRSA=WALK and PRSO=EAST. LIT is retained on this path, not recomputed by V-TELL. The first pass costs zero moves and the movement pass one. Explicit `tell robot "go east"` instead starts continuation at 7. The next fresh LOOK restores player context. The robot's own inventory and location therefore apply to its `TAKE-CHECK`, and a routine that changes `WINNER` mid-action (the cage rescue sets it back to `ADVENTURER`) is respected. The player's context is restored by the next option's prologue, as in the original.

### Integrated execution boundary (step 3.4)

The internal TurnLoop coordinator executes startup and each structured action until the next fresh parser READ, a YES?/FINISH READ, a host primitive or termination. It runs the next fresh prologue before publishing, so context and match-table resets occur at the same point as the original transcript and the prompt is returned once by the segment that printed it. Interpreter retains a diagnostic pre-PARSER mode for action-complete probes; its inputBoundary mode is included in checkpoints. Raw parser text is allowed only for standalone diagnostic fragments, never as a substitute for structured action resolution in an integrated loop.

TurnResolution is the execution packet used by the later public ActionResolution assembly: accepted action sequence, status, text, moves, per-segment source clock ticks, random events and execution boundary. An accepted fresh action advances the sequence once even if source code takes several passes. Internal decision and primitive completions resume the same sequence and budget. Errors restore every component to the last exposed boundary. Public epoch/revision correlation, decision/host request IDs, saves, knowledge state and successful session replacement remain step 3.7; options and filtered observations remain phase 4.

Structured choices supply complete noun bindings; an explicit absent noun or empty ALL search runs the original missing-match arm, but an ambiguous/mismatched identity cannot silently select another object or open free-text orphan dialogue. Multi-word quoted commands that survive a handler require an authored structured continuation; a surviving bare direction can be resolved directly from its source dictionary role. Canonical PLAYER walks can also be bound explicitly. The original fast path preserves prior syntax/verb and unconsumed closing-quote/count state. Nested speech, actor changes and arbitrary unbound command scanning are not part of this bounded action language. These exclusions are deliberate parser-replacement boundaries, not alternative game rules.

### Out of scope

Debug verbs (`#RANDOM`, `#COMMAND`, `#RECORD`, `#UNRECORD`) are not offered as options, so numeric input (`P-NUMBER`, `INTNUM`) is never needed; `AGAIN` and `OOPS` have no meaning without typing and are not offered. Each is listed in the ledger.

## Input inside routines

`READ` appears in three routines: `PARSER` (replaced above), `FINISH` and `YES?` (called by `V-QUIT` and `V-RESTART`). In the engine, `READ` is an interpreter operation that suspends execution. The interpreter keeps its own call stack, so a suspended routine can resume exactly where it stopped.

- When `READ` suspends, `execute()` returns `status: 'pending'` with a decision id and the choices (`YES`/`NO`, or `RESTART`/`RESTORE`/`QUIT`). While a decision is pending, `options()` returns only the options for that decision, with ids such as `DECIDE:<decisionId>:YES`. Any other option, or an old decision id, is rejected without changing state.
- Answering fills P-INBUF/P-LEXV with the selected one-word response using the READ overwrite rule above (count 1, capacity retained, unused slots untouched) and resumes the routine, so `YES?` and `FINISH` run unchanged.
- No clock tick happens while waiting. Saving is refused while a decision is pending.

## Host operations: save, restore, restart, quit

The engine has no storage. The `SAVE`, `RESTORE`, `RESTART` and `QUIT` operations suspend the interpreter and return `status: 'host'` with a request (`save` with the save data, `restore`, `restart`, `quit`). The host performs it and calls `completeHost(result)`:

- A save result resumes the routine with success or failure, as the Z-machine's `SAVE` does.
- A successful restore or restart replaces the whole world and discards the suspended routine; it does not resume it. A failed restore resumes the routine with failure, so `FINISH` prints "Failed." and asks again.
- Quit ends the session.
- Every successful restore, restart or load starts a new **epoch**. Requests carry the epoch and revision they were made against, so a request from before the restore is rejected even if the revision number happens to repeat.

## Saves

Saves have two explicit checkpoint kinds. `boundary` is an external export at a completed ordinary input boundary, with the canonical waiting continuation. `primitive-save` is captured at SAVE before its success branch, and includes every interpreter frame, local, instruction/expression cursor, operand stack, loop/block activation and resume target. On successful restore discard the current RESTORE/FINISH frames, install the saved frames, and resume the saved SAVE **as successful** (V3); do not call GO or the current V-RESTORE's success arm. Boundary import resumes its stored boundary. A malformed checkpoint changes nothing.

The envelope includes format/ABI version, checkpoint kind, semantic build hash, memory, complete continuation, RNG state/draw cursor and knowledge gates. Epoch and transport revision are envelope metadata, not the semantic state hash. Semantic build identity hashes canonical world initialization, all memory segments/layouts/defaults, logic, symbol/reference maps, vocabulary/syntax/action tables, strings, gate rules and compiler/VM/adapter/option-encoder versions. Canonical JSON uses recursively sorted object keys, array order preserved, integers only, UTF-8, no insignificant whitespace; exclude the build-hash field itself. Visual assets and labels that cannot affect rule execution use a separate presentation hash. Saves from another semantic build are rejected; migrations are deferred.

Replay uses a typed accepted-input log: options/decisions plus host completions, correlated operation IDs, success/failure/cancel and immutable save-content hashes with embedded checkpoint payloads. Playback uses those bytes with an empty external save store. Determinism means identical build, initial checkpoint/seed **and complete accepted input log**; option IDs alone do not determine restore results.

### Host and transaction boundaries

A HostRequest carries `{id, epoch, revision, kind}` plus save payload for save. HostResult echoes all four fields and supplies success/failure/cancel plus validated checkpoint for restore. IDs are monotonic session identities; a duplicate, wrong kind, stale epoch/revision or absent request is rejected without changes. Failure/cancel of SAVE or RESTORE resumes false. Restart is an engine reset after acknowledgement; its failure resumes the original failure path. Quit accepts success acknowledgement only and enters terminal state; it has no false/cancel branch. Host wait exposes no ordinary options. `importSave` is legal only at an ordinary input boundary; reject it during READ/host waits. `exportSave` has the same restriction. Invalid host save data leaves the host request pending and returns a validation error so the host can retry or cancel.

The public lifecycle states are normal input, READ pending, host pending, terminal. Execute accepts ordinary actions only in normal input, decision choices only in READ pending; completeHost accepts only the matching request. Terminal rejects execution. Pure observation is available throughout, reflecting only the last exposed state. Rejected protocol inputs neither tick nor advance semantic revision. Accepted exposed boundaries advance revision once; epoch increases on successful load/restore/restart and is never restored from disk.

A command may expose several segments. Each execute/decision/host completion snapshots **all** authoritative state: memory, RNG, gates, frames/stacks, continuation IDs and protocol state. On error restore the latest exposed boundary and discard that segment's unreturned output/events. Previously exposed prompts/text and completed host effects remain; they cannot be undone. The command's step/depth budget persists across suspensions and continuations. Input-wait publication commits the segment; a newly created save checkpoint describes that committed suspension and its success continuation. External writes occur only after returning the host request. A later segment error cannot retract a successful disk write; the save still represents the committed checkpoint. Revision remains that of the prior boundary on error; diagnostic attempt counters are separate, never part of semantic equality. This segment rule refines the older shorthand “whole-action rollback” where no suspension occurs.

## Randomness

- `RANDOM n` with n > 0 returns 1 to n from the engine's seeded generator.
- `RANDOM n` with n < 0 reseeds the generator with -n, so the same n gives the same stream afterwards.
- `RANDOM 0` reseeds from the engine's own seeded generator, never from the clock or other external entropy, so replays stay deterministic. On the Z-machine this would be unpredictable; the ledger records the difference. Zork II only reaches `RANDOM` with n ≤ 0 through the debug verb `#RANDOM`, which is out of scope.
- **Conformance mode.** Results come from the reference interpreter's log, which records every `RANDOM` call with its range, its result, any reseeding, and the routine that made it. Calls made inside the replaced parser middle (for example `GET-OBJECT` choosing one of several matches) are marked as parser draws and are not fed to ZXR; golden scripts name objects explicitly, so such draws are rare and each one is listed. The engine fails clearly on a range mismatch, an out-of-range result, a missing entry or an unused tail of the log.

## Errors and limits

Each execution segment runs as a transaction over the complete state described above, using copy-on-write memory plus cloned non-memory state. A runtime error (division by zero, a bad address, an unknown routine, call depth over 256, or more than 1,000,000 interpreter steps in one action) rolls that segment back to the last exposed boundary, returns `status: 'error'` with the cause and the ZIL source line, and leaves the last valid state and revision untouched.

## Perception queries

`options()` and `observe()` must not change any state. They do not call ZIL helpers such as `LIT?` or `ACCESSIBLE?`, because those write parser globals (`LIT?` writes `P-GWIMBIT`, `HERE`, `P-TABLE`, `P-SLOCBITS` and the `P-MERGE` table). Instead, TypeScript queries reproduce their answers and are tested against them. Three separate questions are kept apart: what the actor can see, what it can reach, and what the player knows.

## Conformance projection

Reference and engine states are compared at four checkpoints: when the parser (or the adapter) returns, when an action completes (after `CLOCKER`), when a `READ` suspends inside a routine, and at the end of the game. They are compared through a semantic projection, not raw memory:

- Included: the object tree, every attribute, every property (strings compared by text, objects and routines by name), every global except the explicit scratch policy below; parser protocol fields are compared separately, the clock table entries (routine name, ticks, enabled), `MOVES`, the score and the random-log position.
- Included also: **every mutable gameplay table**, not just C-TABLE. PICK-ONE counters and reordered string references in HELLOS/YUKS, all remaining allocated gameplay bytes, and interior pointers such as LAMP-TABLE are compared. An interior pointer projects as allocation symbol plus byte offset. Field schemas distinguish ordinary integers from object/routine/string/pointer references even if their numbers coincide; unknown mixed layouts fail compilation rather than guessing from values.
- All 168 globals have an explicit generated classification in `globalPolicies`. The scratch-only exclusions are: P-LEN, P-DIR, P-NCN, P-ACT, P-DIRECTION, P-ADJN, P-AND, P-XNAM, P-XADJ, P-XADJN, P-ACLAUSE, P-ANAM, P-AADJ (noun scanning); P-OFLAG, P-MERGED, P-END-ON-PREP, RESERVE-PTR, AGAIN-DIR (orphan/reserve/repeat modes); P-TABLE, P-GWIMBIT, P-SLOCBITS (retained search helper scratch). Reasons are independently declared in `tools/zil/semantics-contract.ts`. They remain in full saves and rollback, and retained-helper tests check their effects.
- P-CONT, QUOTE-FLAG, P-SYNTAX are protocol values, compared in parser/continuation fixtures after pointer normalization. Sixteen parser buffer globals identify buffers whose contents are compared by adapter fixtures, not ordinary world equality. The match-table prefixes, canonical syntax row, active tokens and relevant P-ITBL fields must match; unrelated stale tail cells and differing canonical input spellings are not semantic gameplay. Preserve their bytes operationally nonetheless. Include PRSA/PRSO/PRSI, WINNER/HERE/LIT, P-IT-OBJECT, P-GETFLAGS, P-WON, P-MULT/P-NOT-HERE and every other gameplay global by default. A new exclusion needs explicit review; do not exclude everything with a P- prefix.
- Parser adapter output is checked separately at the parser-return checkpoint: the match tables, `P-SYNTAX` and the parser globals must match what the original `PARSER` produced for the same typed command.
- Mutation tests prove the projection is not too loose: deliberately corrupting a flag, a clock entry, a property string or an object's location must make conformance fail. Also corrupt a PICK-ONE counter, swap message references, alter a table interior offset and mutate a non-clock gameplay word; each must fail immediately.

## Operation inventory and implementation status

The normative operation families and their contracts are independently enumerated in [semantics-contract.ts](../tools/zil/semantics-contract.ts); the generated inventory must match that list exactly, and records every use with source position. The 70 operation names are:

```text
* + - / MOD BAND BOR BTST EQUAL? ==? N==? L? G? 0? ZERO? 1? NOT
IGRTR? DLESS? SET SETG VALUE COND AND OR PROG REPEAT RETURN AGAIN
RTRUE RFALSE PUSH RSTACK APPLY LOC FIRST? NEXT? IN? MOVE REMOVE
FSET FCLEAR FSET? GETP PUTP GETPT PTSIZE NEXTP GET PUT GETB PUTB
REST BACK PRINT PRINTI PRINTB PRINTC PRINTD PRINTN CRLF RANDOM
READ SAVE RESTORE RESTART QUIT VERIFY DIRIN DIROUT
```

Known routine heads such as PERFORM, CLOCKER and NULL-F are calls to translated ZIL, not new interpreter primitives. DECL/PRIMTYPE are type metadata. DIRIN/DIROUT belong to compiled debug verbs; they remain explicit unsupported capabilities until a host stream protocol is specified. VERIFY validates the semantic bundle instead of a Z-machine disk checksum; this intentional host difference belongs in the ledger. Object property/default/short-name layouts follow the [V3 object format](https://inform-fiction.org/zmachine/standards/z1point1/sect12.html); lexical records follow the [dictionary specification](https://inform-fiction.org/zmachine/standards/z1point1/sect13.html), and VM-facing operations are checked against the [opcode definitions](https://inform-fiction.org/zmachine/standards/z1point1/sect15.html). ZXR remains an AST interpreter, not a bytecode emulator.

All six draft obligations now have concrete candidate answers: quoted/actor layouts with binary probes; P-ITBL/global field rules; a fail-closed operation inventory; ten header sites; explicit scratch classifications; reference numbering with observable byte representations. The specification also closes the save continuation, host correlation/replay, mutable table comparison and rollback gaps from review round three. Runtime acceptance checks belong to phase 3 and are **not yet passed**.

**Status:** the instruction to continue closes the 2.0 review gate. [Phase 2 progress](phase-2.md) records steps 2.1–2.2, the exact source normalization, ITABLE allocation correction and source-text folding rule found while checking compiler inputs. Phase 2 compilation, schemas and bundle packing are complete; engine progress and remaining execution checks are in phase-3.md.
