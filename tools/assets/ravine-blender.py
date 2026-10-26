"""Assemble the generated ravine into a packed, reviewable Blender project."""
from pathlib import Path
import hashlib
import json
import shutil
import math

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / 'out/asset-production/lower-ravine-v2'
SCENE = ROOT / 'games/zork2/planning/scenes/lower-ravine'
OUTPUT = SCENE / 'mesh-v2'
OUTPUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(GENERATED / 'candidate.glb'))
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
meshes = [obj for obj in scene.objects if obj.type == 'MESH']
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
centre, span = (lo + hi) / 2, max(hi - lo)

# This concept looks down into a broad ravine. Projecting colour by height alone
# produces horizontal stripes; include depth along the elevated camera's up axis.
elevation = math.radians(35)
up = Vector((0, math.sin(elevation), math.cos(elevation)))
forward = Vector((0, math.cos(elevation), -math.sin(elevation)))
projected = [up.dot(obj.matrix_world @ vertex.co) for obj in meshes for vertex in obj.data.vertices]
vmin, vmax = min(projected), max(projected)
reference = bpy.data.images.load(str(SCENE / 'exterior-concept-v2/reference.png'), check_existing=True)
reference.pack()
projection = bpy.data.materials.new('Elevated ravine reference projection')
projection.use_nodes = True
texture = projection.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = reference
projection.node_tree.links.new(texture.outputs['Color'], projection.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
projection.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .95
for obj in meshes:
    obj.data.materials.clear()
    obj.data.materials.append(projection)
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='Reference projection')
    for loop in obj.data.loops:
        point = obj.matrix_world @ obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((point.x - lo.x) / (hi.x - lo.x), (up.dot(point) - vmin) / (vmax - vmin))
    for face in obj.data.polygons:
        face.material_index = 0


def collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(result)
    return result


shared = collection('LOWER_RAVINE_EXTERIOR')
geometry = collection('Shared generated geometry', shared)
rooms = collection('Source rooms', shared)
connections = collection('Source connections - authoring guides', shared)
connections.hide_render = True
references = collection('Reference image - viewport only', shared)
references.hide_render = True
rig = collection('Review lighting and cameras')
for index, obj in enumerate(meshes):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    geometry.objects.link(obj)
    obj.name = f'generated_ravine_{index:02d}'
    obj['provenance'] = 'Tencent Hunyuan3D-2 turbo via the existing Hunyuan3D-Swift/MLX pipeline'
    obj['texture_method'] = 'Elevated 35-degree reference projection; approximate hidden surfaces'
    obj['review'] = 'Draft fused reconstruction; no walkability or separated props asserted'
    obj['licence'] = 'Tencent Hunyuan 3D 2.0 Community License'

world = bpy.data.worlds.new('Soft cavern ambient')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.12, .16, .15, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
scene.world = world
for name, offset, colour, strength in [
    ('Moss canopy fill', (-.8, -.7, 1.6), (.72, 1, .88), 38),
    ('Ravine soft key', (.8, -1.3, 1.3), (1, .91, .72), 48),
    ('Cavern rim', (0, 1.5, 1.4), (.63, .83, 1), 28),
]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.size, data.color = span * span * strength, span * 1.2, colour
    obj = bpy.data.objects.new(name, data)
    rig.objects.link(obj)
    obj.location = centre + Vector(offset) * span
    obj.rotation_euler = (centre - obj.location).to_track_quat('-Z', 'Y').to_euler()


def camera(name, target, offset, scale):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    rig.objects.link(obj)
    data.type, data.ortho_scale, data.clip_end = 'ORTHO', scale, span * 100
    obj.location = target + Vector(offset) * span
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


views = {
    'overview': camera('Overview - generated mesh', centre, (0, -2.2, 1.54), span * 1.65),
    'three-quarter': camera('Three quarter - generated mesh', centre, (1.5, -2, 1.7), span * 1.75),
    'back': camera('Back - inferred surfaces', centre, (0, 2.2, 1.54), span * 1.65),
}

