"""Render the latest reduced garden scene in 4K without modifying its blend file."""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1/meshes-v2-reduced'
bpy.ops.wm.open_mainfile(filepath=str(BASE/'garden-models-reduced-v2.blend'))
scene=bpy.context.scene
scene.camera=bpy.data.objects['front']
scene.render.resolution_x=3840
scene.render.resolution_y=2160
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(BASE/'garden-models-reduced-v2-textured-4k.png')
if scene.render.engine=='CYCLES':scene.cycles.samples=48
bpy.ops.render.render(write_still=True)
print('RENDERED',scene.render.filepath,flush=True)
