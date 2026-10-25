"""Replace fused cage infill with separate open bars, retaining the draft input."""
from pathlib import Path
import hashlib
import json
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
directory = ROOT/'out/asset-production/asset_cage'
candidate = json.loads((directory/'candidate.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
root = bpy.data.objects.new('cage_root', None)
scene.collection.objects.link(root)
root['sourceIdentity'] = 'CAGE'
root['motion'] = 'Rigid cage translation; the engine controls trap and rescue.'
iron = bpy.data.materials.new('worn_dark_iron')
iron.use_nodes = True
bsdf = iron.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (.065, .075, .082, 1)
bsdf.inputs['Metallic'].default_value = .7
bsdf.inputs['Roughness'].default_value = .53
pieces = []


def beam(name, start, end, radius):
    start, end = Vector(start), Vector(end)
    direction = end-start
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=direction.length, end_fill_type='NGON', location=(start+end)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(iron)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    pieces.append(obj)


half, height = 1.2, 2.5
for xx in [-half, half]:
    for yy in [-half, half]:
        beam('corner_post', (xx, yy, 0), (xx, yy, height), .055)
for zz in [.07, height*.50, height-.07]:
    for side in [-half, half]:
        beam('frame_x', (-half, side, zz), (half, side, zz), .045)
        beam('frame_y', (side, -half, zz), (side, half, zz), .045)
for index in range(1, 11):
    offset = -half+index*2*half/11
    for side in [-half, half]:
        beam('wall_bar_x', (offset, side, .07), (offset, side, height-.07), .023)
        beam('wall_bar_y', (side, offset, .07), (side, offset, height-.07), .023)
    beam('roof_bar', (offset, -half, height-.07), (offset, half, height-.07), .027)
# Join disconnected bars into one draw call while preserving the open gaps.
bpy.ops.object.select_all(action='DESELECT')
for obj in pieces:
    obj.select_set(True)
bpy.context.view_layer.objects.active = pieces[0]
bpy.ops.object.join()
cage = bpy.context.object
cage.name = 'open_bar_cage'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
cage.parent = root
bpy.context.view_layer.update()
graph = bpy.context.evaluated_depsgraph_get()
# Test a grid through the two opposite walls. A filled sheet would block every
# ray, whereas the deliberately spaced bars must leave most samples open.
clear = 0
total = 0
for xx in [-.92, -.72, -.5, -.28, -.06, .16, .38, .60, .82]:
    for zz in [.35, .75, 1.65, 2.1]:
        hit, *_ = scene.ray_cast(graph, Vector((xx, -1.5, zz)), Vector((0, 1, 0)), distance=3)
        clear += not hit
        total += 1
assert clear > total*.55, {'clear': clear, 'total': total}
root.select_set(True)
output = directory/'finished.glb'
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True, export_animations=False, export_extras=True)
record = {'format': 'zxr-finished-asset-v1', 'sourceIdentity': 'CAGE', 'file': output.name,
          'inputMeshSha256': candidate['sha256'], 'referenceSha256': candidate['referenceSha256'],
          'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'bytes': output.stat().st_size,
          'geometry': 'Authored open iron bars and frame matching the reference silhouette; generated fused candidate retained.',
          'gapRays': {'clear': clear, 'total': total}, 'estimatedSizeMetres': [2.4, 2.5, 2.4],
          'review': 'draft', 'limitations': ['Rigid cage shell; dimensions are authoring estimates.',
              'Reference door detail is omitted; the source puzzle raises the whole cage.',
              'Game-state binding and headset acceptance are separate work.']}
(directory/'finished.json').write_text(json.dumps(record, indent=2)+'\n')
print(json.dumps(record, indent=2))
