"""Blend the generated barrow dressing into earth and continuous rock surfaces.

Produces a separate v2 authoring file and GLB; leaves the v1 experiment intact.
"""
from pathlib import Path
import hashlib
import json
import math
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'out/asset-production/barrow-natural-v1'
OUTPUT = ROOT / 'out/asset-production/barrow-natural-v2'
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'barrow-natural-v1.blend'))
scene = bpy.context.scene
root = bpy.data.objects['barrow_natural_experiment']
root.name = 'barrow_blended_experiment'
root['revision'] = 'blended-v2'
rng = np.random.default_rng(2718)


def noise(size, cells):
    """Periodic smooth value noise for small, baked, code-native textures."""
    grid = rng.random((cells, cells))
    coord = np.arange(size) * cells / size
    lo = np.floor(coord).astype(int)
    f = coord - lo
    f = f * f * (3 - 2 * f)
    a = grid[lo[:, None] % cells, lo[None, :] % cells]
    b = grid[lo[:, None] % cells, (lo[None, :] + 1) % cells]
    c = grid[(lo[:, None] + 1) % cells, lo[None, :] % cells]
    d = grid[(lo[:, None] + 1) % cells, (lo[None, :] + 1) % cells]
    return (a * (1-f[None, :]) + b * f[None, :]) * (1-f[:, None]) + (c * (1-f[None, :]) + d * f[None, :]) * f[:, None]


def image(name, rgb, noncolor=False):
    result = bpy.data.images.new(name, width=rgb.shape[1], height=rgb.shape[0], alpha=True)
    if noncolor:
        result.colorspace_settings.name = 'Non-Color'
    rgba = np.concatenate((rgb, np.ones((*rgb.shape[:2], 1))), axis=2).astype(np.float32)
    result.pixels.foreach_set(rgba.ravel())
    result.filepath_raw = str(OUTPUT / f'{name}.png')
    result.file_format = 'PNG'
    result.save()
    result.pack()
    return result


