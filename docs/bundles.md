# Compiling and loading bundles

Phase 2 is complete. The compiler uses the pinned Zork II source plus the audited reference numbering layout; self-assigned numbering for other games remains deferred. It does not rebuild Z-machine bytecode.

```sh
node bin/zxr.ts compile reference/zork2 --out out/zork2.zxb
node bin/zxr.ts check out/zork2.zxb
```

The compiler also writes `out/zork2/` with schema-valid world, logic, vocabulary, strings, memory, symbols and source-map JSON plus the translation report and `LICENSE-MIT.txt`. The bundle itself embeds the same game license text. The bundle is written last through a temporary file and rename, after validation. `--symbols` opts a source copy into Zork II's reference layout. Unknown/repeated flags, unsupported source constructs and invalid output extensions fail. `node bin/zxr.ts play [game.zxb] [--save file.json] [--seed uint32]` now runs the option-only terminal player; without a path it compiles the pinned source in memory. The browser player uses the same session/controller and is available through `npm run dev` or a production build. See [phase 4 shells](phase-4.md#browser-and-terminal-text-shells-48).

## Format and identity

A `.zxb` is canonical UTF-8 JSON, not a ZIP or a Z-machine executable. Arrays retain their order, object keys sort recursively, and numbers must be safe integers. Undefined values, sparse arrays, cycles and custom objects are rejected during packing. The headless loader rejects invalid UTF-8/JSON and inputs over 64 MiB.

The envelope contains `format: zxr-bundle-v1`, schema version 1, the compatibility ABI, three hashes, the payload, debugging data and embedded distribution-license texts:

| Field | Meaning |
|---|---|
| `buildHash` | SHA-256 of semantic payload: world initialization, memory/layouts, symbolic references, executable IR, vocabulary, strings, gate rules, initialization and compiler/VM/adapter/option-encoder versions. Diagnostic locations/IDs, source spelling and the presentation title are excluded. |
| `presentationHash` | SHA-256 of the presentation title. Presentation assets/labels will extend this separately from game semantics in later phases. |
| `contentHash` | SHA-256 of the entire canonical envelope except this field, including the build/presentation hashes and debug content. |

These are integrity and compatibility checks, not authentication signatures. Changing key order cannot change the packed bytes or hashes. Changing diagnostics or the title can change content/presentation identity while preserving rule identity. Changing rules, memory or version contracts changes the build hash.

The payload contains all 86 rooms, 165 objects, 689 dictionary entries, the 19,882-byte memory image, 1,342 strings and 414 executable routines. Routine IDs remain in the original 439-slot namespace. The other 25 entries are explicitly classified as the PARSER adapter and 24 replaced parser-middle routines. Debug data retains their source points and the complete translation report; no replaced scanner body becomes an ordinary callable routine. Adapter ABI `zxr-adapter-v15` additionally carries the source-derived `entry` and `checks` programs for PARSER and bounded `noVerb` / `notHere` projections of SYNTAX-CHECK / GET-OBJECT; these require an explicit interpreter program role. Version 15 retains source-backed explicit noun/adjective handling, dual-role noun promotion, quoted actor speech and bounded zero-object command continuations, source-driven single-word parser failures and authored multi-word action continuations with one-sided lists/ALL and source-defined closing-quote state, and source missing-match handling with spelling fields, placeholder objects and darkness refusal, exhausted ALL results, surviving quoted directions and the integrated fresh-READ boundary policy. Interpreter checkpoints explicitly record whether they use the diagnostic pre-PARSER boundary or the integrated READ boundary. Older bundles must be recompiled.

Initialization explicitly means **pre-GO**, followed by a call to GO with no arguments. The owned RNG contract is `xorshift32-v1`, initially seeded with 2. No startup mutations, output or clock work are pre-applied. VM/adapter/option-encoder version strings identify compatibility contracts; their presence does not imply those later engine components are implemented. The six initial saved-knowledge policies use `zxr-gates-v2` and participate in semantic identity; see [knowledge gates](phase-4.md#saved-knowledge-gates-45).

## Validation

The schemas in `schema/` are generated from `src/zil/schemas.ts`. Each is a self-contained JSON Schema 2020-12 document. Commands and expressions have separate recursive `op` definitions; unknown fields and operations fail. The headless validator implements only the vocabulary used by these published schemas and has depth/work limits. It needs no host APIs or code generation. Development checks independently compile/validate the same schemas with AJV 2020.

Cross-file validation checks the runtime/excluded routine partition, call arities, local scopes/defaults, active control targets, literal/string/symbol/address references and permitted indirect-call domains. It also checks initial object identities/tree/flags, defaults, exact property and exit payloads/views, dictionary roles/encoding, syntax rows/dispatch/prepositions, relocation domains, table layouts, protected header fields and original source-map/report references. Runtime symbol maps contain allocated dictionary addresses and omit oracle addresses.

`tests/fixtures/three-room/logic.json` is a hand-written logic example used as an actual compiler input. Its three-room world and the full Zork II output both validate, pack and load. `reference/bundle-audit.json` records build/presentation/content/packed hashes and sizes. Its checks use independent Node SHA-256 and AJV as well as the headless loader. Generated `.zxb` files/components stay under ignored `out/`; the full bundle is reproduced rather than checked into Git.

```sh
npm run schemas:check
npm run bundle:check
npm test
npm run build
```

`schemas:record` and `bundle:record` intentionally regenerate reviewed evidence. All earlier stage audits remain regression checks. Hosted CI runs the checks; a local pass does not certify a hosted CI run or runtime conformance.


Adapter v15 additionally accepts source-backed adjective-only operand bindings and preserves their original parser pronoun/promotion semantics. This execution-contract change invalidates prior build/save identities; it does not change the bundle or save-envelope schema shape. See [structured replay acceptance](phase-3.md#completed-reference-replay-acceptance-39).

Phase 4.9 adds bundle policy version `knowledge: zxr-object-memory-v1` and save envelope `zxr-save-v2`. The save stores canonical object identities and last-seen names separately from clue gate IDs. Remembered targets stay selectable for original missing-object refusals without revealing their remote locations or current names. Recompile older bundles; old saves are rejected without migration. Translated game rules and action-ID encoding remain unchanged.
