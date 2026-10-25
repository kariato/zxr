"""Generate a review-only Narrow Tunnel diorama with the existing Hunyuan MLX setup.

Run with out/asset-tools/shape-env/bin/python. This does not change the game scene.
The saved raw GLB permits finishing experiments without another inference run.
"""
from pathlib import Path
import hashlib
import json
import time

from generate import PIPELINE, prepare

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'games/zork2/assets/experiments/narrow-tunnel-v1'
OUTPUT = ROOT / 'out/asset-production/narrow-tunnel-v1'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    import mlx.core as mx
    from hy3dmlx.pipeline import Hunyuan3DShapePipeline
    import trimesh

    reference = SOURCE / 'reference.png'
    context = ROOT / 'games/zork2/assets/rooms/narrow-tunnel/source-context.json'
    options = {'pipeline': PIPELINE, 'referenceSha256': digest(reference),
               'sourceContextSha256': digest(context), 'targetTriangles': 30000,
               'heightMetres': 12, 'textureMethod': 'front-reference-projection; row-median back'}
    key = hashlib.sha256(json.dumps(options, sort_keys=True).encode()).hexdigest()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    record = OUTPUT / 'candidate.json'
    if record.exists():
        old = json.loads(record.read_text())
        if old['inputHash'] == key and digest(OUTPUT / 'candidate.glb') == old['sha256']:
            print('Matching candidate already exists', flush=True)
            return
        raise RuntimeError('Retain the existing experiment and create a new version')
    started = time.monotonic()
    raw_path = OUTPUT / 'raw.glb'
    raw_record = OUTPUT / 'raw.json'
    if raw_path.exists():
        raw_meta = json.loads(raw_record.read_text())
        if raw_meta['inputHash'] != key or raw_meta['sha256'] != digest(raw_path):
            raise RuntimeError('Saved raw mesh does not match these inputs')
        raw = trimesh.load(raw_path, force='mesh')
    else:
        pipe = Hunyuan3DShapePipeline.from_pretrained(
            str(ROOT / 'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'),
            dtype=mx.float16, quantize=8)
        print('START NARROW-TUNNEL', flush=True)
        raw = pipe.generate(str(reference), num_inference_steps=8, guidance_scale=5,
                            octree_resolution=256, seed=42, octree_decode=True)
        raw.export(raw_path)
        raw_record.write_text(json.dumps({'inputHash': key, 'sha256': digest(raw_path)}, indent=2) + '\n')
        del pipe
        mx.clear_cache()
    candidate, components = prepare(raw, reference, 30000, [14, 12, 10])
    candidate.export(OUTPUT / 'candidate.glb')
    report = {'format': 'zxr-room-mesh-experiment-v1', 'sourceRoom': 'NARROW-TUNNEL',
              'inputHash': key, **options, 'rawTriangles': len(raw.faces),
              'triangles': len(candidate.faces), 'componentsBeforeCleanup': components,
              'boundsMetres': candidate.bounds.tolist(), 'sha256': digest(OUTPUT / 'candidate.glb'),
              'bytes': (OUTPUT / 'candidate.glb').stat().st_size,
              'seconds': round(time.monotonic() - started, 2), 'review': 'draft',
              'publication': 'local experiment',
              'limitations': ['Single generated diorama; bridge, stream and rocks are fused scenery.',
                              'Reference-projected colour, not learned multiview paint.',
                              'No navigable passage or source-object interaction binding is claimed.',
                              'Inferred geometry and hidden surfaces require visual review.']}
    record.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
