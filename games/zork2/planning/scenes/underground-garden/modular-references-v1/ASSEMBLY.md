# Editable modular garden

For the reduced version, open `blender-assembly-v3-reduced/garden-modular-reduced-v3.blend`. The eight independent move/scale roots remain available, and the original files are preserved. Use `garden-decimation-controls-v3.blend` in the same directory to adjust reduction on the original geometry. Verification and previews are beside the reduced files.

The original native Blender deliverable is `blender-assembly-v1/garden-modular-editable-v1.blend`, with an optional combined `garden-modular-editable-v1.glb`. The eight generated source assets are retained separately in `meshes-v1/`, with per-reference hashes, generator settings and counts. No welding, mesh cleanup or decimation is performed for the assembly.

## Move and resize

In Blender's Outliner, expand `GARDEN - separate editable assets`. Each named asset has its own collection and a `MOVE AND SCALE` root. Select that root, press **G** to move, **S** to scale or **R** to rotate. Add **X**, **Y** or **Z** to constrain an axis. The mesh beneath the root can be edited separately. Each root's origin is at the center of its base.

The seven props and garden shell are not merged into one mesh. Placement and physical scale are approximate reference-based estimates; adjust them manually. The base material colors are editable in Material Properties. The original image references are packed in a hidden reference collection; these are reference images, not projected scene textures.

## Review limits

These are single-image generated shape drafts. Separating objects improves the amount of detail available to each reconstruction, but does not establish correct hidden surfaces, gazebo openings, statue anatomy, path clearance or watertightness. The gazebo and table are one generated asset and may contain fused details. No learned texture paint is added. The scene is an authoring assembly with no runtime or gameplay changes.

Generator: `tools/assets/garden-modular-generate.py`. Blender assembly: `tools/assets/garden-modular-blender.py`. Verification includes source geometry fingerprints, preservation of eight independent roots in GLB, and reopening the saved Blender file. Tencent license and notice are retained beside the source meshes.
