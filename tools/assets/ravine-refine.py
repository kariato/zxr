"""Preserve Tencent's ravine artwork; refine side materials and authoring views."""
from pathlib import Path
import bpy, math, json, hashlib, shutil
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/lower-ravine';OUT=BASE/'mesh-v4';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'mesh-v2/lower-ravine-v2.blend'))
scene=bpy.context.scene
meshes=list(bpy.data.collections['Shared generated geometry'].objects)
# Original vertex positions and topology are an explicit preservation contract.
def geometry_hash():
 import struct
 h=hashlib.sha256()
 for obj in meshes:
  for v in obj.data.vertices:h.update(struct.pack('<3f',*v.co))
  for p in obj.data.polygons:h.update(struct.pack('<3I',*p.vertices))
 return h.hexdigest()
original_hash=geometry_hash()
up=Vector((0,math.sin(math.radians(35)),math.cos(math.radians(35))))
forward=Vector((0,math.cos(math.radians(35)),-math.sin(math.radians(35))))
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
centre=(lo+hi)/2;span=max(hi-lo);vmin=min(up.dot(p) for p in points);vmax=max(up.dot(p) for p in points)
# Only rear-facing surfaces lose the stretched scene photograph. Front faces
# keep their original reference material and UVs exactly.
rock=bpy.data.materials.new('Quiet rock on inferred rear surfaces');rock.use_nodes=True
rock.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1
image=bpy.data.images.load(str(ROOT/'games/zork2/assets/rooms/deep-ford/reference-v1.png'));image.pack()
tex=rock.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
rock.node_tree.links.new(tex.outputs['Color'],rock.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
changed=0;front_uv_hash=hashlib.sha256();preserved_uv_hash=hashlib.sha256()
for o in meshes:
 o.data.materials.append(rock);slot=len(o.data.materials)-1;uv=o.data.uv_layers.active
 rear_indices=set()
 inverse=o.matrix_world.inverted()
 for face in o.data.polygons:
  if face.normal.dot(-forward)>=-.12:continue
  center=o.matrix_world@face.center;origin=center-forward*span*2
  hit,point,normal,index=o.ray_cast(inverse@origin,inverse.to_3x3()@forward)
  visible=hit and (index==face.index or ((o.matrix_world@point)-center).length<.003)
  if not visible:rear_indices.add(face.index)
 for face in o.data.polygons:
  if face.index not in rear_indices:
   for index in face.loop_indices:
    front_uv_hash.update(str(tuple(uv.data[index].uv)).encode())
   continue
  face.material_index=slot;changed+=1
  # Sample one plain stone patch; do not repeat arches, objects or water.
  axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
  vertices=[o.data.vertices[o.data.loops[i].vertex_index].co for i in face.loop_indices]
  bounds=[min(p[k] for p in vertices) for k in axes];ext=[max(p[k] for p in vertices)-bounds[j] for j,k in enumerate(axes)]
  for index,p in zip(face.loop_indices,vertices):
   uv.data[index].uv=(.03+.11*(p[axes[0]]-bounds[0])/max(ext[0],.0001),.48+.16*(p[axes[1]]-bounds[1])/max(ext[1],.0001))
 for face in o.data.polygons:
  if face.index not in rear_indices:
   for index in face.loop_indices:preserved_uv_hash.update(str(tuple(uv.data[index].uv)).encode())
assert original_hash==geometry_hash()
assert front_uv_hash.hexdigest()==preserved_uv_hash.hexdigest()
# Keep the exact generated mesh; author walking guides as non-rendered proxies.
walk=bpy.data.collections.new('Walking guides - hidden from render');scene.collection.children.link(walk);walk.hide_render=True
rig=bpy.data.collections['Review lighting and cameras']
for light in rig.objects:
 if light.type=='LIGHT':
  if 'Moss' in light.name:light.name='Neutral authoring fill';light.data.color=(.82,.9,1)
  light.data.energy*=.8
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.025,.037,.045,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35

def surface(uv):
 x=lo.x+uv[0]*(hi.x-lo.x);vertical=vmin+(1-uv[1])*(vmax-vmin)
 target=Vector((x,0,0))+up*vertical;origin=target-forward*span*2
 hits=[]
 for o in meshes:
  inverse=o.matrix_world.inverted();found,p,n,f=o.ray_cast(inverse@origin,inverse.to_3x3()@forward)
  if found:hits.append(o.matrix_world@p)
 if not hits:raise RuntimeError('No generated surface at '+str(uv))
 return min(hits,key=lambda p:(p-origin).length)

def camera(name,target,width):
 data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=width;data.clip_end=span*20
 o=bpy.data.objects.new(name,data);rig.objects.link(o);o.location=target-forward*span*2
 o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler();return o
regions={'STREAM-PATH':(.84,.59),'MARBLE-HALL':(.36,.76),'DEEP-FORD':(.47,.49),'RAVINE-LEDGE':(.44,.33),'LEDGE-TUNNEL':(.15,.24)}
views={'overview':camera('Artwork preserved - overview',centre,span*1.58)};samples={}
for room,uv in regions.items():
 p=surface(uv);marker=next(o for o in bpy.data.collections[room].objects if o.type=='EMPTY');marker.location=p
 marker['status']='Surface-sampled authoring origin; collision clearance still requires runtime validation'
 # A small triangulated support patch follows four actual surface samples.
 corners=[surface((uv[0]+dx,uv[1]+dy)) for dx,dy in [(-.018,-.012),(.018,-.012),(.018,.012),(-.018,.012)]]
 mesh=bpy.data.meshes.new(room+' support patch');mesh.from_pydata([tuple(v) for v in corners],[],[(0,1,2),(0,2,3)]);mesh.update()
 guide=bpy.data.objects.new(room+' hidden floor guide',mesh);walk.objects.link(guide);guide.hide_render=True;guide.display_type='WIRE';guide['role']='authoring_collision_guide';guide['source_room']=room;guide['validated_for_runtime']=False
 views[room.lower()]=camera('Artwork preserved - '+room,p,span*(.49 if room=='MARBLE-HALL' else .45))
 samples[room]={'positionBlender':list(p),'supportCornersBlender':[list(v) for v in corners]}
views['entrance']=camera('Upper entrance only',surface((.49,.16)),span*.38)
# A mild rotated view honestly shows the actual mesh relief and inferred sides.
data=bpy.data.cameras.new('Slight angle - actual mesh');data.type='ORTHO';data.ortho_scale=span*1.65;data.clip_end=span*20
angle=bpy.data.objects.new(data.name,data);rig.objects.link(angle);angle.location=centre+Vector((.45,-2.2,1.54))*span;angle.rotation_euler=(centre-angle.location).to_track_quat('-Z','Y').to_euler();views['slight-angle']=angle
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1536;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
for label,camera_obj in views.items():
 scene.camera=camera_obj;scene.render.filepath=str(OUT/('review-'+label+'.png'));bpy.ops.render.render(write_still=True)
scene.camera=views['overview'];scene['revision']='Artwork-preserving material and view refinement; original Tencent geometry unchanged'
for o in scene.objects:o.select_set(False)
for o in meshes:o.select_set(True)
for collection in bpy.data.collections['Source rooms'].children:
 for o in collection.objects:
  if o.type=='EMPTY':o.select_set(True)
bpy.data.objects['TINY_ROOM_ENTRANCE_ONLY'].select_set(True)
for image in bpy.data.images:
 if image.type=='IMAGE' and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'lower-ravine-v4.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'lower-ravine-v4.glb'),export_format='GLB',use_selection=True,export_extras=True)
for name in ['TENCENT-HUNYUAN-3D-2.0-LICENSE.txt','HUNYUAN-NOTICE.txt']:shutil.copyfile(BASE/'mesh-v2'/name,OUT/name)
report={'status':'draft for visual review','geometryUnchanged':original_hash==geometry_hash(),'geometrySha256':original_hash,'frontMaterialUVsUnchanged':front_uv_hash.hexdigest()==preserved_uv_hash.hexdigest(),'rearFacesRepainted':changed,'viewpoints':samples,'renderViews':list(views),'deferredInteriors':['TINY-ROOM','DREARY-ROOM'],'entranceRetained':True,'collisionGuides':'Non-rendered surface samples; not validated runtime collision','limitations':['Original single-view relief geometry remains; rotation can reveal reconstruction distortion.','Preview cameras use the artwork projection angle, not first-person viewpoints.','No runtime integration or publication in this visual review pass.'],'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [OUT/'lower-ravine-v4.blend',OUT/'lower-ravine-v4.glb']}}
(OUT/'refinement.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
