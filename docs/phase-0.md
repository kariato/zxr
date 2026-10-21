# Phase 0 implementation

The foundations and reference gate are implemented locally. This adds no ZXR game logic: `src/engine` and `src/zil` are explicit placeholders. Hosted CI and Pages verification remain pending until these changes are pushed and GitHub runs the workflows.

## Toolchain

Use Node **24** and `npm ci`. `.nvmrc` selects that major; CI also uses Node 24. Exact npm versions and integrity hashes are committed in `package-lock.json`.

| Package | Pin | Basis |
|---|---|---|
| TypeScript | 7.0.2 | rougeXR |
| Vite | 8.3.5 | Security-patch exception to rougeXR's 8.3.0 |
| Vitest | 5.0.0 | rougeXR |
| Playwright | 1.56.1 | rougeXR |
| three.js / types | 0.186.0 | rougeXR |
| ifvms | 1.1.6 | Instrumentable JavaScript V3 reference interpreter, MIT |
| @babel/parser | 7.28.5 | AST-based headless boundary check; TypeScript 7 does not expose the old JS compiler API |
| @types/node | 24.10.0 | Tooling types |

The rougeXR comparison commit is `820cb92500226f5e8817c9a4a452651d94a7609c`. Pages follows its checkout/setup-node/configure-pages/upload/deploy workflow. Vite 8.3.0 was affected by npm's launch-editor advisories, including GHSA-587h-7wmj-h5pm; 8.3.5 fixes them. `npm install` reported zero known vulnerabilities after the update. `.npmrc` enables legacy peer resolution because this environment's npm 10 optional-peer resolver crashed on the pinned Vitest toolchain; no Vitest browser peers are used. Playwright is invoked directly.

## Deliverables

- Runnable Vite shell, responsive styling, keyboard focus, and truthful status text.
- Planned folder skeleton, with the headless directories compiled separately without DOM/Node types. An AST boundary check rejects external/browser/presentation imports, dynamic imports, browser APIs, ambient clocks, and Math.random. Tests deliberately introduce violations. This is an architectural check, not a general-purpose JavaScript security sandbox.
- Unchanged pinned historicalsource/zork2 reference. Root Apache and Zork II MIT notices and provenance are copied into `dist/licenses` on every build.
- Headless original-story runner with exact routine names, random tape, nested READ instrumentation, parser output, lossless state checkpoints, deterministic seeds, and Quetzal save/restore support.
- **75 reproducible fixtures**: full 400-point victory, 12 area scripts, every one of the 50 compiled death sites, all 23 active interrupts, and focused adapter/prompt cases. Each baseline is generated twice and checked byte-for-byte as structured data. Setup uses real walkthrough commands, without patching world state. Some rare cases use the original story's logged `#random` command.
- Reconstructable RAM snapshots, semantic inspection helpers, readable transcripts, machine-readable coverage, and a source/binary audit with twenty source/assembly reviews. [Audit limits and the PREDGEN/release-ID discrepancy](reference-audit.md) are explicit.
- `npx --package=. zxr --help`, and compile/play/check stubs that exit unsuccessfully with “not implemented.”
- CI that installs, type-checks, tests, verifies every reference fixture and audit, builds, and smoke-tests Chromium/Firefox. A Pages workflow builds with `/zxr/` as its base and deploys the resulting shell.

The fixture walkthrough and derived command data have their own GPL-3.0 provenance. They remain development data and are not shipped in the Apache-licensed browser shell. See [reference licensing and trace format](../reference/README.md).

## Validation and hosted follow-up

Local checks cover clean `npm ci`, strict type checking, deliberate boundary violations, 23 Vitest checks, both Playwright browsers, all 75 reference fixtures (two fresh runs each), every snapshot hash, the pinned audit, CLI execution through npm/npx, production build and copied notices. Chromium and Firefox also load the production Pages build at `/zxr/`, checking stylesheet loading, keyboard focus and absence of script errors. The Pages workflow runs that preview check before uploading. To reproduce it locally, run `GITHUB_PAGES=true npm run build`, then `GITHUB_PAGES=true npm run test:browser`. Node 24 is used for final verification; the initial system Node 23 run was also successful but is outside Vitest 5's supported range.

The full walkthrough's measured result is **400 points, 419 moves, WON-FLAG true, zero deaths**, with 143 RANDOM calls. Coverage enumerates all 50 death instruction addresses and 23 interrupt names, rather than relying on fixture names. It does not claim exhaustive coverage of all game branches or event interleavings.

The repository's hosted CI result and deployed Pages URL have not been verified from this local implementation. Step 0.7 stays unchecked for that reason. After a push, confirm the Check workflow is green and GitHub Pages is configured to use GitHub Actions; then confirm the deployed shell loads its assets. No remote deployment is claimed by a successful local build.
