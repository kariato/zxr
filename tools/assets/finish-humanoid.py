"""Finish a reviewed SkinTokens humanoid tree with a small body-only clip set.

Requires the optional local Blender/SkinTokens authoring environment. Refuses
nonhumanoid or malformed trees rather than silently applying a princess rig.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Quaternion,Vector

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'out/asset-tools/assetfurnace/scripts'))
from kimodo_retarget import map_skintokens_to_soma

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('identity');args=parser.parse_args()
    catalog=json.loads((ROOT/'games/zork2/assets/catalog.json').read_text())
    entry=next(e for e in catalog['objects'] if e['sourceIdentity']==args.identity)
    if entry['route']!='image-mesh-humanoid-rig':raise ValueError('Not a humanoid rig task')
    directory=ROOT/'out/asset-production'/entry['id'];rigged=directory/'rigged.glb'
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(rigged))
    # Blender's glTF importer creates a hidden 42-vertex bone-display shape.
    # It is an editor helper, not an unweighted piece of the game character.
    helper_collection=bpy.data.collections.get('glTF_not_exported')
    if helper_collection:
        for helper in list(helper_collection.objects):bpy.data.objects.remove(helper,do_unlink=True)
    arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    parents={b.name:b.parent.name if b.parent else None for b in arm.data.bones}
    heads={b.name:np.array(b.head_local) for b in arm.data.bones}
    # Some valid predictions insert near-coincident pelvis helpers between hips
    # and both thighs. Normalize only this specific, spatially checked pattern.
    virtual=dict(parents);helpers=set();promoted=[]
    children=lambda name:[b for b,p in parents.items() if p==name]
    def low(name):return min([heads[name][2]]+[low(c) for c in children(name)])
    root=next(b for b,p in parents.items() if p is None)
    height=max(h[2] for h in heads.values())-min(h[2] for h in heads.values())
    down=[b for b in children(root) if low(b)<heads[root][2]-.15*height]
    if len(down)==1:
        branch=down[0];chain=[]
        while np.linalg.norm(heads[branch]-heads[root])<.15*height:
            chain.append(branch);kids=children(branch)
            if len(kids)==2 and all(low(c)<heads[root][2]-.25*height for c in kids) and abs(heads[kids[0]][0]-heads[kids[1]][0])>.05*height:
                promoted=kids;helpers=set(chain)
                for child in kids:virtual[child]=root
                for helper in helpers:virtual.pop(helper)
                break
            if len(kids)!=1:break
            branch=kids[0]
    mapping,frame=map_skintokens_to_soma(virtual,heads)
    print('Detected tree mapping:',mapping,flush=True)
    remove=helpers|{b for b,s in mapping.items() if 'Hand' in s and not s.endswith('Hand')}
    targets={}
    for name in remove:
        target=parents[name]
        while target in remove:target=parents[target]
        targets[name]=target
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    repaired=0;vertices=0
    for obj in meshes:
        original_normals={tuple(round(c,6) for c in obj.data.vertices[loop.vertex_index].co):tuple(obj.data.corner_normals[loop.index].vector) for loop in obj.data.loops}
        for name,target in targets.items():
            group=obj.vertex_groups.get(name)
            if group is None or target is None:continue
            dst=obj.vertex_groups.get(target) or obj.vertex_groups.new(name=target)
            for v in obj.data.vertices:
                for g in v.groups:
                    if g.group==group.index:dst.add([v.index],g.weight,'ADD')
            obj.vertex_groups.remove(group)
        for v in obj.data.vertices:
            vertices+=1
            weights=sorted([(g.group,g.weight) for g in v.groups if g.weight>1e-7],key=lambda g:-g[1])[:4]
            total=sum(w for _,w in weights)
            if total<=0:
                # Tiny disconnected reconstruction fragments occasionally receive
                # zero skin weights. Attach only these to the nearest rest-bone
                # segment, and report the repair; reject widespread weight loss.
                point=arm.matrix_world.inverted()@obj.matrix_world@v.co
                def distance(b):
                    delta=b.tail_local-b.head_local
                    t=max(0,min(1,(point-b.head_local).dot(delta)/max(delta.length_squared,1e-12)))
                    return (point-b.head_local-t*delta).length_squared
                nearest=min((b for b in arm.data.bones if b.name not in remove),key=distance)
                group=obj.vertex_groups.get(nearest.name) or obj.vertex_groups.new(name=nearest.name)
                weights=[(group.index,1)];total=1;repaired+=1
            for group in obj.vertex_groups:group.remove([v.index])
            for gi,w in weights:obj.vertex_groups[gi].add([v.index],w/total,'REPLACE')
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(obj.data);bm.free();obj.data.update()
        for p in obj.data.polygons:p.use_smooth=True
        # Preserve the reconstruction's smooth normals across welded UV seams.
        # Recomputing normals from the decimated cage can make broad robot panels
        # look dented even at the bind pose.
        obj.data.normals_split_custom_set([original_normals.get(tuple(round(c,6) for c in obj.data.vertices[loop.vertex_index].co),tuple(obj.data.vertices[loop.vertex_index].normal)) for loop in obj.data.loops])
    if repaired>vertices*.05:raise ValueError(f'Widespread skin-weight failure: {repaired}/{vertices} vertices')
    bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
    for child in promoted:
        arm.data.edit_bones[child].use_connect=False;arm.data.edit_bones[child].parent=arm.data.edit_bones[root]
    for name in remove:arm.data.edit_bones.remove(arm.data.edit_bones[name])
    bpy.ops.object.mode_set(mode='OBJECT')
    def turn(p,axis,angle):return Quaternion(p.bone.matrix_local.to_quaternion().inverted()@Vector(axis),angle)
    arm.animation_data_clear()
    for clip in ['idle','talk']:
        arm.animation_data_create();arm.animation_data.action=bpy.data.actions.new(clip)
        for f in range(1,122,4):
            t=(f-1)/120*math.tau
            for p in arm.pose.bones:
                s=mapping[p.name];p.rotation_mode='QUATERNION';q=Quaternion();side=1 if p.bone.head_local.x>0 else -1
                if s in ('LeftArm','RightArm'):
                    q=turn(p,(0,1,0),side*math.radians(15))
                    if clip=='talk':q=q@turn(p,(1,0,0),math.radians(5)*math.sin(t))
                elif s in ('LeftForeArm','RightForeArm'):q=turn(p,(1,0,0),math.radians(5 if clip=='idle' else 13+7*math.sin(t+side*.6)))
                elif s in ('Spine2','Chest'):q=turn(p,(1,0,0),math.radians(.5)*math.sin(t))
                elif s=='Head':q=turn(p,(0,0,1),math.radians(.6 if clip=='idle' else 1.5)*math.sin(t))
                p.rotation_quaternion=q;p.keyframe_insert(data_path='rotation_quaternion',frame=f,group=p.name)
        action=arm.animation_data.action;action.use_fake_user=True
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for key in fc.keyframe_points:key.interpolation='LINEAR'
        arm.animation_data.action=None
    for p in arm.pose.bones:p.rotation_quaternion=Quaternion()
    bpy.context.scene.render.fps=30;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=121
    output=directory/'animated.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_all_influences=False,export_morph=False)
    report={'format':'zxr-body-animation-v1','sourceIdentity':args.identity,'inputRigSha256':hashlib.sha256(rigged.read_bytes()).hexdigest(),
        'inputMeshSha256':json.loads((directory/'candidate.json').read_text())['sha256'],
        'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,'bones':len(arm.data.bones),'removedFingerBones':len(remove-helpers),'collapsedPelvisHelpers':sorted(helpers),
        'clips':['idle','talk'],'durationSeconds':4,'file':output.name,'review':'draft','publication':'US-only-local-prototype','repairedUnweightedVertices':repaired,
        'rigging':{'model':'VAST-AI/SkinTokens','revision':'79736cad0fd84de384d5eede659b4ebd24effe33','licence':'MIT','beamCount':5},
        'bodyMappingHelper':{'source':'AssetFurnace','revision':'418f63274d2fd03bc177ec75dd52b75dd31858e2','licence':'Apache-2.0'},
        'motion':'Authored procedural body gestures; no facial rig, lip-sync, walking or AI-generated motion.'}
    (directory/'animation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
