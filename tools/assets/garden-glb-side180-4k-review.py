"""Render the original garden inference at 4K without changing its geometry."""
from pathlib import Path
import bpy
import json
import hashlib
import struct
import math
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'games/zork2/planning/scenes/underground-garden/raw-review-4k/underground-garden-original-high-poly-color.glb'
out = ROOT / 'games/zork2/planning/scenes/underground-garden/raw-review-4k'
out.mkdir(exist_ok=True)
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
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
            h.update(struct.pack('<'+'I'*len(p.vertices), *p.vertices))
    return h.hexdigest()
before = fingerprint()
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
center = (lo+hi)/2
span = max(hi-lo)
world = bpy.data.worlds.new('Neutral studio')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.09,.09,.09,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
scene.world = world
for name, offset, strength in [('Key',(-1,-2,3),65),('Fill',(2,-1,2),35),('Rim',(0,2,2),45)]:
    d=bpy.data.lights.new(name,'AREA'); d.energy=span*span*strength; d.size=span*1.5
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o)
    o.location=center+Vector(offset)*span
    o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Original shape overview'); d.type='ORTHO'; d.clip_end=span*100
cam=bpy.data.objects.new(d.name,d); scene.collection.objects.link(cam)
cam.location=center+Vector((0,2.2,1.54))*span
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
rot=cam.rotation_euler.to_matrix()
right=rot@Vector((1,0,0)); up=rot@Vector((0,1,0))
width=max(right.dot(p) for p in points)-min(right.dot(p) for p in points)
height=max(up.dot(p) for p in points)-min(up.dot(p) for p in points)
d.ortho_scale=max(width,height*3840/2160)*1.08
scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.render.resolution_x=3840; scene.render.resolution_y=2160; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='JPEG'; scene.render.image_settings.quality=98
scene.render.filepath=str(out/'underground-garden-original-high-poly-color-side180-4k.jpg')
bpy.ops.render.render(write_still=True)
assert before==fingerprint()
assert source_hash==hashlib.sha256(source.read_bytes()).hexdigest()
triangles=0
for o in meshes:
    o.data.calc_loop_triangles(); triangles+=len(o.data.loop_triangles)
(out/'side180-verification.json').write_text(json.dumps({'source':str(source.relative_to(ROOT)),'sourceSha256':source_hash,'sourceUnchanged':True,'geometryUnchanged':True,'geometryFingerprint':before,'vertices':sum(len(o.data.vertices) for o in meshes),'triangles':triangles,'cameraAzimuthChangeDegrees':180,'resolution':[3840,2160],'format':'JPEG','texture':'existing embedded GLB projection, unchanged','image':'underground-garden-original-high-poly-color-side180-4k.jpg'},indent=2)+'\n')
print(triangles)
