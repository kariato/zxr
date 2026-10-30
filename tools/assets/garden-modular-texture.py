"""Texture only the modular garden shell and retain separately editable props."""
from pathlib import Path
import bpy,math,json,hashlib,struct
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1'
SOURCE=BASE/'blender-assembly-v1/garden-modular-editable-v1.blend'
OUT=BASE/'blender-assembly-v2-textured';OUT.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_hash=sha(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
meshes=sorted([o for o in scene.objects if o.type=='MESH'],key=lambda o:o.name)
shell=[o for o in meshes if o.name.startswith('garden-shell -')]
assert shell

def fingerprint():
 h=hashlib.sha256()
 for obj in meshes:
  for v in obj.data.vertices:h.update(struct.pack('<3f',*v.co))
  for p in obj.data.polygons:h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices))
 return h.hexdigest()
before=fingerprint()
points=[o.matrix_world@v.co for o in shell for v in o.data.vertices]
up=Vector((0,math.sin(math.radians(35)),math.cos(math.radians(35))))
xmin=min(p.x for p in points);xmax=max(p.x for p in points)
vmin=min(up.dot(p) for p in points);vmax=max(up.dot(p) for p in points)
image=bpy.data.images.load(str(BASE/'garden-shell.png'),check_existing=True);image.pack()
mat=bpy.data.materials.new('Garden shell - projected reference color');mat.use_nodes=True
nodes=mat.node_tree.nodes
uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map='Garden reference projection - 35 degrees'
tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='EXTEND'
mat.node_tree.links.new(uvnode.outputs['UV'],tex.inputs['Vector'])
bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.95
mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
for obj in shell:
 uv=obj.data.uv_layers.new(name=uvnode.uv_map)
 for loop in obj.data.loops:
  p=obj.matrix_world@obj.data.vertices[loop.vertex_index].co
  uv.data[loop.index].uv=((p.x-xmin)/(xmax-xmin),(up.dot(p)-vmin)/(vmax-vmin))
 obj.data.materials.clear();obj.data.materials.append(mat)
 for face in obj.data.polygons:face.material_index=0
 obj['texture_method']='Single garden-only image projected at 35 degrees; side stretching remains possible'
assert fingerprint()==before
scene.render.resolution_x=3840;scene.render.resolution_y=2160;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=98
scene.cycles.samples=32
for name in ['front','side']:
 scene.camera=bpy.data.objects[name]
 # Increase horizontal framing when changing from the original 1.6 aspect.
 # Original fit already included enough vertical space; preserve it at 16:9.
 scene.camera.data.ortho_scale*= (3840/2160)/1.6
 scene.render.filepath=str(OUT/f'review-{name}-4k.jpg')
 if not Path(scene.render.filepath).exists(): bpy.ops.render.render(write_still=True)
 print('RENDER READY',name,flush=True)
scene.camera=bpy.data.objects['front']
scene['texture_method']='Garden shell only: projected color; props retain solid editable materials'
notes=bpy.data.texts['START HERE - move and resize']
notes.write('\nTextured revision: only the garden shell has a packed 35-degree garden-only reference projection. Separate props retain their original material colors. Projection can stretch on side/rear surfaces. Original assembly and geometry preserved.\n')
blend=OUT/'garden-modular-textured-v2.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
assert fingerprint()==before and sha(SOURCE)==source_hash
bpy.ops.wm.open_mainfile(filepath=str(blend))
scene=bpy.context.scene
meshes=sorted([o for o in scene.objects if o.type=='MESH'],key=lambda o:o.name)
assert fingerprint()==before
assert len([o for o in scene.objects if o.type=='EMPTY' and o.name.endswith(' - MOVE AND SCALE')])==8
(OUT/'verification.json').write_text(json.dumps({'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':source_hash,'sourceUnchanged':True,'geometryUnchanged':True,'geometryFingerprint':before,'independentAssets':8,'texturedAssets':['garden-shell'],'reference':'../garden-shell.png','referenceSha256':sha(BASE/'garden-shell.png'),'textureMethod':'35-degree single-image UV projection; not multiview paint','renderResolution':[3840,2160],'views':['front','side'],'file':blend.name,'bytes':blend.stat().st_size,'sha256':sha(blend)},indent=2)+'\n')
