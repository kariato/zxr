"""Apply reference-inspired gazebo finishes without changing reduced geometry."""
from pathlib import Path
import bpy, math, hashlib, struct, json
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'games/zork2/planning/scenes/underground-garden/modular-references-v1'
SOURCE = BASE / 'meshes-v2-reduced/garden-models-reduced-v2.blend'
OUT = BASE / 'gazebo-textured-v1'
OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
objects = [o for o in scene.objects if o.type == 'MESH']
def fingerprint():
    h = hashlib.sha256()
    for o in sorted(objects, key=lambda o:o.name):
        h.update(o.name.encode())
        for v in o.data.vertices: h.update(struct.pack('<3f', *v.co))
        for f in o.data.polygons: h.update(struct.pack('<'+'I'*len(f.vertices), *f.vertices))
        for row in o.matrix_world: h.update(struct.pack('<4f', *row))
    return h.hexdigest()
before = fingerprint()
gazebo = next(o for o in objects if o.name.startswith('gazebo -'))
points = [gazebo.matrix_world @ v.co for v in gazebo.data.vertices]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
center = (lo+hi)/2
height = hi.z-lo.z
color = gazebo.data.color_attributes.new(name='Reference finishes', type='FLOAT_COLOR', domain='CORNER')
for face in gazebo.data.polygons:
    for li in face.loop_indices:
        p = points[gazebo.data.loops[li].vertex_index]
        z = (p.z-lo.z)/height
        x, y = (p.x-center.x)/height, (p.y-center.y)/height
        theta = math.atan2(y,x)
        grain = .025*math.sin(x*430+y*121+z*170) + .015*math.sin(z*720+y*310)
        rgb = (.73+grain, .60+grain, .41+grain)
        if .695 < z < .965:
            row = int((z-.695)*42)
            course = ((z-.695)*42)%1
            joint = ((theta/(2*math.pi)*64)+(row%2)*.5)%1
            rib = abs(math.sin(theta*4)) < .065
            if not rib:
                variation = .035*math.sin(row*17+int(theta*10)*13)
                shade = .51 if course < .10 or joint < .055 else 1
                rgb = tuple(max(.015,c*shade+grain*.5+variation) for c in (.30,.16,.075))
        elif z < .19:
            mortar = ((z*30)%1 < .085) or ((theta/(2*math.pi)*18+int(z*30)*.5)%1 < .025)
            rgb = tuple(c*(.67 if mortar else 1)+grain for c in (.44,.35,.27))
        color.data[li].color = (*rgb,1)
