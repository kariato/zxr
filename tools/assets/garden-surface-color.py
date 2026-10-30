"""Replace view projection with spatially coherent vertex surface colors."""
from pathlib import Path
import bpy
import math
import json
import hashlib
import struct
from mathutils import Vector, noise
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden'
OUT=BASE/'surface-color-v1'
OUT.mkdir(exist_ok=True)
source=ROOT/'out/asset-production/underground-garden-v1/raw.glb'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_hash=sha(source)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH']
def fingerprint():
    h=hashlib.sha256()
    for obj in meshes:
        for v in obj.data.vertices: h.update(struct.pack('<3f',*v.co))
        for p in obj.data.polygons: h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices))
    return h.hexdigest()
before=fingerprint()
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
lo=Vector([min(p[i] for p in points) for i in range(3)])
hi=Vector([max(p[i] for p in points) for i in range(3)])
center=(lo+hi)/2; span=max(hi-lo)
zvalues=sorted(p.z for p in points)
# Bottommost outliers/undersides must not establish the garden path height.
ground=zvalues[int(len(zvalues)*.25)]
height=hi.z-ground
print('bounds',list(lo),list(hi),'ground',ground,flush=True)
def clamp(v): return max(0,min(1,v))
def blend(a,b,t): return tuple(a[i]*(1-t)+b[i]*t for i in range(3))
for obj in meshes:
    attr=obj.data.color_attributes.new(name='Garden surface color',type='FLOAT_COLOR',domain='POINT')
    for v in obj.data.vertices:
        p=obj.matrix_world@v.co
        h=(p.z-ground)/max(height,1e-6)
        # Texture detail is anchored in 3D position, never a camera plane.
        n=noise.noise(p/span*70)
        fine=noise.noise(p/span*260)
        coarse=noise.noise(p/span*12)
        nx=(p.x-center.x)/((hi.x-lo.x)/2)
        ny=(p.y-center.y)/((hi.y-lo.y)/2)
        radial=math.sqrt(nx*nx+ny*ny)
        upward=clamp(v.normal.z)
        raised=clamp((h-.035)/.16)
        outer=clamp((radial-.74)/.22)
        moss=blend((.035,.075,.018),(.115,.18,.042),clamp(.5+n*.55+fine*.2))
        stone=blend((.075,.09,.085),(.19,.205,.18),clamp(.5+n*.5+fine*.15))
        earth=blend((.19,.135,.075),(.39,.30,.18),clamp(.5+n*.4+fine*.12))
        surface=blend(earth,moss,raised)
        surface=blend(surface,stone,outer*clamp(.55+h*.7))
        # Undersides and steep base surfaces get rock rather than painted paths.
        if h < -.05: surface=blend(surface,stone,.85)
        if upward<.1 and raised<.25: surface=blend(surface,stone,.5)
        attr.data[v.index].color=(*surface,1)
    obj.data.color_attributes.active_color=attr
    mat=bpy.data.materials.new('Surface anchored garden materials')
    mat.use_nodes=True
    node=mat.node_tree.nodes.new('ShaderNodeVertexColor'); node.layer_name=attr.name
    bsdf=mat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value=.95
    mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
    obj.data.materials.clear(); obj.data.materials.append(mat)
    for face in obj.data.polygons: face.material_index=0
    obj['color_method']='Surface anchored vertex color, no reference image projection'
world=bpy.data.worlds.new('Neutral review studio'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.09,.09,.09,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.world=world
for name,offset,strength in [('Key',(-1,-2,3),65),('Fill',(2,-1,2),35),('Rim',(0,2,2),45)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=span*span*strength; data.size=span*1.5
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
    obj.location=center+Vector(offset)*span
    obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Rotation review'); data.type='ORTHO'; data.clip_end=span*100
cam=bpy.data.objects.new(data.name,data); scene.collection.objects.link(cam); scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=3840; scene.render.resolution_y=2160; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='JPEG'; scene.render.image_settings.quality=98
bounds=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
for degrees,offset in [(0,(0,-2.2,1.54)),(90,(2.2,0,1.54)),(180,(0,2.2,1.54))]:
    cam.location=center+Vector(offset)*span
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    rot=cam.rotation_euler.to_matrix(); right=rot@Vector((1,0,0)); up=rot@Vector((0,1,0))
    w=max(right.dot(p) for p in bounds)-min(right.dot(p) for p in bounds)
    h=max(up.dot(p) for p in bounds)-min(up.dot(p) for p in bounds)
    data.ortho_scale=max(w,h*3840/2160)*1.08
    scene.render.filepath=str(OUT/f'review-{degrees:03d}-4k.jpg')
    bpy.ops.render.render(write_still=True)
    print('RENDERED',degrees,flush=True)
for obj in scene.objects: obj.select_set(obj in meshes)
assert fingerprint()==before and sha(source)==source_hash
blendfile=OUT/'underground-garden-surface-color-v1.blend'
glb=OUT/'underground-garden-surface-color-v1.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blendfile))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=False,export_extras=True)
assert fingerprint()==before
blob=glb.read_bytes(); n=struct.unpack_from('<I',blob,12)[0]; doc=json.loads(blob[20:20+n])
primitives=[p for m in doc['meshes'] for p in m['primitives']]
assert all('COLOR_0' in p['attributes'] for p in primitives)
assert not doc.get('images') and not doc.get('textures')
triangles=sum(doc['accessors'][p['indices']]['count']//3 for p in primitives)
assert triangles==396214
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=str(glb))
check=0
for obj in bpy.context.scene.objects:
    if obj.type=='MESH':
        obj.data.calc_loop_triangles(); check+=len(obj.data.loop_triangles)
assert check==triangles
(OUT/'verification.json').write_text(json.dumps({'source':str(source.relative_to(ROOT)),'sourceSha256':source_hash,'sourceUnchanged':sha(source)==source_hash,'geometryUnchanged':True,'geometryFingerprint':before,'triangles':triangles,'reimportedTriangles':check,'colorMethod':'3D position/height/normal-based vertex colors; no image projection','hasVertexColors':True,'hasProjectedImages':False,'renderAngles':[0,90,180],'renderResolution':[3840,2160],'limitations':['Surface colors do not recover missing gazebo, topiary or path geometry.','Procedural material classification is approximate; no learned multiview paint.'],'files':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in [blendfile,glb]}},indent=2)+'\n')
