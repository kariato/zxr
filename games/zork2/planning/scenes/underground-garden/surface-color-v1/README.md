# Surface color diagnostic

This retains the original 396,214-triangle raw garden geometry and replaces single-image projection with 3D-position/height/normal-based vertex colors. COLOR_0 is stored in the GLB; no camera-facing reference image or external texture is used. Original geometry and source hash are verified unchanged; the GLB was reimported and its triangle count checked.

The 0°, 90° and 180° JPGs are 3840 × 2160. They expose the true shallow, fused reconstruction: material continuity is fixed, but the missing gazebo and creature geometry cannot be recovered by color. This diagnostic is retained alongside the more substantial `../rebuilt-v1/` authoring study. It is not a substitute for the original reference's visual detail or a runtime scene.
