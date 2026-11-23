"""Stage 5: Assemble depth-fitted terrain + generated Hunyuan3D hero objects + skybox in Blender.

Reads:
  - <spec.json>
  - <out>/layout/terrain.npy & terrain-meta.json
  - <out>/layout/resolved-layout.json
  - <out>/inpainted/view-<K>.png  (clean background textures with hero objects removed)
  - <out>/crops/<id>.png          (for front-projected hero textures)
  - <out>/heroes/<id>.glb         (optional Hunyuan3D meshes; falls back to sculpted proxy if omitted)

Writes:
  - <out>/room.glb
  - <out>/manifest.json
  - <out>/review-4view.png (when --render-review is passed)
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[3]
# Reuse texture & review helpers from room-bom
sys.path.insert(0, str(ROOT / 'tools/assets/room-bom'))
import assemble_room as bom_lib


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('spec', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--render-review', action='store_true')
    parser.add_argument('--samples', type=int, default=16)
    parser.add_argument('--resolution', type=int, default=512)
    return parser.parse_args(argv)


def sample_terrain_z(terrain: np.ndarray, meta: dict, x: float, y: float) -> float:
    x0, x1 = meta['xRange']
    y0, y1 = meta['yRange']
    ny, nx = terrain.shape
    fx = max(0.0, min(nx - 1.001, (x - x0) / (x1 - x0) * (nx - 1)))
    fy = max(0.0, min(ny - 1.001, (y - y0) / (y1 - y0) * (ny - 1)))
    ix, iy = int(fx), int(fy)
    tx, ty = fx - ix, fy - iy
    z00 = terrain[iy, ix]
    z10 = terrain[iy, ix + 1]
    z01 = terrain[iy + 1, ix]
    z11 = terrain[iy + 1, ix + 1]
    return float((z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty)


def build_depth_terrain_mesh(
    terrain: np.ndarray,
    meta: dict,
    shore_mat: bpy.types.Material,
    low_mat: bpy.types.Material,
    water_level: float | None,
    tile_m: float = 3.2,
):
    """Build walkable terrain mesh directly from the depth-derived heightfield."""
    bm = bmesh.new()
    ny, nx = terrain.shape
    x0, x1 = meta['xRange']
    y0, y1 = meta['yRange']
    grid = []
    for iy in range(ny):
        row = []
        y = y0 + (y1 - y0) * (iy / (ny - 1))
        for ix in range(nx):
            x = x0 + (x1 - x0) * (ix / (nx - 1))
            row.append(bm.verts.new((x, y, float(terrain[iy, ix]))))
        grid.append(row)

    for iy in range(ny - 1):
        for ix in range(nx - 1):
            v0, v1, v2, v3 = grid[iy][ix], grid[iy][ix + 1], grid[iy + 1][ix + 1], grid[iy + 1][ix]
            face = bm.faces.new((v0, v1, v2, v3))
            if water_level is not None:
                avg_z = (v0.co.z + v1.co.z + v2.co.z + v3.co.z) * 0.25
                face.material_index = 1 if avg_z < (water_level + 0.05) else 0

    mesh = bpy.data.meshes.new('depth-terrain')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(shore_mat)
    mesh.materials.append(low_mat)
    uv = mesh.uv_layers.new(name='UVMap')
    uv_scale = 1.0 / tile_m
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = (co.x * uv_scale, co.y * uv_scale)
    mesh.update()
    obj = bpy.data.objects.new('depth-terrain', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_projected_material(name: str, cutout_png: Path) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.88
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(cutout_png), check_existing=True)
    tex.image.pack()
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    mat.use_backface_culling = False
    return mat


def place_hero_object(hero_layout: dict, hero_glb: Path, cutout_png: Path, terrain: np.ndarray, meta: dict):
    """Import Hunyuan3D hero GLB (or sculpted proxy), project cutout UVs, and snap to depth terrain."""
    hid = hero_layout['id']
    px, py, _ = hero_layout['position']
    sx, sy, sz = hero_layout['sizeMetres']
    yaw = math.radians(hero_layout['yawDeg'])
    ground_z = sample_terrain_z(terrain, meta, px, py)

    mat = build_projected_material(f'mat-hero-{hid}', cutout_png)

    if hero_glb.exists():
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(hero_glb))
        bpy.context.view_layer.update()
        imported = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
        if not imported:
            raise RuntimeError(f'No meshes in {hero_glb}')
        # Join into one clean hero mesh and normalize bottom-center to origin
        bpy.ops.object.select_all(action='DESELECT')
        for o in imported:
            o.select_set(True)
        bpy.context.view_layer.objects.active = imported[0]
        if len(imported) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = f'hero-{hid}'
        obj.data.transform(obj.matrix_world)
        obj.matrix_world = Matrix.Identity(4)

        coords = [v.co for v in obj.data.vertices]
        lo = Vector([min(v[i] for v in coords) for i in range(3)])
        hi = Vector([max(v[i] for v in coords) for i in range(3)])
        span = hi - lo
        center = Vector(((lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, lo.z))
        obj.data.transform(Matrix.Translation(-center))
        scale = Vector((sx / max(span.x, 1e-4), sy / max(span.y, 1e-4), sz / max(span.z, 1e-4)))
        obj.data.transform(Matrix.Diagonal((*scale, 1.0)))

        # Decimate if very dense so WebXR stays fast
        tri_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        if tri_count > 6000:
            mod = obj.modifiers.new('HeroDecimate', 'DECIMATE')
            mod.ratio = 6000.0 / tri_count
            bpy.ops.object.modifier_apply(modifier=mod.name)
    else:
        # Clean tapered rock/object proxy when --skip-hunyuan is used
        bm = bmesh.new()
        ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.5)
        for v in ret['verts']:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z = (v.co.z + 0.5) * sz
        mesh = bpy.data.meshes.new(f'hero-{hid}')
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(f'hero-{hid}', mesh)
        bpy.context.scene.collection.objects.link(obj)

    # Front-project cutout UVs onto the hero mesh in local normalized bounds
    coords = [v.co for v in obj.data.vertices]
    lo = Vector([min(v[i] for v in coords) for i in range(3)])
    hi = Vector([max(v[i] for v in coords) for i in range(3)])
    span = hi - lo
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co
            u = (co.x - lo.x) / max(span.x, 1e-4)
            v = (co.z - lo.z) / max(span.z, 1e-4)
            uv.data[li].uv = (u, v)

    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj.location = (px, py, ground_z - 0.08)
    obj.rotation_euler = (0.0, 0.0, yaw)
    if hero_layout.get('zilIdentity'):
        obj['source_identity'] = hero_layout['zilIdentity']
    return obj


def main():
    args = parse_args()
    spec_path = args.spec.resolve()
    spec = json.loads(spec_path.read_text())
    out_dir = args.out.resolve()
    tex_dir = out_dir / 'textures'
    tex_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'

    # 1. Load clean inpainted views for background texture extraction, original views for review
    ref_arrays = {k: bom_lib.load_image_rgba(ROOT / rel) for k, rel in spec['views'].items()}
    bg_arrays = {
        k: bom_lib.load_image_rgba(out_dir / 'inpainted' / f'view-{k}.png')
        if (out_dir / 'inpainted' / f'view-{k}.png').exists()
        else ref_arrays[k]
        for k in ['N', 'E', 'S', 'W']
    }

    materials = {}
    tiles = {}
    for sname, sspec in spec['surfaces'].items():
        patch = bom_lib.crop_region(bg_arrays[sspec['sourceView']], sspec['crop'])
        albedo = bom_lib.make_tileable(patch, 512)
        normal = bom_lib.synthesize_normal_map(albedo, strength=float(sspec.get('normalStrength', 1.2)))
        a_img = bom_lib.save_image_rgba(albedo, tex_dir / f'{sname}-albedo.png', colorspace='sRGB')
        n_img = bom_lib.save_image_rgba(normal, tex_dir / f'{sname}-normal.png', colorspace='Non-Color')
        materials[sname] = bom_lib.build_pbr_material(
            f'mat-{sname}',
            a_img,
            n_img,
            roughness=float(sspec.get('roughness', 0.9)),
            normal_strength=float(sspec.get('normalStrength', 1.0)),
        )
        tiles[sname] = float(sspec.get('tileMetres', 3.2))

    # 2. Build depth-derived walkable terrain mesh
    terrain = np.load(out_dir / 'layout' / 'terrain.npy')
    tmeta = json.loads((out_dir / 'layout' / 'terrain-meta.json').read_text())
    water_cfg = spec.get('water')
    water_z = float(water_cfg['levelMetres']) if water_cfg else None
    build_depth_terrain_mesh(
        terrain,
        tmeta,
        materials['floor'],
        materials.get('cobble', materials['floor']),
        water_z,
        tile_m=tiles['floor'],
    )

    # 3. Optional translucent water plane
    if water_cfg:
        bom_lib.build_water_surface(
            {
                'id': 'scene-water',
                'placement': {
                    'position': [0.0, 0.0, water_z],
                    'waterColor': water_cfg.get('color', [0.16, 0.35, 0.35]),
                    'alpha': water_cfg.get('alpha', 0.52),
                },
            },
            w=abs(tmeta['xRange'][1] - tmeta['xRange'][0]),
            d=abs(tmeta['yRange'][1] - tmeta['yRange'][0]),
        )

    # 4. Place depth-resolved hero 3D objects
    layout = json.loads((out_dir / 'layout' / 'resolved-layout.json').read_text())
    for hero in layout['heroes']:
        place_hero_object(
            hero,
            out_dir / 'heroes' / f"{hero['id']}.glb",
            out_dir / 'crops' / f"{hero['id']}.png",
            terrain,
            tmeta,
        )

    # 5. Interactive ZIL prop anchors (never baked into static walls)
    anchors = []
    for anchor_spec in spec.get('zilAnchors', []):
        bom_lib.add_zil_anchor({'id': anchor_spec['identity'].lower(), 'zilIdentity': anchor_spec['identity'], 'placement': anchor_spec})
        anchors.append(anchor_spec['identity'])

    # 6. Skybox + lighting
    if scene.world is None:
        scene.world = bpy.data.worlds.new('SceneWorld')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    if bg and spec.get('skybox'):
        wnodes, wlinks = scene.world.node_tree.nodes, scene.world.node_tree.links
        env_tex = wnodes.new('ShaderNodeTexEnvironment')
        env_tex.image = bpy.data.images.load(str(ROOT / spec['skybox']), check_existing=True)
        wlinks.new(env_tex.outputs['Color'], bg.inputs['Color'])
        bg.inputs['Strength'].default_value = 0.85

    for lspec in spec.get('lights', []):
        ldata = bpy.data.lights.new(lspec['name'], 'POINT')
        ldata.energy = float(lspec['energy'])
        ldata.color = tuple(lspec['color'])
        ldata.shadow_soft_size = float(lspec.get('radius', 1.5))
        lobj = bpy.data.objects.new(lspec['name'], ldata)
        scene.collection.objects.link(lobj)
        lobj.location = tuple(lspec['position'])

    # 7. Export GLB
    glb_path = out_dir / 'room.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format='GLB',
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )

    review_path = None
    if args.render_review:
        bom_lib.render_four_view_review(out_dir, ref_arrays, args.resolution, args.samples)
        review_path = str((out_dir / 'review-4view.png').relative_to(ROOT))

    mesh_objs = [o for o in scene.objects if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in mesh_objs)
    manifest = {
        'format': 'zxr-scene-to-glb-v1',
        'room': spec['room'],
        'spec': str(spec_path.relative_to(ROOT)),
        'glb': str(glb_path.relative_to(ROOT)),
        'glbBytes': glb_path.stat().st_size,
        'glbSha256': hashlib.sha256(glb_path.read_bytes()).hexdigest(),
        'meshCount': len(mesh_objs),
        'triangles': tris,
        'heroesPlaced': len(layout['heroes']),
        'zilAnchors': anchors,
        'skybox': spec.get('skybox'),
        'reviewSheet': review_path,
    }
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    main()
