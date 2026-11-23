"""Stage 1: Estimate metric depth maps for all 4 cardinal room views (N, E, S, W).

Backends (--backend auto|depth-anything|depth-pro|heuristic):
  - depth-anything : HuggingFace Depth-Anything-V2-Metric-Indoor-Base (MPS/CPU)
  - depth-pro      : Apple ml-depth-pro metric monocular depth
  - heuristic      : Zero-dependency geometric ground/sky depth fallback for fast prototyping

Outputs per view in <out>/depth/:
  - depth-<K>.npy  : float32 (H, W) metric distance in metres
  - depth-<K>.png  : 8-bit turbo/grayscale visualization for inspection
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def try_depth_anything(img_pil: Image.Image, cache_dir: Path) -> np.ndarray:
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    model_id = 'depth-anything/Depth-Anything-V2-Metric-Indoor-Base-hf'
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    processor = AutoImageProcessor.from_pretrained(model_id, cache_dir=str(cache_dir))
    model = AutoModelForDepthEstimation.from_pretrained(model_id, cache_dir=str(cache_dir)).to(device)
    model.eval()

    inputs = processor(images=img_pil, return_tensors='pt').to(device)
    with torch.no_grad():
        outputs = model(**inputs)
    pred = torch.nn.functional.interpolate(
        outputs.predicted_depth.unsqueeze(1),
        size=img_pil.size[::-1],
        mode='bicubic',
        align_corners=False,
    ).squeeze().cpu().numpy().astype(np.float32)
    return np.clip(pred, 0.3, 45.0)


def try_depth_pro(img_path: Path) -> np.ndarray:
    import depth_pro
    import torch

    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    model, transform = depth_pro.create_model_and_transforms(device=device)
    model.eval()
    image, _, f_px = depth_pro.load_rgb(str(img_path))
    prediction = model.infer(transform(image), f_px=f_px)
    depth = prediction['depth'].detach().cpu().numpy().astype(np.float32)
    return np.clip(depth, 0.3, 45.0)


def heuristic_metric_depth(img_rgb: np.ndarray, camera_height: float = 1.55, vfov_deg: float = 54.0) -> np.ndarray:
    """Fast zero-download geometric + luminance-relief depth estimator for prototyping.

    Ground plane rays below the horizon follow exact pinhole ground-intersection
    distance (z = camera_height / tan(theta)), modulated by local dark/bright
    cavern depth cues so tunnels and distant alcoves recede naturally.
    """
    h, w, _ = img_rgb.shape
    f = (h * 0.5) / np.tan(np.radians(vfov_deg * 0.5))
    ys = np.arange(h, dtype=np.float32)[:, None]
    cy = h * 0.46  # slight downward camera tilt matching reference views
    dy = ys - cy

    # Ground-plane intersection distance below horizon, smooth vault distance above horizon
    ground_d = np.where(dy > 4.0, camera_height * f / np.maximum(dy, 4.0), 18.0)
    upper_d = np.where(dy <= 4.0, 7.5 + 10.5 * np.exp(-((-dy) / (h * 0.22)) ** 2), ground_d)
    base_d = np.where(dy > 4.0, ground_d, upper_d)
    base_d = np.broadcast_to(base_d, (h, w)).copy()

    # Modulate with low-frequency luminance (darker recesses/tunnels are farther away)
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    smooth = cv2.GaussianBlur(gray, (0, 0), sigmaX=max(5, w // 48))
    # Dark openings (e.g. tunnel mouths, deep background) push depth back smoothly
    darkness_push = np.clip((0.32 - smooth) / 0.32, 0.0, 1.0) * 8.5
    depth = np.clip(base_d + darkness_push, 0.6, 35.0)
    return cv2.GaussianBlur(depth.astype(np.float32), (0, 0), sigmaX=2.0)


def save_depth_preview(depth: np.ndarray, out_png: Path):
    inv = 1.0 / np.clip(depth, 0.5, 35.0)
    norm = (inv - inv.min()) / max(inv.max() - inv.min(), 1e-6)
    vis = cv2.applyColorMap((norm * 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
    cv2.imwrite(str(out_png), vis)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('spec', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--backend', choices=['auto', 'depth-anything', 'depth-pro', 'heuristic'], default='auto')
    args = parser.parse_args()

    spec = json.loads(args.spec.read_text())
    depth_dir = args.out / 'depth'
    depth_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = ROOT / 'out/asset-tools/hf-cache'
    os.environ.setdefault('HF_HOME', str(cache_dir))

    chosen = args.backend
    if chosen == 'auto':
        try:
            import torch  # noqa: F401
            import transformers  # noqa: F401
            chosen = 'depth-anything'
        except Exception:
            try:
                import depth_pro  # noqa: F401
                chosen = 'depth-pro'
            except Exception:
                chosen = 'heuristic'

    meta = {'backend': chosen, 'views': {}}
    for key, rel in spec['views'].items():
        img_path = ROOT / rel
        npy_path = depth_dir / f'depth-{key}.npy'
        png_path = depth_dir / f'depth-{key}.png'
        digest = sha256(img_path)
        meta_path = depth_dir / 'meta.json'

        if npy_path.exists() and meta_path.exists():
            old = json.loads(meta_path.read_text())
            if old.get('backend') == chosen and old.get('views', {}).get(key, {}).get('sha256') == digest:
                meta['views'][key] = old['views'][key]
                print(f'[depth] RESUME {key} ({chosen})', flush=True)
                continue

        print(f'[depth] RUN {key} ({chosen})', flush=True)
        img_pil = Image.open(img_path).convert('RGB')
        img_rgb = np.array(img_pil)
        if chosen == 'depth-anything':
            depth = try_depth_anything(img_pil, cache_dir)
        elif chosen == 'depth-pro':
            depth = try_depth_pro(img_path)
        else:
            depth = heuristic_metric_depth(
                img_rgb,
                camera_height=float(spec.get('cameraHeightMetres', 1.55)),
                vfov_deg=float(spec.get('verticalFovDeg', 54.0)),
            )

        np.save(npy_path, depth.astype(np.float32))
        save_depth_preview(depth, png_path)
        meta['views'][key] = {
            'source': rel,
            'sha256': digest,
            'shape': list(depth.shape),
            'minMetres': round(float(depth.min()), 3),
            'maxMetres': round(float(depth.max()), 3),
            'medianMetres': round(float(np.median(depth)), 3),
        }

    (depth_dir / 'meta.json').write_text(json.dumps(meta, indent=2) + '\n')
    print(f'[depth] DONE backend={chosen}', flush=True)


if __name__ == '__main__':
    main()
