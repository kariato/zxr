# Zork II room reference images

One selected 1536 × 1024 PNG for each of the 86 logical room identities in the source context index. All images were created with the built-in image generator using the complete approved `zork2-style-v1` guide, each room's source description, visible initial objects, relevant guarded routines and current scene brief.

Open `index.html` for the searchable gallery. Each card links to the exact generation/edit prompt, source packet and image provenance. `manifest.json` selects the current revision; earlier revisions are retained beside it. `contact-sheets/` provides eight overview sheets. `approved-style-guide.md` is a snapshot of the guide used for this batch.

These are draft art references. They are not room GLBs, approved runtime scenes or an exhaustive set of changing puzzle states. A single image depicts one source-compatible state. Hidden contents and future rewards stay concealed. The airborne volcano locations use suspended views, and the palantir interludes depict mist rather than invented walkable rooms. The Wizard's Quarters reference selects the source's sparse, monkish variant from its changing description table; the table and chosen variant are retained in `wizards-quarters/source-supplement.json`.

Otherwise dark physical rooms use a hypothetical carried lantern outside the image for authoring visibility. This does not grant light, reveal content or change the game state during play. Materials, approximate scale and camera compositions remain art estimates; source directions and state must be checked again during 3D layout.

Visual review corrected the crypt head count, dormant-volcano imagery, closed keyhole lid, unobserved bank boxes, stand colours and unnecessary invented workshop props. See `review-notes.json` for revision details. The generator's readable text is a visual reference; runtime text remains the exact engine output.

Verify inventory, full PNG decoding, dimensions, unique selected images and image/prompt/style/source hashes, then rebuild contact sheets and the download:

```sh
out/asset-tools/shape-env/bin/python tools/assets/verify-room-references.py --package
```

Run that command from the repository root. Delivery files are under `out/asset-production/room-reference-verification/`: `verification.json`, `package-manifest.json` and `all-room-references.zip`. The ZIP includes the gallery, selected and retained image revisions, exact prompts, provenance, source packets, style guide and contact sheets. No room images were integrated into gameplay.
