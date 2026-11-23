"""Generic, BOM-driven Blender room assembler (`zxr-room-bom-v1`).

Usage:
  Blender --factory-startup --background --python tools/assets/room-bom/assemble_room.py -- \\
    <room-bom.json> [--out <dir>] [--render-review] [--samples 16] [--resolution 512]

No room-specific `if rid == ...` branches: every surface, opening, recess,
hero object, and interactive ZIL prop anchor is driven by `room-bom.json`.
"""
import argparse
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parents[3]


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bom', type=Path, help='Path to room-bom.json')
    parser.add_argument('--out', type=Path, default=None, help='Output directory (defaults to BOM directory/build)')
    parser.add_argument('--render-review', action='store_true', help='Render N/E/S/W views and save review-4view.png')
    parser.add_argument('--samples', type=int, default=16)
    parser.add_argument('--resolution', type=int, default=512)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# Image cropping, seamless tiling, and Sobel normal map synthesis (numpy only)
# ---------------------------------------------------------------------------

def load_image_rgba(path: Path) -> np.ndarray:
    """Load an image via Blender as a top-down float32 (H, W, 4) array in [0, 1]."""
    img = bpy.data.images.load(str(path), check_existing=True)
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    arr = arr.reshape((h, w, 4))
    # Blender stores pixels bottom-to-top; flip to standard top-down coordinates.
    return np.flipud(arr).copy()


def save_image_rgba(arr: np.ndarray, path: Path, colorspace: str = 'sRGB') -> bpy.types.Image:
    """Save a top-down float32 (H, W, 4) array as PNG via Blender and return the packed Image."""
    h, w, _ = arr.shape
    flipped = np.flipud(np.clip(arr, 0.0, 1.0)).astype(np.float32)
    img = bpy.data.images.new(path.stem, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(flipped.ravel())
    img.filepath_raw = str(path)
    img.file_format = 'PNG'
    img.save()
    img.pack()
    return img


def resize_bilinear(arr: np.ndarray, out_h: int, out_w: int) -> np.ndarray:
    """Simple numpy bilinear resize for (H, W, C) float32 arrays."""
    h, w, c = arr.shape
    if h == out_h and w == out_w:
        return arr
    ys = np.linspace(0, h - 1, out_h, dtype=np.float32)
    xs = np.linspace(0, w - 1, out_w, dtype=np.float32)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, h - 1)
    x1 = np.minimum(x0 + 1, w - 1)
    wy = (ys - y0)[:, None, None]
    wx = (xs - x0)[None, :, None]
    top = arr[y0[:, None], x0[None, :]] * (1 - wx) + arr[y0[:, None], x1[None, :]] * wx
    bot = arr[y1[:, None], x0[None, :]] * (1 - wx) + arr[y1[:, None], x1[None, :]] * wx
    return top * (1 - wy) + bot * wy


def crop_region(img: np.ndarray, box: list[float]) -> np.ndarray:
    h, w, _ = img.shape
    x0 = max(0, min(w - 2, int(round(box[0] * w))))
    y0 = max(0, min(h - 2, int(round(box[1] * h))))
    x1 = max(x0 + 2, min(w, int(round(box[2] * w))))
    y1 = max(y0 + 2, min(h, int(round(box[3] * h))))
    return img[y0:y1, x0:x1, :].copy()


def box_blur_rgb(arr: np.ndarray, radius: int) -> np.ndarray:
    """Fast separable wrap-around box blur for illumination flattening."""
    k = 2 * radius + 1
    out = arr[:, :, :3].copy()
    # Horizontal pass
    pad_x = np.pad(out, ((0, 0), (radius, radius), (0, 0)), mode='reflect')
    cs = np.cumsum(np.pad(pad_x, ((0, 0), (1, 0), (0, 0)), mode='constant'), axis=1)
    out = (cs[:, k:, :] - cs[:, :-k, :]) / k
    # Vertical pass
    pad_y = np.pad(out, ((radius, radius), (0, 0), (0, 0)), mode='reflect')
    cs = np.cumsum(np.pad(pad_y, ((1, 0), (0, 0), (0, 0)), mode='constant'), axis=0)
    out = (cs[k:, :, :] - cs[:-k, :, :]) / k
    return out


