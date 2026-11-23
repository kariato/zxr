"""Stage 3: Unproject 4 cardinal depth maps into a unified 3D terrain heightfield and hero layout.

Coordinate frame (matches Blender Z-up):
  - Camera origin at (0, 0, cameraHeightMetres)
  - View N looks +Y (yaw 0°), E looks +X (yaw -90°), S looks -Y (yaw 180°), W looks -X (yaw +90°)

Outputs in <out>/layout/:
  - terrain.npy           : float32 (NY, NX) heightfield grid in metres
  - terrain-meta.json     : grid bounds [x0, x1, y0, y1] and resolution
  - resolved-layout.json  : exact depth-derived 3D position & metric size for every hero object
"""
import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[3]
VIEW_YAWS = {'N': 0.0, 'E': -math.pi * 0.5, 'S': math.pi, 'W': math.pi * 0.5}


def unproject_view(depth: np.ndarray, yaw: float, cam_z: float, vfov_deg: float, stride: int = 4) -> np.ndarray:
    """Unproject a depth map into world-space (N, 3) points [X, Y, Z]."""
    h, w = depth.shape
    f = (h * 0.5) / math.tan(math.radians(vfov_deg * 0.5))
    cx, cy = w * 0.5, h * 0.46

    ys = np.arange(0, h, stride, dtype=np.float32)[:, None]
    xs = np.arange(0, w, stride, dtype=np.float32)[None, :]
    d = depth[::stride, ::stride]

    # Camera-local coordinates: right = +x_c, forward = +y_c, up = +z_c
    x_c = ((xs - cx) / f) * d
    y_c = d
    z_c = (-(ys - cy) / f) * d

    # Rotate around Z by yaw (N=0 -> +Y, E=-90° -> +X, S=180° -> -Y, W=+90° -> -X)
    c, s = math.cos(yaw), math.sin(yaw)
    wx = x_c * c - y_c * s
    wy = x_c * s + y_c * c
    wz = cam_z + z_c
    return np.stack([wx, wy, wz], axis=-1).reshape(-1, 3)


def build_heightfield(points: np.ndarray, x_range: tuple[float, float], y_range: tuple[float, float], nx: int = 96, ny: int = 96) -> np.ndarray:
    """Splat lower-hemisphere depth points onto a regular (NY, NX) ground heightfield and fill holes."""
    x0, x1 = x_range
    y0, y1 = y_range
    # Keep plausible ground/bank points (ignore ceiling points well above head height)
    mask = (
        (points[:, 0] >= x0) & (points[:, 0] <= x1)
        & (points[:, 1] >= y0) & (points[:, 1] <= y1)
        & (points[:, 2] >= -1.2) & (points[:, 2] <= 4.2)
    )
    pts = points[mask]

    ix = np.clip(((pts[:, 0] - x0) / (x1 - x0) * (nx - 1)).astype(np.int32), 0, nx - 1)
    iy = np.clip(((pts[:, 1] - y0) / (y1 - y0) * (ny - 1)).astype(np.int32), 0, ny - 1)

    grid_sum = np.zeros((ny, nx), dtype=np.float64)
    grid_cnt = np.zeros((ny, nx), dtype=np.float64)
    np.add.at(grid_sum, (iy, ix), pts[:, 2])
    np.add.at(grid_cnt, (iy, ix), 1.0)

    valid = grid_cnt > 0
    grid = np.zeros((ny, nx), dtype=np.float32)
    grid[valid] = (grid_sum[valid] / grid_cnt[valid]).astype(np.float32)

    # Smoothly fill unobserved cells via normalized Gaussian convolution
    if not valid.all():
        num = gaussian_filter(grid * valid.astype(np.float32), sigma=3.5, mode='nearest')
        den = gaussian_filter(valid.astype(np.float32), sigma=3.5, mode='nearest')
        filled = np.where(den > 1e-4, num / np.maximum(den, 1e-4), 0.0)
        grid = np.where(valid, grid, filled)

    # Gentle terrain smoothing so the walking surface is clean and artifact-free
    return gaussian_filter(grid.astype(np.float32), sigma=1.4, mode='nearest')


