# Modular garden reference images

**Latest individual decimation:** [eight standalone reduced models and counts](meshes-v2-reduced/README.md), totaling 213,288 vertices (96.2% fewer than the original assembly). [Open the updated editable scene](meshes-v2-reduced/garden-models-reduced-v2.blend). Original models and earlier assemblies are preserved.

Use the [reduced editable Blender scene](blender-assembly-v3-reduced/garden-modular-reduced-v3.blend) or [reduced GLB](blender-assembly-v3-reduced/garden-modular-reduced-v3.glb). All eight assets remain independently movable and scalable. The full-detail source files in `meshes-v1/`, `blender-assembly-v1/`, and `blender-assembly-v2-textured/` are preserved.

Reduction: 5,542,839 → 844,700 mesh vertices (84.8% fewer); 11,085,722 → 1,689,444 native triangles. The GLB contains 1,689,433 triangles; its reimported surface passed sampled distance checks against the reduced native scene. Counts refer to Blender mesh vertices; GLB attribute seams can increase exported vertex counts. See [verification](blender-assembly-v3-reduced/verification.json), [front preview](blender-assembly-v3-reduced/review-front.png), and [adjustable decimation controls](blender-assembly-v3-reduced/garden-decimation-controls-v3.blend).

[Open the editable Blender assembly](blender-assembly-v1/garden-modular-editable-v1.blend) · [Front preview](blender-assembly-v1/review-front.png) · [Move/resize instructions](ASSEMBLY.md)

Eight separate meshes have now been generated and assembled, with original geometry preserved and independent transform roots. The native file is approximately 260 MiB and contains 11,085,722 triangles across the assets, plus packed image references. Material colors are simple editable colors; no reference image is projected onto the assembly. The ground reconstruction is rough, and individual assets remain generation drafts. Source meshes and their per-image provenance are in `meshes-v1/`; assembly checks are in `blender-assembly-v1/verification.json`.

Created 2026-10-27 with built-in ImageGen, using the selected flower-free garden `../concept-low-hedges-v2/reference.png` as visual reference. Exact prompts are saved in [prompts.json](prompts.json). These are separate image references for later mesh generation, not completed 3D assets or multiview reconstruction inputs.

| Reference | Purpose |
| --- | --- |
| [Garden shell](garden-shell.png) | No sculptures, pedestals, gazebo or flowers; low hedges and grey paths retained, clear circular gazebo pad |
| [Terracotta dragon](dragon.png) | Detailed seated winged dragon and pedestal |
| [Ivory unicorn](unicorn.png) | Raised foreleg, flowing mane, horn and pedestal |
| [Cobalt serpent](serpent.png) | Coiled base and tall curved neck, no limbs or wings |
| [Golden dog](dog.png) | Seated shaggy dog sculpture and pedestal |
| [Violet figure](woman-violet.png) | Draped classical woman and pedestal |
| [Rose figure](woman-rose.png) | Distinct draped classical woman and pedestal |
| [Gazebo](gazebo.png) | White open structure, brown roof, table, platform and steps |

The seven object references have transparent backgrounds; the garden shell retains its cavern setting. All selected images were visually inspected and decoded, with dimensions, alpha checks and hashes in `verification.json`. The gazebo's first draft is retained as `gazebo-draft.png`; use `gazebo.png`, whose finial and steps fit inside the frame. Transparent edges and delicate gazebo lattice still require inspection during mesh generation. Single-view reference images do not establish backside geometry or guarantee open posts/railings in a generated mesh.

The garden shell and each object can be generated and reviewed separately before assembly in Blender. Keep the sculpture colors separate from foliage materials. This user-requested sculpture treatment is a visual revision from source topiary; no source gameplay or runtime assets are changed here.
