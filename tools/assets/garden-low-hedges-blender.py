"""Package the untouched shape in Blender and render honest untextured previews."""
from pathlib import Path
import hashlib
import json
import struct
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'games/zork2/planning/scenes/underground-garden/concept-low-hedges-v2/mesh-v1'
source = OUT / 'garden-low-hedges-v1.glb'
sha = lambda: hashlib.sha256(source.read_bytes()).hexdigest()
before_sha = sha()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']


def fingerprint():
    h = hashlib.sha256()
    for o in meshes:
        for v in o.data.vertices:
            h.update(struct.pack('<3f', *v.co))
        for p in o.data.polygons:
            h.update(struct.pack('<' + 'I' * len(p.vertices), *p.vertices))
        for uv in o.data.uv_layers:
            for value in uv.data:
                h.update(struct.pack('<2f', *value.uv))
    return h.hexdigest()


before = fingerprint()
geometry = bpy.data.collections.new('Tencent original - unedited shape')
scene.collection.children.link(geometry)
for o in meshes:
    for owner in list(o.users_collection):
        owner.objects.unlink(o)
    geometry.objects.link(o)
    o['geometry_postprocessing'] = 'none'
rig = bpy.data.collections.new('Review cameras and lights - separate')
scene.collection.children.link(rig)
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
center = (lo + hi) / 2
span = max(hi - lo)
world = bpy.data.worlds.new('Neutral review ambient')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.15, .15, .15, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
scene.world = world
for name, offset, power in [('Key', (-1, -2, 3), 70), ('Fill', (2, 0, 2), 35)]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.size = span * span * power, span * 2
    o = bpy.data.objects.new(name, light)
    rig.objects.link(o)
    o.location = center + Vector(offset) * span
    o.rotation_euler = (center - o.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1200, 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
views = [('front', (0, -2.2, 1.55)), ('side', (2.2, 0, 1.55)), ('back', (0, 2.2, 1.55))]
for name, offset in views:
    data = bpy.data.cameras.new(name)
    data.type, data.ortho_scale, data.clip_end = 'ORTHO', span * 1.65, span * 100
    o = bpy.data.objects.new(name, data)
    rig.objects.link(o)
    o.location = center + Vector(offset) * span
    o.rotation_euler = (center - o.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = o
    scene.render.filepath = str(OUT / ('review-' + name + '.png'))
    bpy.ops.render.render(write_still=True)
scene.camera = bpy.data.objects['front']
for o in scene.objects:
    o.select_set(False)
for o in meshes:
    o.select_set(True)
scene['source_glb_sha256'] = before_sha
scene['geometry_and_uv_fingerprint'] = before
scene['status'] = 'Untextured shape draft; native units; no sculpture separation, collision or runtime integration'
notes = bpy.data.texts.new('READ ME')
notes.write('Untouched Tencent shape imported from the sibling GLB. Native model units.\nNo decimation, cleanup, vertex editing or reference-image UV projection.\nReview cameras are authoring views only. No gameplay camera changes.\nInspect gazebo posts, low bushes and sculpture separation before integration.\n')
assert fingerprint() == before and sha() == before_sha
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'garden-low-hedges-v1.blend'))
(OUT / 'blender-verification.json').write_text(json.dumps({
    'sourceSha256': before_sha, 'geometryAndUVFingerprint': before,
    'geometryAndUVsUnchanged': fingerprint() == before,
    'sourceFileUnchanged': sha() == before_sha,
    'meshObjects': len(meshes), 'boundsBlenderNativeUnits': [list(lo), list(hi)],
    'reviewImages': ['review-front.png', 'review-side.png', 'review-back.png']}, indent=2) + '\n')
