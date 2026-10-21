# ZIL fixtures

`macros.json` contains reviewed input/expected expansions for the fifteen DEFMACs and MULTIFROB/MULTIBITS. `d-apply.zil` freezes the remaining DEFINE helper's complete expansion. `expanded/` contains twenty full expanded routines, checked against the reviewed anchors in `reference/expansion-checks.json` and the compiler's `.zap` output.

The macro programs, canonical definitions in `src/zil/macro-definitions.ts`, and expanded ZIL samples derive from `historicalsource/zork2`, pinned at `3da9661098809788a99cef00f00c865c6c204f96`. They retain Copyright (c) 2025 Microsoft and the [MIT notice](../../../reference/zork2/LICENSE), with [source provenance](../../../reference/zork2/PROVENANCE.md). Preserve that notice with these fixtures. The independently written TypeScript tooling/tests retain the repository's Apache 2.0 license.

These files do not use the GPL walkthrough command sequences. `npm run zil:record` updates only the twenty routine samples and active manifest; the smaller macro goldens and accepted-definition signatures require deliberate review/editing.