mat = bpy.data.materials.new('Gazebo - ivory wood, brown shingles, warm stone')
mat.use_nodes = True
nodes = mat.node_tree.nodes
attr = nodes.new('ShaderNodeVertexColor'); attr.layer_name = color.name
bsdf = nodes.get('Principled BSDF')
mat.node_tree.links.new(attr.outputs['Color'],bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value=.87
# Evaluate courses per texture pixel, avoiding interpolation across coarse triangles.
links=mat.node_tree.links
def mathnode(op,a,b=None):
    n=nodes.new('ShaderNodeMath'); n.operation=op
    for i,v in enumerate([a,b] if b is not None else [a]):
        if isinstance(v,(int,float)): n.inputs[i].default_value=v
        else: links.new(v,n.inputs[i])
    return n.outputs[0]
geo=nodes.new('ShaderNodeNewGeometry')
xyz=nodes.new('ShaderNodeSeparateXYZ'); links.new(geo.outputs['Position'],xyz.inputs[0])
zn=mathnode('DIVIDE',mathnode('SUBTRACT',xyz.outputs['Z'],lo.z),height)
xx=mathnode('SUBTRACT',xyz.outputs['X'],center.x)
yy=mathnode('SUBTRACT',xyz.outputs['Y'],center.y)
angle=mathnode('ARCTAN2',yy,xx)
vec=nodes.new('ShaderNodeCombineXYZ')
links.new(mathnode('MULTIPLY',angle,4),vec.inputs['X'])
links.new(mathnode('MULTIPLY',zn,30),vec.inputs['Y'])
brick=nodes.new('ShaderNodeTexBrick'); links.new(vec.outputs[0],brick.inputs['Vector'])
brick.inputs['Scale'].default_value=1
brick.inputs['Color1'].default_value=(.28,.14,.065,1)
brick.inputs['Color2'].default_value=(.39,.23,.12,1)
brick.inputs['Mortar'].default_value=(.10,.045,.018,1)
brick.inputs['Mortar Size'].default_value=.018
brick.inputs['Brick Width'].default_value=.8; brick.inputs['Row Height'].default_value=.6
roof=mathnode('MULTIPLY',mathnode('GREATER_THAN',zn,.64),mathnode('LESS_THAN',zn,.965))
rib=mathnode('GREATER_THAN',mathnode('ABSOLUTE',mathnode('SINE',mathnode('MULTIPLY',angle,4))),.055)
roof=mathnode('MULTIPLY',roof,rib)
mix=nodes.new('ShaderNodeMixRGB'); links.new(roof,mix.inputs[0])
mix.inputs[1].default_value=(.73,.60,.41,1); links.new(brick.outputs['Color'],mix.inputs[2])
stone=nodes.new('ShaderNodeMixRGB'); links.new(mathnode('LESS_THAN',zn,.19),stone.inputs[0])
links.new(mix.outputs[0],stone.inputs[1]); stone.inputs[2].default_value=(.44,.35,.27,1)
links.new(stone.outputs[0],bsdf.inputs['Base Color'])
gazebo.data.materials.clear(); gazebo.data.materials.append(mat)
for face in gazebo.data.polygons: face.material_index=0
# Bake the reference-inspired finish into a portable, packed image texture.
bpy.ops.object.select_all(action='DESELECT'); gazebo.select_set(True)
bpy.context.view_layer.objects.active=gazebo
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(island_margin=.015); bpy.ops.object.mode_set(mode='OBJECT')
atlas=bpy.data.images.new('Gazebo reference finishes - 1024',width=1024,height=1024)
tex=nodes.new('ShaderNodeTexImage'); tex.image=atlas; nodes.active=tex
scene.render.engine='CYCLES'; scene.cycles.samples=1
scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False
scene.render.bake.use_pass_color=True; scene.render.bake.margin=8
bpy.ops.object.bake(type='DIFFUSE')
atlas.filepath_raw=str(OUT/'gazebo-basecolor.png'); atlas.file_format='PNG'; atlas.save(); atlas.pack()
mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
gazebo['finish_reference']='../gazebo.png and ../concept-low-hedges-v2/reference.png'
gazebo['texture_method']='Reference-inspired brown shingles, ivory ribs and framing, stone base; baked 1024 color atlas'
assert fingerprint()==before
scene.camera=bpy.data.objects['front']
scene.render.resolution_x=1920; scene.render.resolution_y=1080; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(OUT/'garden-gazebo-textured-1080p.png')
scene.cycles.samples=32
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'garden-gazebo-textured.blend'))
root=gazebo.parent; location=root.location.copy(); root.location=(0,0,0)
bpy.context.view_layer.update(); root.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'gazebo-textured.glb'),export_format='GLB',use_selection=True,export_extras=True)
root.location=location; bpy.context.view_layer.update()
assert fingerprint()==before
bpy.ops.render.render(write_still=True)
(OUT/'verification.json').write_text(json.dumps({'geometryAndPlacementUnchanged':True,'geometryFingerprint':before,'textureResolution':[1024,1024],'reviewResolution':[1920,1080],'reference':'../gazebo.png','method':'Reference-inspired procedural finish baked to UV atlas; approximate color/material match'},indent=2)+'\n')
print('GAZEBO TEXTURE COMPLETE',flush=True)
