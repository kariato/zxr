"""Run the existing local single-image Tencent model on isolated part references.

Manifest: {"parts": [{"id": "arch", "reference": "arch.png"}, ...]}.
Paths are relative to the manifest; outputs are retained under raw/. Matching
completed inputs are resumable, differing inputs require a new revision.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path

import mlx.core as mx
import numpy as np
from hy3dmlx.pipeline import Hunyuan3DShapePipeline
from generate import PIPELINE

ROOT = Path(__file__).resolve().parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--octree', type=int, default=256)
    args = parser.parse_args()
    manifest = args.manifest.resolve()
    base = manifest.parent
    out = base / 'raw'; out.mkdir(exist_ok=True)
    pipeline = None
    for part in json.loads(manifest.read_text())['parts']:
        name = part['id']
        if Path(name).name != name or name in ('.', '..'):
            raise ValueError('Part id must be a plain filename stem')
        reference = base / part['reference']
        output = out / f'{name}.glb'; record_path = output.with_suffix('.json')
        inputs = {'referenceSha256':sha(reference), 'pipeline':{**PIPELINE, 'octree':args.octree}}
        if output.exists() or record_path.exists():
            old = json.loads(record_path.read_text())
            if old['inputs'] != inputs or old['sha256'] != sha(output):
                raise RuntimeError(f'Retain existing {name}; choose a new revision')
            print('RESUME', name, flush=True)
            continue
        if pipeline is None:
            pipeline = Hunyuan3DShapePipeline.from_pretrained(str(ROOT/'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'),dtype=mx.float16,quantize=8)
        started = time.monotonic()
        print('START', name, flush=True)
        mesh = pipeline.generate(str(reference),num_inference_steps=8,guidance_scale=5,
                                 octree_resolution=args.octree,seed=42,octree_decode=True)
        if not len(mesh.faces) or not np.isfinite(mesh.vertices).all():
            raise RuntimeError('Empty or invalid mesh')
        mesh.export(output)
        record = {'part':name,'inputs':inputs,'sha256':sha(output),'vertices':len(mesh.vertices),
                  'triangles':len(mesh.faces),'bounds':mesh.bounds.tolist(),'seconds':round(time.monotonic()-started,2),
                  'texture':'none','status':'draft; inspect openings and hidden geometry'}
        record_path.write_text(json.dumps(record,indent=2)+'\n')
        print('DONE', name, record['triangles'], flush=True)
        del mesh
        mx.clear_cache()


if __name__ == '__main__':
    main()
