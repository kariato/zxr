# Rotation-consistent garden rebuild

This is a separate authored reconstruction of the garden, created to replace the misleading single-image projection with actual volumetric structures. It changes geometry; the original generated files remain intact.

The white gazebo has individual posts, railings, roof shingles, steps and a tea table. Rosebeds, clipped hedges, gravel paths, cavern rocks, a rose arbor and approximate dragon/unicorn/serpent/dog/human topiary use real meshes with stable material families. The 0°, 90° and 180° review JPGs are each 3840 × 2160. There is no projected image or view-dependent texture to stretch when the camera moves.

Source: `reference/zork2/2dungeon.zil:282–345`. Layout and dimensions are authoring estimates. The topiary shapes are stylized approximations. The cavern is cut away for review with no enclosing moss-covered ceiling; lighting is a review rig. This is a new, simpler visual treatment, not recovery of every detail in the concept image. Hidden walking planes, room cameras, engine observation/lighting integration, device performance and human visual acceptance remain pending. No gameplay changes are made.

`underground-garden-rebuilt-v1.blend` is the editable scene. `underground-garden-rebuilt-v1.glb` contains the geometry and materials. `verification.json` records counts, file hashes and GLB reimport checks. Reproduce with `tools/assets/garden-rebuild.py` in the installed bpy environment.
