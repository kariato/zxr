"""Package the reviewed modular garden and resample its room walking floors."""
from pathlib import Path
import bpy, json, math, hashlib, shutil
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden'
SOURCE=BASE/'modular-references-v1/hedge-models-centered-v2/garden-centered-topiary.blend'
OUT=ROOT/'games/zork2/assets/scenes/underground-garden';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
objects=[o for o in scene.objects if o.type=='MESH']
shell=next(o for o in objects if o.name.startswith('garden-shell -'))
gazebo=next(o for o in objects if o.name.startswith('gazebo -'))
def tree(obj):return BVHTree.FromPolygons([obj.matrix_world@v.co for v in obj.data.vertices],[tuple(f.vertices) for f in obj.data.polygons])
shelltree=tree(shell);gazebotree=tree(gazebo)
cam=bpy.data.objects['front'];rot=cam.matrix_world.to_quaternion()
right=rot@Vector((1,0,0));up=rot@Vector((0,1,0));direction=rot@Vector((0,0,-1))
def screen(px,py):
 origin=cam.matrix_world.translation+right*((px/1920-.5)*cam.data.ortho_scale)+up*((.5-py/1080)*cam.data.ortho_scale/(1920/1080))
 hit,*_=shelltree.ray_cast(origin,direction,1000);assert hit is not None
 return hit
definitions={'GARDEN-NORTH':(screen(1070,390),1.2,1.2),'FORMAL-GARDEN':(screen(1054,547),1.4,1.4),'TOPIARY-ROOM':(screen(1007,813),1.4,1.4)}
gpoints=[gazebo.matrix_world@v.co for v in gazebo.data.vertices]
gx=(min(p.x for p in gpoints)+max(p.x for p in gpoints))/2
gy=(min(p.y for p in gpoints)+max(p.y for p in gpoints))/2
gz=min(p.z for p in gpoints)
definitions['GAZEBO-ROOM']=(Vector((gx,gy-.65,gz+.45)),.8,.8)
rooms={};positions={}
for room,(position,width,depth) in definitions.items():
 support=gazebotree if room=='GAZEBO-ROOM' else shelltree
 def sample(x,y,near):
  origin=Vector((x,y,near+.8))
  for _ in range(12):
   hit,normal,face,distance=support.ray_cast(origin,Vector((0,0,-1)),2)
   if hit is None:return None
   if abs(hit.z-near)<.7 and abs(normal.z)>.45:return hit.z
   origin=hit-Vector((0,0,.002))
  return None
 z=sample(position.x,position.y,position.z);assert z is not None,(room,list(position))
 position.z=z;positions[room]=position.copy()
 origin=[position.x,position.z,-position.y]
 nx=round(width/.1);nz=round(depth/.1);vertices=[];ids={}
 for iz in range(nz+1):
  for ix in range(nx+1):
   dx=(ix/nx-.5)*width;dz=(iz/nz-.5)*depth
   height=sample(position.x+dx,position.y-dz,z)
   if height is not None and abs(height-z)<.24:
    ids[ix,iz]=len(vertices);vertices.append([dx,height-z,dz])
 triangles=[]
 for iz in range(nz):
  for ix in range(nx):
   for corners in [[(ix,iz),(ix,iz+1),(ix+1,iz)],[(ix+1,iz),(ix,iz+1),(ix+1,iz+1)]]:
    if all(c in ids for c in corners):
     t=[ids[c] for c in corners];p=[Vector(vertices[i]) for i in t]
     if (p[1]-p[0]).cross(p[2]-p[0]).normalized().y>.65:triangles.append(t)
 assert len(triangles)>10,(room,len(triangles))
 rooms[room]={'origin':origin,'vertices':vertices,'triangles':triangles,'heading':0,'family':'garden'}
 print('ROOM',room,'origin',origin,'triangles',len(triangles),flush=True)
