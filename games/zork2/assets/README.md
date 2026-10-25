# Zork II asset production

`catalog.json` accounts for all 86 source room identities and all 165 source object identities. Rebuild from current source contexts and planning records with:

```sh
node tools/assets/catalog.ts
```

The catalogue is an offline production inventory, not the runtime's visibility list, an approval manifest or a claim that every entry needs its own mesh. Draft plans retain their draft status. Budgets are provisional targets, not measured device guarantees. Source-specific scales must be checked: several existing draft briefs contain generic size estimates.

Current breakdown:

- 108 prop identities: reference → mesh → optimization → state/interaction review.
- 10 character identities: reference → mesh → body rig → deformation/clip review. Only six are humanoids; the dragon, Cerberus, unicorn and serpent need creature-specific rig checks. The princess recipe must not be applied blindly to them.
- 6 damaged/dead variants: derive from the corresponding base asset and retain independent source identities.
- 8 surfaces and 2 effects: authored surfaces/effects with engine-controlled state, not opaque baked image-to-3D blobs.
- 31 identity/proxy objects: no fabricated physical body. For example, Zork II's sailor is not a visible sailor character.
- 86 logical rooms: skybox/environment plus separate floor, guardrails, exit and interactive/stateful nodes. Nine diamond-maze rooms and four airborne volcano bands can reuse environment families while preserving their logical identities. Four palantir death/interstitial locations do not justify invented walkable rooms.

## Production stages

1. Use source descriptions, current briefs, style and exact source identity to create an isolated reference image. Keep prompt, image hash and generator mode beside the file.
2. Review silhouette, required quantities, colours and thin parts. Reference creation is not model completion or asset approval.
3. Generate geometry locally, decimate, set scale/pivots and finish material/texture coverage. Separate hinges, lids, transparent glass, attachment sockets and state variants. A closed fused chest or opaque lantern chamber is not a functional final asset.
4. Rig characters and author body clips. Test skeleton anatomy, four-weight skinning, garment deformation, loops, bounds and material/texture budgets. Retain static faces unless a later requirement changes this.
5. Review in the actual scene and bind only to engine-observed state. Appearance, attempted actions and animation must not change gameplay or reveal concealed contents.
6. Check source/model/output licences before promoting an asset into the shipped game. Keep large environments, checkpoints and restricted candidates under ignored `out/`.

## Started batch

The princess already has a local 9,960-triangle, 23-bone animated candidate and a lair audition. New built-in image-generation references and exact prompts have been saved for:

- `production/asset_sword/reference-v1.png`
- `production/asset_lamp/reference-v1.png` — unlit reference; engine state supplies light.
- `production/asset_chest/reference-v1.png` — closed exterior; hinged lid/interior still require modeling.
- `production/asset_robot/reference-v1.png` — neutral A-pose for a body rig.

Each directory contains `reference-v1.prompt.txt` and `reference-v1.json` with exact prompt/image hashes. Its generated `prompt.txt` is the full source/style production brief, distinct from the shorter prompt actually used for this first reference. Other production directories currently contain **briefs only**; their reference images and models do not yet exist.

**Pipeline decision, 2026-10-24:** the user explicitly chose Hunyuan for a US-only prototype. Continue with that route; do not reopen this choice for each batch. `pipeline.json` records the decision. Its custom licence restrictions remain relevant to any later distribution change; this does not authorize worldwide publication. See [model research](../../../docs/image-to-3d-review.md) and the [princess experiment](characters/princess/README.md).

The full asset set is **not complete**. Consult the regenerated `catalog.json` and per-asset records under `out/asset-production/` for current progress. No unreviewed asset has been published.

## Local tools

```sh
# Generate/optimize explicit references, or all currently available references.
out/asset-tools/shape-env/bin/python tools/assets/generate.py SWORD LAMP CHEST ROBOT
out/asset-tools/shape-env/bin/python tools/assets/generate.py --available

# Verify geometry preparation without loading a GPU model.
out/asset-tools/shape-env/bin/python -m unittest tools.assets.test_generate

# Finish an already generated SkinTokens humanoid rig. Creature rigs use a
# separate reviewed skeleton; they are never forced through this helper.
out/asset-tools/assetfurnace/vendor/SkinTokens/.venv/bin/python tools/assets/finish-humanoid.py ROBOT
```

GPU generation and local Blender require access to macOS Metal/hardware outside a restrictive sandbox. Process GPU jobs serially on this 24 GB Mac. Keep the environments/checkpoints under ignored `out/`; normal game installation does not need them.

Preview generated candidates at `/tests-e2e/fixtures/asset-model.html`. The selector lists only locally generated mesh/animation candidates; it is not a claim that they are approved or integrated. Model dimensions, triangles, materials, joints and available clips appear above the viewport. Use orbit/back/wireframe views to check geometry. Projection supplies the front texture; a row-median colour approximation supplies the back, so no model is presented as having a learned 360-degree paint pass.
