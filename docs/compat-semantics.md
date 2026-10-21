# ZXR compatibility semantics (draft)

2026-10-21 · Mark Davey

This document defines what translated ZIL code sees when it runs on the ZXR engine. The front end and the engine both follow it. Build plan step 2.0 turns this draft into the full specification before any routine is translated; the obligations it must close are listed at the end. It exists because two design reviews (2026-10-21) showed that "typed tables with stable ids" and "fill in the parser globals" do not say enough: Zork II compares pointers, reads bytes out of words, tells exits apart by property length, prints strings stored in tables, reads the story file header, and its main loop consumes the parser's match tables, not just `PRSO` and `PRSI`.

**The rule:** where Z-machine version 3 behaviour is observable by Zork II's code, ZXR reproduces it. Where it is not observable, ZXR is free to do something simpler. Everything here can be implemented in TypeScript without running Z-machine bytecode.

## Values

- Every value is a 16-bit pattern. Arithmetic and numeric comparison (`+`, `-`, `*`, `/`, `MOD`, `L?`, `G?`) treat it as signed: results wrap to 16 bits, and division and modulo truncate toward zero. Division or modulo by zero is a runtime error (see Errors).
- When a value is used as an address (a table, a `GETPT` result, a string), it is read as unsigned 0 to 65535. The engine never sign-extends an address into a negative JavaScript index.
- `BAND`, `BOR`, `BCOM` work on the unsigned bit pattern.
- False is 0. Everything else is true. `<>` and `<RFALSE>` produce 0; `T` and `<RTRUE>` produce 1. `M-FATAL` is 2, as defined in `gmain.zil`.
- Objects, rooms, routines, globals, words, properties and strings are all numbers at run time (see Numbering and Strings). JSON names are only the source form.

## Evaluation order

- Arguments are evaluated left to right, once each.
- `AND` and `OR` short-circuit and return the deciding value, not just 0 or 1.
- `COND` clauses run in order; a clause with no body returns its test's value.
- A routine that falls off its end returns the value of its last expression.
- Step 2.0 checks these rules against the `.zap` output of 20 representative routines.

## One memory image

All addressable game state lives in one big-endian byte array of at most 64 KB, laid out like a version 3 story file's dynamic and static memory: the header, the global variables table, the object table (attributes, parent, sibling, child, property-table address), property tables, the syntax and action tables, the vocabulary, and every `TABLE`, `LTABLE` and `ITABLE`. The engine's typed views (the object tree, flags, the exit graph) are accessors over this array, never separate copies, so a raw `PUT` and a `MOVE` can never disagree.

- **Globals:** `SETG`, `,GLOBAL` and `VALUE` all read and write the globals table, so a global's number (used by `CEXIT` exits) and its value stay coherent.
- **Tables:** a table value is the byte address of its first element. `GET t n` reads the word at `t + 2n`, `GETB t n` the byte at `t + n`; `PUT` and `PUTB` write the same places. Bytes and words alias, as in the original.
- **`REST t n`** returns `t + n`. Two pointers compare equal with `==?` exactly when they are the same address, which is what `INT` in `gclock.zil` relies on.
- **Layout is ZXR's own.** Addresses are assigned by the ZXR compiler, not copied from `zork2.z3`. Nothing in Zork II depends on absolute addresses beyond the header (below), so relocation is safe; conformance compares canonical references, not raw addresses (see Conformance projection).
- **The header:** the bytes Zork II reads or writes are reproduced. `V-VERSION` reads the release number (word 1, value 63) and serial (bytes 18 to 23, `860811`). `V-SCRIPT` and `V-UNSCRIPT` set and clear bit 0 of word 8 (the transcript flag), which the presenter reads to turn a transcript on or off. Step 2.0 lists every other header access found in reachable code.
- **Routines stored in tables:** a routine reference is stored as its routine number, and `APPLY` of a word calls the routine with that number. 0 is the false routine.

## Strings