# Preserve the previously integrated cave panorama as the surrounding sky.
with bpy.data.libraries.load(str(BASE/'mesh-v2/underground-garden-v2.blend'),link=False) as (src,dst):
 dst.objects=['CAVE_GARDEN_SKYBOX']
sky=dst.objects[0];scene.collection.objects.link(sky)
sky['role']='skybox'
for material in sky.data.materials:
 nodes=material.node_tree.nodes;links=material.node_tree.links
 tex=next(n for n in nodes if n.type=='TEX_IMAGE')
 bsdf=nodes.new('ShaderNodeBsdfPrincipled');links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
 links.new(bsdf.outputs[0],nodes.get('Material Output').inputs['Surface'])
 material.use_backface_culling=True
objects.append(sky)
bpy.ops.object.select_all(action='DESELECT')
for o in objects:
 o.select_set(True)
 if o.parent:o.parent.select_set(True)
asset=OUT/'underground-garden-topiary-v3.glb'
bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',use_selection=True,export_extras=True)
# glTF unlit materials keep the panorama independent of room lighting.
import struct
blob=asset.read_bytes();length=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+length])
for material in doc['materials']:
 if material['name'] in [m.name for m in sky.data.materials]:material.setdefault('extensions',{})['KHR_materials_unlit']={}
doc.setdefault('extensionsUsed',[]).append('KHR_materials_unlit')
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=blob[20+length:]
asset.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
# Replace garden floors only; retain the existing ravine samples exactly.
floors=ROOT/'games/zork2/planning/walking-surfaces'
allrooms=json.loads((floors/'surfaces.json').read_text());allrooms.update(rooms)
(floors/'surfaces.json').write_text(json.dumps(allrooms,indent=2)+'\n')
ts=ROOT/'src/prototype/walking-surfaces.generated.ts'
ts.write_text('// Generated walking floors; garden updated by tools/assets/garden-runtime.py.\nexport interface WalkingSurface {origin:readonly [number,number,number];vertices:readonly (readonly [number,number,number])[];triangles:readonly (readonly [number,number,number])[];heading:number;family:string}\nexport const walkingSurfaces:Record<string,WalkingSurface>='+json.dumps(allrooms,separators=(',',':'))+';\n')
record=json.loads((floors/'verification.json').read_text())
record['inputs']=[r for r in record['inputs'] if r['family']!='garden']+[{'family':'garden','asset':str(asset.relative_to(ROOT)),'sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'visualGeometryChanged':False,'visualTextureChanged':False,'visualTriangles':sum(len(o.data.polygons) for o in objects)}]
record['method']='Garden: downward samples from reviewed modular shell and gazebo floor at 0.1 m spacing; slope and height filtering. Ravine samples retained.'
(floors/'verification.json').write_text(json.dumps(record,indent=2)+'\n')
def y_up(p):return [p.x,p.z,-p.y]
layout={'gazeboCenter':y_up(Vector((gx,gy,gz))),'overviewPosition':[0,12,16],'overviewTarget':[0,2,0]}
(ROOT/'src/prototype/garden-layout.generated.ts').write_text('// Generated by tools/assets/garden-runtime.py. Shared GLB Y-up coordinates.\nexport const gardenLayout='+json.dumps(layout)+' as const;\n')
for filename in ['HUNYUAN-NOTICE.txt','TENCENT-HUNYUAN-3D-2.0-LICENSE.txt']:shutil.copy2(BASE/'modular-references-v1/meshes-v2-reduced'/filename,OUT/filename)
(OUT/'scene.json').write_text(json.dumps({'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'asset':asset.name,'sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'rooms':list(rooms),'topiaryAssets':6,'gazeboScaleMultiplier':.6,'layout':layout,'triangles':sum(len(o.data.polygons) for o in objects),'textureMethod':'Garden shell reference projection; baked topiary color and normal maps; baked gazebo finish; embedded unlit cave panorama'},indent=2)+'\n')
print('RUNTIME GARDEN READY',asset.stat().st_size,flush=True)