def make_tileable(patch: np.ndarray, size: int = 512) -> np.ndarray:
    """Flatten lighting gradients and build a seamless tile via mirrored 2x2 or offset blend."""
    sq = resize_bilinear(patch, size, size)
    # Remove low-frequency lighting gradient so edges have matching brightness/color.
    mean_rgb = sq[:, :, :3].mean(axis=(0, 1), keepdims=True)
    low_freq = box_blur_rgb(sq, radius=size // 8)
    sq[:, :, :3] = np.clip(sq[:, :, :3] - low_freq + mean_rgb, 0.0, 1.0)

    # Half-offset cosine cross-blend on the lighting-flattened patch.
    shifted = np.roll(np.roll(sq, size // 2, axis=0), size // 2, axis=1)
    t = np.linspace(0.0, 1.0, size, dtype=np.float32)
    wx = 0.5 - 0.5 * np.cos(2.0 * np.pi * t)
    wy = 0.5 - 0.5 * np.cos(2.0 * np.pi * t)
    mask = (wy[:, None] * wx[None, :])[:, :, None]
    blended = sq * mask + shifted * (1.0 - mask)
    blended[:, :, 3] = 1.0
    return blended


def _periodic_noise_octave(grid_n: int, out_size: int, rng: np.random.Generator) -> np.ndarray:
    """Generate one seamless tileable bilinear-upsampled random noise octave."""
    base = rng.random((grid_n, grid_n), dtype=np.float32)
    ys = (np.arange(out_size, dtype=np.float32) / out_size) * grid_n
    xs = (np.arange(out_size, dtype=np.float32) / out_size) * grid_n
    y0 = np.floor(ys).astype(np.int32) % grid_n
    x0 = np.floor(xs).astype(np.int32) % grid_n
    y1 = (y0 + 1) % grid_n
    x1 = (x0 + 1) % grid_n
    wy = (ys - np.floor(ys))[:, None]
    wx = (xs - np.floor(xs))[None, :]
    # Smoothstep interpolation eliminates grid artifacts
    wy = wy * wy * (3.0 - 2.0 * wy)
    wx = wx * wx * (3.0 - 2.0 * wx)
    top = base[y0[:, None], x0[None, :]] * (1.0 - wx) + base[y0[:, None], x1[None, :]] * wx
    bot = base[y1[:, None], x0[None, :]] * (1.0 - wx) + base[y1[:, None], x1[None, :]] * wx
    return top * (1.0 - wy) + bot * wy


def make_grey_stone_tile(size: int = 512) -> np.ndarray:
    """Synthesize a natural, seamless multi-octave fBm weathered grey stone texture (zero plaid/sine lines)."""
    rng = np.random.default_rng(42)
    fbm = np.zeros((size, size), dtype=np.float32)
    weight_sum = 0.0
    for grid_n, weight in ((4, 0.34), (8, 0.26), (16, 0.18), (32, 0.12), (64, 0.07), (128, 0.03)):
        fbm += _periodic_noise_octave(grid_n, size, rng) * weight
        weight_sum += weight
    fbm /= weight_sum
    # Map to weathered dark-medium cool slate-grey stone
    val = np.clip(0.20 + 0.36 * fbm, 0.10, 0.65)
    out = np.empty((size, size, 4), dtype=np.float32)
    out[:, :, 0] = val * 0.90
    out[:, :, 1] = val * 0.92
    out[:, :, 2] = val * 0.96
    out[:, :, 3] = 1.0
    return out


def make_dark_oak_tile(size: int = 512) -> np.ndarray:
    """Synthesize a clean, seamless repeating dark aged oak woodgrain texture (no panel frames)."""
    rng = np.random.default_rng(77)
    # Anisotropic periodic noise stretched along X for realistic long wood fibres
    coarse = _periodic_noise_octave(8, size, rng)
    med = _periodic_noise_octave(16, size, rng)
    fine = _periodic_noise_octave(64, size, rng)
    y = np.linspace(0.0, 1.0, size, endpoint=False, dtype=np.float32)[:, None]
    x = np.linspace(0.0, 1.0, size, endpoint=False, dtype=np.float32)[None, :]
    # Subtle elongated woodgrain bands + organic warp
    warp = 0.08 * coarse + 0.04 * med
    rings = 0.5 + 0.5 * np.sin(2.0 * np.pi * (y * 14.0 + warp * 8.0))
    streaks = 0.5 * _periodic_noise_octave(4, size, rng) + 0.3 * med + 0.2 * fine
    val = np.clip(0.14 + 0.16 * streaks + 0.07 * rings, 0.06, 0.42)
    out = np.empty((size, size, 4), dtype=np.float32)
    # Warm rich dark oak / walnut palette matching OFFICE wainscot
    out[:, :, 0] = val * 1.15
    out[:, :, 1] = val * 0.68
    out[:, :, 2] = val * 0.38
    out[:, :, 3] = 1.0
    return out


def make_weathered_oak_tile(size: int = 512) -> np.ndarray:
    """Dark aged oak layered with dusty ochre/grey grime, soot blotches, and scratches."""
    base = make_dark_oak_tile(size)
    rng = np.random.default_rng(137)
    # Grime / dust patches (multi-octave fBm)
    dust = (
        0.45 * _periodic_noise_octave(6, size, rng)
        + 0.35 * _periodic_noise_octave(16, size, rng)
        + 0.20 * _periodic_noise_octave(48, size, rng)
    )
    soot = (
        0.55 * _periodic_noise_octave(5, size, rng)
        + 0.45 * _periodic_noise_octave(20, size, rng)
    )
    # Apply dusty pale ochre-grey film where dust > 0.52 and dark water/soot stains where soot < 0.38
    dust_mask = np.clip((dust - 0.48) / 0.35, 0.0, 1.0)[:, :, None] * 0.58
    dust_color = np.array([[[0.36, 0.31, 0.24]]], dtype=np.float32)
    stain_mask = np.clip((0.42 - soot) / 0.32, 0.0, 1.0)[:, :, None] * 0.52

    rgb = base[:, :, :3] * (1.0 - stain_mask)
    rgb = rgb * (1.0 - dust_mask) + dust_color * dust_mask
    out = np.empty_like(base)
    out[:, :, :3] = np.clip(rgb, 0.03, 0.65)
    out[:, :, 3] = 1.0
    return out


def make_tufted_leather_tile(size: int = 512) -> np.ndarray:
    """Synthesize a clean, seamless repeating diamond-tufted burgundy leather texture."""
    rng = np.random.default_rng(99)
    y = np.linspace(0.0, 1.0, size, endpoint=False, dtype=np.float32)[:, None]
    x = np.linspace(0.0, 1.0, size, endpoint=False, dtype=np.float32)[None, :]
    # 4x4 diamond tuft grid (exact integer cycles = seamless)
    u = (x * 4.0) % 1.0
    v = (y * 4.0) % 1.0
    # Distance to diamond button centres at (0,0) and (0.5, 0.5)
    d1 = np.hypot(np.minimum(u, 1.0 - u), np.minimum(v, 1.0 - v))
    d2 = np.hypot(u - 0.5, v - 0.5)
    d = np.minimum(d1, d2)
    # Soft pillowy puff between buttons + dark creases along diamond diagonals
    puff = np.clip(d / 0.36, 0.0, 1.0)
    puff = puff * puff * (3.0 - 2.0 * puff)
    button = np.clip((d - 0.045) / 0.06, 0.0, 1.0)
    grain = _periodic_noise_octave(64, size, rng) * 0.06
    val = np.clip((0.12 + 0.24 * puff) * (0.45 + 0.55 * button) + grain, 0.05, 0.45)
    out = np.empty((size, size, 4), dtype=np.float32)
    # Deep aged burgundy leather
    out[:, :, 0] = val * 1.18
    out[:, :, 1] = val * 0.34
    out[:, :, 2] = val * 0.28
    out[:, :, 3] = 1.0
    return out


def make_tileable_horizontal(patch: np.ndarray, size: int = 512) -> np.ndarray:
    """Tile horizontally while preserving vertical top-to-bottom orientation (for wainscot-aligned walls)."""
    sq = resize_bilinear(patch, size, size)
    # Flatten horizontal lighting gradient only so vertical plaster-to-lath gradient stays intact.
    row_mean = sq[:, :, :3].mean(axis=1, keepdims=True)
    col_blur = box_blur_rgb(sq, radius=size // 8)
    sq[:, :, :3] = np.clip(sq[:, :, :3] - col_blur + row_mean, 0.0, 1.0)
    shifted = np.roll(sq, size // 2, axis=1)
    t = np.linspace(0.0, 1.0, size, dtype=np.float32)
    wx = (0.5 - 0.5 * np.cos(2.0 * np.pi * t))[None, :, None]
    blended = sq * wx + shifted * (1.0 - wx)
    blended[:, :, 3] = 1.0
    return blended


def synthesize_normal_map(albedo: np.ndarray, strength: float = 1.2) -> np.ndarray:
    """Compute a tangent-space normal map from luminance gradients using Sobel filters."""
    lum = 0.299 * albedo[:, :, 0] + 0.587 * albedo[:, :, 1] + 0.114 * albedo[:, :, 2]
    # Wrap-around Sobel so tileable albedo produces a tileable normal map.
    gx = (
        -np.roll(np.roll(lum, 1, 0), 1, 1)
        + np.roll(np.roll(lum, 1, 0), -1, 1)
        - 2.0 * np.roll(lum, 1, 1)
        + 2.0 * np.roll(lum, -1, 1)
        - np.roll(np.roll(lum, -1, 0), 1, 1)
        + np.roll(np.roll(lum, -1, 0), -1, 1)
    ) * strength
    gy = (
        -np.roll(np.roll(lum, 1, 0), 1, 1)
        - 2.0 * np.roll(lum, 1, 0)
        - np.roll(np.roll(lum, 1, 0), -1, 1)
        + np.roll(np.roll(lum, -1, 0), 1, 1)
        + 2.0 * np.roll(lum, -1, 0)
        + np.roll(np.roll(lum, -1, 0), -1, 1)
    ) * strength
    nz = np.ones_like(gx)
    inv = 1.0 / np.sqrt(gx * gx + gy * gy + nz * nz + 1e-8)
    out = np.empty_like(albedo)
    out[:, :, 0] = (-gx * inv) * 0.5 + 0.5
    out[:, :, 1] = (gy * inv) * 0.5 + 0.5
    out[:, :, 2] = (nz * inv) * 0.5 + 0.5
    out[:, :, 3] = 1.0
    return out


def build_pbr_material(
    name: str,
    albedo_img: bpy.types.Image,
    normal_img: bpy.types.Image,
    roughness: float = 0.9,
    normal_strength: float = 1.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = roughness

    tex_c = nodes.new('ShaderNodeTexImage')
    tex_c.image = albedo_img
    links.new(tex_c.outputs['Color'], bsdf.inputs['Base Color'])

    tex_n = nodes.new('ShaderNodeTexImage')
    tex_n.image = normal_img
    nmap = nodes.new('ShaderNodeNormalMap')
    nmap.inputs['Strength'].default_value = normal_strength
    links.new(tex_n.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    mat.use_backface_culling = False
    return mat


def solid_material(name: str, color: tuple[float, float, float], roughness: float = 0.9, emission: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    if emission > 0.0:
        bsdf.inputs['Emission Color'].default_value = (*color, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission
    mat.use_backface_culling = False
    return mat


# ---------------------------------------------------------------------------
# Parametric geometry builders driven entirely by BOM data
# ---------------------------------------------------------------------------

def noise_3d(x: float, y: float, z: float, seed: int = 0) -> float:
    """Deterministic multi-octave trig displacement (no external noise deps)."""
    s = seed * 1.37
    v = (
        0.52 * math.sin(x * 1.15 + z * 0.85 + s) * math.cos(y * 1.05 - z * 0.65)
        + 0.30 * math.sin(x * 2.4 - y * 2.1 + z * 1.9 + s * 2.1)
        + 0.18 * math.cos(x * 4.7 + y * 4.3 - z * 3.8 + s * 3.3)
    )
    return v


def create_mesh_object(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material, uv_scale: float = 0.35):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    # Triplanar-style box UV projection based on polygon normals.
    uv_layer = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y * uv_scale, co.z * uv_scale
            elif ax == 1:
                u, v = co.x * uv_scale, co.z * uv_scale
            else:
                u, v = co.x * uv_scale, co.y * uv_scale
            uv_layer.data[li].uv = (u, v)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_floor(width: float, depth: float, mat: bpy.types.Material, tile_m: float, cutouts: list[tuple[float, float, float]]):
    """Build floor grid oversized past walls so wall/floor seams never gap, with circular cutouts for wells."""
    bm = bmesh.new()
    nx, ny = 40, 40
    margin = 0.9
    hw, hd = width / 2.0 + margin, depth / 2.0 + margin
    span_w, span_d = hw * 2.0, hd * 2.0
    grid = []
    for iy in range(ny + 1):
        row = []
        y = -hd + span_d * (iy / ny)
        for ix in range(nx + 1):
            x = -hw + span_w * (ix / nx)
            z = 0.025 * noise_3d(x * 0.7, y * 0.7, 0.0, 11)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for iy in range(ny):
        for ix in range(nx):
            v0, v1, v2, v3 = grid[iy][ix], grid[iy][ix + 1], grid[iy + 1][ix + 1], grid[iy + 1][ix]
            if any(
                (v.co.x - ox) ** 2 + (v.co.y - oy) ** 2 < (r + 0.15) ** 2
                for v in (v0, v1, v2, v3)
                for ox, oy, r in cutouts
            ):
                continue
            bm.faces.new((v0, v1, v2, v3))
    return create_mesh_object('room-floor', bm, mat, uv_scale=1.0 / tile_m)


def build_ceiling(width: float, depth: float, height: float, style: str, mat: bpy.types.Material, tile_m: float):
    if style == 'open-sky':
        return None
    bm = bmesh.new()
    nx, ny = 28, 28
    margin = 0.9
    hw_room, hd_room = width / 2.0, depth / 2.0
    hw, hd = hw_room + margin, hd_room + margin
    span_w, span_d = hw * 2.0, hd * 2.0
    grid = []
    for iy in range(ny + 1):
        row = []
        y = -hd + span_d * (iy / ny)
        for ix in range(nx + 1):
            x = -hw + span_w * (ix / nx)
            # Normalized distance from room center (1.0 at nominal wall line)
            rx = abs(x) / max(hw_room, 1e-4)
            ry = abs(y) / max(hd_room, 1e-4)
            edge_t = max(rx, ry)
            arch = 0.0
            if style == 'vaulted':
                arch = 0.65 * max(0.0, 1.0 - rx * rx)
            elif style == 'rough-cavern':
                arch = 0.32 * max(0.0, 1.0 - min(1.0, rx * rx * 0.5 + ry * ry * 0.5))
                arch += 0.22 * noise_3d(x * 0.55, y * 0.55, height, 23)
            # Tuck perimeter slightly below wall top so walls and ceiling always meet tightly
            perimeter_drop = -0.35 * max(0.0, min(1.0, (edge_t - 0.85) / 0.25))
            row.append(bm.verts.new((x, y, height + arch + perimeter_drop)))
        grid.append(row)
    for iy in range(ny):
        for ix in range(nx):
            # Face downward into the room.
            bm.faces.new((grid[iy][ix], grid[iy + 1][ix], grid[iy + 1][ix + 1], grid[iy][ix + 1]))
    ceil_obj = create_mesh_object('room-ceiling', bm, mat, uv_scale=1.0 / tile_m)
    return ceil_obj


def build_coffered_beams(width: float, depth: float, height: float, wood_mat: bpy.types.Material, tile_m: float):
    """Add dark timber ceiling beams and cornice moulding for coffered architectural rooms."""
    bm = bmesh.new()
    hw, hd = width * 0.5, depth * 0.5
    beam_h = 0.24
    beam_w = 0.22
    z0, z1 = height - beam_h, height + 0.05

    def add_box(x0, x1, y0, y1, zb, zt):
        vs = [
            bm.verts.new((x0, y0, zb)), bm.verts.new((x1, y0, zb)),
            bm.verts.new((x1, y1, zb)), bm.verts.new((x0, y1, zb)),
            bm.verts.new((x0, y0, zt)), bm.verts.new((x1, y0, zt)),
            bm.verts.new((x1, y1, zt)), bm.verts.new((x0, y1, zt)),
        ]
        bm.faces.new((vs[0], vs[3], vs[2], vs[1]))
        bm.faces.new((vs[4], vs[5], vs[6], vs[7]))
        bm.faces.new((vs[0], vs[1], vs[5], vs[4]))
        bm.faces.new((vs[2], vs[3], vs[7], vs[6]))
        bm.faces.new((vs[1], vs[2], vs[6], vs[5]))
        bm.faces.new((vs[3], vs[0], vs[4], vs[7]))

    # Cross beams along X and Y + perimeter cornice
    for frac in (-0.33, 0.33):
        cx = frac * width
        add_box(cx - beam_w * 0.5, cx + beam_w * 0.5, -hd, hd, z0, z1)
    for frac in (-0.33, 0.33):
        cy = frac * depth
        add_box(-hw, hw, cy - beam_w * 0.5, cy + beam_w * 0.5, z0, z1)
    # Perimeter cornice
    add_box(-hw, hw, hd - 0.22, hd + 0.05, z0 - 0.04, z1)
    add_box(-hw, hw, -hd - 0.05, -hd + 0.22, z0 - 0.04, z1)
    add_box(hw - 0.22, hw + 0.05, -hd, hd, z0 - 0.04, z1)
    add_box(-hw - 0.05, -hw + 0.22, -hd, hd, z0 - 0.04, z1)
    return create_mesh_object('ceiling-coffered-beams', bm, wood_mat, uv_scale=1.0 / tile_m)


def build_wainscot_band(
    side: str,
    width: float,
    depth: float,
    wainscot_h: float,
    openings: list[dict],
    wood_mat: bpy.types.Material,
    tile_m: float,
):
    """Build lower carved oak wainscot paneling + chair rail along an interior wall."""
    origin, tangent, inward, length = wall_frame(side, width, depth)
    bm = bmesh.new()
    segs = 32
    for i in range(segs):
        u0 = -length * 0.5 + length * (i / segs)
        u1 = -length * 0.5 + length * ((i + 1) / segs)
        um = (u0 + u1) * 0.5
        # Skip across doorway openings
        if any(abs(um - op['placement'].get('offsetAlongWall', 0.0)) < op['placement'].get('sizeMetres', [2.0])[0] * 0.52 for op in openings):
            continue
        p0 = origin + tangent * u0 + inward * 0.04
        p1 = origin + tangent * u1 + inward * 0.04
        # Wainscot panel face
        v0 = bm.verts.new(p0 + Vector((0, 0, -0.05)))
        v1 = bm.verts.new(p1 + Vector((0, 0, -0.05)))
        v2 = bm.verts.new(p1 + Vector((0, 0, wainscot_h)))
        v3 = bm.verts.new(p0 + Vector((0, 0, wainscot_h)))
        bm.faces.new((v0, v1, v2, v3))
        # Chair-rail ledge on top of wainscot
        r0 = bm.verts.new(p0 + inward * 0.06 + Vector((0, 0, wainscot_h - 0.06)))
        r1 = bm.verts.new(p1 + inward * 0.06 + Vector((0, 0, wainscot_h - 0.06)))
        r2 = bm.verts.new(p1 + inward * 0.06 + Vector((0, 0, wainscot_h + 0.02)))
        r3 = bm.verts.new(p0 + inward * 0.06 + Vector((0, 0, wainscot_h + 0.02)))
        bm.faces.new((r0, r1, r2, r3))
        bm.faces.new((r3, r2, v2, v3))
    return create_mesh_object(f'wainscot-{side}', bm, wood_mat, uv_scale=1.0 / tile_m)


def build_rug(obj_spec: dict, mat: bpy.types.Material):
    """Place a flat woven rug slightly above the floor with full 0..1 UVs."""
    pl = obj_spec['placement']
    cx, cy, cz = pl.get('position', [0.0, 0.0, 0.015])
    rw, rd, _ = pl.get('sizeMetres', [3.8, 5.2, 0.02])
    yaw = math.radians(pl.get('yawDeg', 0.0))
    bm = bmesh.new()
    v0 = bm.verts.new((-rw * 0.5, -rd * 0.5, 0.0))
    v1 = bm.verts.new((rw * 0.5, -rd * 0.5, 0.0))
    v2 = bm.verts.new((rw * 0.5, rd * 0.5, 0.0))
    v3 = bm.verts.new((-rw * 0.5, rd * 0.5, 0.0))
    bm.faces.new((v0, v1, v2, v3))
    mesh = bpy.data.meshes.new(obj_spec['id'])
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name='UVMap')
    coords = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    for li, c in zip(mesh.polygons[0].loop_indices, coords):
        uv.data[li].uv = c
    obj = bpy.data.objects.new(obj_spec['id'], mesh)
    obj.location = (cx, cy, cz)
    obj.rotation_euler = (0.0, 0.0, yaw)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_pillar(obj_spec: dict, mat: bpy.types.Material, tile_m: float):
    """Build a square stepped wooden/stone pilaster or column."""
    pl = obj_spec['placement']
    cx, cy, cz = pl.get('position', [0.0, 0.0, 0.0])
    pw, pd, ph = pl.get('sizeMetres', [0.42, 0.42, 3.6])
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = cx + v.co.x * pw
        v.co.y = cy + v.co.y * pd
        v.co.z = cz + (v.co.z + 0.5) * ph
    return create_mesh_object(obj_spec['id'], bm, mat, uv_scale=1.0 / tile_m)


def _add_box(bm: bmesh.types.BMesh, x0: float, x1: float, y0: float, y1: float, z0: float, z1: float, mat_idx: int = 0):
    vs = [
        bm.verts.new((x0, y0, z0)), bm.verts.new((x1, y0, z0)),
        bm.verts.new((x1, y1, z0)), bm.verts.new((x0, y1, z0)),
        bm.verts.new((x0, y0, z1)), bm.verts.new((x1, y0, z1)),
        bm.verts.new((x1, y1, z1)), bm.verts.new((x0, y1, z1)),
    ]
    for f in (
        (vs[0], vs[3], vs[2], vs[1]),
        (vs[4], vs[5], vs[6], vs[7]),
        (vs[0], vs[1], vs[5], vs[4]),
        (vs[2], vs[3], vs[7], vs[6]),
        (vs[1], vs[2], vs[6], vs[5]),
        (vs[3], vs[0], vs[4], vs[7]),
    ):
        face = bm.faces.new(f)
        face.material_index = mat_idx


def build_executive_chair(obj_spec: dict, leather_mat: bpy.types.Material, wood_mat: bpy.types.Material, tile_m: float):
    """Build a clean, sculpted wooden-framed leather executive armchair."""
    pl = obj_spec['placement']
    cx, cy, cz = pl.get('position', [0.0, 0.0, 0.0])
    cw, cd, ch = pl.get('sizeMetres', [0.76, 0.72, 1.18])
    yaw = math.radians(pl.get('yawDeg', 0.0))

    bm = bmesh.new()
    hw, hd = cw * 0.5, cd * 0.5
    seat_h = ch * 0.40
    # 4 sturdy turned-style oak legs (material index 1 = wood)
    leg_w = 0.065
    for sx in (-hw + 0.05, hw - 0.05 - leg_w):
        for sy in (-hd + 0.05, hd - 0.05 - leg_w):
            _add_box(bm, sx, sx + leg_w, sy, sy + leg_w, 0.0, seat_h, mat_idx=1)
    # Wooden seat frame apron + armrests
    _add_box(bm, -hw, hw, -hd, hd, seat_h - 0.08, seat_h, mat_idx=1)
    arm_h = seat_h + 0.24
    for side in (-1.0, 1.0):
        ax0 = side * (hw - 0.08) - 0.04
        ax1 = side * (hw - 0.08) + 0.04
        # Front armrest post + horizontal armrest rail
        _add_box(bm, ax0, ax1, -hd + 0.05, -hd + 0.13, seat_h, arm_h, mat_idx=1)
        _add_box(bm, ax0 - 0.015, ax1 + 0.015, -hd + 0.03, hd - 0.06, arm_h - 0.05, arm_h + 0.02, mat_idx=1)
    # Wooden backrest outer frame + arched top rail
    _add_box(bm, -hw, -hw + 0.07, hd - 0.12, hd, seat_h, ch - 0.08, mat_idx=1)
    _add_box(bm, hw - 0.07, hw, hd - 0.12, hd, seat_h, ch - 0.08, mat_idx=1)
    _add_box(bm, -hw, hw, hd - 0.12, hd, ch - 0.10, ch, mat_idx=1)

    # Tufted leather seat cushion + high backrest cushion (material index 0 = leather)
    _add_box(bm, -hw + 0.05, hw - 0.05, -hd + 0.04, hd - 0.08, seat_h, seat_h + 0.11, mat_idx=0)
    _add_box(bm, -hw + 0.07, hw - 0.07, hd - 0.16, hd - 0.04, seat_h + 0.08, ch - 0.09, mat_idx=0)
    # Soft bevel on all edges so the chair reads plush and realistic
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.018, segments=2, affect='EDGES', clamp_overlap=True)

    mesh = bpy.data.meshes.new(obj_spec['id'])
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(leather_mat)
    mesh.materials.append(wood_mat)
    uv = mesh.uv_layers.new(name='UVMap')
    uv_scale = 1.0 / max(tile_m, 0.5)
    for poly in mesh.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        if poly.material_index == 0:
            # Clean local cushion UVs for diamond-tufted leather (aligned to backrest & seat)
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                if ax == 2:
                    uv.data[li].uv = ((co.x + hw) / max(cw, 0.3), (co.y + hd) / max(cd, 0.3))
                else:
                    uv.data[li].uv = ((co.x + hw) / max(cw, 0.3), (co.z - seat_h) / max(ch - seat_h, 0.3))
        else:
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                uv.data[li].uv = ((co.y if ax == 0 else co.x) * uv_scale, (co.y if ax == 2 else co.z) * uv_scale)
    obj = bpy.data.objects.new(obj_spec['id'], mesh)
    obj.location = (cx, cy, cz)
    obj.rotation_euler = (0.0, 0.0, yaw)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_bookcase(
    obj_spec: dict,
    wood_mat: bpy.types.Material,
    rubble_mat: bpy.types.Material,
    tile_m: float,
):
    """Build a weathered carved oak bookcase with a broken shelf and irregular multi-material debris."""
    pl = obj_spec['placement']
    cx, cy, cz = pl.get('position', [0.0, 0.0, 0.0])
    bw, bd, bh = pl.get('sizeMetres', [1.55, 0.48, 2.55])
    yaw = math.radians(pl.get('yawDeg', 0.0))

    bm = bmesh.new()
    hw, hd = bw * 0.5, bd * 0.5
    t = 0.07
    # Back panel, left/right side panels, plinth base, and stepped crown cornice (mat_idx = 0)
    _add_box(bm, -hw, hw, hd - t, hd, 0.0, bh, mat_idx=0)
    _add_box(bm, -hw, -hw + t, -hd, hd, 0.0, bh, mat_idx=0)
    _add_box(bm, hw - t, hw, -hd, hd, 0.0, bh, mat_idx=0)
    _add_box(bm, -hw - 0.03, hw + 0.03, -hd - 0.03, hd, 0.0, 0.16, mat_idx=0)
    _add_box(bm, -hw - 0.06, hw + 0.06, -hd - 0.06, hd + 0.02, bh - 0.14, bh, mat_idx=0)

    def add_rotated_box(pos, dims, rot_euler, mat_idx):
        ret = bmesh.ops.create_cube(bm, size=1.0)
        verts = ret['verts']
        rot_m = Euler(rot_euler, 'XYZ').to_matrix()
        for v in verts:
            p = Vector((v.co.x * dims[0], v.co.y * dims[1], v.co.z * dims[2]))
            v.co = rot_m @ p + Vector(pos)
        for f in set(f for v in verts for f in v.link_faces):
            f.material_index = mat_idx

    def add_rubble_chunk(pos, rad, seed_n, mat_idx):
        ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rad)
        verts = ret['verts']
        rlocal = random.Random(seed_n)
        sx, sy, sz = rlocal.uniform(0.7, 1.4), rlocal.uniform(0.6, 1.3), rlocal.uniform(0.45, 0.95)
        for v in verts:
            dn = 1.0 + 0.28 * noise_3d(v.co.x * 8.0, v.co.y * 8.0, v.co.z * 8.0, seed_n)
            v.co = Vector((pos[0] + v.co.x * sx * dn, pos[1] + v.co.y * sy * dn, pos[2] + v.co.z * sz * dn))
        for f in set(f for v in verts for f in v.link_faces):
            f.material_index = mat_idx

    # 5 interior shelves (shelf 3 is broken/sagging on the right) + irregular rubble & battered books
    rng = random.Random(313)
    for i in range(1, 6):
        sz = 0.16 + (bh - 0.34) * (i / 6.0)
        if i == 3:
            # Cracked, sagging shelf board tilted downward
            add_rotated_box((-hw * 0.25, 0.0, sz), (bw * 0.52, bd - 0.06, 0.045), (0.0, 0.14, 0.0), 0)
            add_rotated_box((hw * 0.35, -0.02, sz - 0.06), (bw * 0.36, bd - 0.08, 0.045), (0.04, -0.22, 0.08), 0)
        else:
            _add_box(bm, -hw + t, hw - t, -hd + 0.03, hd - t, sz, sz + 0.045, mat_idx=0)

        # Irregular grey stone/plaster rubble chunks (mat_idx = 1)
        for j in range(rng.randint(2, 4)):
            rx = rng.uniform(-hw + t + 0.12, hw - t - 0.12)
            ry = rng.uniform(-hd + 0.10, hd - t - 0.10)
            rad = rng.uniform(0.045, 0.095)
            add_rubble_chunk((rx, ry, sz + 0.045 + rad * 0.55), rad, i * 31 + j * 7, mat_idx=1)

        # Toppled/leaning battered books & parchment bundles (mat_idx = 2 or 3)
        for j in range(rng.randint(2, 5)):
            bx = rng.uniform(-hw + t + 0.14, hw - t - 0.14)
            by = rng.uniform(-hd + 0.12, hd - t - 0.12)
            bw_b = rng.uniform(0.04, 0.08)
            bd_b = rng.uniform(0.16, 0.24)
            bh_b = rng.uniform(0.18, 0.28)
            leaning = rng.choice([True, False])
            if leaning:
                rot = (rng.uniform(-0.1, 0.1), rng.uniform(-0.65, 0.65), rng.uniform(-0.35, 0.35))
                bz = sz + 0.045 + bh_b * 0.44
            else:
                # Lying flat / askew
                rot = (math.pi * 0.5 + rng.uniform(-0.08, 0.08), rng.uniform(-0.12, 0.12), rng.uniform(-0.9, 0.9))
                bz = sz + 0.045 + bw_b * 0.55
            add_rotated_box((bx, by, bz), (bw_b, bd_b, bh_b), rot, mat_idx=2 if j % 2 == 0 else 3)

    # Distinct weathered parchment/book materials so shelf items read clearly against dark oak
    parchment_mat = solid_material('mat-shelf-parchment', (0.52, 0.44, 0.31), roughness=0.92)
    binding_mat = solid_material('mat-shelf-binding', (0.34, 0.14, 0.12), roughness=0.84)

    mesh = bpy.data.meshes.new(obj_spec['id'])
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(wood_mat)
    mesh.materials.append(rubble_mat)
    mesh.materials.append(parchment_mat)
    mesh.materials.append(binding_mat)
    uv = mesh.uv_layers.new(name='UVMap')
    uv_scale = 1.0 / tile_m
    for poly in mesh.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = ((co.y if ax == 0 else co.x) * uv_scale, (co.y if ax == 2 else co.z) * uv_scale)
    obj = bpy.data.objects.new(obj_spec['id'], mesh)
    obj.location = (cx, cy, cz)
    obj.rotation_euler = (0.0, 0.0, yaw)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def wall_frame(side: str, width: float, depth: float):
    """Return (origin, tangent, inward_normal, length) for cardinal wall N/E/S/W."""
    hw, hd = width / 2.0, depth / 2.0
    if side == 'N':
        return Vector((0.0, hd, 0.0)), Vector((1.0, 0.0, 0.0)), Vector((0.0, -1.0, 0.0)), width
    if side == 'S':
        return Vector((0.0, -hd, 0.0)), Vector((-1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)), width
    if side == 'E':
        return Vector((hw, 0.0, 0.0)), Vector((0.0, -1.0, 0.0)), Vector((-1.0, 0.0, 0.0)), depth
    return Vector((-hw, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)), Vector((1.0, 0.0, 0.0)), depth


def build_wall_with_openings(
    side: str,
    width: float,
    depth: float,
    height: float,
    displacement: float,
    openings: list[dict],
    mat: bpy.types.Material,
    tile_m: float,
    uv_z_range: tuple[float, float] | None = None,
):
    """Build one displaced wall panel with real arch cutouts for openings and recesses."""
    origin, tangent, inward, nominal_length = wall_frame(side, width, depth)
    # Overlap walls past corners, floor, and ceiling so no seam gaps can ever open.
    h_pad = 0.65
    z_min, z_max = -0.25, height + 0.65
    length = nominal_length + 2.0 * h_pad
    total_h = z_max - z_min
    nu = max(28, int(length * 4))
    nv = max(16, int(total_h * 4))
    bm = bmesh.new()
    grid = []
    seed = {'N': 1, 'E': 2, 'S': 3, 'W': 4}[side]

    def in_opening(u: float, z: float) -> bool:
        for op in openings:
            pl = op['placement']
            cu = pl.get('offsetAlongWall', 0.0)
            ow, _, oh = pl.get('sizeMetres', [2.0, 0.5, 2.5])
            half_w = ow * 0.5
            if abs(u - cu) > half_w or z > oh or z < -0.05:
                continue
            # Arched top over upper 28% of opening height.
            arch_start = oh * 0.72
            if z <= arch_start:
                return True
            rx = (u - cu) / max(half_w, 1e-4)
            rz = (z - arch_start) / max(oh - arch_start, 1e-4)
            if rx * rx + rz * rz <= 1.0:
                return True
        return False

    for iv in range(nv + 1):
        row = []
        z = z_min + total_h * (iv / nv)
        for iu in range(nu + 1):
            u = -length * 0.5 + length * (iu / nu)
            p = origin + tangent * u + Vector((0.0, 0.0, z))
            # Taper displacement near floor so floor/wall mates cleanly.
            edge_fade = min(1.0, max(0.0, (z + 0.1) / 0.45))
            disp = displacement * edge_fade * noise_3d(p.x * 0.65, p.y * 0.65, p.z * 0.65, seed)
            p = p + inward * disp
            row.append(bm.verts.new(p))
        grid.append(row)

    for iv in range(nv):
        for iu in range(nu):
            v0, v1, v2, v3 = grid[iv][iu], grid[iv][iu + 1], grid[iv + 1][iu + 1], grid[iv + 1][iu]
            cu = -length * 0.5 + length * ((iu + 0.5) / nu)
            cz = z_min + total_h * ((iv + 0.5) / nv)
            if in_opening(cu, cz):
                continue
            bm.faces.new((v0, v1, v2, v3))

    obj = create_mesh_object(f'wall-{side}', bm, mat, uv_scale=1.0 / tile_m)
    if uv_z_range is not None:
        # Align upper-wall V cleanly from wainscot top (v=0) to ceiling cornice (v=1).
        z0_uv, z1_uv = uv_z_range
        span_z = max(z1_uv - z0_uv, 1e-4)
        mesh = obj.data
        uv_layer = mesh.uv_layers.active
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                u_coord = (co - origin).dot(tangent) / tile_m
                v_coord = max(0.0, min(1.0, (co.z - z0_uv) / span_z))
                uv_layer.data[li].uv = (u_coord, v_coord)
    return obj


def build_passage_or_recess(
    obj_spec: dict,
    width: float,
    depth: float,
    wall_mat: bpy.types.Material,
    floor_mat: bpy.types.Material,
    dark_mat: bpy.types.Material,
    tile_m: float,
):
    """Build deep arched rock reveal/tunnel for an opening or capped recess."""
    pl = obj_spec['placement']
    side = pl['wall']
    origin, tangent, inward, _ = wall_frame(side, width, depth)
    outward = -inward
    cu = pl.get('offsetAlongWall', 0.0)
    ow, _, oh = pl.get('sizeMetres', [2.0, 0.5, 2.5])
    tun_depth = pl.get('depthMetres', 2.6 if obj_spec['category'] == 'opening' else 1.5)
    center = origin + tangent * cu

    # Build arched tunnel sleeve from d=-0.35 (overlapping wall) to d=tun_depth.
    bm = bmesh.new()
    arch_pts = []
    half_w = ow * 0.5
    arch_start = oh * 0.72
    # Left jamb -> arch crown -> right jamb
    for z in np.linspace(0.0, arch_start, 5):
        arch_pts.append((-half_w, float(z)))
    for i in range(1, 10):
        a = math.pi * (1.0 - i / 10.0)
        arch_pts.append((math.cos(a) * half_w, arch_start + math.sin(a) * (oh - arch_start)))
    for z in np.linspace(arch_start, 0.0, 5):
        arch_pts.append((half_w, float(z)))

    rings = []
    n_depth = 8
    for idp in range(n_depth + 1):
        d = -0.05 + (tun_depth + 0.05) * (idp / n_depth)
        ring = []
        for u, z in arch_pts:
            p = center + tangent * u + outward * d + Vector((0.0, 0.0, z))
            n = 0.08 * noise_3d(p.x * 1.4, p.y * 1.4, p.z * 1.4, 71)
            ring.append(bm.verts.new(p + inward * (n * 0.4) + Vector((0, 0, n * 0.3))))
        rings.append(ring)

    for idp in range(n_depth):
        for k in range(len(arch_pts) - 1):
            bm.faces.new((rings[idp][k], rings[idp + 1][k], rings[idp + 1][k + 1], rings[idp][k + 1]))

    # Cap the back of the tunnel/recess.
    back_verts = [bm.verts.new(center + tangent * u + outward * tun_depth + Vector((0, 0, z))) for u, z in arch_pts]
    back_face = bm.faces.new(back_verts)
    back_face.material_index = 0

    mesh = bpy.data.meshes.new(obj_spec['id'])
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(wall_mat)
    mesh.materials.append(dark_mat)
    uv_layer = mesh.uv_layers.new(name='UVMap')
    uv_scale = 1.0 / tile_m
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv_layer.data[li].uv = ((co.x + co.y) * uv_scale, co.z * uv_scale)
    obj = bpy.data.objects.new(obj_spec['id'], mesh)
    bpy.context.scene.collection.objects.link(obj)

    # Floor slab inside the passage/recess.
    bf = bmesh.new()
    v0 = bf.verts.new(center - tangent * (half_w + 0.1) - outward * 0.35)
    v1 = bf.verts.new(center + tangent * (half_w + 0.1) - outward * 0.35)
    v2 = bf.verts.new(center + tangent * (half_w + 0.1) + outward * tun_depth)
    v3 = bf.verts.new(center - tangent * (half_w + 0.1) + outward * tun_depth)
    bf.faces.new((v0, v1, v2, v3))
    create_mesh_object(obj_spec['id'] + '-floor', bf, floor_mat, uv_scale=1.0 / tile_m)

    # Sculpted 3D rock/stone arch surround encompassing the tunnel entrance.
    ba = bmesh.new()
    arch_thickness = 0.52
    proj_in = 0.45
    proj_out = 0.42
    # Build inner and outer profile loops around the full archway (left jamb -> crown -> right jamb).
    inner_pts = arch_pts
    outer_pts = []
    for u, z in inner_pts:
        if z <= arch_start:
            # Jambs expand horizontally outward
            ou = u - arch_thickness if u < 0 else u + arch_thickness
            oz = z
        else:
            # Arch crown expands radially outward
            dx = u
            dz = z - arch_start
            dist = max(math.hypot(dx, dz), 1e-4)
            ou = u + (dx / dist) * arch_thickness
            oz = z + (dz / dist) * arch_thickness
        outer_pts.append((ou, oz))

    rng = random.Random(sum(map(ord, obj_spec['id'])))
    for k in range(len(inner_pts) - 1):
        iu0, iz0 = inner_pts[k]
        iu1, iz1 = inner_pts[k + 1]
        ou0, oz0 = outer_pts[k]
        ou1, oz1 = outer_pts[k + 1]
        # Slight per-stone variation for organic rough-hewn arch blocks
        jin = proj_in + rng.uniform(-0.06, 0.08)
        jout = proj_out + rng.uniform(-0.04, 0.06)

        def pt(u, z, d_in):
            p = center + tangent * u + inward * d_in + Vector((0.0, 0.0, z))
            n = 0.05 * noise_3d(p.x * 2.1, p.y * 2.1, p.z * 2.1, 89)
            return p + inward * n

        # 8 corners of this arch voussoir / jamb stone
        v_fi0 = ba.verts.new(pt(iu0, iz0, jin))
        v_fi1 = ba.verts.new(pt(iu1, iz1, jin))
        v_fo1 = ba.verts.new(pt(ou1, oz1, jin * 0.72))
        v_fo0 = ba.verts.new(pt(ou0, oz0, jin * 0.72))
        v_bi0 = ba.verts.new(pt(iu0, iz0, -jout))
        v_bi1 = ba.verts.new(pt(iu1, iz1, -jout))
        v_bo1 = ba.verts.new(pt(ou1, oz1, -jout))
        v_bo0 = ba.verts.new(pt(ou0, oz0, -jout))

        ba.faces.new((v_fi0, v_fi1, v_fo1, v_fo0))  # front face
        ba.faces.new((v_bo0, v_bo1, v_bi1, v_bi0))  # back face
        ba.faces.new((v_bi0, v_bi1, v_fi1, v_fi0))  # inner reveal
        ba.faces.new((v_fo0, v_fo1, v_bo1, v_bo0))  # outer bevel
        ba.faces.new((v_fi0, v_fo0, v_bo0, v_bi0))  # end cap 0
        ba.faces.new((v_fi1, v_bi1, v_bo1, v_fo1))  # end cap 1

    bmesh.ops.recalc_face_normals(ba, faces=ba.faces)
    create_mesh_object(obj_spec['id'] + '-arch', ba, wall_mat, uv_scale=1.0 / tile_m)

    # Optional warm/cool bounce light inside exit passages.
    if pl.get('tunnelEnergy', 0) > 0:
        ldata = bpy.data.lights.new(obj_spec['id'] + '-light', 'POINT')
        ldata.energy = pl['tunnelEnergy']
        ldata.color = tuple(pl.get('tunnelColor', [1.0, 0.75, 0.45]))
        ldata.shadow_soft_size = 0.5
        lobj = bpy.data.objects.new(obj_spec['id'] + '-light', ldata)
        bpy.context.scene.collection.objects.link(lobj)
        lobj.location = center + outward * (tun_depth * 0.6) + Vector((0, 0, oh * 0.55))


def build_well(obj_spec: dict, stone_mat: bpy.types.Material, dark_mat: bpy.types.Material, etching_mat: bpy.types.Material | None):
    """Build circular dressed-ashlar well curb + deep shaft + optional etched front blocks."""
    pl = obj_spec['placement']
    cx, cy, cz = pl.get('position', [0.0, 0.0, 0.0])
    r_out = pl.get('outerRadius', 1.65)
    r_in = pl.get('innerRadius', 1.25)
    h = pl.get('height', 0.85)
    shaft_d = pl.get('shaftDepth', 8.0)
    blocks = pl.get('blocks', 18)

    bm = bmesh.new()
    rng = random.Random(42)
    # Two courses of tight, heavy weathered coping stones forming the circular curb.
    for course in range(2):
        z0 = cz + course * (h * 0.49)
        z1 = cz + (course + 1) * (h * 0.50)
        angle_offset = (math.pi / blocks) if course == 1 else 0.0
        for i in range(blocks):
            a0 = angle_offset + i * (math.tau / blocks) + 0.0015
            a1 = angle_offset + (i + 1) * (math.tau / blocks) - 0.0015
            ro = r_out + rng.uniform(-0.02, 0.02)
            ri = r_in + rng.uniform(-0.01, 0.01)
            zh = z1 + rng.uniform(-0.012, 0.012)
            pts = [
                (cx + math.cos(a0) * ri, cy + math.sin(a0) * ri, z0),
                (cx + math.cos(a0) * ro, cy + math.sin(a0) * ro, z0),
                (cx + math.cos(a1) * ro, cy + math.sin(a1) * ro, z0),
                (cx + math.cos(a1) * ri, cy + math.sin(a1) * ri, z0),
                (cx + math.cos(a0) * ri, cy + math.sin(a0) * ri, zh),
                (cx + math.cos(a0) * ro, cy + math.sin(a0) * ro, zh),
                (cx + math.cos(a1) * ro, cy + math.sin(a1) * ro, zh),
                (cx + math.cos(a1) * ri, cy + math.sin(a1) * ri, zh),
            ]
            vs = [bm.verts.new(p) for p in pts]
            bm.faces.new((vs[0], vs[3], vs[2], vs[1]))  # bottom
            bm.faces.new((vs[4], vs[5], vs[6], vs[7]))  # top
            bm.faces.new((vs[1], vs[2], vs[6], vs[5]))  # outer
            bm.faces.new((vs[3], vs[0], vs[4], vs[7]))  # inner
            bm.faces.new((vs[0], vs[1], vs[5], vs[4]))  # side 0
            bm.faces.new((vs[2], vs[3], vs[7], vs[6]))  # side 1

    # Deep masonry shaft descending below the floor (faces pointing inward).
    segs = 32
    top_ring = [bm.verts.new((cx + math.cos(i * math.tau / segs) * (r_in + 0.02), cy + math.sin(i * math.tau / segs) * (r_in + 0.02), cz + 0.02)) for i in range(segs)]
    bot_ring = [bm.verts.new((cx + math.cos(i * math.tau / segs) * (r_in + 0.02), cy + math.sin(i * math.tau / segs) * (r_in + 0.02), cz - shaft_d)) for i in range(segs)]
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((top_ring[i], top_ring[j], bot_ring[j], bot_ring[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    curb_obj = create_mesh_object(obj_spec['id'], bm, stone_mat, uv_scale=0.65)
    # Cylindrical UVs on vertical faces so repeating grey stone wraps cleanly around the well.
    cmesh = curb_obj.data
    cuv = cmesh.uv_layers.active
    circumference = math.tau * r_out
    for poly in cmesh.polygons:
        if abs(poly.normal.z) < 0.7:
            # Keep loop angles continuous across the -pi/+pi seam per polygon.
            angles = [math.atan2(cmesh.vertices[cmesh.loops[li].vertex_index].co.y - cy,
                                 cmesh.vertices[cmesh.loops[li].vertex_index].co.x - cx) for li in poly.loop_indices]
            ref_a = angles[0]
            for li, a in zip(poly.loop_indices, angles):
                da = a - ref_a
                if da > math.pi:
                    a -= math.tau
                elif da < -math.pi:
                    a += math.tau
                co = cmesh.vertices[cmesh.loops[li].vertex_index].co
                cuv.data[li].uv = ((a / math.tau) * (circumference / 1.35), (co.z - cz) / 1.35)

    # Dark unlit shaft bottom disc.
    bd = bmesh.new()
    disc = [bd.verts.new((cx + math.cos(i * math.tau / segs) * (r_in + 0.05), cy + math.sin(i * math.tau / segs) * (r_in + 0.05), cz - shaft_d + 0.05)) for i in range(segs)]
    bd.faces.new(disc)
    create_mesh_object(obj_spec['id'] + '-dark-bottom', bd, dark_mat, uv_scale=1.0)

    # Optional curved etched stone relief band on the south face (-Y).
    if etching_mat is not None:
        be = bmesh.new()
        arc_steps = 12
        a_start = -math.pi * 0.72
        a_end = -math.pi * 0.28
        r_band = r_out + 0.032
        row0, row1 = [], []
        for i in range(arc_steps + 1):
            a = a_start + (a_end - a_start) * (i / arc_steps)
            row0.append(be.verts.new((cx + math.cos(a) * r_band, cy + math.sin(a) * r_band, cz + 0.06)))
            row1.append(be.verts.new((cx + math.cos(a) * r_band, cy + math.sin(a) * r_band, cz + h * 0.92)))
        for i in range(arc_steps):
            be.faces.new((row0[i], row0[i + 1], row1[i + 1], row1[i]))
        emesh = bpy.data.meshes.new(obj_spec['id'] + '-etchings-relief')
        be.to_mesh(emesh)
        be.free()
        emesh.materials.append(etching_mat)
        uv = emesh.uv_layers.new(name='UVMap')
        for idx, poly in enumerate(emesh.polygons):
            u0, u1 = idx / arc_steps, (idx + 1) / arc_steps
            coords = [(u0, 0.0), (u1, 0.0), (u1, 1.0), (u0, 1.0)]
            for li, (u, v) in zip(poly.loop_indices, coords):
                uv.data[li].uv = (u, v)
        eobj = bpy.data.objects.new(obj_spec['id'] + '-etchings-relief', emesh)
        bpy.context.scene.collection.objects.link(eobj)
    return curb_obj


def build_floor_crack(obj_spec: dict, dark_mat: bpy.types.Material):
    """Build a narrow jagged fissure across the floor."""
    pl = obj_spec['placement']
    cx, cy, cz = pl.get('position', [0.0, 0.0, 0.0])
    cw, cl, _ = pl.get('sizeMetres', [0.10, 3.0, 0.05])
    yaw = math.radians(pl.get('yawDeg', 0.0))
    bm = bmesh.new()
    segs = 22
    rng = random.Random(77)
    left, right = [], []
    for i in range(segs + 1):
        t = (i / segs) - 0.5
        y = t * cl
        jag = rng.uniform(-0.08, 0.08) * (1.0 - abs(t) * 1.6)
        half = cw * 0.5 * (1.0 - abs(t) * 1.4)
        left.append(bm.verts.new((jag - half, y, 0.032)))
        right.append(bm.verts.new((jag + half, y, 0.032)))
    for i in range(segs):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    obj = create_mesh_object(obj_spec['id'], bm, dark_mat, uv_scale=1.0)
    obj.location = (cx, cy, cz)
    obj.rotation_euler = (0.0, 0.0, yaw)
    return obj


def build_boulder_cluster(obj_spec: dict, mat: bpy.types.Material, tile_m: float):
    """Scatter angular low-poly rock boulders and rubble to ground walls into the floor."""
    pl = obj_spec['placement']
    cx, cy, cz = pl.get('position', [0.0, 0.0, 0.0])
    sx, sy, sz = pl.get('sizeMetres', [3.0, 1.0, 0.8])
    count = pl.get('count', 10)
    rng = random.Random(pl.get('seed', 1))
    bm = bmesh.new()
    for i in range(count):
        rx = cx + rng.uniform(-sx * 0.5, sx * 0.5)
        ry = cy + rng.uniform(-sy * 0.5, sy * 0.5)
        r = rng.uniform(0.14, sz * 0.65)
        ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in ret['verts']:
            # Flatten bottom and facet each boulder.
            scale_x = rng.uniform(0.85, 1.25)
            scale_y = rng.uniform(0.85, 1.25)
            scale_z = rng.uniform(0.55, 0.95)
            v.co.x = rx + v.co.x * scale_x
            v.co.y = ry + v.co.y * scale_y
            v.co.z = max(cz - 0.04, cz + (v.co.z + r * 0.45) * scale_z)
    return create_mesh_object(obj_spec['id'], bm, mat, uv_scale=1.0 / tile_m)


def import_hero_glb(obj_spec: dict, mat: bpy.types.Material | None = None, tile_m: float = 1.5):
    """Import an external hero GLB (e.g. from Hunyuan3D), decimate, box-UV/assign material, and ground-snap."""
    path = ROOT / obj_spec['meshPath']
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    imported = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
    if not imported:
        raise RuntimeError(f'No mesh found in {path}')

    bpy.ops.object.select_all(action='DESELECT')
    for o in imported:
        o.select_set(True)
    bpy.context.view_layer.objects.active = imported[0]
    if len(imported) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj_spec['id']
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)

    coords = [v.co for v in obj.data.vertices]
    lo = Vector([min(v[i] for v in coords) for i in range(3)])
    hi = Vector([max(v[i] for v in coords) for i in range(3)])
    center = Vector(((lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, lo.z))
    span = hi - lo

    pl = obj_spec['placement']
    pos = Vector(pl.get('position', [0.0, 0.0, 0.0]))
    size = pl.get('sizeMetres')
    scale = Vector((1, 1, 1)) if not size else Vector([size[i] / max(span[i], 1e-5) for i in range(3)])
    yaw = math.radians(pl.get('yawDeg', 0.0))

    obj.data.transform(Matrix.Diagonal((*scale, 1.0)) @ Matrix.Translation(-center))

    # Decimate dense Hunyuan3D meshes cleanly for WebXR
    tri_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tri_count > 6500:
        mod = obj.modifiers.new('HeroDecimate', 'DECIMATE')
        mod.ratio = 6500.0 / tri_count
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # Apply BOM surface material with clean triplanar box UVs if mesh is untextured or surface specified
    if mat is not None:
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
        uv_scale = 1.0 / tile_m
        for poly in obj.data.polygons:
            n = poly.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for li in poly.loop_indices:
                co = obj.data.vertices[obj.data.loops[li].vertex_index].co
                if ax == 0:
                    uv.data[li].uv = (co.y * uv_scale, co.z * uv_scale)
                elif ax == 1:
                    uv.data[li].uv = (co.x * uv_scale, co.z * uv_scale)
                else:
                    uv.data[li].uv = (co.x * uv_scale, co.y * uv_scale)
        obj.data.materials.clear()
        obj.data.materials.append(mat)

    obj.location = pos
    obj.rotation_euler = (0.0, 0.0, yaw)
    return obj


def add_zil_anchor(obj_spec: dict):
    """Create an empty transform node for an engine-controlled interactive ZIL prop."""
    identity = obj_spec.get('zilIdentity') or obj_spec['id']
    pl = obj_spec['placement']
    anchor = bpy.data.objects.new(f'anchor:{identity}', None)
    anchor.empty_display_type = 'PLAIN_AXES'
    anchor.empty_display_size = 0.35
    anchor.location = tuple(pl.get('position', [0.0, 0.0, 0.0]))
    anchor.rotation_euler = (0.0, 0.0, math.radians(pl.get('yawDeg', 0.0)))
    anchor['source_identity'] = identity
    anchor['engine_state_controlled'] = True
    bpy.context.scene.collection.objects.link(anchor)
    return anchor


# ---------------------------------------------------------------------------
# Organic cavern builders (zero box structures: continuous terrain + dome)
# ---------------------------------------------------------------------------

def ford_stream_center_y(x: float) -> float:
    return -0.7 + 1.15 * math.sin(x * 0.22 + 0.3)


def ford_path_center_x(y: float) -> float:
    return -1.5 + 1.35 * math.sin(y * 0.24 - 0.2)


def organic_cavern_ground_z(x: float, y: float, w: float, d: float) -> float:
    """Continuous heightfield:
    - Shallow ford stream runs low all the way to the far distance in both E/W directions.
    - Winding northern path is recessed lower than the surrounding ground.
    - Distant ground rises into natural cavern slopes everywhere except the ford and path.
    """
    # 1. Shallow ford stream running E-W to the far horizon in both directions
    sy = ford_stream_center_y(x)
    stream_dist = abs(y - sy)
    stream_half_w = 2.85 + 0.55 * math.sin(x * 0.28)
    t_stream = max(0.0, min(1.0, stream_dist / stream_half_w))
    in_ford = 0.5 + 0.5 * math.cos(t_stream * math.pi)  # 1 at stream center, 0 on banks
    stream_z = -0.34 + 0.44 * (1.0 - in_ford)
    # Wide gentle bank transition so distant hills slope softly down to the water
    t_ford_valley = max(0.0, min(1.0, max(0.0, stream_dist - stream_half_w * 0.7) / 6.5))
    in_ford_valley = 0.5 + 0.5 * math.cos(t_ford_valley * math.pi)

    # 2. Winding northern path (+Y): stays low and carved gently below surrounding banks
    px = ford_path_center_x(y)
    path_dist = abs(x - px)
    north_fade = max(0.0, min(1.0, (y - (sy + 1.4)) / 2.8))
    t_path = max(0.0, min(1.0, max(0.0, path_dist - 1.2) / 5.2))
    in_path = north_fade * (0.5 + 0.5 * math.cos(t_path * math.pi))

    # 3. South tunnel approach stays low in front of the tunnel mouth
    south_portal_dist = math.hypot(x - 2.4, y - (-5.2))
    in_south_approach = max(0.0, 1.0 - max(0.0, south_portal_dist - 2.0) / 4.2)

    # 4. Distant ground rises gently into rolling cavern slopes EXCEPT the ford and path
    dist_from_center = math.hypot(x / 12.5, (y - 1.0) / 13.0)
    distant_rise = min(3.4, 1.45 * (max(0.0, dist_from_center - 0.55) ** 1.25))
    # Gentle bank shoulders immediately flanking the recessed path so the path reads lower
    path_shoulder = north_fade * 0.55 * (1.0 - in_path) * (1.0 - in_ford_valley)

    # Suppress rising ground along the ford valley (to infinity E/W), recessed path, and tunnel mouth
    clear_mask = (1.0 - in_ford_valley) * (1.0 - 0.90 * in_path) * (1.0 - 0.85 * in_south_approach)
    path_grade = 0.022 * max(0.0, y - 2.0) * in_path

    # Organic gravel/rock undulation (calmer inside the recessed path)
    micro = 0.08 * noise_3d(x * 0.42, y * 0.42, 0.0, 19) * (1.0 - 0.65 * in_path)
    return stream_z + (distant_rise + path_shoulder) * clear_mask + path_grade + micro


def build_organic_cavern_terrain(
    w: float,
    d: float,
    shore_mat: bpy.types.Material,
    cobble_mat: bpy.types.Material,
    tile_m: float,
    water_z: float = -0.05,
    open_horizon: bool = False,
):
    """Build one continuous organic terrain with cobble streambed and gravel shores."""
    bm = bmesh.new()
    if open_horizon:
        # Extend floor far into the distance so it blends seamlessly into cavern fog/skybox.
        nx, ny = 104, 108
        x0, x1 = -36.0, 36.0
        y0, y1 = -20.0, 44.0
    else:
        nx, ny = 84, 88
        x0, x1 = -w * 0.62, w * 0.62
        y0, y1 = -d * 0.58, d * 0.78
    grid = []
    for iy in range(ny + 1):
        row = []
        y = y0 + (y1 - y0) * (iy / ny)
        for ix in range(nx + 1):
            x = x0 + (x1 - x0) * (ix / nx)
            z = organic_cavern_ground_z(x, y, w, d)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)

    for iy in range(ny):
        for ix in range(nx):
            v0, v1, v2, v3 = grid[iy][ix], grid[iy][ix + 1], grid[iy + 1][ix + 1], grid[iy + 1][ix]
            face = bm.faces.new((v0, v1, v2, v3))
            avg_z = (v0.co.z + v1.co.z + v2.co.z + v3.co.z) * 0.25
            face.material_index = 1 if avg_z < (water_z + 0.05) else 0

    mesh = bpy.data.meshes.new('cavern-terrain')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(shore_mat)
    mesh.materials.append(cobble_mat)
    uv = mesh.uv_layers.new(name='UVMap')
    scale = 1.0 / tile_m
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = (co.x * scale, co.y * scale)
    mesh.update()
    obj = bpy.data.objects.new('cavern-terrain', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_organic_cavern_dome(
    w: float,
    d: float,
    h: float,
    disp: float,
    wall_mat: bpy.types.Material,
    ceil_mat: bpy.types.Material,
    tile_m: float,
    tunnels: list[dict],
):
    """Build one continuous, vaulted organic limestone cavern shell (walls + ceiling, no box corners)."""
    bm = bmesh.new()
    n_theta = 72
    n_phi = 24  # 0 = below ground bank, 1 = ceiling crown
    rx_base = w * 0.54
    ry_south = d * 0.48
    ry_north = d * 0.76  # elongated northward into the stalagmite cavern

    def in_tunnel_cutout(p: Vector) -> bool:
        for t in tunnels:
            pl = t['placement']
            tx, ty, tz = pl.get('position', [2.4, -6.8, 0.0])
            tw, _, th = pl.get('sizeMetres', [3.4, 1.0, 3.2])
            # Distance to tunnel portal center in XY and Z
            dx = p.x - tx
            dy = p.y - ty
            if math.hypot(dx, dy) > max(tw * 0.72, 2.2):
                continue
            if -0.4 <= p.z <= th + 0.15:
                return True
        return False

    rings = []
    for ip in range(n_phi + 1):
        t = ip / n_phi  # 0..1 from ground skirt to ceiling apex
        # Smooth dome profile: vertical-ish organic walls curving gently into vaulted ceiling
        phi = t * (math.pi * 0.5)
        r_scale = math.cos(phi) ** 0.78
        z_base = -0.9 + (h + 0.9) * (math.sin(phi) ** 0.85)
        ring = []
        for it in range(n_theta):
            theta = it * (math.tau / n_theta)
            cx = math.sin(theta)
            cy = math.cos(theta)
            ry = ry_north if cy >= 0 else ry_south
            # Organic non-circular cavern footprint with natural rocky bays & buttresses
            bay = 1.0 + 0.10 * math.sin(theta * 3.0 + 0.6) + 0.06 * math.cos(theta * 5.0 - 0.4)
            x = cx * rx_base * bay * r_scale
            y = cy * ry * bay * r_scale
            # Multi-octave rugged limestone relief (stronger on walls/overhangs)
            relief = disp * (0.45 + 0.55 * math.sin(t * math.pi)) * noise_3d(x * 0.34, y * 0.34, z_base * 0.48, 37)
            strata = 0.22 * math.sin(z_base * 2.1 + x * 0.35) * math.cos(phi)
            x -= cx * (relief + strata)
            y -= cy * (relief + strata)
            z = z_base + 0.38 * noise_3d(x * 0.25, y * 0.25, 1.5, 53) * (t ** 0.6)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)

    for ip in range(n_phi):
        for it in range(n_theta):
            it2 = (it + 1) % n_theta
            v0, v1, v2, v3 = rings[ip][it], rings[ip][it2], rings[ip + 1][it2], rings[ip + 1][it]
            mid = (v0.co + v1.co + v2.co + v3.co) * 0.25
            if in_tunnel_cutout(mid):
                continue
            # Faces point inward into the cavern
            face = bm.faces.new((v0, v3, v2, v1))
            face.material_index = 1 if (ip / n_phi) > 0.68 else 0

    mesh = bpy.data.meshes.new('cavern-dome')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(wall_mat)
    mesh.materials.append(ceil_mat)
    uv = mesh.uv_layers.new(name='UVMap')
    uv_scale = 1.0 / tile_m
    for poly in mesh.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y * uv_scale, co.z * uv_scale
            elif ax == 1:
                u, v = co.x * uv_scale, co.z * uv_scale
            else:
                u, v = co.x * uv_scale, co.y * uv_scale
            uv.data[li].uv = (u, v)
    mesh.update()
    obj = bpy.data.objects.new('cavern-dome', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_water_surface(obj_spec: dict, w: float, d: float):
    """Build translucent rippled shallow water plane revealing the cobble streambed beneath."""
    pl = obj_spec['placement']
    wz = float(pl.get('position', [0.0, 0.0, -0.05])[2])
    color = tuple(pl.get('waterColor', [0.16, 0.34, 0.34]))
    alpha = float(pl.get('alpha', 0.56))

    mat = bpy.data.materials.new(obj_spec['id'] + '-mat')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.09
    bsdf.inputs['Alpha'].default_value = alpha
    if 'IOR' in bsdf.inputs:
        bsdf.inputs['IOR'].default_value = 1.333
    mat.surface_render_method = 'BLENDED'
    mat.use_backface_culling = False

    bm = bmesh.new()
    nx, ny = 72, 44
    x0, x1 = -34.0, 34.0
    y0, y1 = -12.0, 9.0
    grid = []
    for iy in range(ny + 1):
        row = []
        y = y0 + (y1 - y0) * (iy / ny)
        for ix in range(nx + 1):
            x = x0 + (x1 - x0) * (ix / nx)
            ripple = 0.012 * math.sin(x * 3.4 + y * 2.7) + 0.008 * math.cos(x * 5.8 - y * 4.3)
            row.append(bm.verts.new((x, y, wz + ripple)))
        grid.append(row)
    for iy in range(ny):
        for ix in range(nx):
            bm.faces.new((grid[iy][ix], grid[iy][ix + 1], grid[iy + 1][ix + 1], grid[iy + 1][ix]))
    return create_mesh_object(obj_spec['id'], bm, mat, uv_scale=0.35)


def build_smoothed_tunnel(
    obj_spec: dict,
    wall_mat: bpy.types.Material,
    floor_mat: bpy.types.Material,
    dark_mat: bpy.types.Material,
    tile_m: float,
):
    """Build an organic enlarged & smoothed arched dark tunnel receding deep into shadow."""
    pl = obj_spec['placement']
    tx, ty, tz = pl.get('position', [2.4, -6.8, 0.0])
    tw, _, th = pl.get('sizeMetres', [3.4, 1.0, 3.2])
    tun_depth = float(pl.get('depthMetres', 10.5))
    yaw = math.radians(pl.get('yawDeg', 180.0))
    curve_yaw = math.radians(pl.get('curveYawDeg', 16.0))

    # Forward direction into the tunnel
    fwd0 = Vector((math.sin(yaw), math.cos(yaw), 0.0))
    right0 = Vector((math.cos(yaw), -math.sin(yaw), 0.0))
    origin = Vector((tx, ty, tz))

    # Rounded horseshoe tunnel profile (organic smoothed cave arch)
    n_prof = 18
    profile = []
    for i in range(n_prof + 1):
        t = i / n_prof  # 0 = left floor, 0.5 = crown, 1 = right floor
        ang = math.pi * (1.0 - t)
        u = math.cos(ang) * (tw * 0.5)
        z = (math.sin(ang) ** 0.72) * th - 0.12
        profile.append((u, z))

    bm = bmesh.new()
    rings = []
    n_steps = 14
    for s in range(n_steps + 1):
        frac = s / n_steps
        dist = -1.2 + (tun_depth + 1.2) * frac
        # Gentle horizontal curve deeper into the tunnel so the far end vanishes naturally
        bend = curve_yaw * (frac ** 1.8)
        cur_fwd = Vector((math.sin(yaw + bend), math.cos(yaw + bend), 0.0))
        cur_right = Vector((math.cos(yaw + bend), -math.sin(yaw + bend), 0.0))
        center = origin + fwd0 * dist + right0 * (math.sin(bend) * dist * 0.35)
        # Slightly narrow deeper inside
        taper = 1.0 - 0.14 * frac
        ring = []
        for u, z in profile:
            p = center + cur_right * (u * taper) + Vector((0.0, 0.0, z * taper))
            n = 0.09 * noise_3d(p.x * 1.1, p.y * 1.1, p.z * 1.1, 61)
            ring.append(bm.verts.new(p + cur_right * n + Vector((0.0, 0.0, n * 0.5))))
        rings.append(ring)

    for s in range(n_steps):
        for k in range(n_prof):
            bm.faces.new((rings[s][k], rings[s + 1][k], rings[s + 1][k + 1], rings[s][k + 1]))
    # Pitch-black terminal cap deep inside
    cap = bm.faces.new(rings[-1])
    cap.material_index = 1

    mesh = bpy.data.meshes.new(obj_spec['id'])
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(wall_mat)
    mesh.materials.append(dark_mat)
    uv = mesh.uv_layers.new(name='UVMap')
    uv_scale = 1.0 / tile_m
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x + co.y) * uv_scale, co.z * uv_scale)
    obj = bpy.data.objects.new(obj_spec['id'], mesh)
    bpy.context.scene.collection.objects.link(obj)

    # Organic sculpted rock buttresses & crown collar framing the tunnel mouth cleanly
    bb = bmesh.new()
    rng = random.Random(91)
    for j in range(11):
        ang = math.pi * (j / 10.0)
        bx = origin + right0 * (math.cos(ang) * (tw * 0.62)) - fwd0 * (0.35 + rng.uniform(-0.15, 0.25))
        bz = 0.20 + math.sin(ang) * (th * 1.04)
        rad = rng.uniform(0.85, 1.35)
        ret = bmesh.ops.create_icosphere(bb, subdivisions=2, radius=rad)
        for v in ret['verts']:
            dn = 1.0 + 0.22 * noise_3d(v.co.x * 2.2, v.co.y * 2.2, v.co.z * 2.2, 13 + j)
            v.co.x = bx.x + v.co.x * dn * 1.12
            v.co.y = bx.y + v.co.y * dn * 1.12
            v.co.z = bz + v.co.z * dn * 0.92
    create_mesh_object(obj_spec['id'] + '-buttresses', bb, wall_mat, uv_scale=1.0 / tile_m)


def build_tunnel_cliff_wall(
    tunnels: list[dict],
    wall_mat: bpy.types.Material,
    tile_m: float,
    w: float,
    h: float,
    disp: float,
):
    """Build a sweeping, tall organic cliff wall covering the tunnel side so the tunnel enters solid rock."""
    if not tunnels:
        return None
    main = tunnels[0]
    pl = main['placement']
    tx, ty, _ = pl.get('position', [2.4, -7.2, 0.0])
    tw, _, th = pl.get('sizeMetres', [3.5, 1.0, 3.3])

    bm = bmesh.new()
    nu, nv = 92, 24
    # Span the full extended horizon width so the cliff never ends abruptly along the ford.
    span_x = 74.0
    wall_h = max(9.5, h * 1.45)

    def in_tunnel_portal(x: float, z: float) -> bool:
        for t in tunnels:
            tpl = t['placement']
            px, _, _ = tpl.get('position', [tx, ty, 0.0])
            pw, _, ph = tpl.get('sizeMetres', [tw, 1.0, th])
            dx = (x - px) / max(pw * 0.5, 1e-4)
            if abs(dx) > 1.0 or z > ph or z < -0.2:
                continue
            arch_z = ph * 0.58
            if z <= arch_z:
                return True
            dz = (z - arch_z) / max(ph - arch_z, 1e-4)
            if dx * dx + dz * dz <= 1.0:
                return True
        return False

    # Sweeping curved cliff face across the southern side, with deep overhang cap covering the tunnel roof.
    grid = []
    for iv in range(nv + 1):
        t_v = iv / nv
        # Bottom skirt (-1.0 m) -> tall cliff face -> curves backward over the tunnel roof at top
        if t_v <= 0.78:
            z = -1.0 + (wall_h + 1.0) * (t_v / 0.78)
            back_curve = 0.0
        else:
            cap_t = (t_v - 0.78) / 0.22
            z = wall_h - 0.4 * cap_t
            back_curve = -14.0 * cap_t
        row = []
        for iu in range(nu + 1):
            t_u = iu / nu
            x = -span_x * 0.5 + span_x * t_u
            # Follow the south bank of the meandering ford all the way to both horizons
            bank_y = ford_stream_center_y(x) - 5.2
            # Smoothly blend from the tunnel portal depth to the meandering south riverbank
            portal_w = math.exp(-((x - tx) / 7.5) ** 2)
            arc_y = ty * portal_w + bank_y * (1.0 - portal_w)
            # Rugged limestone relief (reduced right around the portal rim)
            near_portal = 1.0 if abs(x - tx) > tw * 0.75 or z > th * 1.15 else 0.25
            relief = disp * 1.35 * near_portal * noise_3d(x * 0.28, arc_y * 0.28, z * 0.38, 47)
            overhang = 0.85 * math.sin(min(1.0, max(0.0, t_v / 0.78)) * math.pi)
            y = arc_y + back_curve + overhang + relief
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)

    for iv in range(nv):
        for iu in range(nu):
            v0, v1, v2, v3 = grid[iv][iu], grid[iv][iu + 1], grid[iv + 1][iu + 1], grid[iv + 1][iu]
            mid = (v0.co + v1.co + v2.co + v3.co) * 0.25
            if iv < int(nv * 0.78) and in_tunnel_portal(mid.x, mid.z):
                continue
            bm.faces.new((v0, v1, v2, v3))

    return create_mesh_object('tunnel-cliff-wall', bm, wall_mat, uv_scale=1.0 / tile_m)


def build_stalagmite_field(obj_spec: dict, mat: bpy.types.Material, tile_m: float, w: float, d: float):
    """Build organically fluted, tapered limestone stalagmites flanking the winding northern path."""
    pl = obj_spec['placement']
    cx, cy, _ = pl.get('position', [-0.5, 6.5, 0.0])
    sx, sy, _ = pl.get('sizeMetres', [14.0, 12.0, 4.0])
    count = int(pl.get('count', 36))
    min_h = float(pl.get('minHeight', 1.1))
    max_h = float(pl.get('maxHeight', 4.0))
    clearance = float(pl.get('pathClearance', 1.85))
    rng = random.Random(pl.get('seed', 404))

    bm = bmesh.new()
    placed = 0
    attempts = 0
    while placed < count and attempts < count * 10:
        attempts += 1
        x = cx + rng.uniform(-sx * 0.5, sx * 0.5)
        y = cy + rng.uniform(-sy * 0.5, sy * 0.5)
        # Keep the recessed northern path and the shallow ford channel clear
        sy_ford = ford_stream_center_y(x)
        if abs(y - sy_ford) < 3.1:
            continue
        if y > sy_ford + 1.5 and abs(x - ford_path_center_x(y)) < clearance:
            continue
        gz = organic_cavern_ground_z(x, y, w, d)
        if gz < 0.14:
            continue
        # Grow taller stalagmites as the ground rises, forming a dense natural barrier
        slope_boost = 1.0 + 0.28 * min(2.5, max(0.0, gz - 0.3))
        sh = rng.uniform(min_h, max_h) * slope_boost
        base_r = sh * rng.uniform(0.16, 0.26)
        segs = 9
        rings_n = 7
        rings = []
        for ir in range(rings_n + 1):
            t = ir / rings_n
            # Organic dripstone taper with slight bulges
            r = base_r * ((1.0 - t) ** 1.15) * (1.0 + 0.14 * math.sin(t * math.pi * 3.0)) + 0.03
            z = gz - 0.12 + sh * t
            ring = []
            for k in range(segs):
                a = k * (math.tau / segs)
                flute = 1.0 + 0.16 * math.sin(a * 3.0 + t * 4.0 + placed)
                ring.append(bm.verts.new((x + math.cos(a) * r * flute, y + math.sin(a) * r * flute, z)))
            rings.append(ring)
        for ir in range(rings_n):
            for k in range(segs):
                k2 = (k + 1) % segs
                bm.faces.new((rings[ir][k], rings[ir][k2], rings[ir + 1][k2], rings[ir + 1][k]))
        tip = bm.verts.new((x, y, gz + sh + 0.05))
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((rings[-1][k], rings[-1][k2], tip))
        placed += 1
    return create_mesh_object(obj_spec['id'], bm, mat, uv_scale=1.0 / tile_m)


def build_stalactite_ceiling(obj_spec: dict, mat: bpy.types.Material, tile_m: float, w: float, d: float, h: float):
    """Build clusters of hanging tapered limestone stalactites anchored in the cavern vault."""
    pl = obj_spec['placement']
    count = int(pl.get('count', 32))
    min_l = float(pl.get('minHeight', 0.75))
    max_l = float(pl.get('maxHeight', 2.4))
    rng = random.Random(pl.get('seed', 505))
    bm = bmesh.new()
    for i in range(count):
        x = rng.uniform(-w * 0.42, w * 0.42)
        y = rng.uniform(-d * 0.35, d * 0.58)
        # Approximate dome ceiling height at (x, y)
        r_norm = min(0.92, math.hypot(x / (w * 0.54), y / (d * 0.62)))
        ceil_z = h * ((1.0 - r_norm * r_norm * 0.38) ** 0.5) + 0.25
        length = rng.uniform(min_l, max_l)
        base_r = length * rng.uniform(0.11, 0.18)
        segs = 8
        rings_n = 5
        rings = []
        for ir in range(rings_n + 1):
            t = ir / rings_n
            r = base_r * ((1.0 - t) ** 1.35) + 0.02
            z = ceil_z - length * t
            ring = []
            for k in range(segs):
                a = k * (math.tau / segs)
                flute = 1.0 + 0.18 * math.cos(a * 3.0 + i)
                ring.append(bm.verts.new((x + math.cos(a) * r * flute, y + math.sin(a) * r * flute, z)))
            rings.append(ring)
        for ir in range(rings_n):
            for k in range(segs):
                k2 = (k + 1) % segs
                bm.faces.new((rings[ir][k], rings[ir + 1][k], rings[ir + 1][k2], rings[ir][k2]))
        tip = bm.verts.new((x, y, ceil_z - length - 0.04))
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((rings[-1][k], tip, rings[-1][k2]))
    return create_mesh_object(obj_spec['id'], bm, mat, uv_scale=1.0 / tile_m)


def build_river_boulders(obj_spec: dict, mat: bpy.types.Material, tile_m: float, w: float, d: float):
    """Scatter smooth water-worn rounded river boulders along both banks of the ford."""
    pl = obj_spec['placement']
    cx, cy, _ = pl.get('position', [0.0, 0.0, 0.0])
    sx, sy, sz = pl.get('sizeMetres', [14.0, 10.0, 1.1])
    count = int(pl.get('count', 28))
    rng = random.Random(pl.get('seed', 606))
    bm = bmesh.new()
    for i in range(count):
        rx = cx + rng.uniform(-sx * 0.5, sx * 0.5)
        ry = cy + rng.uniform(-sy * 0.5, sy * 0.5)
        gz = organic_cavern_ground_z(rx, ry, w, d)
        # Prefer shoreline and bank edges (avoid middle of walking path)
        if abs(rx - ford_path_center_x(ry)) < 1.35 and ry > 1.0:
            continue
        r = rng.uniform(0.22, sz * 0.72)
        ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
        sx_b = rng.uniform(0.9, 1.45)
        sy_b = rng.uniform(0.85, 1.35)
        sz_b = rng.uniform(0.52, 0.82)
        for v in ret['verts']:
            dn = 1.0 + 0.12 * noise_3d(v.co.x * 2.8, v.co.y * 2.8, v.co.z * 2.8, i + 7)
            v.co.x = rx + v.co.x * sx_b * dn
            v.co.y = ry + v.co.y * sy_b * dn
            v.co.z = gz + (v.co.z + r * 0.25) * sz_b * dn
    return create_mesh_object(obj_spec['id'], bm, mat, uv_scale=1.0 / tile_m)


# ---------------------------------------------------------------------------
# 4-view render & side-by-side contact sheet against the 4 reference images
# ---------------------------------------------------------------------------

def render_four_view_review(out_dir: Path, ref_arrays: dict[str, np.ndarray], resolution: int, samples: int):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.resolution_x = resolution
    scene.render.resolution_y = int(resolution * 0.67)
    scene.render.image_settings.file_format = 'PNG'

    cam_data = bpy.data.cameras.new('ReviewCamera')
    cam_data.lens = 24.0
    cam = bpy.data.objects.new('ReviewCamera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # Match the 4 cardinal headings: N (+Y), E (+X), S (-Y), W (-X)
    headings = [
        ('N', (0.0, -2.1, 1.55), (0.0, 1.5, 1.15)),
        ('E', (-0.6, 0.0, 1.55), (3.5, 0.15, 1.25)),
        ('S', (0.0, 1.2, 1.55), (0.0, -3.5, 1.15)),
        ('W', (1.2, 0.0, 1.55), (-3.5, 0.0, 1.15)),
    ]
    renders = {}
    for key, loc, target in headings:
        cam.location = Vector(loc)
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        render_path = out_dir / f'render-{key}.png'
        scene.render.filepath = str(render_path)
        bpy.ops.render.render(write_still=True)
        renders[key] = load_image_rgba(render_path)

    # Composite 2x4 contact sheet: top row = references, bottom row = Blender renders.
    rh, rw, _ = renders['N'].shape
    sheet = np.zeros((rh * 2, rw * 4, 4), dtype=np.float32)
    sheet[:, :, 3] = 1.0
    for idx, key in enumerate(['N', 'E', 'S', 'W']):
        sheet[0:rh, idx * rw : (idx + 1) * rw, :] = resize_bilinear(ref_arrays[key], rh, rw)
        sheet[rh : rh * 2, idx * rw : (idx + 1) * rw, :] = renders[key]
    save_image_rgba(sheet, out_dir / 'review-4view.png', colorspace='sRGB')
    bpy.data.objects.remove(cam, do_unlink=True)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    bom_path = args.bom.resolve()
    bom = json.loads(bom_path.read_text())
    out_dir = (args.out.resolve() if args.out else bom_path.parent / 'build')
    tex_dir = out_dir / 'textures'
    crop_dir = out_dir / 'crops'
    tex_dir.mkdir(parents=True, exist_ok=True)
    crop_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'

    # 1. Load 4 room reference images once.
    ref_arrays = {k: load_image_rgba(ROOT / rel) for k, rel in bom['views'].items()}

    # 2. Extract room-specific PBR textures from the reference crops (or procedural tiles).
    materials = {}
    surface_tiles = {}
    for sname, spec in bom['surfaces'].items():
        if spec.get('procedural') == 'grey-stone':
            albedo_arr = make_grey_stone_tile(512)
        elif spec.get('procedural') == 'dark-oak':
            albedo_arr = make_dark_oak_tile(512)
        elif spec.get('procedural') == 'weathered-oak':
            albedo_arr = make_weathered_oak_tile(512)
        elif spec.get('procedural') == 'tufted-leather':
            albedo_arr = make_tufted_leather_tile(512)
        else:
            patch = crop_region(ref_arrays[spec['sourceView']], spec['crop'])
            scale = float(spec.get('colorScale', 1.0))
            if scale != 1.0:
                patch[:, :, :3] = np.clip(patch[:, :, :3] * scale, 0.0, 1.0)
            if sname == 'wall' and float(bom['envelope'].get('wainscotHeightMetres', 0.0)) > 0.0:
                albedo_arr = make_tileable_horizontal(patch, 512)
            else:
                albedo_arr = make_tileable(patch, 512) if spec.get('tileable', True) else resize_bilinear(patch, 512, 512)
        normal_arr = synthesize_normal_map(albedo_arr, strength=float(spec.get('normalStrength', 1.2)))
        albedo_img = save_image_rgba(albedo_arr, tex_dir / f'{sname}-albedo.png', colorspace='sRGB')
        normal_img = save_image_rgba(normal_arr, tex_dir / f'{sname}-normal.png', colorspace='Non-Color')
        materials[sname] = build_pbr_material(
            f'mat-{sname}',
            albedo_img,
            normal_img,
            roughness=float(spec.get('roughness', 0.9)),
            normal_strength=float(spec.get('normalStrength', 1.0)),
        )
        surface_tiles[sname] = float(spec.get('tileMetres', 3.0))

    dark_mat = solid_material('mat-dark-void', (0.008, 0.009, 0.012), roughness=1.0, emission=0.02)

    # 3. Save isolated object reference crops (ready for multi-view Hunyuan3D if needed).
    for obj_spec in bom['objects']:
        if obj_spec.get('sourceView') and obj_spec.get('crop'):
            crop = crop_region(ref_arrays[obj_spec['sourceView']], obj_spec['crop'])
            save_image_rgba(crop, crop_dir / f"{obj_spec['id']}.png", colorspace='sRGB')

    # 4. Build room envelope (organic-cavern dome + terrain OR box/octagon walls).
    env = bom['envelope']
    w, d, h = env['dimensionsMetres']
    disp = float(env.get('wallDisplacementMetres', 0.35 if env['wallStyle'] == 'rough-cavern' else 0.03))
    if env['shape'] == 'organic-cavern':
        cobble_mat = materials.get('cobble', materials['floor'])
        tunnels = [o for o in bom['objects'] if o['category'] == 'smoothed-tunnel']
        open_sky = env['ceilingStyle'] == 'open-sky'
        build_organic_cavern_terrain(w, d, materials['floor'], cobble_mat, surface_tiles['floor'], open_horizon=open_sky)
        if open_sky:
            build_tunnel_cliff_wall(tunnels, materials['wall'], surface_tiles['wall'], w, h, disp)
        else:
            build_organic_cavern_dome(w, d, h, disp, materials['wall'], materials['ceiling'], surface_tiles['wall'], tunnels)
    else:
        floor_cutouts = [
            (o['placement']['position'][0], o['placement']['position'][1], o['placement'].get('innerRadius', 1.2))
            for o in bom['objects']
            if o['category'] == 'well'
        ]
        build_floor(w, d, materials['floor'], surface_tiles['floor'], floor_cutouts)
        build_ceiling(w, d, h, env['ceilingStyle'], materials['ceiling'], surface_tiles['ceiling'])
        if env['ceilingStyle'] == 'coffered':
            beam_key = 'timber' if 'timber' in materials else 'wainscot'
            if beam_key in materials:
                build_coffered_beams(w, d, h, materials[beam_key], surface_tiles[beam_key])

        wall_surf_map = env.get('wallSurfaces', {})
        wainscot_h = float(env.get('wainscotHeightMetres', 0.0))
        for side in ['N', 'E', 'S', 'W']:
            side_openings = [
                o for o in bom['objects']
                if o['category'] in {'opening', 'door', 'recess'} and o['placement'].get('wall') == side
            ]
            wname = wall_surf_map.get(side, 'wall')
            uv_z = (wainscot_h, h - 0.22) if (wainscot_h > 0.0 and wname == 'wall') else None
            build_wall_with_openings(side, w, d, h, disp, side_openings, materials[wname], surface_tiles[wname], uv_z_range=uv_z)
            if wainscot_h > 0.0 and 'wainscot' in materials and wname == 'wall':
                build_wainscot_band(side, w, d, wainscot_h, side_openings, materials['wainscot'], surface_tiles['wainscot'])

    # 5. Build or import every object in the BOM.
    etching_mat = materials.get('well-etchings')
    anchors = []
    for obj_spec in bom['objects']:
        cat = obj_spec['category']
        mat = materials.get(obj_spec.get('surface', 'wall'), materials['wall'])
        tile_m = surface_tiles.get(obj_spec.get('surface', 'wall'), 3.0)
        if cat in {'opening', 'door', 'recess'}:
            build_passage_or_recess(obj_spec, w, d, mat, materials['floor'], dark_mat, tile_m)
        elif cat == 'well':
            build_well(obj_spec, mat, dark_mat, etching_mat)
        elif cat == 'floor-crack':
            build_floor_crack(obj_spec, dark_mat)
        elif cat == 'boulder-cluster':
            build_boulder_cluster(obj_spec, mat, tile_m)
        elif cat == 'river-boulders':
            build_river_boulders(obj_spec, mat, tile_m, w, d)
        elif cat == 'water-surface':
            build_water_surface(obj_spec, w, d)
        elif cat == 'stalagmite-field':
            build_stalagmite_field(obj_spec, mat, tile_m, w, d)
        elif cat == 'stalactite-ceiling':
            build_stalactite_ceiling(obj_spec, mat, tile_m, w, d, h)
        elif cat == 'smoothed-tunnel':
            build_smoothed_tunnel(obj_spec, mat, materials['floor'], dark_mat, tile_m)
        elif cat == 'rug':
            build_rug(obj_spec, mat)
        elif cat == 'pillar':
            build_pillar(obj_spec, mat, tile_m)
        elif cat == 'chair':
            wood_mat = materials.get('timber', materials.get('wainscot', materials.get('desk-wood', materials['wall'])))
            build_executive_chair(obj_spec, mat, wood_mat, tile_m)
        elif cat == 'bookcase':
            rubble_mat = materials.get('north-stone', materials['wall'])
            build_bookcase(obj_spec, mat, rubble_mat, tile_m)
        elif cat == 'hero-3d' and obj_spec.get('meshPath'):
            hero_mat = materials.get(obj_spec['surface']) if obj_spec.get('surface') else None
            import_hero_glb(obj_spec, hero_mat, tile_m)
        elif cat == 'zil-prop-anchor':
            add_zil_anchor(obj_spec)
            anchors.append(obj_spec.get('zilIdentity') or obj_spec['id'])

    # 6. Configure room lighting from BOM.
    lighting = env.get('lighting', {})
    if scene.world is None:
        scene.world = bpy.data.worlds.new('RoomWorld')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    if bg:
        if env.get('skybox'):
            wnodes = scene.world.node_tree.nodes
            wlinks = scene.world.node_tree.links
            env_tex = wnodes.new('ShaderNodeTexEnvironment')
            env_tex.image = bpy.data.images.load(str(ROOT / env['skybox']), check_existing=True)
            wlinks.new(env_tex.outputs['Color'], bg.inputs['Color'])
            bg.inputs['Strength'].default_value = float(lighting.get('ambientStrength', 0.85))
        else:
            bg.inputs['Color'].default_value = (*lighting.get('ambientColor', [0.1, 0.12, 0.14]), 1.0)
            bg.inputs['Strength'].default_value = float(lighting.get('ambientStrength', 0.25))
    for lspec in lighting.get('lights', []):
        ldata = bpy.data.lights.new(lspec['name'], 'POINT')
        ldata.energy = float(lspec['energy'])
        ldata.color = tuple(lspec['color'])
        ldata.shadow_soft_size = float(lspec.get('radius', 0.8))
        lobj = bpy.data.objects.new(lspec['name'], ldata)
        scene.collection.objects.link(lobj)
        lobj.location = tuple(lspec['position'])

    # 7. Export material-preserving GLB (preserving anchor:* empty nodes & extras).
    glb_path = out_dir / 'room.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format='GLB',
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )

    # 8. Optional 4-view review render against references.
    review_path = None
    if args.render_review:
        render_four_view_review(out_dir, ref_arrays, args.resolution, args.samples)
        review_path = str((out_dir / 'review-4view.png').relative_to(ROOT))

    mesh_objs = [o for o in scene.objects if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in mesh_objs)
    manifest = {
        'format': 'zxr-room-bom-build-v1',
        'room': bom['room'],
        'bom': str(bom_path.relative_to(ROOT)),
        'bomSha256': sha256(bom_path),
        'glb': str(glb_path.relative_to(ROOT)),
        'glbBytes': glb_path.stat().st_size,
        'glbSha256': sha256(glb_path),
        'meshCount': len(mesh_objs),
        'materialCount': len(materials) + 1,
        'triangles': tris,
        'zilAnchors': anchors,
        'skybox': env.get('skybox'),
        'reviewSheet': review_path,
    }
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    main()
