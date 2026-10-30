"""Assemble existing textured gazebo and topiary on overhead Tencent garden."""
from pathlib import Path
import bpy,json,math,hashlib
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden'
CONCEPT=BASE/'concept-top-down-v1'
OUT=CONCEPT/'assembly-v1';OUT.mkdir(exist_ok=True)
MOD=BASE/'modular-references-v1'
bpy.ops.wm.open_mainfile(filepath=str(CONCEPT/'mesh-v1-textured/garden-top-down-textured-v1.blend'))
scene=bpy.context.scene
garden=[o for o in scene.objects if o.type=='MESH']
points=[o.matrix_world@v.co for o in garden for v in o.data.vertices]
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
center=(lo+hi)/2;size=hi-lo;span=max(size)
verts=[];faces=[]
for o in garden:
 offset=len(verts);verts.extend([o.matrix_world@v.co for v in o.data.vertices]);faces.extend([tuple(i+offset for i in f.vertices) for f in o.data.polygons])
tree=BVHTree.FromPolygons(verts,faces)
rows=[]
def place(name,path,x,y,width=None,height=None):
 old=set(scene.objects)
 bpy.ops.import_scene.gltf(filepath=str(path))
 imported=[o for o in scene.objects if o not in old]
 meshes=[o for o in imported if o.type=='MESH']
 # Preserve imported transforms while making each part independently placeable.
 for o in imported:
  m=o.matrix_world.copy();o.parent=None;o.matrix_world=m
 bpy.context.view_layer.update()
 ps=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
 low=Vector([min(p[i] for p in ps) for i in range(3)]);high=Vector([max(p[i] for p in ps) for i in range(3)])
 extent=high-low
 factor=width/max(extent.x,extent.y) if width else height/extent.z
 tx=center.x+x*size.x;ty=center.y+y*size.y
 hit=tree.ray_cast(Vector((tx,ty,hi.z+span)),Vector((0,0,-1)),span*3)[0]
 z=hit.z if hit else hi.z
 origin=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
 transform=Matrix.Translation(Vector((tx,ty,z+.002*span)))@Matrix.Scale(factor,4)@Matrix.Translation(-origin)
 root=bpy.data.objects.new(name+' placement',None);scene.collection.objects.link(root)
 for o in imported:
  o.matrix_world=transform@o.matrix_world
  m=o.matrix_world.copy();o.parent=root;o.matrix_world=m
 root['placement']='Central gazebo' if name=='gazebo' else 'Dedicated planted bed; paths left clear'
 rows.append({'name':name,'source':str(path.relative_to(ROOT)),'center':[tx,ty,z],'scaleFactor':factor})
 return meshes
allmeshes=list(garden)
allmeshes+=place('gazebo',MOD/'gazebo-textured-v1/gazebo-textured.glb',0,0,width=span*.145)
for name,x,y,h in [('dragon',-.27,-.19,.13),('unicorn',.27,-.19,.125),('serpent',.27,.19,.14),('dog',-.27,.19,.105),('woman-violet',-.12,.25,.12),('woman-rose',.12,-.25,.12)]:
 allmeshes+=place(name,MOD/f'hedge-models-v1/{name}-hedge.glb',x,y,height=span*h)
bpy.context.view_layer.update()
# Keep the same 45-degree elevation, framing the assembled scene including roofs.
ps=[o.matrix_world@Vector(c) for o in allmeshes for c in o.bound_box]
cam=scene.camera;rot=cam.rotation_euler.to_matrix();right=rot@Vector((1,0,0));up=rot@Vector((0,1,0))
minr,maxr=min(right.dot(p) for p in ps),max(right.dot(p) for p in ps)
minu,maxu=min(up.dot(p) for p in ps),max(up.dot(p) for p in ps)
cam.location+=right*((minr+maxr)/2-right.dot(center))+up*((minu+maxu)/2-up.dot(center))
cam.data.ortho_scale=max(maxr-minr,(maxu-minu)*16/9)*1.12
scene.render.filepath=str(OUT/'garden-gazebo-topiary-45-degree.png')
for o in scene.objects:o.select_set(o.type in {'MESH','EMPTY'})
blend=OUT/'garden-gazebo-topiary-v1.blend';glb=OUT/'garden-gazebo-topiary-v1.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_extras=True,export_apply=False)
bpy.ops.render.render(write_still=True)
blob=glb.read_bytes();import struct
n=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+n])
assert len(doc.get('images',[]))>=8
(OUT/'assembly.json').write_text(json.dumps({'placements':rows,'cameraElevationDegrees':45,'embeddedImages':len(doc['images']),'meshObjects':len(allmeshes),'sourceGardenGeometry':'unchanged','textureLimitations':'Garden retains overhead reference projection; steep outer sides stretch.'},indent=2)+'\n')
print('ASSEMBLY COMPLETE',flush=True)
