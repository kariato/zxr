"""Reduce each modular garden asset with curvature weights and measured shape checks."""
from pathlib import Path
import bpy,bmesh,math,json,hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1'
SOURCE=BASE/'blender-assembly-v2-textured/garden-modular-textured-v2.blend'
OUT=BASE/'blender-assembly-v3-reduced';OUT.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_hash=sha(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
objects=sorted([o for o in scene.objects if o.type=='MESH'],key=lambda o:o.name)
ratios={'garden-shell':.10,'dragon':.15,'unicorn':.15,'serpent':.12,'dog':.12,'woman-violet':.15,'woman-rose':.15,'gazebo':.20}
report=[]
for obj in objects:
 name=obj.name.split(' - ')[0];print('START',name,flush=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.normal_update()
 group=obj.vertex_groups.new(name='Simplification weight - protect sharp detail')
 for vert in bm.verts:
  bend=max((edge.calc_face_angle(0) for edge in vert.link_edges if edge.is_manifold),default=math.pi)
  weight=max(.02,1-min(1,bend/math.radians(25)))
  if vert.is_boundary:weight=.005
  group.add([vert.index],weight,'REPLACE')
 bm.free()
 obj.data.calc_loop_triangles();original_triangles=len(obj.data.loop_triangles)
 original_vertices=len(obj.data.vertices)
 sample=[obj.data.vertices[i].co.copy() for i in range(0,original_vertices,max(1,original_vertices//4096))]
 lo=Vector([min(v.co[i] for v in obj.data.vertices) for i in range(3)])
 hi=Vector([max(v.co[i] for v in obj.data.vertices) for i in range(3)])
 diagonal=(hi-lo).length
 mod=obj.modifiers.new('Shape-preserving selective Decimate','DECIMATE');mod.decimate_type='COLLAPSE';mod.ratio=ratios[name]
 mod.vertex_group=group.name;mod.vertex_group_factor=1;mod.use_collapse_triangulate=True
 for attempt in range(4):
  deps=bpy.context.evaluated_depsgraph_get();evaluated=obj.evaluated_get(deps);reduced=evaluated.to_mesh();reduced.calc_loop_triangles()
  vertices=[v.co.copy() for v in reduced.vertices];faces=[tuple(p.vertices) for p in reduced.polygons]
  tree=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
  errors=sorted(tree.find_nearest(p)[3] for p in sample)
  p95=errors[int(.95*(len(errors)-1))]/diagonal;maximum=max(errors)/diagonal
  rlo=Vector([min(v[i] for v in vertices) for i in range(3)]);rhi=Vector([max(v[i] for v in vertices) for i in range(3)])
  bounds_error=max(abs((rhi-rlo)[i]-(hi-lo)[i])/diagonal for i in range(3))
  reduced_counts=(len(vertices),len(reduced.loop_triangles))
  evaluated.to_mesh_clear()
  if p95<=.0015 and maximum<=.0075 and bounds_error<=.005:break
  mod.ratio=min(.8,mod.ratio*1.65);obj.update_tag()
 else:raise RuntimeError('Cannot meet shape tolerance for '+name)
 report.append({'name':name,'originalVertices':original_vertices,'originalTriangles':original_triangles,'reducedVertices':reduced_counts[0],'reducedTriangles':reduced_counts[1],'ratio':mod.ratio,'sampledVertices':len(sample),'surfaceError95PercentOfDiagonal':p95*100,'surfaceErrorMaxPercentOfDiagonal':maximum*100,'boundsChangePercentOfDiagonal':bounds_error*100,'shapeTolerancePassed':True})
 print('DONE',name,original_triangles,'->',reduced_counts[1],'triangles','max error',round(maximum*100,4),'percent of diagonal',flush=True)
# Retain an adjustable high-resolution master, then apply reduction in a smaller editing file.
notes=bpy.data.texts['START HERE - move and resize']
notes.write('\nSelective reduction: curvature weights protect sharp bends and open boundaries. Every asset passed sampled surface-distance and bounds checks. Use the separate decimation-controls file to adjust ratios/weights; the reduced editing file has modifiers applied for faster manual transforms.\n')
controls=OUT/'garden-decimation-controls-v3.blend';bpy.ops.wm.save_as_mainfile(filepath=str(controls))
for obj in objects:
 bpy.context.view_layer.objects.active=obj
 mod=next(m for m in obj.modifiers if m.type=='DECIMATE')
 bpy.ops.object.modifier_apply(modifier=mod.name)
 obj.data.calc_loop_triangles()
 row=next(r for r in report if obj.name.startswith(r['name']+' -'))
 assert len(obj.data.loop_triangles)==row['reducedTriangles']
# Review from existing front/side views at the same framing as the textured scene.
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.cycles.samples=24
for view in ['front','side']:
 scene.camera=bpy.data.objects[view];scene.render.filepath=str(OUT/f'review-{view}.png');bpy.ops.render.render(write_still=True)
# Close-ups make gazebo openings and dragon wing silhouettes assessable.
for name in ['gazebo','dragon']:
 obj=next(o for o in objects if o.name.startswith(name+' -'))
 points=[obj.matrix_world@Vector(c) for c in obj.bound_box]
 lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);center=(lo+hi)/2;span=max(hi-lo)
 data=bpy.data.cameras.new(name+' reduction review');data.type='ORTHO';data.ortho_scale=span*1.9;data.clip_end=1000
 cam=bpy.data.objects.new(data.name,data);scene.collection.objects.link(cam);cam.location=center+Vector((.8,-2,1))*span;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.camera=cam;scene.render.filepath=str(OUT/f'review-{name}-close.png');bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects['front']
blend=OUT/'garden-modular-reduced-v3.blend';glb=OUT/'garden-modular-reduced-v3.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for obj in scene.objects:obj.select_set(obj.type=='MESH' or obj.name.endswith(' - MOVE AND SCALE'))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=False,export_extras=True)
assert sha(SOURCE)==source_hash
# Independently verify exported near-degenerate omissions and saved native scene.
import runpy
runpy.run_path(str(ROOT/'tools/assets/garden-modular-decimate-verify.py'),run_name='__main__')
