"""Reopen the saved Blender deliverable and verify its packed authoring structure."""
from pathlib import Path
import hashlib
import json
import argparse
import struct

import bpy

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--revision', choices=['v1', 'v2'], default='v1')
revision = parser.parse_args().revision
OUTPUT = ROOT / 'games/zork2/planning/scenes/underground-garden' / ('mesh-' + revision)
blend_name, glb_name = 'underground-garden-' + revision + '.blend', 'underground-garden-' + revision + '.glb'
bpy.ops.wm.open_mainfile(filepath=str(OUTPUT / blend_name))
scene = bpy.context.scene
rooms = ['GARDEN-NORTH', 'GAZEBO-ROOM', 'FORMAL-GARDEN', 'TOPIARY-ROOM']
assert list(bpy.data.collections['Source rooms'].children.keys()) == rooms
meshes = list(bpy.data.collections['Shared generated geometry'].objects)
assert meshes and all(obj.type == 'MESH' for obj in meshes)
triangles = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in meshes)
assert triangles == 60000
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
assert scene.camera and scene.camera.name == 'Overview - generated mesh'
camera_name = scene.camera.name
sky_checks = None
if revision == 'v2':
    sky = bpy.data.objects['CAVE_GARDEN_SKYBOX']
    assert sky['role'] == 'skybox'
    assert all(face.normal.dot(face.center) < 0 for face in sky.data.polygons)
    sky_image = next(node.image for node in sky.data.materials[0].node_tree.nodes if node.type == 'TEX_IMAGE')
    assert sky_image.packed_file and list(sky_image.size) == [1774, 887]
    assert any(node.type == 'TEX_ENVIRONMENT' and node.image.packed_file for node in scene.world.node_tree.nodes)
    data = (OUTPUT / glb_name).read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    node = next(n for n in gltf['nodes'] if n.get('extras', {}).get('role') == 'skybox')
    material = gltf['materials'][gltf['meshes'][node['mesh']]['primitives'][0]['material']]
    assert 'KHR_materials_unlit' in material.get('extensions', {})
    assert len(gltf['images']) == 2 and all('bufferView' in image for image in gltf['images'])
    assert {n.get('extras', {}).get('source_room') for n in gltf['nodes'] if n.get('extras', {}).get('source_room')} == set(rooms)
    assert len(gltf['cameras']) == 7
    # Confirm standard unlit material and skybox geometry survive a GLB round trip.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUTPUT / glb_name))
    imported = next(obj for obj in bpy.context.scene.objects if obj.get('role') == 'skybox')
    assert imported.type == 'MESH' and imported.data.materials[0].use_nodes
    sky_checks = {'packedBlenderWorld': True, 'inwardSphere': True, 'embeddedGlbImages': 2,
                  'glbUnlitSkybox': True, 'glbRoundTrip': True, 'exportedCameras': 7}
report = {'checks': 'passed', 'reopenedBlend': True, 'rooms': rooms, 'triangles': triangles,
          'packedMaterialTextures': len(textures), 'renderCamera': camera_name,
          'files': {name: {'bytes': (OUTPUT / name).stat().st_size,
                           'sha256': hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest()}
                    for name in [blend_name, glb_name]}}
if sky_checks:
    report['skybox'] = sky_checks
(OUTPUT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