# Screen-space estimates are projected onto the actual reconstructed surface.
# They label scene regions, not validated gameplay spawns or collision portals.
source_rooms = {
    'STREAM-PATH': ('Path Near Stream', (.84, .59), {'EAST': 'FORMAL-GARDEN', 'NE': 'DARK-TUNNEL', 'SW': 'CAROUSEL-ROOM', 'WEST': 'MARBLE-HALL IF SECRET-DOOR'}),
    'MARBLE-HALL': ('Marble Hall', (.36, .76), {'EAST': 'STREAM-PATH IF SECRET-DOOR', 'NORTH': 'DEEP-FORD', 'SOUTH': 'CAROUSEL-ROOM'}),
    'DEEP-FORD': ('Deep Ford', (.47, .49), {'NORTH': 'RAVINE-LEDGE', 'UP': 'RAVINE-LEDGE', 'SOUTH': 'MARBLE-HALL'}),
    'RAVINE-LEDGE': ('Ledge in Ravine', (.44, .33), {'UP': 'TINY-ROOM [DEFERRED INTERIOR]', 'SOUTH': 'DEEP-FORD', 'DOWN': 'DEEP-FORD', 'WEST': 'LEDGE-TUNNEL'}),
    'LEDGE-TUNNEL': ('End of Ledge', (.15, .24), {'EAST': 'RAVINE-LEDGE', 'IN': 'DRAGON-ROOM', 'NORTH': 'DRAGON-ROOM'}),
}
anchors = {}
for identity, (name, uv, exits) in source_rooms.items():
    room = collection(identity, rooms)
    x, screen_up = lo.x + uv[0] * (hi.x - lo.x), vmin + (1 - uv[1]) * (vmax - vmin)
    target = Vector((x, 0, 0)) + up * screen_up
    origin, direction = target - forward * span * 2, forward.copy()
    hits = []
    for mesh in meshes:
        inverse = mesh.matrix_world.inverted()
        found, location, normal, face = mesh.ray_cast(inverse @ origin, inverse.to_3x3() @ direction)
        if found:
            hits.append(mesh.matrix_world @ location)
    location = min(hits, key=lambda point: (point - origin).length) if hits else target
    marker = bpy.data.objects.new(identity + ' - region marker', None)
    room.objects.link(marker)
    marker.empty_display_type, marker.empty_display_size = 'SPHERE', span * .018
    marker.location, marker.show_name, marker.show_in_front = location, True, True
    marker['source_room'], marker['display_name'] = identity, name
    marker['source_exits_json'] = json.dumps(exits, sort_keys=True)
    marker['status'] = 'Approximate projected region marker; not a validated player spawn'
    anchors[identity] = marker
    inspect = camera(identity + ' - inspection camera', location, (0, -.9, .3), span * .5)
    rig.objects.unlink(inspect)
    room.objects.link(inspect)
    inspect['purpose'] = 'Mesh inspection, not a walkable first-person camera'

# Exterior entrance boundary only: no Tiny/Dreary interior collection or door.
boundaries = collection('Deferred interior boundaries', shared)
x, screen_up = lo.x + .49 * (hi.x - lo.x), vmin + .87 * (vmax - vmin)
target = Vector((x, 0, 0)) + up * screen_up
origin, direction = target - forward * span * 2, forward.copy()
hits = []
for mesh in meshes:
    inverse = mesh.matrix_world.inverted()
    found, location, normal, face = mesh.ray_cast(inverse @ origin, inverse.to_3x3() @ direction)
    if found:
        hits.append(mesh.matrix_world @ location)
entrance = bpy.data.objects.new('TINY_ROOM_ENTRANCE_ONLY', None)
boundaries.objects.link(entrance)
entrance.location = min(hits, key=lambda point: (point - origin).length) if hits else target
entrance.empty_display_type, entrance.empty_display_size = 'CIRCLE', span * .025
entrance.show_name, entrance.show_in_front = True, True
entrance['role'] = 'exterior_entrance_boundary'
entrance['destination_room'] = 'TINY-ROOM'
entrance['deferred_interiors_json'] = json.dumps(['TINY-ROOM', 'DREARY-ROOM'])
entrance['status'] = 'Dark exterior entrance mouth only; projected marker is not a validated portal or spawn'

