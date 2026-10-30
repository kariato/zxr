"""Texture raw Tencent geometry with the overhead reference and render at 45 degrees."""
from pathlib import Path
import bpy, math, json, hashlib, struct
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/concept-top-down-v1'
OUT=BASE/'mesh-v1-textured'; OUT.mkdir(exist_ok=True)
source=BASE/'mesh-v1/garden-top-down-v1.glb'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_sha=sha(source)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH']
def fingerprint():
    h=hashlib.sha256()
    for o in meshes:
        for v in o.data.vertices:h.update(struct.pack('<3f',*v.co))
        for f in o.data.polygons:h.update(struct.pack('<'+'I'*len(f.vertices),*f.vertices))
    return h.hexdigest()
before=fingerprint()
# Native inference is an XY relief with depth along Z. Blender glTF imports
# it as an XZ relief; rotate the objects to lay the garden on Blender XY.
from mathutils import Matrix
for o in meshes:o.matrix_world=Matrix.Rotation(-math.pi/2,4,'X')@o.matrix_world
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
lo=Vector([min(p[i] for p in points) for i in range(3)])
hi=Vector([max(p[i] for p in points) for i in range(3)])
center=(lo+hi)/2; span=max(hi-lo)
image=bpy.data.images.load(str(BASE/'reference.png'));image.pack()
mat=bpy.data.materials.new('Overhead garden reference texture');mat.use_nodes=True
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='EXTEND'
bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.95
mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
for o in meshes:
    o.data.materials.clear();o.data.materials.append(mat)
    uv=o.data.uv_layers.new(name='Overhead XY projection')
    for loop in o.data.loops:
        p=o.matrix_world@o.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=((p.x-lo.x)/(hi.x-lo.x),(p.y-lo.y)/(hi.y-lo.y))
    for face in o.data.polygons:face.material_index=0
    o['texture_method']='Single-image overhead planar projection; side/underside colors approximate'
world=bpy.data.worlds.new('Neutral studio');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.12,.12,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5;scene.world=world
for name,offset,power in [('Key',(-1,-2,3),65),('Fill',(2,1,3),45)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=span*span*power;d.size=span*2
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=center+Vector(offset)*span
    o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Garden 45 degree elevation');d.type='ORTHO';d.clip_end=100
cam=bpy.data.objects.new(d.name,d);scene.collection.objects.link(cam)
cam.location=center+Vector((0,-2,2))*span
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
bounds=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
rot=cam.rotation_euler.to_matrix();right=rot@Vector((1,0,0));up=rot@Vector((0,1,0))
w=max(right.dot(p) for p in bounds)-min(right.dot(p) for p in bounds)
h=max(up.dot(p) for p in bounds)-min(up.dot(p) for p in bounds)
d.ortho_scale=max(w,h*16/9)*1.12
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.view_settings.view_transform='Standard'
scene.render.resolution_x=2560;scene.render.resolution_y=1440;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'garden-45-degree.png')
scene['texture_limitation']='Overhead single-image projection; not learned multiview texture painting'
for o in scene.objects:o.select_set(o in meshes)
blend=OUT/'garden-top-down-textured-v1.blend';glb=OUT/'garden-top-down-textured-v1.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=False,export_extras=True)
assert fingerprint()==before and sha(source)==source_sha
bpy.ops.render.render(write_still=True)
blob=glb.read_bytes();n=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+n])
assert doc.get('images') and all('bufferView' in i for i in doc['images'])
triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
assert triangles==809993
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb))
count=0
for o in bpy.context.scene.objects:
    if o.type=='MESH':o.data.calc_loop_triangles();count+=len(o.data.loop_triangles)
assert count==triangles
(OUT/'verification.json').write_text(json.dumps({'sourceSha256':source_sha,'sourceUnchanged':sha(source)==source_sha,'localGeometryUnchanged':True,'geometryFingerprint':before,'orientation':'Rigid rotation to horizontal XY in Blender, Y-up GLB','textureMethod':'Overhead reference planar UV projection','embeddedImages':len(doc['images']),'triangles':triangles,'reimportedTriangles':count,'cameraElevationDegrees':45,'resolution':[2560,1440],'files':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in [blend,glb,OUT/'garden-45-degree.png']}},indent=2)+'\n')
print('DONE',flush=True)