def surface_material(name, rgb, height):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .97
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image(name + '-color', rgb)
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    dy, dx = np.gradient(height)
    normals = np.stack((-dx * 13, -dy * 13, np.ones_like(dx)), axis=2)
    normals /= np.linalg.norm(normals, axis=2, keepdims=True)
    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = image(name + '-normal', normals * .5 + .5, True)
    normal = nodes.new('ShaderNodeNormalMap')
    links.new(normal_tex.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


size = 512
y, x = np.mgrid[0:1:complex(size), 0:1:complex(size)]
broad = noise(size, 5)
medium = noise(size, 24)
fine = noise(size, 100)
strata = .5 + .5 * np.sin(2 * np.pi * (y * 12 + .32 * np.sin(x * 2 * np.pi) + .20 * broad))
cracks = np.maximum(0, (strata - .93) / .07)
height = .45 * broad + .23 * medium + .13 * fine + .15 * strata - .08 * cracks
shade = .71 + .30 * broad + .15 * medium + .08 * fine - .17 * cracks
rock_rgb = np.clip(shade[..., None] * np.array([.40, .32, .23]), 0, 1)
rock = surface_material('continuous-weathered-stone', rock_rgb, height)

# Replace the stretched front-projection UVs with metre-scaled rock around an
# irregular, outward-only tunnel. The original walkable envelope stays clear.
old = bpy.data.objects['practical_tunnel']
bpy.data.objects.remove(old, do_unlink=True)
outline = [(-1.045, z) for z in [0, .3, .65, 1.0, 1.45]]
outline += [(math.cos(math.pi - i * math.pi / 32) * 1.045,
             1.45 + math.sin(math.pi - i * math.pi / 32) * 1.045) for i in range(1, 33)]
outline += [(1.045, z) for z in [1.0, .65, .3, 0]]
lengths = [0.0]
for i in range(1, len(outline)):
    lengths.append(lengths[-1] + math.dist(outline[i-1], outline[i]))
verts, faces = [], []
rings, n = 45, len(outline)
for j in range(rings):
    distance = j * 5.5 / (rings - 1)
    for i, (xx, zz) in enumerate(outline):
        relief = .018 + .025 * (1 + math.sin(i * 1.74 + j * 1.91))
        side = math.copysign(relief, xx) if abs(xx) > .7 else 0
        verts.append((xx + side, -3.25-distance,
                      zz + (relief if zz > 1.4 else 0)))
for j in range(rings-1):
    for i in range(n-1):
        a = j*n+i
        faces.append((a, a+1, a+n+1, a+n))
data = bpy.data.meshes.new('continuous_rock_tunnel')
data.from_pydata(verts, [], faces)
data.materials.append(rock)
uv = data.uv_layers.new(name='UVMap')
for loop in data.loops:
    ring, index = divmod(loop.vertex_index, n)
    uv.data[loop.index].uv = (lengths[index] / 1.8, ring * 5.5 / (rings-1) / 1.8)
tunnel = bpy.data.objects.new('practical_tunnel', data)
scene.collection.objects.link(tunnel)
tunnel.parent = root
for polygon in data.polygons:
    polygon.use_smooth = True

# Continue the cave floor beneath the passage. Small relief, grain and a wide
# irregular transparent perimeter replace the visible rectangular floor plate.
old = bpy.data.objects['earth_floor']
bpy.data.objects.remove(old, do_unlink=True)
earth_noise = .48 * noise(size, 6) + .28 * noise(size, 31) + .24 * noise(size, 150)
grain = rng.random((size, size))
earth_shade = .68 + .47 * earth_noise + .12 * grain
earth = surface_material('cave-earth', np.clip(earth_shade[..., None] * np.array([.34, .265, .185]), 0, 1), earth_noise * .65 + grain * .08)
earth.surface_render_method = 'DITHERED'
nodes, links = earth.node_tree.nodes, earth.node_tree.links
colors = nodes.new('ShaderNodeVertexColor')
colors.layer_name = 'Color'
base = next(node for node in nodes if node.type == 'TEX_IMAGE' and node.image.name.endswith('-color'))
mix = nodes.new('ShaderNodeMixRGB')
mix.blend_type = 'MULTIPLY'
mix.inputs[0].default_value = 1
links.new(base.outputs['Color'], mix.inputs[1])
links.new(colors.outputs['Color'], mix.inputs[2])
links.new(mix.outputs[0], nodes['Principled BSDF'].inputs['Base Color'])
links.new(colors.outputs['Alpha'], nodes['Principled BSDF'].inputs['Alpha'])
verts, faces, values = [], [], []
nx, ny = 72, 80
for j in range(ny+1):
    yy = -14 + j*27/ny
    for i in range(nx+1):
        xx = -14 + i*28/nx
        radius = math.sqrt((xx/1.08)**2 + (yy*.88)**2)
        edge = 10.7 + .6*math.sin(xx*1.4+yy*.8) + .3*math.sin(yy*2.5-xx*.9)
        alpha = max(0, min(1, (edge-radius)/3.7))
        alpha = alpha*alpha*(3-2*alpha)
        # Avoid raised vertices in the playable area and tunnel.
        zz = -.008 + .006*math.sin(xx*4+yy*3)*math.sin(yy*5-xx*2)
        if abs(xx) > 2:
            zz += .025*(1+math.sin(xx*2+yy*3))
        verts.append((xx, yy, zz))
        variation = .86+.07*math.sin(xx*.8+yy*.9)+.035*math.sin(xx*3.1-yy*2.2)
        values.append((variation, variation, variation, alpha))
for j in range(ny):
    for i in range(nx):
        a = j*(nx+1)+i
        faces.append((a, a+1, a+nx+2, a+nx+1))
data = bpy.data.meshes.new('feathered_earth_floor')
data.from_pydata(verts, [], faces)
data.materials.append(earth)
attribute = data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
for item, value in zip(attribute.data, values):
    item.color = value
data.color_attributes.active_color = attribute
uv = data.uv_layers.new(name='UVMap')
for loop in data.loops:
    xx, yy, zz = verts[loop.vertex_index]
    uv.data[loop.index].uv = (xx/2.3, yy/2.3)
floor = bpy.data.objects.new('earth_floor', data)
scene.collection.objects.link(floor)
floor.parent = root
for polygon in data.polygons:
    polygon.use_smooth = True

# Close the full rough tunnel cross-section: the smaller v1 cap otherwise leaves
# a bright outline where the distant skybox leaks around the tunnel end.
end = bpy.data.objects['far_end']
bpy.data.objects.remove(end, do_unlink=True)
end_outline = [(xx*1.08, max(-.06, zz*1.06)) for xx, zz in outline]
data = bpy.data.meshes.new('closed_tunnel_end')
data.from_pydata([(xx, -8.84, zz) for xx, zz in end_outline], [], [tuple(range(len(end_outline)))])
end_material = bpy.data.materials.new('distant_faint_glow')
end_material.use_nodes = True
end_nodes, end_links = end_material.node_tree.nodes, end_material.node_tree.links
end_bsdf = end_nodes.get('Principled BSDF')
end_bsdf.inputs['Base Color'].default_value = (.001, .002, .001, 1)
end_bsdf.inputs['Roughness'].default_value = 1
glow_field = np.exp(-2.3*(((x-.5)/.22)**2 + ((y-.42)/.31)**2))
glow_tex = end_nodes.new('ShaderNodeTexImage')
glow_tex.image = image('distant-glow', glow_field[..., None]*np.array([.10, .17, .125]))
end_links.new(glow_tex.outputs['Color'], end_bsdf.inputs['Emission Color'])
end_bsdf.inputs['Emission Strength'].default_value = .8
data.materials.append(end_material)
uv = data.uv_layers.new(name='UVMap')
for loop in data.loops:
    xx, zz = end_outline[loop.vertex_index]
    uv.data[loop.index].uv = (.5+xx/2.4, zz/2.8)
end = bpy.data.objects.new('far_end', data)
scene.collection.objects.link(end)
end.parent = root

# Reuse the generated rock meshes to bed the arch into a shallow bank.
template = bpy.data.objects['boundary_boulder_0']
ledge = bpy.data.objects['boundary_ledge_1']
placements = [
    (template, (-2.65, -3.7, -.22), (1.45, 1.5, 1.7), .35),
    (template, (2.70, -3.8, -.24), (1.65, 1.4, 1.9), -.35),
    (ledge, (-3.75, -3.2, -.12), (1.2, 1.25, 1.2), .65),
    (ledge, (3.85, -3.5, -.13), (1.25, 1.2, 1.3), -.4),
]
for i, (source, location, scale, angle) in enumerate(placements):
    obj = source.copy()
    obj.data = source.data
    obj.name = f'entrance_bank_{i}'
    scene.collection.objects.link(obj)
    obj.parent = root
    obj.location, obj.scale = location, scale
    obj.rotation_euler = (0, 0, math.pi+angle)

# Small partially buried fragments break the hard arch/floor contact without
# adding new interactive props or narrowing the approach.
fragment = template.copy()
fragment.data = template.data.copy()
fragment.name = 'fragment_template'
scene.collection.objects.link(fragment)
bpy.context.view_layer.objects.active = fragment
modifier = fragment.modifiers.new('Small fragment budget', 'DECIMATE')
modifier.ratio = min(1, 128 / sum(len(p.vertices)-2 for p in fragment.data.polygons))
bpy.ops.object.modifier_apply(modifier=modifier.name)
for side in [-1, 1]:
    for i in range(9):
        obj = fragment.copy()
        obj.data = fragment.data
        obj.name = f'buried_fragment_{side}_{i}'
        scene.collection.objects.link(obj)
        obj.parent = root
        obj.location = (side*(1.22+i*.22), -2.65+.20*math.sin(i*2.3), -.035)
        scale = .065+.035*(1+math.sin(i*1.7))
        obj.scale = (scale, scale*.9, scale*.55)
        obj.rotation_euler = (.05, .1, i*2.1)
bpy.data.objects.remove(fragment, do_unlink=True)

for obj in root.children_recursive:
    if obj.type == 'MESH' and ('boundary_' in obj.name or 'entrance_bank_' in obj.name or 'buried_fragment_' in obj.name):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

# Verify human clearance against the final geometry, not only the input arch.
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
clearance = []
for xx in [-.55, 0, .55]:
    for zz in [.2, 1.6, 1.85]:
        hit, location, normal, index, obj, matrix = scene.ray_cast(depsgraph, Vector((xx, -2.5, zz)), Vector((0, -1, 0)), distance=6.15)
        clearance.append({'x': xx, 'height': zz, 'clear': not hit, 'obstruction': obj.name if hit else None})
assert all(item['clear'] for item in clearance), clearance

blend = OUTPUT / 'barrow-natural-v2.blend'
glb = OUTPUT / 'barrow-natural-v2.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
# glTF multiplies COLOR_0 into the base texture by definition. Export the active
# RGBA directly so both vertex tint and perimeter alpha survive Blender's node
# gatherer, which does not recognize the equivalent preview multiply graph.
bsdf = earth.node_tree.nodes['Principled BSDF']
for socket in [bsdf.inputs['Base Color'], bsdf.inputs['Alpha']]:
    for link in list(socket.links):
        earth.node_tree.links.remove(link)
earth.node_tree.links.new(base.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Alpha'].default_value = .999
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in root.children_recursive:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_animations=False, export_extras=True, export_vertex_color='ACTIVE')
report = {
    'source': str(SOURCE / 'barrow-natural-v1.blend'),
    'blend': str(blend), 'glb': str(glb),
    'changes': ['Continuous rough rock tunnel with metre-scaled color and normal textures',
                'Grained earth floor continues into passage with irregular feathered perimeter',
                'Generated rock banks and partially buried fragments bed the entrance into the cave'],
    'clearance': clearance,
    'skyboxSha256': hashlib.sha256((ROOT/'src/prototype/assets/barrow-skybox-v1.png').read_bytes()).hexdigest(),
    'glbSha256': hashlib.sha256(glb.read_bytes()).hexdigest(),
    'limitations': ['Local visual experiment; clearance samples do not replace a headset playtest.',
                    'Generated rock backs retain approximate reference projection.'],
}
(OUTPUT/'assembly.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
