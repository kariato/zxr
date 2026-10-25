"""Render the actual Narrow Tunnel candidate and save a packed Blender scene."""
from pathlib import Path
import json

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'out/asset-production/narrow-tunnel-v1'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUTPUT / 'candidate.glb'))
scene = bpy.context.scene
meshes = [obj for obj in scene.objects if obj.type == 'MESH']
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
center = (lo + hi) / 2
span = max(hi - lo)
world = bpy.data.worlds.new('Neutral inspection lighting')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.12, .15, .17, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
scene.world = world
for index, offset in enumerate([(1, -1.5, 2), (-1.5, -.5, 1), (0, 2, 1.5)]):
    data = bpy.data.lights.new('Review light ' + str(index), 'AREA')
    data.energy = span * span * 45
    data.size = span * 1.5
    obj = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(obj)
    obj.location = center + Vector(offset) * span
    obj.rotation_euler = (center - obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Review camera')
camera = bpy.data.objects.new(data.name, data)
scene.collection.objects.link(camera)
scene.camera = camera
data.type = 'ORTHO'
data.ortho_scale = span * 1.35
data.clip_end = span * 100
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
for label, offset in [('front', (0, -2.2, .7)), ('side', (2, -1, .8)), ('back', (0, 2.2, .7))]:
    camera.location = center + Vector(offset) * span
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUTPUT / f'review-{label}.png')
    bpy.ops.render.render(write_still=True)
camera.location = center + Vector((0, -2.2, .7)) * span
camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
for image in bpy.data.images:
    if image.type == 'IMAGE' and not image.packed_file:
        image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'narrow-tunnel-v1.blend'))
(OUTPUT / 'render.json').write_text(json.dumps({'views': ['front', 'side', 'back'],
    'renderer': 'Blender Cycles CPU, 24 samples', 'boundsBlender': [list(lo), list(hi)],
    'note': 'Images render the generated mesh, not the source reference.'}, indent=2) + '\n')
