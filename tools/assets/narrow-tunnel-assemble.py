"""Finish the generated diorama around the source room's near-bank walking area."""
from pathlib import Path
import hashlib
import json
import math

import bpy
import bmesh
import numpy as np
from PIL import Image
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'out/asset-production/narrow-tunnel-v1'
OUTPUT = ROOT / 'out/asset-production/narrow-tunnel-room-v1'
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE / 'candidate.glb'))
rock = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
rock.name = 'generated_narrow_tunnel'

# GLB Y-up becomes Blender Z-up. The generated bridge runs along raw +X;
# rotate it toward game +Z (Blender -Y), and put the near shelf at floor level.
rock.rotation_mode = 'XYZ'
rock.rotation_euler.z = -math.pi / 2
rock.location = (0, -5.5, -5.1)
bpy.context.view_layer.objects.active = rock
rock.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(rock.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
# Remove reconstructed ledge ribbons above the ravine beside the actual bridge.
remove = []
for face in bm.faces:
    point = face.calc_center_median()
    if 2.7 < -point.y < 10.3 and -3.1 < point.z < 2.4:
        remove.append(face)
bmesh.ops.delete(bm, geom=remove, context='FACES')
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(rock.data); bm.free(); rock.data.update()

# Use actual stone grain from the generated reference on inward-facing surfaces.
size = 512
reference = Image.open(ROOT / 'games/zork2/assets/experiments/narrow-tunnel-v1/reference.png').convert('RGB')
rgb = np.asarray(reference.crop((1280, 440, 1420, 650)).resize((size, size)), dtype=np.float32)[::-1] / 255
rgba = np.concatenate([rgb, np.ones((size, size, 1))], axis=2).astype(np.float32)
image = bpy.data.images.new('rough_stone', width=size, height=size)
image.pixels.foreach_set(rgba.ravel()); image.pack()
stone = bpy.data.materials.new('rough_stone'); stone.use_nodes = True
nodes = stone.node_tree.nodes
texture = nodes.new('ShaderNodeTexImage'); texture.image = image
stone.node_tree.links.new(texture.outputs['Color'], nodes['Principled BSDF'].inputs['Base Color'])
nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
rock.data.materials.append(stone)
uv = rock.data.uv_layers.active
for face in rock.data.polygons:
    face.material_index = 1
    axis = max(range(3), key=lambda i: abs(face.normal[i]))
    axes = [(1, 2), (0, 2), (0, 1)][axis]
    for index in face.loop_indices:
        point = rock.data.vertices[rock.data.loops[index].vertex_index].co
        uv.data[index].uv = (point[axes[0]] * .22, point[axes[1]] * .22)

# Cut a head-height clearance volume; no player movement into the ravine is added.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, .1, 1.15))
cutter = bpy.context.object; cutter.name = 'near_bank_clearance'
cutter.dimensions = (2.6, 6.4, 2.7)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.context.view_layer.objects.active = rock
modifier = rock.modifiers.new('Clear walking area', 'BOOLEAN')
modifier.operation = 'DIFFERENCE'; modifier.solver = 'EXACT'; modifier.object = cutter
bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.data.objects.remove(cutter, do_unlink=True)
# A Boolean difference through an inferred solid adds end caps. Open both ends
# of the authored passage so its southern mouth actually overlooks the cavern.
bm = bmesh.new(); bm.from_mesh(rock.data)
caps = [face for face in bm.faces if any(all(abs(vertex.co.y - end) < 1e-4 for vertex in face.verts) for end in [-3.1, 3.3])]
bmesh.ops.delete(bm, geom=caps, context='FACES')
bm.to_mesh(rock.data); bm.free(); rock.data.update()

# A level near-bank floor prevents floating props and uneven floor under the eye.
uv = rock.data.uv_layers.active
for face in rock.data.polygons:
    face.material_index = 1
    axes = [(1, 2), (0, 2), (0, 1)][max(range(3), key=lambda i: abs(face.normal[i]))]
    for index in face.loop_indices:
        point = rock.data.vertices[rock.data.loops[index].vertex_index].co
        uv.data[index].uv = (point[axes[0]] * .22, point[axes[1]] * .22)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -.14))
floor = bpy.context.object; floor.name = 'near_bank_floor'
floor.dimensions = (2.7, 5.2, .28)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
floor.data.materials.append(stone)
floor_uv = floor.data.uv_layers.active
for loop in floor.data.loops:
    point = floor.data.vertices[loop.vertex_index].co
    floor_uv.data[loop.index].uv = (point.x * .22, point.y * .22)

root = bpy.data.objects.new('narrow_tunnel_room', None)
bpy.context.collection.objects.link(root)
root['sourceRoom'] = 'NARROW-TUNNEL'
root['walkingWidthMetres'] = 2.4
root['walkingDepthMetres'] = 5
for obj in [rock, floor]: obj.parent = root
# Rebuild the fused bridge deck from separate planks. Crossing remains a source
# room transition, rather than locomotion onto this distant scenery.
wood = bpy.data.materials.new('bridge_wood'); wood.use_nodes = True
wood.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.24, .16, .08, 1)
wood.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
for index in range(29):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -2.7 - index * .3, .63))
    plank = bpy.context.object; plank.name = f'bridge_plank_{index}'
    plank.dimensions = (2.2, .27, .12); plank.rotation_euler.z = .015 * math.sin(index * 2.3)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    plank.data.materials.append(wood); plank.parent = root