def resolve_hero_transform(
    obj: dict,
    depth: np.ndarray,
    mask_path: Path,
    yaw: float,
    cam_z: float,
    vfov_deg: float,
) -> dict:
    """Compute exact 3D world position and metric bounding size from the object's mask + depth map."""
    h, w = depth.shape
    f = (h * 0.5) / math.tan(math.radians(vfov_deg * 0.5))
    cx, cy = w * 0.5, h * 0.46

    box = obj['crop']
    x0, y0 = int(round(box[0] * w)), int(round(box[1] * h))
    x1, y1 = int(round(box[2] * w)), int(round(box[3] * h))

    if mask_path.exists():
        m = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        ys, xs = np.where(m > 127)
    else:
        ys, xs = np.mgrid[y0:y1, x0:x1]
        ys, xs = ys.ravel(), xs.ravel()

    if len(xs) == 0:
        xs = np.array([(x0 + x1) * 0.5], dtype=np.float32)
        ys = np.array([(y0 + y1) * 0.5], dtype=np.float32)

    # Use 35th-percentile depth inside mask so background bleed doesn't push the object too far back
    ds = depth[ys.astype(np.int32), xs.astype(np.int32)]
    d_med = float(np.percentile(ds, 35))
    if obj.get('distanceOverrideMetres'):
        d_med = float(obj['distanceOverrideMetres'])

    px = float(np.median(xs))
    py_bot = float(np.percentile(ys, 92))
    py_top = float(np.percentile(ys, 8))
    pw_px = max(8.0, float(np.percentile(xs, 92) - np.percentile(xs, 8)))
    ph_px = max(8.0, py_bot - py_top)

    # Metric width & height at distance d_med
    metric_w = (pw_px / f) * d_med
    metric_h = (ph_px / f) * d_med
    metric_d = metric_w * float(obj.get('depthAspect', 0.85))

    x_c = ((px - cx) / f) * d_med
    y_c = d_med
    z_bot = cam_z - ((py_bot - cy) / f) * d_med

    c, s = math.cos(yaw), math.sin(yaw)
    wx = x_c * c - y_c * s
    wy = x_c * s + y_c * c

    return {
        'id': obj['id'],
        'sourceView': obj['sourceView'],
        'zilIdentity': obj.get('zilIdentity'),
        'position': [round(wx, 3), round(wy, 3), round(z_bot, 3)],
        'sizeMetres': [round(metric_w, 3), round(metric_d, 3), round(metric_h, 3)],
        'yawDeg': round(math.degrees(yaw) + float(obj.get('yawOffsetDeg', 0.0)), 1),
        'estimatedDistanceMetres': round(d_med, 3),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('spec', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()

    spec = json.loads(args.spec.read_text())
    depth_dir = args.out / 'depth'
    crops_dir = args.out / 'crops'
    layout_dir = args.out / 'layout'
    layout_dir.mkdir(parents=True, exist_ok=True)

    cam_z = float(spec.get('cameraHeightMetres', 1.55))
    vfov = float(spec.get('verticalFovDeg', 54.0))
    extent = float(spec.get('terrainExtentMetres', 26.0))
    x_range = (-extent, extent)
    y_range = (-extent, extent)

    all_pts = []
    depths = {}
    for k in ['N', 'E', 'S', 'W']:
        d = np.load(depth_dir / f'depth-{k}.npy')
        depths[k] = d
        all_pts.append(unproject_view(d, VIEW_YAWS[k], cam_z, vfov, stride=4))

    cloud = np.concatenate(all_pts, axis=0)
    terrain = build_heightfield(cloud, x_range, y_range, nx=96, ny=96)
    np.save(layout_dir / 'terrain.npy', terrain)
    (layout_dir / 'terrain-meta.json').write_text(
        json.dumps(
            {
                'xRange': list(x_range),
                'yRange': list(y_range),
                'nx': int(terrain.shape[1]),
                'ny': int(terrain.shape[0]),
                'minZ': round(float(terrain.min()), 3),
                'maxZ': round(float(terrain.max()), 3),
            },
            indent=2,
        ) + '\n'
    )

    resolved_heroes = []
    for obj in spec.get('heroObjects', []):
        k = obj['sourceView']
        item = resolve_hero_transform(obj, depths[k], crops_dir / f"{obj['id']}-mask.png", VIEW_YAWS[k], cam_z, vfov)
        resolved_heroes.append(item)
        print(f"[layout] HERO {item['id']} -> pos={item['position']} size={item['sizeMetres']}", flush=True)

    (layout_dir / 'resolved-layout.json').write_text(
        json.dumps({'room': spec['room'], 'heroes': resolved_heroes}, indent=2) + '\n'
    )
    print(f"[layout] DONE terrain={terrain.shape} z=[{terrain.min():.2f}, {terrain.max():.2f}] heroes={len(resolved_heroes)}", flush=True)


if __name__ == '__main__':
    main()
