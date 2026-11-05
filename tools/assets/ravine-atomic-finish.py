"""Finish Tencent atomic ravine parts in Blender; retain raw inference unchanged.

Planar parts use bounded Tencent front relief and opaque reference projection.
Opening silhouettes come from the reference alpha, never a hidden back plate.
The boulder retains its volumetric Tencent mesh, decimated and UV baked.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import shutil
import time

import bpy
import bmesh
import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import (distance_transform_edt, gaussian_filter, label,
                           map_coordinates, median_filter)
from mathutils import Vector, Matrix
import modular_mesh_utils as utils

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('manifest', type=Path)
parser.add_argument('--wait-for-inputs', action='store_true')
parser.add_argument('--refresh-openings', action='store_true')
parser.add_argument('--refresh-boulder', action='store_true')
args = parser.parse_args()
BASE = args.manifest.resolve().parent
OUT = BASE / 'meshes'
OUT.mkdir(exist_ok=True)
manifest = json.loads(args.manifest.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
scene.render.bake.margin = 8
utils.configure(OUT)
parts = {}
records = json.loads((OUT/'verification.json').read_text()).get('parts', {}) if (OUT/'verification.json').exists() else {}


def select(obj):
    for o in scene.objects:
        o.select_set(o == obj)
    bpy.context.view_layer.objects.active = obj


def load_raw(path):
    previous = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [o for o in scene.objects if o not in previous and o.type == 'MESH']
    for o in scene.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    return obj


def material(name, color_path, normal_path=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .93
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(color_path)); tex.image.pack()
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal_path:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(normal_path))
        tex.image.colorspace_settings.name = 'Non-Color'; tex.image.pack()
        normal = nodes.new('ShaderNodeNormalMap')
        links.new(tex.outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def texture_boulder(obj, name, reference):
    """Bake pixel-level front projection, rather than interpolated vertex colour."""
    rgba = np.array(Image.open(reference).convert('RGBA'))
    yy, xx = np.where(rgba[:,:,3] > 200)
    image_path = OUT/f'{name}-projection.png'
    Image.fromarray(rgba[yy.min():yy.max()+1,xx.min():xx.max()+1,:3]).save(image_path)
    mat = bpy.data.materials.new(name+' projection source'); mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links; nodes.clear()
    coord = nodes.new('ShaderNodeTexCoord'); separate = nodes.new('ShaderNodeSeparateXYZ')
    combine = nodes.new('ShaderNodeCombineXYZ'); tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(image_path)); tex.image.pack(); tex.extension = 'EXTEND'
    links.new(coord.outputs['Generated'], separate.inputs[0])
    links.new(separate.outputs['X'], combine.inputs['X']); links.new(separate.outputs['Z'], combine.inputs['Y'])
    links.new(combine.outputs[0], tex.inputs['Vector'])
    geometry = nodes.new('ShaderNodeNewGeometry'); dot = nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = (0,-1,0); links.new(geometry.outputs['Normal'], dot.inputs[0])
    amount = nodes.new('ShaderNodeMath'); amount.operation = 'MULTIPLY'; amount.inputs[1].default_value = 1.3; amount.use_clamp = True
    links.new(dot.outputs['Value'], amount.inputs[0])
    mix = nodes.new('ShaderNodeMixRGB'); mix.inputs[1].default_value = (.16,.175,.18,1)
    links.new(amount.outputs[0], mix.inputs[0]); links.new(tex.outputs['Color'], mix.inputs[2])
    emit = nodes.new('ShaderNodeEmission'); output = nodes.new('ShaderNodeOutputMaterial')
    links.new(mix.outputs[0], emit.inputs[0]); links.new(emit.outputs[0], output.inputs[0])
    obj.data.materials.clear(); obj.data.materials.append(mat)
    for f in obj.data.polygons: f.material_index = 0
    select(obj)
    for other in scene.objects:
        if other.type == 'MESH': other.hide_render = other != obj
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.006)
    bpy.ops.object.mode_set(mode='OBJECT')
    atlas = bpy.data.images.new(name+' albedo',width=1024,height=1024,alpha=False)
    target = nodes.new('ShaderNodeTexImage'); target.image = atlas; nodes.active = target
    bpy.ops.object.bake(type='EMIT')
    atlas.filepath_raw = str(OUT/f'{name}-albedo.png'); atlas.file_format = 'PNG'; atlas.save(); atlas.pack()
    nodes.clear(); tex = nodes.new('ShaderNodeTexImage'); tex.image = atlas
    bsdf = nodes.new('ShaderNodeBsdfPrincipled'); bsdf.inputs['Roughness'].default_value = .93
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(tex.outputs['Color'],bsdf.inputs['Base Color']); links.new(bsdf.outputs[0],output.inputs[0])


def panel(raw, spec):
    name = spec['id']
    opening = spec['kind'] == 'opening'
    width, height = spec['sizeMetres'][:2]
    rgba = np.array(Image.open(BASE / spec['reference']).convert('RGBA'))
    # High alpha excludes the faint generated halos without changing the source.
    mask = rgba[:, :, 3] > 200
    sy, sx = np.where(mask)
    crop = rgba[sy.min():sy.max()+1, sx.min():sx.max()+1]
    mask = crop[:, :, 3] > 200
    if opening:
        regions, count = label(mask)
        areas = np.bincount(regions.ravel()); areas[0] = 0
        mask = regions == areas.argmax()
    else:
        mask[:] = True
    near = distance_transform_edt(~(crop[:, :, 3] > 200), return_distances=False, return_indices=True)
    rgb = crop[:, :, :3].copy()
    missing = crop[:, :, 3] <= 200
    rgb[missing] = rgb[tuple(near)][missing]
    color_path = OUT / f'{name}-color.png'
    Image.fromarray(rgb).resize((1024, 1024), Image.Resampling.LANCZOS).save(color_path)

    p = np.array([v.co[:] for v in raw.data.vertices])
    lo, hi = p.min(axis=0), p.max(axis=0)
    n = 512
    x = np.clip(np.rint((p[:, 0]-lo[0])/(hi[0]-lo[0])*(n-1)).astype(int), 0, n-1)
    y = np.clip(np.rint((p[:, 2]-lo[2])/(hi[2]-lo[2])*(n-1)).astype(int), 0, n-1)
    depth = np.full((n, n), -np.inf)
    np.maximum.at(depth, (y, x), -p[:, 1])
    missing = ~np.isfinite(depth)
    near = distance_transform_edt(missing, return_distances=False, return_indices=True)
    depth[missing] = depth[tuple(near)][missing]
    depth = gaussian_filter(median_filter(depth, size=9), 2)
    a, b = np.percentile(depth, [2, 98])
    relief = .065 if opening else (.018 if name in ['ledge-top', 'marble-floor', 'riverbed'] else .05)
    depth = np.clip((depth-a)/max(b-a, 1e-8), 0, 1)*relief
    # Fade the relief to zero at every silhouette edge; the rear stays planar.
    mask512 = np.flipud(np.array(Image.fromarray(mask).resize((n, n), Image.Resampling.NEAREST)))
    distance = distance_transform_edt(np.pad(mask512, 1))[1:-1, 1:-1]
    fade = np.clip(distance/12, 0, 1); fade = fade*fade*(3-2*fade)
    depth *= fade
    nx = 96 if opening else 48
    ny = max(24, round(nx*height/width))
    us, vs = np.meshgrid(np.linspace(0, 1, nx+1), np.linspace(0, 1, ny+1))
    z = map_coordinates(depth, [vs.ravel()*(n-1), us.ravel()*(n-1)], order=1).reshape(ny+1, nx+1)
    verts = np.column_stack([(us.ravel()-.5)*width, -z.ravel(), vs.ravel()*height])
    faces = []
    for j in range(ny):
        for i in range(nx):
            if opening:
                row = min(mask.shape[0]-1, int((1-(j+.5)/ny)*mask.shape[0]))
                col = min(mask.shape[1]-1, int((i+.5)/nx*mask.shape[1]))
                if not mask[row, col]:
                    continue
            a = j*(nx+1)+i; b = a+1; c = a+nx+1; d = c+1
            faces.extend([(a,b,c), (b,d,c)])
    counts = Counter(tuple(sorted((a,b))) for tri in faces for a,b in zip(tri, np.roll(tri,-1)))
    edges = [(a,b) for tri in faces for a,b in zip(tri,np.roll(tri,-1)) if counts[tuple(sorted((a,b)))] == 1]
    if opening:
        # Round off pixel-grid stepping without changing the flat mating back.
        neighbours = {}
        for a,b in edges:
            neighbours.setdefault(a,set()).add(b); neighbours.setdefault(b,set()).add(a)
        border = np.array(list(neighbours))
        assert all(len(v) == 2 for v in neighbours.values()), 'Pinched alpha silhouette'
        fixed_bottom = verts[:,2] < 1e-7
        for _ in range(5):
            previous = verts.copy()
            for a,near in neighbours.items():
                verts[a,[0,2]] = previous[a,[0,2]]*.35 + previous[list(near)][:,[0,2]].mean(axis=0)*.65
            verts[fixed_bottom,2] = 0
        verts[border,1] = 0
    nv = len(verts)
    rear = verts.copy(); rear[:, 1] = .16 if opening else .10
    all_verts = np.vstack([verts, rear])
    all_faces = faces + [tuple(nv+i for i in tri[::-1]) for tri in faces]
    for a,b in edges:
        all_faces.extend([(a,a+nv,b), (b,a+nv,b+nv)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(all_verts.tolist(), [], all_faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); scene.collection.objects.link(obj)
    select(obj)
    # Remove grid vertices unused by the cutout without moving the silhouette.
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(mesh); bm.free(); mesh.update()
    uv = mesh.uv_layers.new(name='Reference orthographic projection')
    for face in mesh.polygons:
        for loop in face.loop_indices:
            v = mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv = (v.x/width+.5, v.z/height)
        face.material_index = 0 if face.index < len(faces) else 1
    low = map_coordinates(z, [np.linspace(0, ny, n)[:,None]+np.zeros((n,n)),
                             np.linspace(0, nx, n)[None,:]+np.zeros((n,n))], order=1)
    dy, dx = np.gradient(depth-low, height/(n-1), width/(n-1))
    limit = np.maximum(1, np.sqrt(dx*dx+dy*dy)/.35)
    normal = np.stack([-dx/limit,-dy/limit,np.ones_like(dx)], axis=-1)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    normal_path = OUT/f'{name}-normal.png'
    Image.fromarray(np.flipud(np.clip((normal*.5+.5)*255,0,255).astype('uint8'))).save(normal_path)
    mesh.materials.append(material(name+' reference projection', color_path, normal_path))
    back = bpy.data.materials.new(name+' stone back and reveal'); back.diffuse_color = (.19,.21,.22,1)
    back.use_nodes = True; back.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.19,.21,.22,1)
    back.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    mesh.materials.append(back)
    bm = bmesh.new(); bm.from_mesh(mesh)
    closed = all(e.is_manifold for e in bm.edges); volume = bm.calc_volume(signed=True)
    bm.free()
    assert closed and volume > 0, (name, closed, volume)
    bpy.context.view_layer.update()
    rays = []
    if opening:
        for x in [-spec['opening'][0]*.25, 0, spec['opening'][0]*.25]:
            for h in [.1,.3,.5]:
                z = spec['opening'][1]*h
                hit,*_ = obj.ray_cast(Vector((x,-1,z)), Vector((0,1,0)), distance=2)
                rays.append({'x':x,'height':z,'clear':not hit})
        assert all(r['clear'] for r in rays), (name, rays)
    bpy.data.objects.remove(raw, do_unlink=True)
    return obj, {'finish':'Tencent front relief resampled into a shallow, flat-backed module; alpha silhouette for openings',
                 'closedManifold':closed,'positiveVolume':float(volume),'maxFrontRelief':relief,
                 'openingChecks':rays,'color':'1024px reference projection; opaque mesh material',
                 'normal':'512px residual Tencent relief normal; not learned texture paint',
                 'referenceMaskAlphaThreshold':200}


for spec in manifest['parts']:
    name = spec['id']
    raw_path = BASE/'raw'/f'{name}.glb'
    started = time.monotonic()
    while not (raw_path.exists() and raw_path.with_suffix('.json').exists()):
        if not args.wait_for_inputs:
            raise FileNotFoundError(raw_path)
        if time.monotonic()-started > 1800:
            raise TimeoutError(name)
        time.sleep(2)
    print('FINISH', name, flush=True)
    raw_hash = sha(raw_path)
    assert raw_hash == json.loads(raw_path.with_suffix('.json').read_text())['sha256']
    existing = OUT/f'{name}.glb'
    refresh = (args.refresh_openings and spec['kind'] == 'opening') or (args.refresh_boulder and spec['kind'] == 'object')
    if name in records and existing.exists() and not refresh:
        rec = records[name]
        assert rec['rawSourceSha256'] == raw_hash and rec['referenceSha256'] == sha(BASE/spec['reference'])
        assert rec['sha256'] == sha(existing), 'Existing finished asset changed'
        obj = load_raw(existing); obj.name = name; parts[name] = obj
        print('RESUME', name, flush=True)
        continue
    obj = load_raw(raw_path)
    if spec['kind'] == 'object':
        obj.name = name
        bm = bmesh.new(); bm.from_mesh(obj.data)
        remaining = set(bm.verts); components = []
        while remaining:
            seed = remaining.pop(); component = {seed}; stack = [seed]
            while stack:
                v = stack.pop()
                for e in v.link_edges:
                    other = e.other_vert(v)
                    if other in remaining:
                        remaining.remove(other); component.add(other); stack.append(other)
            components.append(component)
        components.sort(key=len,reverse=True)
        removed_components = len(components)-1
        bmesh.ops.delete(bm,geom=[v for group in components[1:] for v in group],context='VERTS')
        bm.to_mesh(obj.data); bm.free(); obj.data.update()
        lo, hi = utils.bounds(obj)
        target = Vector((spec['sizeMetres'][0],spec['sizeMetres'][1],spec['sizeMetres'][2]))
        centre = Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
        obj.data.transform(Matrix.Diagonal([target[i]/(hi[i]-lo[i]) for i in range(3)]+[1]) @ Matrix.Translation(-centre))
        select(obj)
        if len(obj.data.polygons)>6000:
            dec = obj.modifiers.new('Browser triangle budget','DECIMATE'); dec.ratio = 6000/len(obj.data.polygons)
            bpy.ops.object.modifier_apply(modifier=dec.name)
        bm = bmesh.new(); bm.from_mesh(obj.data)
        boundary = [e for e in bm.edges if e.is_boundary]
        holes_repaired = len(boundary)
        if boundary:
            bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        assert all(e.is_manifold for e in bm.edges), 'Boulder still has open or nonmanifold edges'
        bm.to_mesh(obj.data); bm.free()
        obj.data.update()
        texture_boulder(obj, name, BASE/spec['reference'])
        checks = {'finish':'Volumetric Tencent mesh decimated in Blender; pixel-level reference projection UV baked',
                  'removedDisconnectedRawComponents':removed_components,'repairedBoundaryEdges':holes_repaired,'closedManifold':True,
                  'hiddenSurfaces':'Neutral stone fallback; not unseen learned detail'}
    else:
        obj, checks = panel(obj, spec)
    obj['source'] = 'Tencent Hunyuan3D-2 turbo; reference-projected Blender finish'
    obj['raw_source_sha256'] = raw_hash
    obj['asset_pivot_description'] = 'bottom centre; Blender Z up, front -Y; GLB Y up, front +Z'
    output = OUT/f'{name}.glb'
    select(obj); obj.hide_render = False
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True, export_extras=True)
    assert sha(raw_path) == raw_hash
    records[name] = {**checks,'file':output.name,'bytes':output.stat().st_size,'sha256':sha(output),
                     'rawSourceSha256':raw_hash,'referenceSha256':sha(BASE/spec['reference']),
                     'triangles':sum(len(f.vertices)-2 for f in obj.data.polygons),'dimensionsMetres':list(obj.dimensions)}
    parts[name] = obj
    (OUT/'verification.json').write_text(json.dumps({'parts':records},indent=2)+'\n')
    print('DONE',name,records[name]['triangles'],flush=True)

# Staged independent kit, not an inferred final ravine assembly.
for i, spec in enumerate(manifest['parts']):
    obj = parts[spec['id']]; obj.location = ((i%4)*5.5, 0, -(i//4)*5)
    obj.hide_render = False
world = bpy.data.worlds.new('Neutral review'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.06,.075,.09,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6; scene.world = world
for name,pos,power,size in [('Key',(-5,-12,14),2500,12),('Fill',(20,-8,3),1800,10)]:
    data = bpy.data.lights.new(name,'AREA'); data.energy = power; data.size = size
    obj = bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location = pos
    obj.rotation_euler = (Vector((8,0,-3))-obj.location).to_track_quat('-Z','Y').to_euler()
data = bpy.data.cameras.new('Atomic kit review'); data.type = 'ORTHO'; data.ortho_scale = 25
cam = bpy.data.objects.new(data.name,data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (8.25,-35,-2.8); cam.rotation_euler = (Vector((8.25,0,-2.8))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x = 1600; scene.render.resolution_y = 1100; scene.render.resolution_percentage = 100
scene.cycles.samples = 16
bpy.data.orphans_purge(do_recursive=True)
blend = OUT/'ravine-atomic-kit.blend'; bpy.ops.wm.save_as_mainfile(filepath=str(blend))
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(OUT/'kit-preview.png')
bpy.ops.render.render(write_still=True)
for name in ['TENCENT-HUNYUAN-3D-2.0-LICENSE.txt','HUNYUAN-NOTICE.txt']:
    shutil.copy2(BASE/name, OUT/name)
report = {'parts':records,'blend':blend.name,'source':'Eleven independent local Tencent reconstructions',
          'scope':'Individual textured modular GLBs; staged kit only, no app or gameplay changes',
          'limitations':['Front reference projection; hidden faces use neutral stone.','Panel relief and backs are engineered; raw inference is retained.',
                         'Dimensions are authoring targets, not surveyed scene measurements.','Modules are not guaranteed seamless tiles.']}
(OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print('ELEVEN TEXTURED GLBS COMPLETE',flush=True)
