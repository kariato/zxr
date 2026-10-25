"""Convert both existing foot-bridge references, serially, after the main queue."""
from pathlib import Path
import hashlib
import json
import time
from generate import PIPELINE, prepare

ROOT = Path(__file__).resolve().parents[2]


def main():
    jobs = []
    for version in [1, 2]:
        reference = ROOT/f'games/zork2/assets/experiments/foot-bridge-rocks-v1/reference-v{version}.png'
        directory = ROOT/f'out/asset-production/foot-bridge-rocks-v1/version{version}'
        directory.mkdir(parents=True, exist_ok=True)
        if (directory/'candidate.json').exists():
            record = json.loads((directory/'candidate.json').read_text())
            assert record['referenceSha256'] == hashlib.sha256(reference.read_bytes()).hexdigest()
            assert record['sha256'] == hashlib.sha256((directory/'candidate.glb').read_bytes()).hexdigest()
            print(f'Bridge v{version}: matching GLB exists', flush=True)
            continue
        jobs.append((version, reference, directory))
    if not jobs:
        return
    import mlx.core as mx
    from hy3dmlx.pipeline import Hunyuan3DShapePipeline
    pipe = Hunyuan3DShapePipeline.from_pretrained(str(ROOT/'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'), dtype=mx.float16, quantize=8)
    for version, reference, directory in jobs:
        started = time.monotonic()
        print(f'START bridge reference v{version}', flush=True)
        raw = pipe.generate(str(reference), num_inference_steps=8, guidance_scale=5, octree_resolution=256, seed=42, octree_decode=True)
        raw.export(directory/'raw.glb')
        mesh, components = prepare(raw, reference, 12000, [10, 3, 4], stone_projection=True)
        output = directory/'candidate.glb'
        mesh.export(output)
        record = {'format': 'zxr-local-experiment-candidate-v1', 'sourceRoom': 'FOOT-BRIDGE', 'referenceVersion': version,
                  'pipeline': PIPELINE, 'referenceSha256': hashlib.sha256(reference.read_bytes()).hexdigest(),
                  'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'triangles': len(mesh.faces),
                  'boundsMetres': mesh.bounds.tolist(), 'componentsBeforeCleanup': components,
                  'seconds': round(time.monotonic()-started, 2), 'file': 'candidate.glb', 'review': 'draft',
                  'limitations': ['Single-image geometry and texture coverage require visual review.',
                                  'Scale is an estimate; deck clearance and railings are not gameplay-approved.',
                                  'v1 is retained for completeness; v2 is the selected reference.']}
        (directory/'candidate.json').write_text(json.dumps(record, indent=2)+'\n')
        print(f'DONE bridge v{version}: {record["seconds"]} seconds', flush=True)
        del raw, mesh
        mx.clear_cache()


if __name__ == '__main__':
    main()
