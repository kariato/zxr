"""Re-export the saved ravine review scene without repeating its renders."""
from pathlib import Path
import bpy

output = Path(__file__).resolve().parents[2] / 'games/zork2/planning/scenes/lower-ravine/mesh-v2'
bpy.ops.wm.open_mainfile(filepath=str(output / 'lower-ravine-v2.blend'))
for obj in bpy.context.scene.objects:
    obj.select_set(obj.type == 'MESH' or bool(obj.get('source_room'))
                   or obj.get('role') == 'exterior_entrance_boundary')
bpy.ops.export_scene.gltf(filepath=str(output / 'lower-ravine-v2.glb'),
                          export_format='GLB', use_selection=True, export_extras=True)
