"""Assemble isolated generated garden assets without welding or editing source meshes."""
from pathlib import Path
import bpy,math,json,hashlib,struct,time
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1'
SOURCE=BASE/'meshes-v1'; OUT=BASE/'blender-assembly-v1'; OUT.mkdir(exist_ok=True)
NAMES=['garden-shell','dragon','unicorn','serpent','dog','woman-violet','woman-rose','gazebo']
COLORS={'garden-shell':(.13,.19,.085),'dragon':(.48,.105,.045),'unicorn':(.75,.69,.52),'serpent':(.025,.085,.48),'dog':(.55,.29,.055),'woman-violet':(.29,.12,.34),'woman-rose':(.55,.17,.18),'gazebo':(.72,.66,.50)}
HEIGHTS={'dragon':4,'unicorn':3.4,'serpent':4.2,'dog':2.7,'woman-violet':3.0,'woman-rose':3.0,'gazebo':5.5}
UV={'dragon':(.38,.64),'unicorn':(.60,.65),'serpent':(.80,.57),'dog':(.87,.80),'woman-violet':(.90,.49),'woman-rose':(.95,.65),'gazebo':(.59,.24)}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
assembly=bpy.data.collections.new('GARDEN - separate editable assets'); scene.collection.children.link(assembly)
rig=bpy.data.collections.new('Review cameras and lights'); scene.collection.children.link(rig)
refs=bpy.data.collections.new('Packed image references - hidden from renders'); scene.collection.children.link(refs); refs.hide_render=True; refs.hide_viewport=True
roots={}; meshes={}; fingerprints={}; records=[]
def fingerprint(objects):
 h=hashlib.sha256()
 for obj in objects:
  for v in obj.data.vertices:h.update(struct.pack('<3f',*v.co))
  for p in obj.data.polygons:h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices))
 return h.hexdigest()
for name in NAMES:
 path=SOURCE/f'{name}.glb'
 while not (path.exists() and (SOURCE/f'{name}.json').exists()):
  print('WAITING FOR GENERATED ASSET',name,flush=True); time.sleep(10)
 before=set(scene.objects)
 bpy.ops.import_scene.gltf(filepath=str(path))
 imported=[o for o in scene.objects if o not in before and o.type=='MESH']; assert imported
 fingerprints[name]=fingerprint(imported)
 collection=bpy.data.collections.new(name.upper()+' - independent asset'); assembly.children.link(collection)
 root=bpy.data.objects.new(name+' - MOVE AND SCALE',None); collection.objects.link(root); root.empty_display_type='PLAIN_AXES'; root.empty_display_size=.6
 points=[o.matrix_world@v.co for o in imported for v in o.data.vertices]
 lo=Vector([min(p[i] for p in points) for i in range(3)]); hi=Vector([max(p[i] for p in points) for i in range(3)])
 pivot=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 for obj in imported:
  matrix=obj.matrix_world.copy()
  for owner in list(obj.users_collection):owner.objects.unlink(obj)
  collection.objects.link(obj); obj.parent=root; obj.matrix_world=matrix; obj.location-=pivot
  obj.name=name+' - original generated mesh'
  mat=bpy.data.materials.new(name+' - editable base color'); mat.use_nodes=True; mat.diffuse_color=(*COLORS[name],1)
  bsdf=mat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Base Color'].default_value=(*COLORS[name],1); bsdf.inputs['Roughness'].default_value=.82
  if name=='dog':bsdf.inputs['Metallic'].default_value=.35
  obj.data.materials.clear(); obj.data.materials.append(mat)
  for f in obj.data.polygons:f.material_index=0
  obj['source_glb']=str(path.relative_to(ROOT)); obj['geometry_editing']='none; positioning and scaling only'
 scale=30/(hi.x-lo.x) if name=='garden-shell' else HEIGHTS[name]/max(hi.z-lo.z,1e-6)
 root.scale=(scale,scale,scale); root['reference_image']=name+'.png'; root['instructions']='Move/scale this root to transform the entire asset. Mesh may also be selected separately.'
 roots[name]=root; meshes[name]=imported
 image=bpy.data.images.load(str(BASE/f'{name}.png')); image.pack()
 reference=bpy.data.objects.new(name+' - image reference',None); refs.objects.link(reference); reference.empty_display_type='IMAGE'; reference.data=image; reference.empty_display_size=8; reference.hide_render=True
 records.append({'name':name,'sourceSha256':sha(path),'geometryFingerprint':fingerprints[name],'scale':scale,'nativeBounds':[list(lo),list(hi)]})
 print('IMPORTED',name,flush=True)
bpy.context.view_layer.update()
# Ray-cast approximate image-space placements against the actual shell surface.
shellverts=[]; shellfaces=[]
for obj in meshes['garden-shell']:
 offset=len(shellverts); shellverts.extend(obj.matrix_world@v.co for v in obj.data.vertices); shellfaces.extend(tuple(i+offset for i in p.vertices) for p in obj.data.polygons)
