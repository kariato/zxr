# Source maps and translation report

Step 2.9 supplies source identities for the future interpreter and presentation overlays. It does not execute game logic or implement the phase 9 cue overlay.

`mapLogicSources()` takes fully linked logic, injected source files, the optional parser partition and the normalized expanded forms. It returns the mapped runtime program, all mapped reference routines, a source map and the translation report. The reference view includes the original parser bodies for diagnostics; the runtime view contains the same 414 routines selected in step 2.8. Removing only `sourceMapId` and `nodeId` reproduces the original 439-routine IR exactly. Earlier compiler APIs/artifacts remain regression stages.

Every routine, binding, command and expression has two references:

| Reference | Purpose | Stability |
|---|---|---|
| `sourceMapId` | Persistent semantic target for overlays | Based on routine name, semantic source form, role within the form or macro expansion, and symbolic IR meaning. |
| `nodeId` | Exact instruction instance for diagnostics and execution cursors | Deterministic within a build. Insertions can change it; do not persist it in overlays. |

Source IDs exclude lines, columns, instruction numbers, relocated dictionary/table addresses, routine/string IDs and local/block slot numbers. Actual string text, named references, lexical binding identity, control targets and expression semantics participate instead. Whitespace, comments, equivalent numeric spelling, line endings, renumbering and unrelated siblings can change while a point's semantic identity remains unchanged. An edited form, changed binding/control target, changed lowering role or changed meaning can invalidate a target. Routine-entry IDs deliberately identify the named entry across body edits; they are not body hashes.

The `semantic-form-v1` identity uses deterministic 64-bit non-security fingerprints. Generation checks complete keys for collisions and fails rather than merging different keys. Audit SHA-256 hashes cover the complete artifacts. These IDs are joins, not authenticity or security checks.

## Resolving an overlay target

This is a real point in SCORE-UPD:

```json
{
  "routine": "SCORE-UPD",
  "sourceMapId": "sm1:SCORE-UPD:expression:9d08fc2ff7a4a0d5"
}
```

`resolveSourcePoint(map, target)` resolves it to the original `<SETG BASE-SCORE <+ ,BASE-SCORE .NUM>>` form, its exact source span and the mapped instruction path. Resolution requires one runtime point in the named routine. A missing ID, wrong routine or excluded parser target errors. There is no line-number, nearest-point or occurrence-number fallback.

Repeated identical semantic forms can share an ID. An overlay can supply `within`, the source-map ID of one unique runtime ancestor in the same routine. Resolution then requires exactly one candidate under that ancestor. A missing/ambiguous ancestor or zero/multiple candidates errors. If the enclosing context cannot distinguish the point, the overlay cannot target it safely. Inserting another identical form can therefore turn a previously valid overlay into an explicit ambiguity error.

`lookupSourceNode(map, {routine, nodeId})` provides exact build-local diagnostics even for a repeated semantic point or excluded reference routine. This is separate from persistent overlay resolution.

## Artifact layout

`games/zork2/source-map.zxr.json` contains:

- `files`: the original source text, stored once per file.
- `locations`: interned original spans. `start` and `end` are `[UTF-16 offset, line, column]`; lines/columns are one-based and ends are exclusive. LF, CR and CRLF follow the reader's position rules.
- `anchors`: semantic source-form identities linked to original locations.
- `entries`: stable IDs, routine identity, site kind, lowering role, semantic fingerprint and every exact node instance/path.
- Macro origins on instances: call and definition locations, preserving the compiler's origin chain and operands' original spans.
- Runtime/adapter/replaced policies, guarded normalization provenance and generated-default reasons. The omitted REST count maps to its real `<REST .SYN>` form and explicitly names SRC-010; no nonexistent source argument is invented. Implicit zero initializers are also marked.

SRC-006 and SRC-011 are recorded as source normalizations. The original file text is unchanged. SRC-006's lowered block maps back to its trailing source list; SRC-011 affects initial data rather than an executable instruction.

The map covers **26,507 sites**: 439 routines, 487 bindings, 6,487 commands and 19,094 expressions. There are **24,403 semantic IDs**, including **1,424 ambiguous IDs**, 16,164 locations, 6,250 anchors and 8,102 macro-origin points. The full mapped IR is available through the headless API; the audit records its runtime-program hash instead of checking in a second complete logic tree. The map uses compact JSON rows to avoid deeply indented repeated metadata.

`reference/translation-report.json` has zero untranslated constructs. It separately records all 27 intentional parser replacements (PARSER adapter plus 26 middle routines), 32 classified external parser-variable accesses, three READ sites and three explicitly unsupported debug-stream sites. Every item links to actual mapped node instances. These are deliberate adaptation or runtime-error policies, not omitted source accidentally reported as implemented.

`reference/source-map-audit.json` verifies site-kind coverage, original source files, all macro definition spans and report coverage. `validateMappedSources()` checks exact IR preservation, source-point/origin coverage, parser policies, runtime projection and complete reports. This is compiler evidence; complete bundle schema/reference checks are implemented in step 2.10; runtime stepping/conformance remain phase 3.

## Reproduce

```sh
npm run source-maps:check
npm test
npm run build
```

`source-maps:record` intentionally regenerates the map, report and audit. CI runs the check. Reference-assisted `zxr check` now builds the maps and reports complete coverage and zero untranslated constructs; `zxr compile` now packs and validates the complete bundle.

Phase 5.5 adds four expression sites through guarded SRC-014 (the CLIMB synonym bound). The current totals above include that correction; vendored source locations and macro-origin counts are unchanged.
