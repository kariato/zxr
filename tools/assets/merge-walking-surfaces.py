"""Merge read-only Tencent scenes with separate hidden floor guides in Blender."""
from pathlib import Path
import bpy,json,hashlib,struct,math
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'games/zork2/planning/walking-surfaces'
rooms=json.loads((OUT/'surfaces.json').read_text());record=json.loads((OUT/'verification.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
reports=[]
for source in record['inputs']:
 path=ROOT/source['asset'];assert sha(path)==source['sha256']
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path));scene=bpy.context.scene
 originals=[o for o in scene.objects if o.type=='MESH']
 def fingerprint():
  h=hashlib.sha256()
  for o in originals:
   for v in o.data.vertices:h.update(struct.pack('<3f',*v.co))
   for p in o.data.polygons:h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices))
   for uv in o.data.uv_layers:
    for v in uv.data:h.update(struct.pack('<2f',*v.uv))
  return h.hexdigest()
 before=fingerprint();floors=bpy.data.collections.new('Hidden walking planes - separate from Tencent');scene.collection.children.link(floors);floors.hide_render=True
 # Authoring display is wireframe only. Runtime consumes the same JSON support data.
 def loc(p):return (p[0],-p[2],p[1])
 for identity,data in rooms.items():
  if data['family']!=source['family']:continue
  origin=data['origin'];vertices=[loc([p[i]+origin[i] for i in range(3)]) for p in data['vertices']]
  mesh=bpy.data.meshes.new(identity+' walking surface');mesh.from_pydata(vertices,[],data['triangles']);mesh.update()
  o=bpy.data.objects.new(identity+' hidden floor',mesh);floors.objects.link(o);o.display_type='WIRE';o.show_wire=True;o.show_in_front=True;o.hide_render=True;o.color=(.1,1,.35,1);o['role']='walking_surface';o['source_room']=identity
  marker=bpy.data.objects.new(identity+' walking origin',None);floors.objects.link(marker);marker.location=loc(origin);marker.empty_display_type='ARROWS';marker.empty_display_size=.4
  # Normal eye-height inspection camera over the mapped original surface.
  camera=bpy.data.cameras.new(identity+' walking inspection');camera.lens=27;camera.clip_end=1000
  view=bpy.data.objects.new(camera.name,camera);scene.collection.objects.link(view);eye=Vector(loc([origin[0],origin[1]+1.6,origin[2]]));view.location=eye
  heading=data['heading'];direction=Vector(loc([-math.sin(heading),-.1,-math.cos(heading)]));view.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
  view['source_room']=identity;view['purpose']='Actual eye-height review; no artwork-view substitution'
  if scene.camera is None:scene.camera=view
 assert fingerprint()==before;assert sha(path)==source['sha256']
 scene['source_asset_sha256']=source['sha256'];scene['visual_mesh_unchanged']=True;scene['visual_uvs_unchanged']=True;scene['floor_data']='surfaces.json'
 for image in bpy.data.images:
  if image.type=='IMAGE' and not image.packed_file:image.pack()
 file=OUT/(source['family']+'-with-hidden-floors.blend');bpy.ops.wm.save_as_mainfile(filepath=str(file))
 reports.append({'family':source['family'],'blend':file.name,'sourceSha256':source['sha256'],'geometryAndUVFingerprint':before,'geometryAndUVsUnchanged':fingerprint()==before,'sourceAssetUnchanged':sha(path)==source['sha256'],'floorObjects':len([o for o in floors.objects if o.type=='MESH']),'floorObjectsRenderHidden':all(o.hide_render for o in floors.objects if o.type=='MESH')})
(OUT/'blender-verification.json').write_text(json.dumps(reports,indent=2)+'\n');print(json.dumps(reports),flush=True)
