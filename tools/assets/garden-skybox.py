"""Add the existing cave-garden panorama to Blender and a self-contained GLB."""
from pathlib import Path
import hashlib
import json
import math
import shutil
import struct

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'games/zork2/planning/scenes/underground-garden'
SOURCE = BASE / 'mesh-v1'
OUTPUT = BASE / 'mesh-v2'
PANORAMA = ROOT / 'games/zork2/assets/skyboxes/cave-garden/reference-v1.png'
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'underground-garden-v1.blend'))
scene = bpy.context.scene
garden = list(bpy.data.collections['Shared generated geometry'].objects)
points = [obj.matrix_world @ Vector(corner) for obj in garden for corner in obj.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
centre, span = (lo + hi) / 2, max(hi - lo)
image = bpy.data.images.load(str(PANORAMA), check_existing=True)
image.pack()

# Blender world for native inspection; the sphere below carries the same image
# into glTF, which has no standard world-environment/background node.
world = bpy.data.worlds.new('Moss-lit cavern garden panorama')
world.use_nodes = True
nodes = world.node_tree.nodes
nodes.clear()
environment = nodes.new('ShaderNodeTexEnvironment')
environment.image = image
environment.projection = 'EQUIRECTANGULAR'
background = nodes.new('ShaderNodeBackground')
background.inputs['Strength'].default_value = .35
output = nodes.new('ShaderNodeOutputWorld')
world.node_tree.links.new(environment.outputs['Color'], background.inputs['Color'])
world.node_tree.links.new(background.outputs['Background'], output.inputs['Surface'])
scene.world = world

sky_collection = bpy.data.collections.new('Skybox - embedded cave garden panorama')
bpy.data.collections['UNDERGROUND_GARDEN'].children.link(sky_collection)
radius = span * 4.8
bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=radius, location=centre)
sky = bpy.context.object
sky.name = 'CAVE_GARDEN_SKYBOX'
for owner in list(sky.users_collection):
    owner.objects.unlink(sky)
sky_collection.objects.link(sky)
bm = bmesh.new()
bm.from_mesh(sky.data)
bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
bm.to_mesh(sky.data)
bm.free()
sky.data.update()

# Blender UV spheres start their longitude on the opposite side from the world
# Environment Texture node. Calibrate UVs from world-facing longitude/latitude
# so the sphere and native Blender world use the same equirectangular mapping.
uv = sky.data.uv_layers.active
for face in sky.data.polygons:
    values = []
    for index in face.loop_indices:
        point = sky.data.vertices[sky.data.loops[index].vertex_index].co.normalized()
        u = .5 - math.atan2(point.y, point.x) / (2 * math.pi)
        v = .5 + math.asin(max(-1, min(1, point.z))) / math.pi
        values.append((index, u, v))
    crosses_seam = max(value[1] for value in values) - min(value[1] for value in values) > .5
    for index, u, v in values:
        uv.data[index].uv = (u + 1 if crosses_seam and u < .5 else u, v)
material = bpy.data.materials.new('Cave garden skybox - unlit')
material.use_nodes = True
nodes = material.node_tree.nodes
nodes.clear()
texture = nodes.new('ShaderNodeTexImage')
texture.image = image
texture.extension = 'REPEAT'
emission = nodes.new('ShaderNodeEmission')
emission.inputs['Strength'].default_value = 1
output = nodes.new('ShaderNodeOutputMaterial')
material.node_tree.links.new(texture.outputs['Color'], emission.inputs['Color'])
material.node_tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])
material.use_backface_culling = True
sky.data.materials.append(material)
sky['role'] = 'skybox'
sky['projection'] = 'equirectangular'
sky['ignore_for_walk_bounds'] = True
sky['source_image'] = str(PANORAMA.relative_to(ROOT))
sky['source_sha256'] = hashlib.sha256(PANORAMA.read_bytes()).hexdigest()
scene['skybox_image'] = sky['source_image']
scene['skybox_radius_metres'] = radius
scene['garden_bounds_blender_json'] = json.dumps([list(lo), list(hi)])

notes = bpy.data.texts.get('READ ME - Underground Garden')
notes.write('''

SKYBOX UPDATE
The cave-garden equirectangular panorama is packed in the Blender world and
on CAVE_GARDEN_SKYBOX, an inward-facing unlit sphere. The sphere is exported
because glTF cannot carry Blender world nodes. Its extras mark it as scenery
to exclude from walking and model-fit bounds. The GLB includes inspection
cameras; choose Overview if a viewer initially frames the whole sky sphere.
''')
overview = bpy.data.objects['Overview - generated mesh']
for label, name in [('overview', 'Overview - generated mesh'), ('three-quarter', 'Three quarter - generated mesh')]:
    scene.camera = bpy.data.objects[name]
    scene.render.filepath = str(OUTPUT / ('review-' + label + '.png'))
    bpy.ops.render.render(write_still=True)
scene.camera = overview
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        area.spaces.active.shading.use_scene_world = True
        area.spaces.active.shading.use_scene_world_render = True
for item in bpy.data.images:
    if item.type == 'IMAGE' and not item.packed_file:
        item.pack()
blend = OUTPUT / 'underground-garden-v2.blend'
glb = OUTPUT / 'underground-garden-v2.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for obj in scene.objects:
    obj.select_set(False)
for obj in garden + [sky]:
    obj.select_set(True)
for obj in scene.objects:
    if obj.type == 'CAMERA' or obj.get('source_room'):
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                          export_extras=True, export_cameras=True)
# Blender writes pure Emission as emissive PBR. Express the same background as
# standard KHR_materials_unlit so viewer lighting cannot change its appearance.
payload = glb.read_bytes()
json_length = struct.unpack_from('<I', payload, 12)[0]
document = json.loads(payload[20:20 + json_length])
sky_material = next(item for item in document['materials'] if item['name'] == material.name)
sky_material['pbrMetallicRoughness'] = {
    'baseColorFactor': [1, 1, 1, 1], 'baseColorTexture': sky_material.pop('emissiveTexture'),
    'metallicFactor': 0, 'roughnessFactor': 1,
}
sky_material.pop('emissiveFactor', None)
sky_material.setdefault('extensions', {})['KHR_materials_unlit'] = {}
document.setdefault('extensionsUsed', []).append('KHR_materials_unlit')
encoded = json.dumps(document, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
tail = payload[20 + json_length:]
glb.write_bytes(struct.pack('<III', 0x46546C67, 2, 20 + len(encoded) + len(tail))
                + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)
for name in ['TENCENT-HUNYUAN-3D-2.0-LICENSE.txt', 'HUNYUAN-NOTICE.txt']:
    shutil.copy2(SOURCE / name, OUTPUT / name)
report = {'format': 'zxr-garden-skybox-scene-v1', 'blend': blend.name, 'glb': glb.name,
          'sourceBlend': '../mesh-v1/underground-garden-v1.blend',
          'skybox': {'image': str(PANORAMA.relative_to(ROOT)), 'sha256': sky['source_sha256'],
                     'projection': 'equirectangular', 'radiusMetres': radius,
                     'node': sky.name, 'inwardFacing': True, 'unlit': True},
          'gardenBoundsBlender': [list(lo), list(hi)],
          'rooms': json.loads(scene['source_rooms_json']),
          'reviewCamera': overview.name,
          'files': {path.name: {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                    for path in [blend, glb]}}
(OUTPUT / 'scene.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
