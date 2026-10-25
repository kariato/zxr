"""Assemble generated rock dressing around a practical, clearance-checked passage."""
from pathlib import Path
import hashlib
import json
import math
import bpy
import bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
directory=ROOT/'out/asset-production/barrow-natural-v1'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
root=bpy.data.objects.new('barrow_natural_experiment',None);bpy.context.collection.objects.link(root)
root['sourceRoom']='INSIDE-BARROW';root['noninteractiveDressing']=True

def imported(name):
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(directory/name/'candidate.glb'))
    objects=[o for o in bpy.context.scene.objects if o not in before and o.type=='MESH']
    assert len(objects)==1,(name,len(objects))
    obj=objects[0];obj.name=name;obj.parent=root;return obj

arch=imported('arch');arch.rotation_mode='XYZ';arch.rotation_euler=(0,0,math.pi)
arch.dimensions=(3.6,.75,3.05);arch.location=(0,-3.3,0)
bpy.context.view_layer.update();bpy.context.view_layer.objects.active=arch
bpy.ops.object.select_all(action='DESELECT');arch.select_set(True)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bm=bmesh.new();bm.from_mesh(arch.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(arch.data);bm.free();arch.data.update()
for polygon in arch.data.polygons:polygon.use_smooth=True

stone=arch.data.materials[0].copy();stone.name='reused_stone_tunnel';stone.use_nodes=True
stone.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1
dark=bpy.data.materials.new('unlit_far_end');dark.use_nodes=True
dark.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.002,.004,.003,1)
dark.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1

# An exact clearance cutter is independent of the generated silhouette.
section=[(-.96,-.15)]+[(math.cos(math.pi-i*math.pi/24)*.96,1.45+math.sin(math.pi-i*math.pi/24)*.96) for i in range(25)]+[(.96,-.15)]
def volume(name,outline,front,back):
    n=len(outline);vertices=[(x,y,z) for y in [front,back] for x,z in outline]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],[tuple(reversed(face)) for face in faces]);data.update();obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);return obj