Strings are values too. Zork II stores them in tables (`LAMP-TABLE` holds the lamp's dimming messages, printed by `LIGHT-INT` after a `GET`), in properties (`TEXT` for readable objects, read by `V-READ`), and assigns new ones at run time (`PUTP ,CERBERUS ,P?LDESC ...`).

- Every string literal in the source is interned in a string pool and gets a number, stable for a given build. Its value at run time is that number, stored like any other word.
- `PRINT` prints the string with a given number, `PRINTI` prints an inline literal, `PRINTB` prints a vocabulary word from its dictionary address, `PRINTC` prints one character, `PRINTD` prints an object's short name, `PRINTN` prints a signed number. `TELL` expands to these, including `PRINT` for any dynamic expression.
- Text is stored as Unicode in the pool, and output uses the original's line-break and spacing rules; the presenter wraps lines.
- Saves store string numbers. A save is only accepted by the build that made it (see Saves), so numbers never need translating.

## Objects and properties

- **Attributes:** 32 per object, numbered as the source's `FLAGS` declare them, in ZIL's assignment order.
- **Tree:** parent, first child and next sibling, with `MOVE` putting the object first among its new siblings.
- **Property tables** use the version 3 layout: a size byte (length and number) followed by the data. `GETPT` returns the address of the data, `PTSIZE` returns its length, `GETP` reads a 1- or 2-byte property as a value, and a missing property returns the default from the `PROPDEF` defaults table. `PUTP` writes in place.
- **Exits are properties.** Each direction is a property whose length tells `V-WALK` the exit kind: `UEXIT` (plain), `NEXIT` (blocked with a message), `FEXIT` (routine), `CEXIT` (conditional on a global, whose number is stored in the property and read with `VALUE`) and `DEXIT` (conditional on a door). The front end encodes them with the original lengths and the field offsets defined as constants in `gverbs.zil` (`REXIT`, `UEXIT`, `NEXIT`, `FEXIT`, `CEXIT`, `DEXIT` and their field offsets).
- **Readable views** such as `"exits": { "down": { "to": "CELLAR", "if": ... } }` are generated from the memory image for tools, the scene planner and the option builder. Translated code never reads them.

## Numbering

Zork II is bootstrapped in a **reference-assisted mode**: where code can observe a number, ZXR uses the number recovered from the vendored `.zap` files and checked against `zork2.z3` in the phase 0.8 audit.

- Objects and rooms keep the original compiler's order, so anything that prints, compares or orders by object number behaves the same.
- Verbs (`V?`), actions (`ACT?`), prepositions (`PR?`), properties (`P?`) and attributes keep their `.zap` values.
- Vocabulary words are numbered by their dictionary order, and the dictionary is laid out so that `W?` comparisons and `PRINTB` work.
- A later **self-assigned mode** will number everything from the source alone, for ZIL games that ship without assembly output or a compiled story file. That mode is not needed for Zork II and is not scheduled yet.

## The parser adapter

`PARSER` is replaced, but only its middle: reading the input, looking up words, parsing clauses and resolving noun phrases to objects (`CLAUSE`, `SNARF-OBJECTS`, `GET-OBJECT`, `ORPHAN` and their helpers). Its start and its end are kept, because `MAIN-LOOP-1` depends on what they leave behind. The adapter is a hand-written ZIL-level routine, recorded in the ledger, that runs in place of `PARSER` when an option is executed.

### 1. Prologue (kept from `PARSER`)

The adapter runs the translated opening of `PARSER` unchanged: it clears `P-ADVERB`, `P-MERGED` and `P-END-ON-PREP`, sets the match lengths of `P-PRSO`, `P-PRSI` and `P-BUTS` to 0, and restores the player's context:

- If the last command was given to another actor (`WINNER` is not `PLAYER`) and no quoted command is continuing, it sets `WINNER` to `PLAYER`, `HERE` to `META-LOC` of the player, and `LIT` to `LIT? HERE`.
- Otherwise it sets `WINNER` to `PLAYER`, clears `QUOTE-FLAG`, sets `HERE` to the player's location unless the player is in a vehicle (the bucket, the balloon basket), and sets `LIT`.

`PLAYER` is a global whose value is the `ADVENTURER` object. Option ids say `PLAYER` and mean "the object in the `PLAYER` global".

Buffers are reset to their initial contents, not zero-filled: `P-LEXV` keeps its capacity byte (59) and `P-INBUF` its capacity byte; all word slots, including the slot after the last word, are 0.

### 2. Resolution (replaces the middle of `PARSER`)

The option already names everything the parser would have worked out. The adapter writes it into the same tables `MAIN-LOOP-1` reads:

- **Verb and syntax.** `PRSA` is the action number. `P-SYNTAX` is set to the address of the exact syntax entry the option names. Every `act` option carries a syntax id, which is the index of the line within its verb's syntax table; the option builder chooses it with the same rule `SYNTAX-CHECK` uses (the first line whose prepositions and object count match), so a given verb, preposition and object count always maps to one id. `P-ITBL` gets the verb word and the noun-clause pointers that `MAIN-LOOP-1` and `MANY-CHECK` read.
- **Objects.** `P-PRSO` and `P-PRSI` are filled as match tables: the count at `P-MATCHLEN`, then the objects. `PRSO` and `PRSI` are set to the first entry of each, or 0. A multi-object option (`TAKE ALL`, `DROP` of several things) fills `P-PRSO` with every object, in the order `GET-OBJECT` would have listed them (object-tree order), and an "all" option also writes `W?ALL` as the first word of the noun clause, because `MAIN-LOOP-1`'s multiple-object exceptions test for it.
- **Pseudo-objects.** A room feature such as the Tea Room's hole is one shared `PSEUDO-OBJECT` whose action and name are swapped in by `GLOBAL-CHECK` for the word the player typed. An option names such a feature as `{ pseudo: { room, word } }`. At this step, and only here, the adapter does what `GLOBAL-CHECK`'s pseudo branch does: `PUTP ,PSEUDO-OBJECT ,P?ACTION` to that room's handler for that word, writes the word into the object's name, and puts `PSEUDO-OBJECT` in the match table. `options()` never does this.
- **Movement.** A `walk` option does exactly what `PARSER` does for a direction: `PRSA` is `V?WALK`, `PRSO` and `P-WALK-DIR` are the direction's property number, `AGAIN-DIR` is set, `P-OFLAG` is cleared, and the adapter returns true without the checks below. For every other option it clears `P-WALK-DIR` and `AGAIN-DIR`.
- **Spoken words.** A `say` option writes its words into `P-LEXV` and sets `P-CONT` and `QUOTE-FLAG` the way `PARSER` leaves them after a quoted phrase such as `ANSWER "WELL"`: `RIDDLE-ROOM-FCN` checks the word at `P-CONT` and the one after it, and `V-INCANT` stores the word at `P-CONT` in `SPELL-USED`. Step 2.0 derives the exact layout from `PARSER` and confirms it against the reference interpreter.

### 3. Epilogue (kept from `PARSER`)

The adapter ends the way `PARSER` does, by calling the translated `MANY-CHECK` and `TAKE-CHECK` and returning their result:

- `MANY-CHECK` refuses several objects where the syntax does not allow them.
- `TAKE-CHECK` runs `ITAKE-CHECK` for each slot whose syntax has `HAVE` or `TAKE`. This can pick the object up and print "(Taken)", or print "You don't have the X." and fail, all within the same command and the same clock tick, exactly as typed input would.
- If the adapter returns false, `MAIN-LOOP-1` treats it as a failed parse: no action, no clock tick, `P-CONT` cleared. These outcomes are ordinary resolved results with their text, not protocol errors.

### Commands to another actor

In the original, "robot, go east" is two passes through `MAIN-LOOP-1`: `TELL ROBOT`, whose `V-TELL` sets `WINNER` to the robot and `HERE` to the robot's location (and `TELL` costs no clock tick), then "go east" parsed with the robot as `WINNER`. An actor option does the same within one `execute()`: the adapter first produces `TELL <actor>` with `P-CONT` and `QUOTE-FLAG` set, then, on the second pass, takes the continuation branch of the prologue (no context reset) and resolves the command for the actor. The robot's own inventory and location therefore apply to its `TAKE-CHECK`, and a routine that changes `WINNER` mid-action (the cage rescue sets it back to `ADVENTURER`) is respected. The player's context is restored by the next option's prologue, as in the original.

### Out of scope

Debug verbs (`#RANDOM`, `#COMMAND`, `#RECORD`, `#UNRECORD`) are not offered as options, so numeric input (`P-NUMBER`, `INTNUM`) is never needed; `AGAIN` and `OOPS` have no meaning without typing and are not offered. Each is listed in the ledger.

## Input inside routines

`READ` appears in three routines: `PARSER` (replaced above), `FINISH` and `YES?` (called by `V-QUIT` and `V-RESTART`). In the engine, `READ` is an interpreter operation that suspends execution. The interpreter keeps its own call stack, so a suspended routine can resume exactly where it stopped.

- When `READ` suspends, `execute()` returns `status: 'pending'` with a decision id and the choices (`YES`/`NO`, or `RESTART`/`RESTORE`/`QUIT`). While a decision is pending, `options()` returns only the options for that decision, with ids such as `DECIDE:<decisionId>:YES`. Any other option, or an old decision id, is rejected without changing state.
- Answering writes the chosen word into `P-LEXV` (with its capacity byte kept and the next slot 0) and resumes the routine, so `YES?` and `FINISH` run unchanged.
- No clock tick happens while waiting. Saving is refused while a decision is pending.

## Host operations: save, restore, restart, quit

The engine has no storage. The `SAVE`, `RESTORE`, `RESTART` and `QUIT` operations suspend the interpreter and return `status: 'host'` with a request (`save` with the save data, `restore`, `restart`, `quit`). The host performs it and calls `completeHost(result)`:

- A save result resumes the routine with success or failure, as the Z-machine's `SAVE` does.
- A successful restore or restart replaces the whole world and discards the suspended routine; it does not resume it. A failed restore resumes the routine with failure, so `FINISH` prints "Failed." and asks again.
- Quit ends the session.
- Every successful restore, restart or load starts a new **epoch**. Requests carry the epoch and revision they were made against, so a request from before the restore is rejected even if the revision number happens to repeat.

## Saves

A save is a ZXR envelope: format version, the build hash (a hash of the compiled logic, vocabulary, syntax tables, string pool, option-id encoder version and compiler version), epoch, revision, the memory image, the RNG state and the knowledge gates. A save from a different build is rejected with a clear message; there is no migration until a release needs one. Replays carry the same build hash and start either from a fresh game (seed) or from a named save.

## Randomness

- `RANDOM n` with n > 0 returns 1 to n from the engine's seeded generator.
- `RANDOM n` with n < 0 reseeds the generator with -n, so the same n gives the same stream afterwards.
- `RANDOM 0` reseeds from the engine's own seeded generator, never from the clock or other external entropy, so replays stay deterministic. On the Z-machine this would be unpredictable; the ledger records the difference. Zork II only reaches `RANDOM` with n ≤ 0 through the debug verb `#RANDOM`, which is out of scope.
- **Conformance mode.** Results come from the reference interpreter's log, which records every `RANDOM` call with its range, its result, any reseeding, and the routine that made it. Calls made inside the replaced parser middle (for example `GET-OBJECT` choosing one of several matches) are marked as parser draws and are not fed to ZXR; golden scripts name objects explicitly, so such draws are rare and each one is listed. The engine fails clearly on a range mismatch, an out-of-range result, a missing entry or an unused tail of the log.

## Errors and limits

Each `execute()` runs as a transaction on a copy-on-write view of the memory image. A runtime error (division by zero, a bad address, an unknown routine, call depth over 256, or more than 1,000,000 interpreter steps in one action) rolls the whole action back, returns `status: 'error'` with the cause and the ZIL source line, and leaves the last valid state and revision untouched.

## Perception queries

`options()` and `observe()` must not change any state. They do not call ZIL helpers such as `LIT?` or `ACCESSIBLE?`, because those write parser globals (`LIT?` writes `P-GWIMBIT`, `HERE`, `P-TABLE`, `P-SLOCBITS` and the `P-MERGE` table). Instead, TypeScript queries reproduce their answers and are tested against them. Three separate questions are kept apart: what the actor can see, what it can reach, and what the player knows.

## Conformance projection

Reference and engine states are compared at four checkpoints: when the parser (or the adapter) returns, when an action completes (after `CLOCKER`), when a `READ` suspends inside a routine, and at the end of the game. They are compared through a semantic projection, not raw memory:

- Included: the object tree, every attribute, every property (strings compared by text, objects and routines by name), every global except a reviewed list of parser and interpreter scratch globals (such as `P-LEN`, `P-CONT`, `P-TABLE`, `P-MERGED`), the clock table entries (routine name, ticks, enabled), `MOVES`, the score and the random-log position.
- Excluded: raw addresses, the input buffers and parser tables, and anything else on the reviewed list. Every exclusion is listed with its reason.
- Parser adapter output is checked separately at the parser-return checkpoint: the match tables, `P-SYNTAX` and the parser globals must match what the original `PARSER` produced for the same typed command.
- Mutation tests prove the projection is not too loose: deliberately corrupting a flag, a clock entry, a property string or an object's location must make conformance fail.

## Obligations for step 2.0

- Derive the exact `P-LEXV`, `P-CONT` and `QUOTE-FLAG` layout for `say` options and actor commands from `PARSER`, and confirm it in the reference interpreter.
- Write the full list of `P-ITBL` fields and parser globals that `MAIN-LOOP-1`, `MANY-CHECK`, `TAKE-CHECK` and game code read, and what the adapter sets each one to.
- Produce the primitive inventory: every operation used by reachable expanded code, with its semantics here.
- List every header access in reachable code.
- Produce the reviewed list of excluded scratch globals for the conformance projection.
- Check whether object numbers are observable in Zork II beyond sibling order; if not, record that numbering could be simplified.
