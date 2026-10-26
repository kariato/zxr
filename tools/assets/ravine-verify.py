"""Reopen the saved Blender deliverable and verify its packed authoring structure."""
from pathlib import Path
import hashlib
import json
import struct

import bpy

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'games/zork2/planning/scenes/lower-ravine/mesh-v2'
blend_name, glb_name = 'lower-ravine-v2.blend', 'lower-ravine-v2.glb'
bpy.ops.wm.open_mainfile(filepath=str(OUTPUT / blend_name))
scene = bpy.context.scene
rooms = ['STREAM-PATH', 'MARBLE-HALL', 'DEEP-FORD', 'RAVINE-LEDGE', 'LEDGE-TUNNEL']
assert list(bpy.data.collections['Source rooms'].children.keys()) == rooms
meshes = list(bpy.data.collections['Shared generated geometry'].objects)
assert meshes and all(obj.type == 'MESH' for obj in meshes)
triangles = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in meshes)
assert triangles == 60000
assert not any(name in bpy.data.collections for name in ['TINY-ROOM', 'DREARY-ROOM'])
for identity in rooms:
    objects = bpy.data.collections[identity].objects
    assert any(obj.type == 'CAMERA' for obj in objects)
    marker = next(obj for obj in objects if obj.type == 'EMPTY')
    assert marker['source_room'] == identity
    assert isinstance(json.loads(marker['source_exits_json']), dict)
textures = [node.image for obj in meshes for mat in obj.data.materials if mat.use_nodes
            for node in mat.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image]
assert textures and all(image.packed_file for image in textures)
assert bpy.data.collections['Reference image - viewport only'].hide_render
assert bpy.data.collections['Source connections - authoring guides'].hide_render
assert bpy.data.objects['TINY_ROOM_ENTRANCE_ONLY']['role'] == 'exterior_entrance_boundary'
assert scene.camera and scene.camera.name == 'Overview - generated mesh'
camera_name = scene.camera.name
data = (OUTPUT / glb_name).read_bytes()
length = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + length])
assert {n.get('extras', {}).get('source_room') for n in gltf['nodes'] if n.get('extras', {}).get('source_room')} == set(rooms)
assert all('bufferView' in image for image in gltf['images'])
assert any(n.get('extras', {}).get('role') == 'exterior_entrance_boundary' for n in gltf['nodes'])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUTPUT / glb_name))
assert any(obj.type == 'MESH' for obj in bpy.context.scene.objects)
report = {'checks': 'passed', 'reopenedBlend': True, 'rooms': rooms, 'triangles': triangles,
          'packedMaterialTextures': len(textures), 'renderCamera': camera_name,
          'files': {name: {'bytes': (OUTPUT / name).stat().st_size,
                           'sha256': hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest()}
                    for name in [blend_name, glb_name]}}
(OUTPUT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
