"""Create an adjustable curvature-weighted reduction without editing the source."""
from pathlib import Path
import bpy
import bmesh
import math
import json
import hashlib

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'games/zork2/planning/scenes/ice-and-lava-passage'
OUT = BASE / 'mesh-v2-reduced'
OUT.mkdir(exist_ok=True)
source = BASE / 'mesh-v1-color/ice-and-lava-passage-color-v1.blend'
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
report = []
for obj in meshes:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    weights = []
    group = obj.vertex_groups.new(name='Simplify broad surfaces - editable')
    for vert in bm.verts:
        angles = [e.calc_face_angle(0) for e in vert.link_edges if e.is_manifold]
        bend = max(angles, default=math.pi)
        # Full reduction on nearly planar surfaces; retain more geometry at
        # creases, openings and detailed areas. This is a geometric heuristic,
        # not semantic segmentation of the fused glacier and room shell.
        weight = max(.03, 1 - min(1, bend / math.radians(28)))
        if vert.is_boundary:
            weight = .01
        group.add([vert.index], weight, 'REPLACE')
        weights.append(weight)
    bm.free()
    mod = obj.modifiers.new('Selective reduction - broad surfaces first', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = .2
    mod.vertex_group = group.name
    mod.vertex_group_factor = 1
    mod.use_collapse_triangulate = True
    deps = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(deps)
    reduced = evaluated.to_mesh()
    reduced.calc_loop_triangles()
    obj.data.calc_loop_triangles()
    report.append({'object': obj.name, 'originalVertices': len(obj.data.vertices),
                   'originalTriangles': len(obj.data.loop_triangles),
                   'reducedVertices': len(reduced.vertices),
                   'reducedTriangles': len(reduced.loop_triangles),
                   'weightRange': [min(weights), max(weights)],
                   'ratio': mod.ratio, 'vertexGroup': group.name})
    evaluated.to_mesh_clear()
scene['status'] = 'Selective reduced draft; editable weights and unapplied Decimate modifier'
notes = bpy.data.texts['READ ME']
notes.clear()
notes.write('Selective reduction copy. Source mesh and editable UVs retained.\nDecimate modifier is unapplied in this Blender file; export evaluates it.\nHigh weights simplify planar surfaces more; low weights protect sharp detail.\nAutomatic curvature weights are a starting point, not semantic masks.\nPaint the vertex group to tune glacier, chimney and openings manually.\nOriginal source files retained. Existing projection and fused ice limitations remain.\n')
for label in ['front', 'back']:
    scene.camera = bpy.data.objects[label]
    scene.render.filepath = str(OUT / f'review-{label}.png')
    bpy.ops.render.render(write_still=True)
scene.camera = bpy.data.objects['front']
for obj in scene.objects:
    obj.select_set(obj in meshes)
blend = OUT / 'ice-and-lava-passage-reduced-v2.blend'
glb = OUT / 'ice-and-lava-passage-reduced-v2.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                          export_extras=True, export_apply=True)
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
# Verify actual exported geometry, rather than only the modifier display.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
exported = []
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        obj.data.calc_loop_triangles()
        exported.append({'vertices': len(obj.data.vertices), 'triangles': len(obj.data.loop_triangles)})
assert sum(x['triangles'] for x in exported) == sum(x['reducedTriangles'] for x in report)
(OUT / 'verification.json').write_text(json.dumps({'sourceSha256': source_hash,
    'sourceUnchanged': True, 'modifierUnappliedInBlend': True,
    'weightMethod': 'maximum incident edge angle; lower weights at sharp bends and boundaries',
    'meshes': report, 'exportedMeshes': exported,
    'files': {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [blend, glb]}}, indent=2) + '\n')
print(json.dumps(report, indent=2))