for a, b in [('MARBLE-HALL', 'DEEP-FORD'), ('DEEP-FORD', 'RAVINE-LEDGE'), ('RAVINE-LEDGE', 'LEDGE-TUNNEL')]:
    curve = bpy.data.curves.new(a + ' to ' + b, 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    spline.points.add(1)
    for point, identity in zip(spline.points, [a, b]):
        location = anchors[identity].location
        point.co = (*location, 1)
    obj = bpy.data.objects.new(curve.name, curve)
    connections.objects.link(obj)
    obj['purpose'] = 'Source adjacency guide only; not a reconstructed traversable path'

image = bpy.data.objects.new('Exterior-only five-room concept - reference only', None)
image.empty_display_type, image.data = 'IMAGE', reference
image.empty_display_size = span
image.location = centre + Vector((span * 1.5, 0, 0))
image.rotation_euler = (1.57079632679, 0, 0)
references.objects.link(image)
references.hide_viewport = True

scene['scene_group'] = 'lower-ravine'
scene['source_rooms_json'] = json.dumps(list(source_rooms))
scene['source_connections'] = 'Inspect each source room region marker for exact exits; external regions are not modeled.'
scene['reference_sha256'] = hashlib.sha256((SCENE / 'exterior-concept-v2/reference.png').read_bytes()).hexdigest()
scene['geometry_status'] = 'Generated exterior review scene; five labeled regions share fused geometry; Tiny and Dreary interiors deferred'
notes = bpy.data.texts.new('READ ME - Lower Ravine Exterior')
notes.write('''LOWER RAVINE EXTERIOR - Tencent generated review scene

Five exterior source regions share the actual image-to-mesh reconstruction.
Tiny Room and Dreary Room interiors, shared door and puzzle objects are deferred.
The upper shelf has a dark entrance mouth only; no chamber interiors are embedded.
Source exit metadata includes deferred/external boundaries, not new gameplay.

Reference-projected colour is approximate on sides and back. This fused draft
requires manual passage, clearance, water and collision work before runtime use.
Authoring lighting does not override source darkness. The Marble Hall secret
connection must remain state-controlled and concealed. No runtime integration.

The source concept image is packed but hidden from renders. Review images show
actual generated mesh, not a reference image plane.
Tencent Hunyuan 3D 2.0 Community License applies to generated geometry.
''')

scene.render.engine = 'CYCLES'
scene.cycles.device, scene.cycles.samples, scene.cycles.use_denoising = 'CPU', 24, True
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1200, 800, 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
for label, view in views.items():
    scene.camera = view
    scene.render.filepath = str(OUTPUT / ('review-' + label + '.png'))
    bpy.ops.render.render(write_still=True)
scene.camera = views['overview']
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
for item in bpy.data.images:
    if item.type == 'IMAGE' and not item.packed_file:
        item.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'lower-ravine-v2.blend'))
for obj in scene.objects:
    obj.select_set(False)
for obj in meshes + list(anchors.values()) + [entrance]:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / 'lower-ravine-v2.glb'), export_format='GLB', use_selection=True, export_extras=True)
shutil.copy2(GENERATED / 'candidate.json', OUTPUT / 'generation.json')
for name in ['TENCENT-HUNYUAN-3D-2.0-LICENSE.txt', 'HUNYUAN-NOTICE.txt']:
    shutil.copy2(ROOT / 'src/prototype/assets' / name, OUTPUT / name)
report = {'format': 'zxr-blender-shared-scene-v1', 'blend': 'lower-ravine-v2.blend',
          'mesh': 'lower-ravine-v2.glb', 'rooms': list(source_rooms), 'deferredRooms': ['TINY-ROOM', 'DREARY-ROOM'],
          'entranceBoundary': {'node': entrance.name, 'destination': 'TINY-ROOM', 'positionBlender': list(entrance.location), 'interiorModeled': False},
          'boundsBlender': [list(lo), list(hi)], 'reviewViews': list(views),
          'renderer': 'Blender Cycles CPU, 24 samples',
          'markers': {identity: list(marker.location) for identity, marker in anchors.items()},
          'textureProjection': {'elevationDegrees': 35, 'image': '../exterior-concept-v2/reference.png', 'method': 'Planar reference projection including depth; hidden surfaces remain approximate'},
          'note': 'Renders show actual generated mesh; source concept is packed but hidden from render.'}
(OUTPUT / 'scene.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