cutter=volume('walk_clearance_cutter',section,-2.2,-4.3)
modifier=arch.modifiers.new('Preserve clear opening','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
bpy.context.view_layer.objects.active=arch
bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(cutter,do_unlink=True)

# A real corridor with a constant human-sized cross section, not a filled AI tunnel.
cross=[(-1.01,0)]+[(math.cos(math.pi-i*math.pi/24)*1.01,1.45+math.sin(math.pi-i*math.pi/24)*1.01) for i in range(25)]+[(1.01,0)]
vertices=[];faces=[];rings=7;n=len(cross)
for j in range(rings):
    for i,(x,z) in enumerate(cross):
        rough=.012*(1+math.sin(i*2.9+j*3.1))
        vertices.append((x+(math.copysign(rough,x) if abs(x)>.7 else 0),-3.3-j*5.5/(rings-1),z+(rough if z>1.45 else 0)))
for j in range(rings-1):
    for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
data=bpy.data.meshes.new('practical_tunnel');data.from_pydata(vertices,[],faces);data.materials.append(stone);data.update()
uv=data.uv_layers.new(name='UVMap')
for loop in data.loops:
    ring,index=divmod(loop.vertex_index,n);uv.data[loop.index].uv=(.04+.18*index/(n-1),.08+.84*ring/(rings-1))
tunnel=bpy.data.objects.new('practical_tunnel',data);bpy.context.collection.objects.link(tunnel);tunnel.parent=root
for polygon in data.polygons:polygon.use_smooth=True
end_data=bpy.data.meshes.new('far_end');end_data.from_pydata([(x,-8.82,z) for x,z in cross],[],[tuple(range(n))]);end_data.materials.append(dark);end_data.update()
end=bpy.data.objects.new('far_end',end_data);bpy.context.collection.objects.link(end);end.parent=root

templates={name:imported(name) for name in ['boulder','ledge']}
# Positions are outside the original six-metre-wide walking rectangle and leave
# the central south approach open. Templates are reused, not welded into one blob.
placements=[('boulder',(-3.2,1.9,-.10),(.8,.8,.8),.18),('ledge',(3.25,1.5,-.07),(1,1,1),-.2),
    ('ledge',(-3.2,-1.1,-.05),(.8,.85,.85),.6),('boulder',(3.3,-1.2,-.13),(.75,.8,.7),-.45),
    ('boulder',(-2.05,-3.55,-.15),(.7,.65,.75),.4),('ledge',(2.2,-3.6,-.08),(.75,.8,.8),-.3)]
for i,(name,location,scale,rotation) in enumerate(placements):
    obj=templates[name].copy();obj.data=templates[name].data;obj.name=f'boundary_{name}_{i}';bpy.context.collection.objects.link(obj);obj.parent=root
    obj.location=location;obj.scale=scale;obj.rotation_mode='XYZ';obj.rotation_euler=(0,0,math.pi+rotation)
for obj in templates.values():bpy.data.objects.remove(obj,do_unlink=True)

# A softly varied earth floor uses vertex colour, avoiding a new raster/skybox edit.
floor_mat=bpy.data.materials.new('barrow_earth');floor_mat.use_nodes=True
nodes=floor_mat.node_tree.nodes;colour=nodes.new('ShaderNodeVertexColor');colour.layer_name='earth'
floor_mat.node_tree.links.new(colour.outputs['Color'],nodes['Principled BSDF'].inputs['Base Color']);nodes['Principled BSDF'].inputs['Roughness'].default_value=1
vertices=[];faces=[];nx,ny=24,28
for j in range(ny+1):
    for i in range(nx+1):vertices.append((-4+i*8/nx,-4.5+j*9/ny,.001))
for j in range(ny):
    for i in range(nx):
        a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
data=bpy.data.meshes.new('earth_floor');data.from_pydata(vertices,[],faces);data.materials.append(floor_mat);data.update()
attribute=data.color_attributes.new(name='earth',type='FLOAT_COLOR',domain='POINT')
for i,(x,y,z) in enumerate(vertices):
    variation=1+.09*math.sin(x*1.9+y*.7)+.05*math.cos(y*2.7-x*.6)
    attribute.data[i].color=(.22*variation,.155*variation,.095*variation,1)
floor=bpy.data.objects.new('earth_floor',data);bpy.context.collection.objects.link(floor);floor.parent=root

bpy.context.view_layer.update()
# Test eye/head-height rays through the opening and almost the full corridor.
depsgraph=bpy.context.evaluated_depsgraph_get();clearance=[]
for x in [-.55,0,.55]:
    for z in [.2,1.6,1.85]:
        hit,location,normal,index,obj,matrix=bpy.context.scene.ray_cast(depsgraph,Vector((x,-2.5,z)),Vector((0,-1,0)),distance=6.15)
        clearance.append({'x':x,'height':z,'clear':not hit,'obstruction':obj.name if hit else None})
if not all(check['clear'] for check in clearance):raise RuntimeError('Tunnel clearance failed: '+json.dumps(clearance))

# Pack the unchanged skybox in the authoring .blend; the lightweight GLB contains
# the assembled physical dressing, while the game keeps its existing skybox.
world=bpy.data.worlds.new('Original barrow skybox');world.use_nodes=True;bpy.context.scene.world=world
environment=world.node_tree.nodes.new('ShaderNodeTexEnvironment');environment.image=bpy.data.images.load(str(ROOT/'src/prototype/assets/barrow-skybox-v1.png'));environment.image.pack()
world.node_tree.links.new(environment.outputs['Color'],world.node_tree.nodes['Background'].inputs['Color']);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
camera_data=bpy.data.cameras.new('Opening camera');camera=bpy.data.objects.new('Opening camera',camera_data);bpy.context.collection.objects.link(camera)
camera.location=(0,2.1,1.6);camera.rotation_euler=(Vector((0,-3.3,1.2))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.sensor_fit='VERTICAL';camera_data.sensor_height=24;camera_data.lens=24/(2*math.tan(math.radians(65/2)));bpy.context.scene.camera=camera
for image in bpy.data.images:
    if image.type=='IMAGE' and not image.packed_file:
        try:image.pack()
        except RuntimeError:pass
bpy.ops.wm.save_as_mainfile(filepath=str(directory/'barrow-natural-v1.blend'))
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for obj in root.children_recursive:obj.select_set(True)
output=directory/'barrow-natural-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=False,export_extras=True)
report={'format':'zxr-barrow-experiment-v1','sourceRoom':'INSIDE-BARROW','generatedPieces':['arch','boulder','ledge'],'rockInstances':len(placements),
    'assembly':'Blender 5.0.1','openingCameraMetres':[0,1.6,-2.1],'tunnelOpeningWidthMetres':1.92,'corridorLengthMetres':5.5,'clearance':clearance,
    'skybox':'src/prototype/assets/barrow-skybox-v1.png','skyboxSha256':hashlib.sha256((ROOT/'src/prototype/assets/barrow-skybox-v1.png').read_bytes()).hexdigest(),
    'glbBytes':output.stat().st_size,'glbSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'review':'local experiment','publication':'US-only prototype',
    'limitations':['Three-axis reference projection reuses stone grain; not learned multiview texturing.','Skybox remains separate in the game preview and is packed in the Blender file.','Clearance ray checks are geometric samples, not a headset playtest.']}
(directory/'assembly.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
