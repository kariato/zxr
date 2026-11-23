"""Stage 4: Generate 3D meshes for each segmented hero cutout using local MLX Hunyuan3D-2 Turbo.

Reads <out>/crops/<id>.png and writes untextured meshes to <out>/heroes/<id>.glb
with SHA-256 resume caching so completed heroes are never regenerated.
"""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('spec', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--octree', type=int, default=224)
    parser.add_argument('--steps', type=int, default=8)
    args = parser.parse_args()

    spec = json.loads(args.spec.read_text())
    crops_dir = args.out / 'crops'
    heroes_dir = args.out / 'heroes'
    heroes_dir.mkdir(parents=True, exist_ok=True)

    weights_dir = ROOT / 'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'
    if not weights_dir.exists():
        raise FileNotFoundError(f'Local Hunyuan3D-2 weights not found at {weights_dir}')

    # Ensure local hy3dmlx package is importable
    pixal_dir = ROOT / 'out/asset-tools/pixal3d-mlx'
    if pixal_dir.exists() and str(pixal_dir) not in sys.path:
        sys.path.insert(0, str(pixal_dir))

    pipeline = None
    for obj in spec.get('heroObjects', []):
        oid = obj['id']
        cutout = crops_dir / f'{oid}.png'
        out_glb = heroes_dir / f'{oid}.glb'
        rec_path = heroes_dir / f'{oid}.json'
        cut_sha = sha256(cutout)

        if out_glb.exists() and rec_path.exists():
            old = json.loads(rec_path.read_text())
            if old.get('cutoutSha256') == cut_sha and old.get('glbSha256') == sha256(out_glb):
                print(f'[heroes] RESUME {oid}', flush=True)
                continue

        if pipeline is None:
            import mlx.core as mx
            from hy3dmlx.pipeline import Hunyuan3DShapePipeline

            print('[heroes] Loading local MLX Hunyuan3D-2 Turbo…', flush=True)
            pipeline = Hunyuan3DShapePipeline.from_pretrained(str(weights_dir), dtype=mx.float16, quantize=8)

        import mlx.core as mx
        import numpy as np

        started = time.monotonic()
        print(f'[heroes] START {oid} ({cutout.name})', flush=True)
        mesh = pipeline.generate(
            str(cutout),
            num_inference_steps=args.steps,
            guidance_scale=5.0,
            octree_resolution=args.octree,
            seed=42,
            octree_decode=True,
        )
        if not len(mesh.faces) or not np.isfinite(mesh.vertices).all():
            raise RuntimeError(f'Empty or invalid mesh for {oid}')
        mesh.export(out_glb)
        record = {
            'id': oid,
            'cutoutSha256': cut_sha,
            'glbSha256': sha256(out_glb),
            'vertices': int(len(mesh.vertices)),
            'triangles': int(len(mesh.faces)),
            'seconds': round(time.monotonic() - started, 2),
        }
        rec_path.write_text(json.dumps(record, indent=2) + '\n')
        print(f"[heroes] DONE {oid} ({record['triangles']} tris in {record['seconds']}s)", flush=True)
        del mesh
        mx.clear_cache()


if __name__ == '__main__':
    main()
