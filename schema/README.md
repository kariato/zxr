# JSON Schemas

These self-contained JSON Schema 2020-12 files are generated from `src/zil/schemas.ts`. Run `npm run schemas:check` to compare them and independently compile them with AJV 2020; `schemas:record` intentionally updates them. `logic` is the runtime projection; `raw-logic` supports fully lowered hand-authored operations/linked IR. Commands and expressions have separate recursive definitions. Reference audit/partial-stage reports are not runtime artifacts.

The pure headless validator implements only the JSON Schema vocabulary emitted here. Bundle loading additionally checks integrity, ABI contracts and cross-file semantic references; passing an individual component schema is insufficient to accept an executable bundle. See `docs/bundles.md`.

`save` and `replay` are generated from the engine envelope contracts. `scene-plan`, `asset-brief` and `label-set` are presentation-only authoring contracts generated from `tools/planning/schemas.ts`; they are checked with AJV, not the limited headless validator. `npm run planning:check` checks the three pilot rooms and sample briefs/labels. Their local consistency checks supplement JSON Schema; source/GLB and all-room checks remain later steps. See [phase 6](../docs/phase-6.md).

`scene-bindings` is generated from `tools/planning/bindings-schema.ts` and describes draft assembly, explicit exit aliases and room-group links. `npm run scenes:check` adds source, shared-asset, attachment and doorway-geometry checks for current review candidates. It reports incomplete room coverage and unresolved state bindings; `-- --complete` fails if either remains. This contract cannot grant human approval or alter engine rules.
