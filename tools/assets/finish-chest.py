"""Split the generated closed chest into a hinged lid, hollow body and contents socket."""
import hashlib
import json
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
directory=ROOT/'out/asset-production/asset_chest'
record=json.loads((directory/'candidate.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(directory/'candidate.glb'))
original=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.ops.object.select_all(action='DESELECT');original.select_set(True);bpy.context.view_layer.objects.active=original
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
points=[original.matrix_world@Vector(p) for p in original.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
width,depth,height=hi-lo;cut=lo.z+height*.59
root=bpy.data.objects.new('asset_chest',None);bpy.context.collection.objects.link(root);root['sourceIdentity']='CHEST'
hinge=bpy.data.objects.new('chest_lid_hinge',None);bpy.context.collection.objects.link(hinge);hinge.parent=root;hinge.location=(0,lo.y+depth*.9,cut)
bpy.context.view_layer.update()
for name,lid in [('chest_body',False),('chest_lid',True)]:
    obj=bpy.data.objects.new(name,original.data.copy());bpy.context.collection.objects.link(obj);obj.matrix_world=original.matrix_world.copy()
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,0,cut),plane_no=(0,0,1),clear_inner=lid,clear_outer=not lid)
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    world=obj.matrix_world.copy();obj.parent=hinge if lid else root;obj.matrix_world=world
bpy.data.objects.remove(original,do_unlink=True)
inner=bpy.data.materials.new('dark_worn_inner_wood');inner.use_nodes=True
bsdf=inner.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.075,.041,.02,1);bsdf.inputs['Roughness'].default_value=.95
def board(name,location,scale,parent):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);obj=bpy.context.object;obj.name=name;obj.scale=scale;obj.data.materials.append(inner)
    bpy.context.view_layer.update()
    world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world
board('chest_inside_bottom',(0,(lo.y+hi.y)/2,lo.z+height*.1),(width*.78,depth*.74,height*.035),root)
for side in [-1,1]:
    board('chest_inside_side',(side*width*.39,(lo.y+hi.y)/2,lo.z+height*.33),(width*.025,depth*.76,height*.45),root)
    board('chest_inside_end',(0,(lo.y+hi.y)/2+side*depth*.37,lo.z+height*.33),(width*.8,depth*.025,height*.45),root)
board('chest_lid_underside',(0,(lo.y+hi.y)/2,cut+height*.008),(width*.8,depth*.78,height*.025),hinge)
contents=bpy.data.objects.new('contents',None);bpy.context.collection.objects.link(contents);contents.parent=root;contents.location=(0,(lo.y+hi.y)/2,lo.z+height*.17)
for clip,keys in [('idle',[(1,0),(121,0)]),('open',[(1,0),(31,-1.8),(121,-1.8)]),('close',[(1,-1.8),(31,0),(121,0)])]:
    hinge.animation_data_create();hinge.animation_data.action=bpy.data.actions.new(clip)
    for frame,angle in keys:hinge.rotation_euler.x=angle;hinge.keyframe_insert(data_path='rotation_euler',frame=frame)
    hinge.animation_data.action.use_fake_user=True;hinge.animation_data.action=None
hinge.rotation_euler.x=0
bpy.context.scene.render.fps=30;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=121
output=directory/'animated.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_extras=True)
report={'format':'zxr-prop-animation-v1','sourceIdentity':'CHEST','inputMeshSha256':record['sha256'],
    'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,'file':output.name,
    'clips':['idle','open','close'],'contentsNode':'contents','review':'draft','publication':'US-only-local-prototype',
    'finishing':'Generated exterior split into hollow base and hinged lid; procedural dark interior. Contents remain separate engine-controlled objects.'}
(directory/'animation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
