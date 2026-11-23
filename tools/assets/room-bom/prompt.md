# Vision-LLM Room Decomposition Prompt (`room-bom-v1`)

Use this prompt with any multimodal model (Gemini, Claude, GPT) to convert a room's
four reference images (`N`, `E`, `S`, `W`) and `source-context.json` into a
schema-validated `room-bom.json` before running `run_room.mjs`.

## System / Task Prompt

You are a 3D environment technical artist decomposing a Zork II room from its four
cardinal reference images (`N` = forward, `E` = yaw 90°, `S` = reverse 180°,
`W` = yaw 270°) and its `source-context.json`.

Output **only** valid JSON matching `tools/assets/room-bom/schema.json`
(`format: "zxr-room-bom-v1"`).

### Rules

1. **Inventory every visible structural and hero element** in the four views:
   - Envelope shape (`box` or `octagon`), realistic interior dimensions in metres
     (`width` X, `depth` Y, `height` Z), `wallStyle`, `ceilingStyle`, and lighting.
   - Surface textures (`wall`, `floor`, `ceiling`, plus any distinct architectural
     material like `well-stone` or `etchings`): pick the cleanest, flattest patch
     from one of the 4 views and record its normalized `[x0, y0, x1, y1]` crop
     (top-left origin, `0..1`).
   - Every architectural opening/exit (`opening`, `door`), alcove (`recess`),
     floor feature (`floor-crack`), structural hero (`well`, `pillar`, `table`,
     `hero-3d`), and grounding rubble (`boulder-cluster`).
2. **Coordinate frame**:
   - Origin `(0, 0, 0)` is the room center on the floor.
   - `+X` = East, `-X` = West, `+Y` = North, `-Y` = South, `+Z` = Up.
3. **Never bake interactive ZIL objects into static room geometry**:
   - Every item in `source-context.json -> visibleInitialObjects` that can move,
     change state, or be targeted by the player must appear as a `zil-prop-anchor`
     (or carry `zilIdentity` on a separate anchor) at the exact spot shown in the
     reference images.
4. **Never invent exits**:
   - Only `sourceExits` with `UEXIT` or `DEXIT` may be `opening` / `door` exits.
   - Visually recessed dark areas without a source exit must be `recess` (capped
     shallow depth), never a walkable tunnel.

---

## Visual-Diff Refinement Prompt (Stage 4)

After `assemble_room.py --render-review` writes `review-4view.png` (top row: 4
reference views; bottom row: 4 Blender renders at matching N/E/S/W headings):

> Compare each column (`N`, `E`, `S`, `W`) in `review-4view.png`. List the top
> geometric, placement, scale, or lighting discrepancies between the top reference
> image and the bottom render, then emit an updated `room-bom.json` that fixes
> them without inventing exits or baking interactive ZIL objects.
