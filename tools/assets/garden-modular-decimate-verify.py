"""Verify saved reduction, surface deviation and export omissions independently."""
from pathlib import Path
import bpy,json,hashlib,struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1'
OUT=BASE/'blender-assembly-v3-reduced'
SOURCE=BASE/'blender-assembly-v2-textured/garden-modular-textured-v2.blend'
controls=OUT/'garden-decimation-controls-v3.blend';blend=OUT/'garden-modular-reduced-v3.blend';glb=OUT/'garden-modular-reduced-v3.glb'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(controls));report=[]
for obj in sorted([o for o in bpy.context.scene.objects if o.type=='MESH'],key=lambda o:o.name):
 obj.data.calc_loop_triangles();name=obj.name.split(' - ')[0];count=len(obj.data.vertices)
 sample=[obj.data.vertices[i].co.copy() for i in range(0,count,max(1,count//4096))]
 lo=Vector([min(v.co[i] for v in obj.data.vertices) for i in range(3)]);hi=Vector([max(v.co[i] for v in obj.data.vertices) for i in range(3)]);diag=(hi-lo).length
 evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());reduced=evaluated.to_mesh();reduced.calc_loop_triangles()
 verts=[v.co.copy() for v in reduced.vertices];tree=BVHTree.FromPolygons(verts,[tuple(p.vertices) for p in reduced.polygons],all_triangles=True)
 errors=sorted(tree.find_nearest(p)[3]/diag for p in sample)
 rlo=Vector([min(v[i] for v in verts) for i in range(3)]);rhi=Vector([max(v[i] for v in verts) for i in range(3)])
 errbounds=max(abs((rhi-rlo)[i]-(hi-lo)[i])/diag for i in range(3))
 tiny=sum(1 for p in reduced.polygons if p.area<1e-12*diag*diag)
 assert errors[int(.95*(len(errors)-1))]<=.0015 and max(errors)<=.0075 and errbounds<=.005
 report.append({'name':name,'originalVertices':count,'originalTriangles':len(obj.data.loop_triangles),'reducedVertices':len(reduced.vertices),'reducedTriangles':len(reduced.loop_triangles),'ratio':next(m.ratio for m in obj.modifiers if m.type=='DECIMATE'),'sampledVertices':len(sample),'surfaceError95PercentOfDiagonal':errors[int(.95*(len(errors)-1))]*100,'surfaceErrorMaxPercentOfDiagonal':max(errors)*100,'boundsChangePercentOfDiagonal':errbounds*100,'nearZeroAreaTriangles':tiny,'shapeTolerancePassed':True})
 evaluated.to_mesh_clear()
bpy.ops.wm.open_mainfile(filepath=str(blend))
assert len([o for o in bpy.context.scene.objects if o.type=='MESH'])==8
assert len([o for o in bpy.context.scene.objects if o.name.endswith(' - MOVE AND SCALE')])==8
native_counts={};native_samples={}
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':
  obj.data.calc_loop_triangles();name=obj.name.split(' - ')[0];native_counts[name]=len(obj.data.loop_triangles)
  coords=[v.co.copy() for v in obj.data.vertices];lo=Vector([min(v[i] for v in coords) for i in range(3)]);hi=Vector([max(v[i] for v in coords) for i in range(3)])
  native_samples[name]=(coords[::max(1,len(coords)//4096)],(hi-lo).length)
for r in report:assert native_counts[r['name']]==r['reducedTriangles']
blob=glb.read_bytes();n=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+n])
export_counts={}
for node in doc['nodes']:
 if 'mesh' in node:
  name=node['name'].split(' - ')[0];export_counts[name]=sum(doc['accessors'][p['indices']]['count']//3 for p in doc['meshes'][node['mesh']]['primitives'])
for r in report:
 omitted=r['reducedTriangles']-export_counts[r['name']]
 print('EXPORT CHECK',r['name'],'native',r['reducedTriangles'],'exported',export_counts[r['name']],'omitted',omitted,'tiny',r['nearZeroAreaTriangles'],flush=True)
 assert 0<=omitted<=max(10,r['reducedTriangles']*.001)
 r['exportedTriangles']=export_counts[r['name']];r['trianglesOmittedByExporter']=omitted
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb));reimported=0
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':
  obj.data.calc_loop_triangles();reimported+=len(obj.data.loop_triangles)
  name=obj.name.split(' - ')[0];sample,diag=native_samples[name]
  tree=BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices],[tuple(t.vertices) for t in obj.data.loop_triangles],all_triangles=True)
  error=max(tree.find_nearest(v)[3] for v in sample)/diag
  assert error<=.0001,(name,error)
  next(r for r in report if r['name']==name)['exportSurfaceMaxSampledErrorPercentOfDiagonal']=error*100
assert reimported==sum(export_counts.values())
assert len([o for o in bpy.context.scene.objects if o.name.endswith(' - MOVE AND SCALE')])==8
result={'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':sha(SOURCE),'sourceUnchanged':sha(SOURCE)==json.loads((SOURCE.parent/'verification.json').read_text())['sha256'],'method':'Curvature-weighted per-asset collapse decimation with adaptive sampled surface/bounds checks','meshes':report,'originalVertices':sum(r['originalVertices'] for r in report),'reducedVertices':sum(r['reducedVertices'] for r in report),'originalTriangles':sum(r['originalTriangles'] for r in report),'reducedTriangles':sum(r['reducedTriangles'] for r in report),'exportedTriangles':sum(export_counts.values()),'reimportedTriangles':reimported,'exporterTriangleOmissions':sum(r['trianglesOmittedByExporter'] for r in report),'independentAssets':8,'blendReopened':True,'files':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in [blend,glb,controls]},'limitations':['Export omits a small number of triangles; sampled reimport surface distance checked independently.','Surface error is sampled, not an exhaustive silhouette proof.','Fine details may be simplified; full source retained.','Existing shell image-projection limits remain.']}
assert result['sourceUnchanged']
(OUT/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print('VERIFIED',result['reducedVertices'],'vertices',result['reducedTriangles'],'native triangles',reimported,'exported triangles',flush=True)
