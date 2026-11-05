"""Render the exported atomic ravine GLBs, independently of the authoring scene."""
import argparse
import json
from pathlib import Path
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base', type=Path)
parser.add_argument('--part')
args = parser.parse_args()
base = args.base.resolve()
specs = json.loads((base/'manifest.json').read_text())['parts']
for spec in specs:
    name = spec['id']
    if args.part and name != args.part:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(base/'meshes'/f'{name}.glb'))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 12
    scene.render.resolution_x = 720; scene.render.resolution_y = 640; scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'
    meshes = [o for o in scene.objects if o.type == 'MESH']
    points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = Vector([min(v[i] for v in points) for i in range(3)])
    hi = Vector([max(v[i] for v in points) for i in range(3)])
    centre = (lo+hi)/2; span = max(hi-lo)
    scene.world = bpy.data.worlds.new('Neutral review'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.045,.055,.07,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
    for offset,power in [((-1,-2,2),40),((1,-1,1),25)]:
        bpy.ops.object.light_add(type='AREA', location=centre+Vector(offset)*span)
        light = bpy.context.object; light.data.energy = power*span*span; light.data.size = span*2
        light.rotation_euler = (centre-light.location).to_track_quat('-Z','Y').to_euler()
    data = bpy.data.cameras.new('GLB review'); data.type = 'ORTHO'; data.ortho_scale = span*1.45
    cam = bpy.data.objects.new('GLB review',data); scene.collection.objects.link(cam); scene.camera = cam
    for view,offset in [('front',(0,-3,0)),('angled',(1,-3,.6))]:
        cam.location = centre+Vector(offset)*span
        cam.rotation_euler = (centre-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = str(base/'meshes'/f'preview-{name}-{view}.png')
        bpy.ops.render.render(write_still=True)
    print('REVIEWED',name,flush=True)