for x in [-1.05, 1.05]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -6.9, .48))
    beam = bpy.context.object; beam.name = 'bridge_support'; beam.dimensions = (.12, 8.8, .18)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    beam.data.materials.append(wood); beam.parent = root
bpy.ops.object.select_all(action='DESELECT')
wood_objects = [obj for obj in root.children if obj.type == 'MESH' and obj.data.materials[0] == wood]
for obj in wood_objects: obj.select_set(True)
bpy.context.view_layer.objects.active = wood_objects[0]
bpy.ops.object.join(); bpy.context.object.name = 'wooden_footbridge'

# Locally observed stream and high moss remain independent visual surfaces.
water = bpy.data.materials.new('stream_water'); water.use_nodes = True
water.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.055, .15, .17, 1)
water.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .3
vertices = [(math.sin(i * .4) * .35 + side * .4, -2.7 - i * .25, -4.15) for i in range(33) for side in [-1, 1]]
data = bpy.data.meshes.new('stream_below'); data.from_pydata(vertices, [], [(i*2, i*2+1, i*2+3, i*2+2) for i in range(32)])
data.materials.append(water); stream = bpy.data.objects.new('stream_below', data); bpy.context.collection.objects.link(stream); stream.parent = root
moss = bpy.data.materials.new('phosphorescent_moss'); moss.use_nodes = True
bsdf = moss.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (.12, .21, .075, 1)
bsdf.inputs['Emission Color'].default_value = (.09, .16, .04, 1)
bsdf.inputs['Emission Strength'].default_value = .4
vertices, faces = [], []
high_faces = [face for face in rock.data.polygons if face.center.z > 4.6 and -face.center.y > 6 and face.normal.y > 0]
for face in high_faces[::max(1, len(high_faces)//30)][:30]:
    center = face.center + face.normal * .012
    tangent = face.normal.cross(Vector((0, 0, 1))).normalized()
    if tangent.length < .01: continue
    other = face.normal.cross(tangent).normalized()
    start = len(vertices); vertices.append(center)
    vertices.extend([center + tangent * math.cos(i*math.pi/3)*.18 + other * math.sin(i*math.pi/3)*.35 for i in range(6)])
    faces.extend([(start, start+1+i, start+1+(i+1)%6) for i in range(6)])
data = bpy.data.meshes.new('high_moss'); data.from_pydata(vertices, [], faces); data.materials.append(moss)
patches = bpy.data.objects.new('high_moss', data); bpy.context.collection.objects.link(patches); patches.parent = root
bpy.context.view_layer.update()
graph = bpy.context.evaluated_depsgraph_get()
checks = []
for x in [-.84, 0, .84]:
    for z in [.3, 1.6, 2.1]:
        hit, *_ = bpy.context.scene.ray_cast(graph, Vector((x, 2.14, z)), Vector((0, -1, 0)), distance=4.28)
        checks.append({'x': x, 'height': z, 'clear': not hit})
if not all(row['clear'] for row in checks):
    raise RuntimeError('Near-bank walking clearance failed: ' + json.dumps(checks))
hit, *_ = bpy.context.scene.ray_cast(graph, Vector((0, -1.1, 1.6)), Vector((0, -1, 0)), distance=10)
if hit:
    raise RuntimeError('The arrival view toward the bridge is obstructed')

# Save a packed authoring scene, with the same starting view used by the game.
scene = bpy.context.scene
world = bpy.data.worlds.new('Cavern ambience'); world.use_nodes = True; scene.world = world
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.26, .31, .29, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .8
light_data = bpy.data.lights.new('Moss fill', 'AREA'); light_data.energy = 1400; light_data.size = 14
light = bpy.data.objects.new(light_data.name, light_data); scene.collection.objects.link(light)
light.location = (0, -4, 10)
camera_data = bpy.data.cameras.new('Narrow Tunnel arrival')
camera = bpy.data.objects.new(camera_data.name, camera_data); scene.collection.objects.link(camera)
camera.location = (0, -1.1, 1.6)
camera.rotation_euler = (Vector((0, -8, 1.15)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.lens = 24; camera_data.clip_end = 100
scene.camera = camera
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 24
scene.render.resolution_x = 1200; scene.render.resolution_y = 800; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUTPUT / 'arrival.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'narrow-tunnel-room-v1.blend'))
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in root.children_recursive: obj.select_set(True)
path = OUTPUT / 'narrow-tunnel-room-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                          export_animations=False, export_extras=True)
report = {'sourceRoom': 'NARROW-TUNNEL', 'sourceCandidateSha256': hashlib.sha256((SOURCE / 'candidate.glb').read_bytes()).hexdigest(),
          'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size,
          'clearance': checks, 'arrivalSightlineClear': not hit, 'walkingBounds': {'width': 2.4, 'depth': 5},
          'removedRavineFaces': len(remove), 'textureMethod': 'reference stone tile with planar UVs; authored wooden bridge',
          'limitations': ['Generated scenery remains fused; source interactions use separate observation-bound hit targets.',
                          'Not a headset clearance or performance acceptance test.']}
(OUTPUT / 'assembly.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
