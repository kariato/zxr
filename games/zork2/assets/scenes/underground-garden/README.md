# Runtime modular underground garden

`underground-garden-topiary-v3.glb` is the shared scene for Garden North, Gazebo Room, Formal Garden and Topiary Room. It contains the reviewed garden shell, six separate hedge sculptures centered on different islands, a gazebo reduced by 40% with brown roof and ivory framing, and the existing unlit cave panorama. All textures are embedded. Source game rules and room transitions are unchanged.

The packed editable source and review image are in [the centered scene directory](../../../planning/scenes/underground-garden/modular-references-v1/hedge-models-centered-v2/). The shell uses a single reference projection, so side views can show stretching. Hedge color and normal maps and the gazebo finish are baked textures. Geometry remains the reviewed reduced draft.

Run `tools/assets/garden-runtime.py` with Blender Python (`bpy` 5.0.1) from the repository to export this asset and regenerate garden walking surfaces and layout metadata. The exporter samples separate invisible floors from the shell and gazebo; ravine data is retained. The older garden v2 blend supplies the sky sphere. `scene.json` records the runtime and source hashes. Tencent Hunyuan notices are retained here and included in the published game's existing license bundle.
