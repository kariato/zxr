"""Stage 2: Segment foreground hero objects into transparent cutouts and inpaint empty views.

For each object with a `sourceView` and normalized `crop` [x0, y0, x1, y1]:
  - Runs OpenCV GrabCut inside the crop box to extract a clean RGBA cutout
    saved to <out>/crops/<id>.png (ready for Hunyuan3D-2).
  - Accumulates foreground masks per view and inpaints them out of the room
    image using OpenCV Telea inpainting, writing clean background views to
    <out>/inpainted/view-<K>.png for texture extraction and terrain projection.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[3]


def segment_crop_rgba(img_bgr: np.ndarray, box: list[float]) -> tuple[np.ndarray, np.ndarray]:
    """Return (rgba_cutout, full_image_binary_mask) using GrabCut inside the normalized box."""
    h, w, _ = img_bgr.shape
    x0 = max(1, min(w - 3, int(round(box[0] * w))))
    y0 = max(1, min(h - 3, int(round(box[1] * h))))
    x1 = max(x0 + 2, min(w - 1, int(round(box[2] * w))))
    y1 = max(y0 + 2, min(h - 1, int(round(box[3] * h))))

    # Run GrabCut on a padded ROI for speed & crisp foreground separation.
    pad = max(16, int(0.08 * max(x1 - x0, y1 - y0)))
    rx0, ry0 = max(0, x0 - pad), max(0, y0 - pad)
    rx1, ry1 = min(w, x1 + pad), min(h, y1 + pad)
    roi = img_bgr[ry0:ry1, rx0:rx1].copy()
    mask = np.zeros(roi.shape[:2], np.uint8)
    rect = (x0 - rx0, y0 - ry0, max(2, x1 - x0), max(2, y1 - y0))
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(roi, mask, rect, bgd, fgd, 4, cv2.GC_INIT_WITH_RECT)
        fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    except Exception:
        fg = np.zeros(roi.shape[:2], np.uint8)
        fg[rect[1] : rect[1] + rect[3], rect[0] : rect[0] + rect[2]] = 255

    # If GrabCut collapsed to empty, fall back to a soft elliptical foreground inside the rect.
    if fg.sum() < 255 * 32:
        fg = np.zeros(roi.shape[:2], np.uint8)
        cx, cy = rect[0] + rect[2] // 2, rect[1] + rect[3] // 2
        cv2.ellipse(fg, (cx, cy), (max(1, rect[2] // 2), max(1, rect[3] // 2)), 0, 0, 360, 255, -1)

    # Smooth cutout edge slightly
    fg = cv2.GaussianBlur(fg, (5, 5), 0)
    full_mask = np.zeros((h, w), np.uint8)
    full_mask[ry0:ry1, rx0:rx1] = fg

    crop_bgr = img_bgr[y0:y1, x0:x1]
    crop_alpha = full_mask[y0:y1, x0:x1]
    crop_bgra = np.dstack([crop_bgr, crop_alpha])
    return crop_bgra, (full_mask > 127).astype(np.uint8) * 255


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('spec', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()

    out_dir = args.out.resolve()
    spec = json.loads(args.spec.read_text())
    crops_dir = out_dir / 'crops'
    inpaint_dir = out_dir / 'inpainted'
    crops_dir.mkdir(parents=True, exist_ok=True)
    inpaint_dir.mkdir(parents=True, exist_ok=True)

    views_bgr = {k: cv2.imread(str(ROOT / rel), cv2.IMREAD_COLOR) for k, rel in spec['views'].items()}
    inpaint_masks = {k: np.zeros(img.shape[:2], np.uint8) for k, img in views_bgr.items()}

    extracted = []
    for obj in spec.get('heroObjects', []):
        view_key = obj['sourceView']
        cutout_bgra, full_mask = segment_crop_rgba(views_bgr[view_key], obj['crop'])
        out_png = crops_dir / f"{obj['id']}.png"
        cv2.imwrite(str(out_png), cutout_bgra)
        # Save mask for Stage 3 depth sampling
        cv2.imwrite(str(crops_dir / f"{obj['id']}-mask.png"), full_mask)
        if obj.get('inpaintFromBackground', True):
            inpaint_masks[view_key] = cv2.bitwise_or(inpaint_masks[view_key], full_mask)
        extracted.append({'id': obj['id'], 'view': view_key, 'cutout': str(out_png.relative_to(ROOT))})
        print(f"[segment] CUTOUT {obj['id']} from view {view_key}", flush=True)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    for k, img_bgr in views_bgr.items():
        mask = inpaint_masks[k]
        if mask.any():
            dilated = cv2.dilate(mask, kernel, iterations=1)
            cleaned = cv2.inpaint(img_bgr, dilated, inpaintRadius=7, flags=cv2.INPAINT_TELEA)
        else:
            cleaned = img_bgr
        cv2.imwrite(str(inpaint_dir / f'view-{k}.png'), cleaned)
        print(f'[segment] INPAINT view-{k}.png', flush=True)

    (crops_dir / 'manifest.json').write_text(json.dumps({'cutouts': extracted}, indent=2) + '\n')


if __name__ == '__main__':
    main()
