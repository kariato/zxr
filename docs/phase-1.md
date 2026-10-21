# Phase 1: ZIL reader and macro expansion

The complete vendored Zork II program reads and expands with zero errors. The reader round-trips all eleven source files, preserving object comments and source spans. The loader follows ten inserted files and selects the audited PREDGEN/ZORK-NUMBER=2 build. The expanded program contains **439 routines, 86 rooms, 165 objects, 164 source globals, 269 syntax entries and 75 synonym declarations**. Four additional globals are compiler-generated tables, matching the assembly's 168 slots.

## Run and inspect

Use Node 24 after `npm ci`:

```sh
npx --package=. zxr check reference/zork2
npx --package=. zxr check path/to/entry.zil
npm run zil:check
npm run typecheck
npm test
npm run build
```

`zxr check` reports reader, loader and macro errors with filename, line, column and a caret. For example an unmatched `]` on line 2 at column 5 produces `file.zil:2:5: ZIL002: Unexpected closing delimiter ]`. It performs no writes. Directory checks read every `.zil` file, including unused `crufty.zil`, before loading the entry program. The CLI distinguishes this phase's checks from the symbol/type/primitive checks deferred to phase 2; `compile` and `play` remain explicit stubs.

`npm run zil:check` independently checks the active program against `.zap` names and data, verifies twenty source/assembly expansion reviews, and compares the manifest and expanded sample files with their saved baselines. `npm run zil:record` intentionally updates those baselines after review. It does not update macro ports or their accepted definition signatures.

## Reader contract

`src/zil` imports only headless code. The lexer recognizes forms, lists, vectors, strings and atom escapes, signed decimal/octal integers, characters, typed objects, and global/local/quote/read-time/segment prefixes. `;` retains a whole commented object, including nested structure; it does not consume a line. Comments between a prefix and its operand are preserved. CRLF counts as one line break; offsets and columns count UTF-16 code units, with one-based lines/columns and an exclusive end. Tabs occupy one source column; diagnostic rendering expands them for the caret.

The tree distinguishes character values, octal/decimal spelling, prefix operators, typed-object tags, comments and ordinary sequences. The canonical printer preserves the semantic tree on re-read; it does not preserve original whitespace or source positions. Original AST nodes keep their exact spans. Integer literals are exact safe integers here; 16-bit target arithmetic and string encoding are later compiler work. Nesting and macro/evaluation limits produce diagnostics rather than unbounded execution.

This is the Zork II MDL/ZIL subset, not a general MDL reader/interpreter. In particular `%%`, custom READ tables, arbitrary MDL evaluation and floating-point numbers are outside its contract. Unsupported read-time operations fail explicitly. Reader/comment semantics follow the [MDL manual's comments section](https://mdl-language.readthedocs.io/en/latest/05-simple-functions/#55-examples-comments-1) and [READ macro section](https://mdl-language.readthedocs.io/en/latest/17-macro-operations/). Percent macros run while reading, including within quoted/commented objects; ordinary commented game code is discarded before loading.

## Loader and active manifest

`loadProgram` accepts an injected source map rather than opening files. Its finite evaluator handles this source's COND, equality, GASSIGNED?/ASSIGNED?, NOT/AND/OR, SET/SETG and compiler directives. It tracks PROPDEF defaults, REDEFINE, include order, selected branches, overridden declarations and macro definitions. PREDGEN and ZILCH start assigned; `zork2.zil` sets ZORK-NUMBER=2. Assigned false remains assigned for GASSIGNED?. Numeric zero is true in MDL conditionals. Include cycles, missing files, unsafe include names, unsupported build operations and unpermitted redefinitions are errors.

`reference/active-program.json` contains source/tree hashes and node counts for all eleven files, declaration names and locations, each selected branch, every excluded declaration with its reason, all 269 syntax rows, all synonym forms, expansion counts and a hash of the expanded tree. The compiler tables PREPOSITIONS, ACTIONS, PREACTIONS and VERBS are explicitly accounted for, rather than invented as source declarations.

The earlier counts of 441 routines, 267 syntax lines and 74 synonyms were line-based scans. The reader sees 456 routine forms when commented and inactive code is included. The manifest explains all seventeen exclusions, including the uninserted duplicate I-LANTERN, alternate PERFORM/DD-APPLY, and object-commented routines. It also records DUMMY's permitted redefinition: the later game-specific global replaces the shared library's initializer. The active routine/object/global names match the assembly exactly.

Every syntax entry is compared with the corresponding eight-byte assembly record: object count, two prepositions, two FIND flags, both slot-rule bitsets, and action. ATBL and PATBL confirm action/preaction dispatch. All synonym roles are checked against dictionary bytes, allowing aliases to have additional roles (for example HAND is also a noun). A test changes a slot rule and proves this audit fails; matching counts alone cannot pass it.

## Macro ports and evidence

The fifteen DEFMACs and the three DEFINE helpers have TypeScript ports. The active PREDGEN program uses seventeen definitions; D-APPLY belongs to the unselected debug variant and has its own golden test. The ports preserve details of the actual MDL programs:

- MULTIFROB reverses each group of up to three operands and ORs the groups. Semantic metadata separately retains the original VERB?/PRSO?/PRSI?/ROOM? arguments for later option ranking.
- MULTIBITS reverses flag operations and chooses a single operation, OR, or PROG wrapper, including empty flag lists.
- TELL handles strings, property/object/number/character markers, and dynamic string expressions. RFATAL keeps the PUSH 2/RSTACK expansion. ENABLE/DISABLE use the compile-time enabled-slot index. PROB distinguishes an absent optional argument from a supplied false one and keeps strict comparison semantics.
- D-APPLY uses fresh locals so arguments evaluate once and cannot be captured by its generated bindings; its debug output branches are retained.

Changed or unknown macro definitions are rejected. Canonical signatures of the pinned MIT definitions prevent a different macro program from being silently interpreted using a familiar name. A general MDL macro evaluator remains deferred until another game requires it; the ledger records this decision.

Expansion nodes retain their call-site span and macro origin, with the definition span when loaded from source. Operands retain their own source locations. The active game expands **1,464 macro calls**, including 1,047 TELL calls, with no macro calls left in executable forms. Tests cover all eighteen ports, argument errors, source maps, semantic metadata and definition changes.

Twenty complete expanded routine samples are saved under `tests/fixtures/zil/expanded`. `reference/expansion-checks.json` records their reviewed expanded/assembly anchors and rationale, including grouped comparisons, queue writes, PRINTI/CRLF folding to PRINTR, strict random tests and RFATAL folding to RETURN 2. Sample hashes and assembly locations are in the active manifest. These are source-level semantic checks, not a new Z-machine assembler or proof of complete opcode equivalence. Phase 2 still owns code generation, symbol resolution, table layout and string normalization; phase 3 owns runtime execution against the reference tape.

## Validation and provenance

Local validation includes 96 passing tests, every source round trip, the active manifest, twenty expansion samples, strict headless type checks, the functioning CLI and production build. The phase 0 reference corpus and source/binary audit remain separate regression gates. CI runs the new manifest and CLI checks. Hosted CI/Pages still require a pushed revision; no deployment is claimed.

The vendored source is unchanged. Canonical macro definitions and expanded source samples derive from the pinned MIT Zork II source and retain its notice; see [fixture provenance](../tests/fixtures/zil/README.md). ZXR tooling retains the root Apache license. The separate GPL walkthrough fixtures are unchanged by this phase.
