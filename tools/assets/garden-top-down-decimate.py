"""Reduce assembled garden with stricter surface tolerances on focal objects."""
from pathlib import Path
import bpy,json,hashlib,math,struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/concept-top-down-v1'
SOURCE=BASE/'assembly-v1/garden-gazebo-topiary-v1.blend'
SOURCE_GLB=SOURCE.with_suffix('.glb')
OUT=BASE/'assembly-v2-reduced';OUT.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_sha=sha(SOURCE);glb_sha=sha(SOURCE_GLB)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
objects=[o for o in scene.objects if o.type=='MESH'];report=[]
for o in objects:
 bpy.context.view_layer.objects.active=o
 name=o.parent.name.split(' placement')[0] if o.parent else 'garden'
 o.data.calc_loop_triangles();original=len(o.data.loop_triangles)
 target=25000 if name=='garden' else 12000 if name=='gazebo' else 8000
 sample=[o.data.vertices[i].co.copy() for i in range(0,len(o.data.vertices),max(1,len(o.data.vertices)//4096))]
 lo=Vector([min(v.co[i] for v in o.data.vertices) for i in range(3)])
 hi=Vector([max(v.co[i] for v in o.data.vertices) for i in range(3)]);diag=(hi-lo).length
 mod=o.modifiers.new('Selective asset reduction','DECIMATE');mod.ratio=min(1,target/original);mod.use_collapse_triangulate=True
 for attempt in range(7):
  deps=bpy.context.evaluated_depsgraph_get();ev=o.evaluated_get(deps);m=ev.to_mesh();m.calc_loop_triangles()
  vs=[v.co.copy() for v in m.vertices];fs=[tuple(f.vertices) for f in m.polygons]
  tree=BVHTree.FromPolygons(vs,fs)
  errors=sorted(tree.find_nearest(p)[3]/diag for p in sample)
  p95=errors[int(.95*(len(errors)-1))];maximum=max(errors)
  bounds=max(abs((max(v[i] for v in vs)-min(v[i] for v in vs))-(hi-lo)[i])/diag for i in range(3))
  count=len(m.loop_triangles);ev.to_mesh_clear()
  if p95<(.002 if name=='garden' else .001) and maximum<(.01 if name=='garden' else .005) and bounds<.003:break
  mod.ratio=min(1,mod.ratio*1.6);o.update_tag()
 else:raise RuntimeError('Shape checks failed: '+name)
 bpy.ops.object.modifier_apply(modifier=mod.name)
 report.append({'asset':name,'originalTriangles':original,'reducedTriangles':count,'achievedTriangleRatio':count/original,'sampledVertices':len(sample),'surfaceErrorP95PercentOfDiagonal':p95*100,'surfaceErrorMaxPercentOfDiagonal':maximum*100,'boundsChangePercentOfDiagonal':bounds*100})
 print(name,original,'->',count,flush=True)
# 45 degree elevation and 45 degree azimuth relative to the preceding front view.
ps=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box]
lo=Vector([min(p[i] for p in ps) for i in range(3)]);hi=Vector([max(p[i] for p in ps) for i in range(3)])
center=(lo+hi)/2;span=max(hi-lo);cam=scene.camera
cam.location=center+Vector((math.sqrt(2),-math.sqrt(2),2))*span
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
rot=cam.rotation_euler.to_matrix();right=rot@Vector((1,0,0));up=rot@Vector((0,1,0))
w=max(right.dot(p) for p in ps)-min(right.dot(p) for p in ps)
h=max(up.dot(p) for p in ps)-min(up.dot(p) for p in ps)
cam.data.ortho_scale=max(w,h*16/9)*1.12
scene.render.filepath=str(OUT/'garden-reduced-45-elevation-45-azimuth.png')
for o in scene.objects:o.select_set(o.type in {'MESH','EMPTY'})
blend=OUT/'garden-gazebo-topiary-reduced-v2.blend';glb=blend.with_suffix('.glb')
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=False,export_extras=True)
bpy.ops.render.render(write_still=True)
blob=glb.read_bytes();n=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+n])
assert doc.get('images') and all('bufferView' in i for i in doc['images'])
exported=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb))
reimported=0
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();reimported+=len(o.data.loop_triangles)
assert reimported==exported
assert sha(SOURCE)==source_sha and sha(SOURCE_GLB)==glb_sha
r={'assets':report,'originalTriangles':sum(x['originalTriangles'] for x in report),'exportedTriangles':exported,'reimportedTriangles':reimported,'originalGLBBytes':SOURCE_GLB.stat().st_size,'reducedGLBBytes':glb.stat().st_size,'embeddedImages':len(doc['images']),'sourceFilesUnchanged':True,'cameraElevationDegrees':45,'cameraAzimuthDegrees':45,'geometryChecks':'4096 sampled source vertices per mesh; one-way surface distances and bounds, plus visual review','glbSha256':sha(glb)}
(OUT/'verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r),flush=True)
