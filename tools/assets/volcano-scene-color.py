"""Add reference color without changing Tencent vertex positions or faces."""
from pathlib import Path
import bpy
import math
import json
import hashlib
import struct
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'games/zork2/planning/scenes/volcano'
OUT = BASE / 'mesh-v2-color'
OUT.mkdir(exist_ok=True)
source = BASE / 'mesh-v2/volcano-v2.glb'
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(BASE / 'mesh-v2/volcano-v2.blend'))
scene = bpy.context.scene
meshes = list(bpy.data.collections['Tencent original - unedited shape'].objects)


def geometry_hash():
    h = hashlib.sha256()
    for o in meshes:
        for v in o.data.vertices:
            h.update(struct.pack('<3f', *v.co))
        for p in o.data.polygons:
            h.update(struct.pack('<' + 'I' * len(p.vertices), *p.vertices))
    return h.hexdigest()


before = geometry_hash()
points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
up = Vector((0, math.sin(math.radians(35)), math.cos(math.radians(35))))
vmin, vmax = min(up.dot(p) for p in points), max(up.dot(p) for p in points)
reference = bpy.data.images.load(str(BASE / 'concept-v2.png'), check_existing=True)
reference.pack()
material = bpy.data.materials.new('Scene reference color - editable projection')
material.use_nodes = True
nodes = material.node_tree.nodes
texture = nodes.new('ShaderNodeTexImage')
texture.image = reference
texture.extension = 'EXTEND'
bsdf = nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = .95
material.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
for o in meshes:
    o.data.materials.clear()
    o.data.materials.append(material)
    uv = o.data.uv_layers.new(name='Reference color projection - 35 degrees')
    for loop in o.data.loops:
        p = o.matrix_world @ o.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((p.x - lo.x) / (hi.x - lo.x),
                                  (up.dot(p) - vmin) / (vmax - vmin))
    for face in o.data.polygons:
        face.material_index = 0
    o['texture_method'] = '35-degree single-reference projection; editable UVs'
assert geometry_hash() == before
scene['status'] = 'Colored manual-editing draft; Tencent vertices and faces unchanged'
scene['geometry_fingerprint_before_color'] = before
scene['texture_limitation'] = 'Single-view projection; side/back and eye-height views can stretch. Not multiview paint.'
for o in bpy.data.collections['Review cameras and lights - separate'].objects:
    if o.type == 'LIGHT':
        o.data.energy *= .2
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .3
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x, scene.render.resolution_y = 1024, 1536
for label in ['front', 'back']:
    scene.camera = bpy.data.objects[label]
    scene.render.filepath = str(OUT / ('review-' + label + '.png'))
    bpy.ops.render.render(write_still=True)
scene.camera = bpy.data.objects['front']
notes = bpy.data.texts['READ ME']
notes.clear()
notes.write('Colored copy of untouched Tencent shape. Vertex positions and faces preserved.\nReference image packed; editable UV projection at 35 degrees.\nSingle-view color stretches on side/back surfaces and when viewed at player height.\nNo learned multiview painting, denoising, decimation or topology repairs.\nOriginal untextured GLB and Blender file retained in ../mesh-v2/.\nNative inference units; mutable ledge separation, walking planes and runtime integration pending.\n')
for o in scene.objects:
    o.select_set(False)
for o in meshes:
    o.select_set(True)
blend = OUT / 'volcano-color-v2.blend'
glb = OUT / 'volcano-color-v2.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                          export_extras=True, export_apply=False)
assert geometry_hash() == before
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
(OUT / 'verification.json').write_text(json.dumps({
    'geometryUnchanged': True, 'geometryFingerprint': before,
    'originalGLBSha256': source_hash, 'originalGLBUnchanged': True,
    'textureMethod': 'single-reference planar projection at 35 degrees; not learned paint',
    'referenceSha256': hashlib.sha256((BASE / 'concept-v2.png').read_bytes()).hexdigest(),
    'files': {p.name: {'bytes': p.stat().st_size,
                     'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
              for p in [blend, glb]}}, indent=2) + '\n')
