"""Reusable Blender UV-bake helpers for independently generated modular pieces."""
from pathlib import Path
import math
import bpy
import numpy as np
from mathutils import Vector, noise

OUT = None
scene = None

def configure(output):
    global OUT, scene
    OUT = Path(output)
    scene = bpy.context.scene

def select_only(obj):
    for o in scene.objects: o.select_set(o == obj)
    bpy.context.view_layer.objects.active = obj

def bounds(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])

def texture(obj, name, image_path, elevation, resolution):
    select_only(obj)
    for other in scene.objects:
        if other.type == 'MESH': other.hide_render = other != obj
    lo, hi = bounds(obj); span = max(hi-lo)
    up = Vector((0,math.sin(elevation),math.cos(elevation)))
    front = Vector((0,-math.cos(elevation),math.sin(elevation)))
    projections = [up.dot(v.co) for v in obj.data.vertices]
    vmin,vmax = min(projections),max(projections)
    image = bpy.data.images.load(str(image_path)); w,h = image.size
    values = np.empty(w*h*4,dtype=np.float32); image.pixels.foreach_get(values); values = values.reshape(h,w,4)
    if np.min(values[:,:,3]) < .5:
        mask = values[:,:,3] > .5
    else:
        corner = np.median(np.concatenate([values[:16,:16,:3].reshape(-1,3),values[-16:,-16:,:3].reshape(-1,3)]),axis=0)
        mask = np.max(np.abs(values[:,:,:3]-corner),axis=2) > .06
    yy,xx = np.where(mask); xmin,xmax,ymin,ymax = xx.min(),xx.max(),yy.min(),yy.max()
    image.pack()
    colour = obj.data.color_attributes.new(name='Bake source',type='FLOAT_COLOR',domain='POINT')
    for v in obj.data.vertices:
        p = v.co
        u = (p.x-lo.x)/(hi.x-lo.x); t = (up.dot(p)-vmin)/(vmax-vmin)
        c = values[min(ymax,max(ymin,round(ymin+t*(ymax-ymin)))),min(xmax,max(xmin,round(xmin+u*(xmax-xmin))))]
        n = noise.noise(p/span*40)
        stone = np.array((.16,.175,.18))*(1+n*.2)
        facing = max(0,v.normal.dot(front)); amount = min(.97,facing*1.3)*float(c[3])
        # Regular PNG image pixels are stored sRGB; vertex colours are scene-linear.
        reference_linear = np.where(c[:3]<=.04045,c[:3]/12.92,((c[:3]+.055)/1.055)**2.4)
        rgb = stone*(1-amount)+reference_linear*amount
        colour.data[v.index].color = (*rgb,1)
    material = bpy.data.materials.new(name+' baked material'); material.use_nodes = True
    nodes,links = material.node_tree.nodes,material.node_tree.links; nodes.clear()
    source = nodes.new('ShaderNodeVertexColor'); source.layer_name = colour.name
    emit = nodes.new('ShaderNodeEmission'); output = nodes.new('ShaderNodeOutputMaterial')
    links.new(source.outputs['Color'],emit.inputs['Color']);links.new(emit.outputs[0],output.inputs['Surface'])
    obj.data.materials.clear();obj.data.materials.append(material)
    for f in obj.data.polygons: f.material_index = 0
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    atlas = bpy.data.images.new(name+' albedo',width=resolution,height=resolution,alpha=False)
    target = nodes.new('ShaderNodeTexImage');target.image = atlas;nodes.active = target
    print('BAKE',name,flush=True);bpy.ops.object.bake(type='EMIT')
    atlas.filepath_raw = str(OUT/f'{name}-albedo.png');atlas.file_format='PNG';atlas.save();atlas.pack()
    nodes.clear();tex=nodes.new('ShaderNodeTexImage');tex.image=atlas
    bsdf=nodes.new('ShaderNodeBsdfPrincipled');bsdf.inputs['Roughness'].default_value=.9
    output=nodes.new('ShaderNodeOutputMaterial');links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);links.new(bsdf.outputs[0],output.inputs['Surface'])
    for a in list(obj.data.color_attributes):obj.data.color_attributes.remove(a)
