"""Generate the shared Lower Ravine exterior mesh with the working local Hunyuan pipeline."""
from pathlib import Path
import hashlib
import json
import time

from generate import PIPELINE, prepare

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'games/zork2/planning/scenes/lower-ravine/exterior-concept-v2'
OUTPUT = ROOT / 'out/asset-production/lower-ravine-v2'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    import mlx.core as mx
    from hy3dmlx.pipeline import Hunyuan3DShapePipeline
    import trimesh

    reference = SOURCE / 'reference.png'
    options = {'pipeline': PIPELINE, 'referenceSha256': digest(reference),
               'sourceReviewSha256': digest(SOURCE / 'source-review.json'),
               'targetTriangles': 60000, 'heightMetres': 18,
               'textureMethod': 'front-reference-projection; row-median back'}
    key = hashlib.sha256(json.dumps(options, sort_keys=True).encode()).hexdigest()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    record = OUTPUT / 'candidate.json'
    if record.exists():
        old = json.loads(record.read_text())
        if old['inputHash'] == key and digest(OUTPUT / 'candidate.glb') == old['sha256']:
            print('Matching ravine candidate already exists', flush=True)
            return
        raise RuntimeError('Retain the existing ravine revision; create a new version')
    started = time.monotonic()
    raw_path, raw_record = OUTPUT / 'raw.glb', OUTPUT / 'raw.json'
    if raw_path.exists():
        old = json.loads(raw_record.read_text())
        if old['inputHash'] != key or old['sha256'] != digest(raw_path):
            raise RuntimeError('Saved raw ravine mesh does not match these inputs')
        raw = trimesh.load(raw_path, force='mesh')
    else:
        pipe = Hunyuan3DShapePipeline.from_pretrained(
            str(ROOT / 'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'),
            dtype=mx.float16, quantize=8)
        print('START UNDERGROUND RAVINE', flush=True)
        raw = pipe.generate(str(reference), num_inference_steps=8, guidance_scale=5,
                            octree_resolution=256, seed=42, octree_decode=True)
        raw.export(raw_path)
        raw_record.write_text(json.dumps({'inputHash': key, 'sha256': digest(raw_path)}, indent=2) + '\n')
        del pipe
        mx.clear_cache()
    candidate, components = prepare(raw, reference, options['targetTriangles'], [50, 18, 45])
    candidate.export(OUTPUT / 'candidate.glb')
    report = {'format': 'zxr-shared-scene-mesh-v1', 'scene': 'lower-ravine',
              'rooms': ['STREAM-PATH', 'MARBLE-HALL', 'DEEP-FORD', 'RAVINE-LEDGE', 'LEDGE-TUNNEL'],
              'inputHash': key, **options, 'rawTriangles': len(raw.faces),
              'triangles': len(candidate.faces), 'componentsBeforeCleanup': components,
              'boundsMetres': candidate.bounds.tolist(), 'sha256': digest(OUTPUT / 'candidate.glb'),
              'bytes': (OUTPUT / 'candidate.glb').stat().st_size,
              'seconds': round(time.monotonic() - started, 2), 'review': 'draft',
              'limitations': ['One fused inferred scene; room markers do not separate geometry.',
                              'Reference-projected colour, not learned multiview texture paint.',
                              'Single-view reconstruction cannot guarantee hidden surfaces or walkable paths.',
                              'Scale is an authoring estimate, not a source measurement.']}
    record.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
