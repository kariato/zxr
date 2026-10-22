# Runtime JSON Schemas

These self-contained JSON Schema 2020-12 files are generated from `src/zil/schemas.ts`. Run `npm run schemas:check` to compare them and independently compile them with AJV 2020; `schemas:record` intentionally updates them. `logic` is the runtime projection; `raw-logic` supports fully lowered hand-authored operations/linked IR. Commands and expressions have separate recursive definitions. Reference audit/partial-stage reports are not runtime artifacts.

The pure headless validator implements only the JSON Schema vocabulary emitted here. Bundle loading additionally checks integrity, ABI contracts and cross-file semantic references; passing an individual component schema is insufficient to accept an executable bundle. See `docs/bundles.md`.
