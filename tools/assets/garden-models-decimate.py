"""Create individually budgeted garden models without replacing earlier assets."""
from pathlib import Path
import bpy,json,hashlib,struct,shutil
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1'
SOURCE=BASE/'blender-assembly-v3-reduced/garden-modular-reduced-v3.blend'
OUT=BASE/'meshes-v2-reduced';OUT.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
originals={p.name:sha(p) for p in (BASE/'meshes-v1').glob('*.glb')}
source_hash=sha(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];rows=[]
for obj in objects:
 name=obj.name.split(' - ')[0];budget=60000 if name=='garden-shell' else 40000 if name=='gazebo' else 20000
 before=len(obj.data.vertices);obj.data.calc_loop_triangles();tris=len(obj.data.loop_triangles)
 sample=[v.co.copy() for v in obj.data.vertices][::max(1,before//4096)]
 lo=Vector([min(v.co[i] for v in obj.data.vertices) for i in range(3)]);hi=Vector([max(v.co[i] for v in obj.data.vertices) for i in range(3)]);diag=(hi-lo).length
 bpy.context.view_layer.objects.active=obj
 mod=obj.modifiers.new('Individual vertex budget','DECIMATE');mod.ratio=min(1,budget/before*.98);mod.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=mod.name)
 obj.data.validate(clean_customdata=True)
 for polygon in obj.data.polygons:polygon.use_smooth=True
 obj.data.update();obj.data.calc_loop_triangles()
 assert len(obj.data.vertices)<=budget,(name,len(obj.data.vertices),budget)
 tree=BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices],[tuple(t.vertices) for t in obj.data.loop_triangles],all_triangles=True)
 errors=sorted(tree.find_nearest(v)[3]/diag for v in sample)
 assert errors[int(.95*(len(errors)-1))]<.005 and max(errors)<.02,(name,max(errors))
 obj['geometry_editing']='Decimated to individual vertex budget; originals retained in meshes-v1'
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);obj.parent.select_set(True)
 # Keep assembled placement in the combined scene; export each model centered at its root.
 root=obj.parent;location=root.location.copy();root.location=(0,0,0);bpy.context.view_layer.update()
 path=OUT/(name+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True)
 root.location=location;bpy.context.view_layer.update()
 blob=path.read_bytes();doc=json.loads(blob[20:20+struct.unpack_from('<I',blob,12)[0]])
 exported_tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
 exported_vertices=sum(doc['accessors'][p['attributes']['POSITION']]['count'] for m in doc['meshes'] for p in m['primitives'])
 row=dict(name=name,previousVertices=before,vertices=len(obj.data.vertices),vertexBudget=budget,previousTriangles=tris,triangles=len(obj.data.loop_triangles),exportedVertices=exported_vertices,exportedTriangles=exported_tris,sampledSurfaceError95Percent=errors[int(.95*(len(errors)-1))]*100,sampledSurfaceErrorMaxPercent=max(errors)*100,sha256=sha(path))
 rows.append(row);print('REDUCED',row,flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'garden-models-reduced-v2.blend'))
for filename in ['HUNYUAN-NOTICE.txt','TENCENT-HUNYUAN-3D-2.0-LICENSE.txt']:shutil.copy2(BASE/'meshes-v1'/filename,OUT/filename)
# Reimport every standalone file and verify mesh counts and materials.
for row in rows:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/(row['name']+'.glb')))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(meshes)==1
 mesh=meshes[0];mesh.data.calc_loop_triangles();assert len(mesh.data.loop_triangles)==row['exportedTriangles'];assert mesh.data.materials
 row['reimportVerified']=True
assert sha(SOURCE)==source_hash
assert all(sha(BASE/'meshes-v1'/n)==h for n,h in originals.items())
(OUT/'verification.json').write_text(json.dumps(dict(originalsUnchanged=True,previousReducedSceneUnchanged=True,originalHashes=originals,meshes=rows,vertices=sum(r['vertices'] for r in rows),triangles=sum(r['triangles'] for r in rows)),indent=2)+'\n')
print('VERIFIED TOTAL',sum(r['vertices'] for r in rows),'vertices',flush=True)
