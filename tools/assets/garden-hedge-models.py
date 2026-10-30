"""Shrink the gazebo and bake leafy topiary finishes onto six sculptures."""
from pathlib import Path
import bpy, hashlib, struct, json
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1'
SOURCE=BASE/'gazebo-textured-v1/garden-gazebo-textured.blend'
OUT=BASE/'hedge-models-v1'; OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE)); scene=bpy.context.scene
objects=[o for o in scene.objects if o.type=='MESH']
def geometry():
 h=hashlib.sha256()
 for o in sorted(objects,key=lambda o:o.name):
  for v in o.data.vertices:h.update(struct.pack('<3f',*v.co))
  for f in o.data.polygons:h.update(struct.pack('<'+'I'*len(f.vertices),*f.vertices))
 return h.hexdigest()
before=geometry()
transforms={o.name:[list(row) for row in o.matrix_world] for o in objects}
gazebo=next(o for o in objects if o.name.startswith('gazebo -'))
gazebo.parent.scale*=.6
bpy.context.view_layer.update()
names=['dragon','unicorn','serpent','dog','woman-violet','woman-rose']
scene.render.engine='CYCLES';scene.cycles.samples=1
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False
scene.render.bake.use_pass_color=True;scene.render.bake.margin=8
rows=[]
for name in names:
 obj=next(o for o in objects if o.name.startswith(name+' -'))
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 mat=bpy.data.materials.new(name+' - dense clipped hedge foliage');mat.use_nodes=True
 nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
 bsdf.inputs['Roughness'].default_value=.92
 bsdf.inputs['Metallic'].default_value=0
 coord=nodes.new('ShaderNodeTexCoord')
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=65;noise.inputs['Detail'].default_value=3;noise.inputs['Roughness'].default_value=.7
 links.new(coord.outputs['Generated'],noise.inputs['Vector'])
 ramp=nodes.new('ShaderNodeValToRGB')
 cr=ramp.color_ramp
 cr.elements.remove(cr.elements[1]);cr.elements[0].position=.22;cr.elements[0].color=(.008,.018,.003,1)
 for pos,col in [(.40,(.024,.055,.007,1)),(.53,(.065,.12,.014,1)),(.65,(.14,.21,.027,1)),(.80,(.25,.30,.06,1))]:cr.elements.new(pos).color=col
 links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],bsdf.inputs['Base Color'])
 leaf=nodes.new('ShaderNodeTexVoronoi');leaf.inputs['Scale'].default_value=100
 links.new(coord.outputs['Generated'],leaf.inputs['Vector'])
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.65;bump.inputs['Distance'].default_value=.035
 links.new(leaf.outputs['Distance'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
 obj.data.materials.clear();obj.data.materials.append(mat)
 for f in obj.data.polygons:f.material_index=0
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map=obj.data.uv_layers.active.name
 atlas=bpy.data.images.new(name+' hedge color',width=1024,height=1024)
 tex=nodes.new('ShaderNodeTexImage');tex.image=atlas;links.new(uv.outputs['UV'],tex.inputs['Vector']);nodes.active=tex
 bpy.ops.object.bake(type='DIFFUSE')
 atlas.filepath_raw=str(OUT/(name+'-hedge-basecolor.png'));atlas.file_format='PNG';atlas.save();atlas.pack()
 normal=bpy.data.images.new(name+' hedge normal',width=1024,height=1024);normal.colorspace_settings.name='Non-Color'
 nt=nodes.new('ShaderNodeTexImage');nt.image=normal;links.new(uv.outputs['UV'],nt.inputs['Vector']);nodes.active=nt
 bpy.ops.object.bake(type='NORMAL')
 normal.filepath_raw=str(OUT/(name+'-hedge-normal.png'));normal.file_format='PNG';normal.save();normal.pack()
 links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
 nm=nodes.new('ShaderNodeNormalMap');links.new(nt.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
 obj['texture_method']='Packed 1024 hedge color and tangent normal textures; geometry preserved'
 root=obj.parent;location=root.location.copy();root.location=(0,0,0);root.select_set(True);bpy.context.view_layer.update()
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'-hedge.glb')),export_format='GLB',use_selection=True,export_extras=True)
 root.location=location;bpy.context.view_layer.update()
 rows.append({'name':name,'textureSize':[1024,1024],'triangles':len(obj.data.polygons)})
 print('HEDGE READY',name,flush=True)
assert before==geometry()
for o in objects:
 if o!=gazebo:assert transforms[o.name]==[list(row) for row in o.matrix_world],o.name
scene.camera=bpy.data.objects['front'];scene.cycles.samples=32
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(OUT/'garden-hedge-models-1080p.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'garden-hedge-models.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:obj.select_set(True);obj.parent.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'garden-hedge-models.glb'),export_format='GLB',use_selection=True,export_extras=True)
bpy.ops.render.render(write_still=True)
(OUT/'verification.json').write_text(json.dumps({'geometryUnchanged':True,'geometryFingerprint':before,'gazeboScaleMultiplier':.6,'otherTransformsUnchanged':True,'hedgeAssets':rows,'previewResolution':[1920,1080]},indent=2)+'\n')
print('HEDGE SCENE COMPLETE',flush=True)