bvh=BVHTree.FromPolygons(shellverts,shellfaces,all_triangles=True)
up=Vector((0,math.sin(math.radians(35)),math.cos(math.radians(35)))); forward=Vector((0,math.cos(math.radians(35)),-math.sin(math.radians(35))))
xmin=min(p.x for p in shellverts); xmax=max(p.x for p in shellverts); vmin=min(up.dot(p) for p in shellverts); vmax=max(up.dot(p) for p in shellverts)
for name,(u,v) in UV.items():
 p=Vector((xmin+u*(xmax-xmin),0,0))+up*(vmin+(1-v)*(vmax-vmin))
 location,normal,face,distance=bvh.ray_cast(p-forward*100,forward,200)
 if location is None:location=Vector((xmin+u*(xmax-xmin),(v-.5)*-20,1))
 roots[name].location=location+Vector((0,0,.06)); roots[name]['placement']='approximate reference-space placement; manually editable'
for r in records:
 r['location']=list(roots[r['name']].location); assert fingerprint(meshes[r['name']])==fingerprints[r['name']]
world=bpy.data.worlds.new('Neutral editing world'); world.use_nodes=True; world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45; world.node_tree.nodes['Background'].inputs['Color'].default_value=(.1,.12,.11,1); scene.world=world
bpy.context.view_layer.update(); points=[o.matrix_world@Vector(c) for group in meshes.values() for o in group for c in o.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)]); hi=Vector([max(p[i] for p in points) for i in range(3)]); center=(lo+hi)/2; span=max(hi-lo)
for name,offset,power in [('Key',(-1,-2,3),65),('Fill',(2,-1,2),35),('Rim',(0,2,2),45)]:
 data=bpy.data.lights.new(name,'AREA'); data.energy=span*span*power; data.size=span*1.5
 obj=bpy.data.objects.new(name,data); rig.objects.link(obj); obj.location=center+Vector(offset)*span; obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
for name,offset in [('front',(0,-2.2,1.54)),('side',(2.2,0,1.54))]:
 data=bpy.data.cameras.new(name);data.type='ORTHO';data.clip_end=span*100
 obj=bpy.data.objects.new(name,data);rig.objects.link(obj);obj.location=center+Vector(offset)*span;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
 rot=obj.rotation_euler.to_matrix();right=rot@Vector((1,0,0));upview=rot@Vector((0,1,0))
 w=max(right.dot(p) for p in points)-min(right.dot(p) for p in points);h=max(upview.dot(p) for p in points)-min(upview.dot(p) for p in points)
 data.ortho_scale=max(w,h*1.6)*1.1;scene.camera=obj;scene.render.filepath=str(OUT/f'review-{name}.png');bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects['front']
scene.unit_settings.system='METRIC';scene['status']='Separate generated modular draft; approximate placement, no image projection, no runtime integration'
notes=bpy.data.texts.new('START HERE - move and resize')
notes.write('Eight independently generated assets. Use the Outliner to select a named MOVE AND SCALE root; press G to move, S to resize, R to rotate. Each collection contains its original mesh, with vertices/faces preserved. Solid base colors only; no deceptive reference projection. Each reference image is packed in a hidden reference collection. Placement and sizes are approximate. Inspect gazebo openings, statue anatomy, grounds and undersides before use. No runtime changes.\n')
for obj in scene.objects:obj.select_set(False)
roots['dragon'].select_set(True);bpy.context.view_layer.objects.active=roots['dragon']
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.clip_end=1000;area.spaces.active.region_3d.view_distance=span*1.3;area.spaces.active.region_3d.view_location=center
   area.spaces.active.shading.type='MATERIAL'
blend=OUT/'garden-modular-editable-v1.blend';glb=OUT/'garden-modular-editable-v1.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for obj in scene.objects:obj.select_set(obj in roots.values() or any(obj in m for m in meshes.values()))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=False,export_extras=True)
for name in NAMES:assert fingerprint(meshes[name])==fingerprints[name]
blob=glb.read_bytes();n=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+n])
exported_triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
assert all(any(n['name']==name+' - MOVE AND SCALE' for n in doc['nodes']) for name in NAMES)
# Reopen the saved native file to verify all independent transform roots persist.
bpy.ops.wm.open_mainfile(filepath=str(blend))
assert all(name+' - MOVE AND SCALE' in bpy.data.objects for name in NAMES)
(OUT/'verification.json').write_text(json.dumps({'assets':records,'independentTransformRoots':8,'exportedTriangles':exported_triangles,'geometryUnchanged':True,'blendReopened':True,'referenceImagesPacked':8,'textureMethod':'solid editable material colors; no single-image projection','files':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in [blend,glb]},'limitations':['Inferred single-image geometry; review anatomy and hidden surfaces.','Approximate placements and sizes, editable by user.','Gazebo may have fused posts or railings.','No learned texture paint or runtime integration.']},indent=2)+'\n')
print('ASSEMBLY COMPLETE',exported_triangles,'triangles',flush=True)
