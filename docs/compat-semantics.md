# ZXR compatibility semantics (draft)

2026-10-21 · Mark Davey

This document defines what translated ZIL code sees when it runs on the ZXR engine. The front end and the engine both follow it, and the build plan's step 2.0 turns this draft into the full specification before any routine is translated. It exists because the 2026-10-21 design review showed that "typed tables with stable ids" does not say enough: Zork II compares pointers, reads bytes out of words, tells exits apart by property length and reads the story file header.

**The rule:** where the Z-machine version 3 behaviour is observable by Zork II's code, ZXR reproduces it. Where it is not observable, ZXR is free to do something simpler. Everything here can be implemented in TypeScript without running Z-machine bytecode.

## Values

- Every value is a 16-bit word. Arithmetic (`+`, `-`, `*`, `/`, `MOD`) is signed 16-bit with wrap-around; division truncates toward zero. `BAND`, `BOR`, `BCOM` work on the unsigned bit pattern.
- False is 0. Everything else is true. `<>` and `<RFALSE>` produce 0; `T` and `<RTRUE>` produce 1.
- `M-FATAL` is 2, as defined in `gmain.zil`. Code that tests for it compares the number.
- Objects, rooms, routines, globals, words and properties are all numbers at run time (see Numbering). JSON names are only the source form.

## Evaluation order

- Arguments are evaluated left to right, once each.
- `AND` and `OR` short-circuit and return the deciding value, not just 0 or 1.
- `COND` clauses run in order; a clause with no body returns its test's value.
- A routine that falls off its end returns the value of its last expression.

## The memory image

All tables, all property tables and a fake story header live in one big-endian byte array.

- **Addresses:** a table value is the byte address of its first element. `GET t n` reads the word at `t + 2n`, `GETB t n` reads the byte at `t + n`; `PUT` and `PUTB` write the same places. Bytes and words therefore alias, as in the original.
- **`REST t n`** returns `t + n`. Two pointers compare equal with `==?` exactly when they are the same address, which is what `INT` in `gclock.zil` relies on.
- **Table forms:** `TABLE` lays out words, `LTABLE` adds a leading length word, `ITABLE` makes an initialized block, and `(BYTE)` / `(PURE)` flags follow ZIL's rules.
- **The header:** addresses 0 to 63 hold a version 3 header with the release number (63) and serial (`860811`) of the reference story file, because `V-VERSION` prints them with `GET 0 1` and `GETB 0 n`. Other header fields are zero unless a routine is found that reads them.
- **Routines stored in tables:** a routine reference is stored as its routine number, and `APPLY` of a word calls the routine with that number. 0 is the false routine.

## Objects and properties

- **Attributes:** 32 per object, numbered as `gglobals.zil` and the source's `FLAGS` declare them (in ZIL's assignment order).
- **Tree:** parent, first child and next sibling, with `MOVE` putting the object first among its new siblings.
- **Property tables** sit in the memory image with version 3 layout: a size byte (length and number) followed by the data. `GETPT` returns the address of the data, `PTSIZE` returns its length, `GETP` reads a 1- or 2-byte property as a value, and a missing property returns the default from the `PROPDEF` defaults table.
- **Exits are properties.** Each direction is a property whose length tells `V-WALK` the exit kind: `UEXIT` (plain), `NEXIT` (blocked with a message), `FEXIT` (routine), `CEXIT` (conditional on a global, whose number is stored in the property and read with `VALUE`) and `DEXIT` (conditional on a door). The front end encodes them with the original lengths and offsets defined as constants in `gverbs.zil` (`REXIT`, `UEXIT`, `NEXIT`, `FEXIT`, `CEXIT`, `DEXIT` and their field offsets).
- **Readable views** such as `"exits": { "down": { "to": "CELLAR", "if": ... } }` are generated from the memory image for tools, the scene planner and the option builder. Translated code never reads them, so they can never disagree with what the game sees.

## Numbering

- Objects and rooms are numbered in the order the original compiler assigned them, so that anything that prints, compares or orders by object number behaves the same. The phase 0.8 audit recovers that order from the `.zap` files and checks it against `zork2.z3`.
- Globals, routines, verbs (`V?` constants), actions (`ACT?`), prepositions (`PR?`) and properties (`P?`) use the values in the `.zap` files where code can observe them.
- Vocabulary words are numbered by their dictionary address in the reference story file, because `P-LEXV` stores those and game code compares them with `W?` constants.

## From an option to the parser globals

`PARSER` is the only routine replaced for normal turns. When an option is executed, the engine:

1. Resets temporary parser state: `P-CONT`, `P-WALK-DIR`, `QUOTE-FLAG`, `P-MULT`, `P-NOT-HERE`, and the `P-LEXV` and `P-INBUF` buffers.
2. Sets `WINNER` to the option's actor, then `PRSA`, `PRSO` and `PRSI`.
3. For a `walk` option, sets `PRSA` to `V?WALK`, and `PRSO` and `P-WALK-DIR` to the direction's property number, exactly as `PARSER` does.
4. For a `say` option, writes the words into `P-LEXV` and sets `P-CONT` the way `PARSER` leaves them after a quoted phrase such as `ANSWER "WELL"`: `RIDDLE-ROOM-FCN` checks the word at `P-CONT` and the one after it, and `V-INCANT` stores the word at `P-CONT` in `SPELL-USED`. The exact layout is confirmed against the reference interpreter in phase 3.
5. Sets `P-IT-OBJECT` the way `PERFORM` does, and makes `PARSER` return true. `MAIN-LOOP-1` continues unchanged.

Game code also sets `P-CONT` to false to cancel the rest of a chained command. Options never chain, so this has no effect beyond step 1's reset.

## Input inside routines

Only three routines read input: `PARSER` (replaced, above), `FINISH` and `YES?` (called by `V-QUIT` and `V-RESTART`). These are hand-translated into resumable form. When one reaches its `READ`, the engine stops and returns a pending decision; the answer resumes the routine where it stopped. No clock tick happens while waiting, and saving is refused. Each of these translations is recorded in the rules ledger.

## Perception queries

`options()` and `observe()` must not change any state. They do not call ZIL helpers such as `LIT?` or `ACCESSIBLE?`, because those write parser globals (`LIT?` writes `P-GWIMBIT`, `HERE`, `P-TABLE`, `P-SLOCBITS` and the `P-MERGE` table). Instead, TypeScript queries reproduce their answers and are tested against them. Three separate questions are kept apart: what the actor can see, what it can reach, and what the player knows.

## Randomness

`RANDOM n` with n > 0 returns 1 to n from the engine's seeded RNG; `RANDOM` with n ≤ 0 reseeds as on the Z-machine. In conformance mode, results come from the reference interpreter's recorded log instead, and the engine checks that each call's n matches the log.

## Open questions for step 2.0

- Exact `P-LEXV` layout after `ANSWER "WELL"` and after `INCANT` with a spell word.
- Whether any routine reads header fields other than release and serial.
- Whether object numbers are observable anywhere in Zork II beyond sibling order (if not, numbering can be simplified and the ledger says so).
