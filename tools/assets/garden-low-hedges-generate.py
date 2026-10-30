"""Generate an untouched Tencent shape draft; deliberately no cleanup or projection."""
from pathlib import Path
import hashlib
import json
import shutil
import time
from generate import PIPELINE

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / 'games/zork2/planning/scenes/underground-garden/concept-low-hedges-v2'
OUTPUT = SCENE / 'mesh-v1'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    reference = SCENE / 'reference.png'
    OUTPUT.mkdir(parents=True, exist_ok=True)
    mesh = OUTPUT / 'garden-low-hedges-v1.glb'
    record = OUTPUT / 'generation.json'
    if mesh.exists() or record.exists():
        if mesh.exists() and record.exists():
            saved = json.loads(record.read_text())
            if saved['referenceSha256'] == sha(reference) and saved['sha256'] == sha(mesh):
                print('Matching untouched mesh already exists', flush=True)
                return
        raise RuntimeError('Retain existing output; use a new version')
    import mlx.core as mx
    from hy3dmlx.pipeline import Hunyuan3DShapePipeline
    started = time.monotonic()
    pipe = Hunyuan3DShapePipeline.from_pretrained(
        str(ROOT / 'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'),
        dtype=mx.float16, quantize=8)
    print('START FLOWER FREE GARDEN', flush=True)
    raw = pipe.generate(str(reference), num_inference_steps=8, guidance_scale=5,
                        octree_resolution=512, seed=42, octree_decode=True)
    # Export the pipeline result directly. No prepare(), decimation, component
    # removal, vertex movement, remeshing, UV projection, or artificial repairs.
    raw.export(mesh)
    report = {'scene': 'garden-low-hedges-flower-free', 'pipeline': {**PIPELINE, 'octree': 512},
              'reference': '../reference.png', 'referenceSha256': sha(reference),
              'file': mesh.name, 'sha256': sha(mesh), 'bytes': mesh.stat().st_size,
              'vertices': len(raw.vertices), 'triangles': len(raw.faces),
              'boundsNativeUnits': raw.bounds.tolist(),
              'seconds': round(time.monotonic() - started, 2),
              'geometryPostprocessing': 'none', 'textureMethod': 'none; shape-only output',
              'review': 'draft; not integrated into the game',
              'limitations': ['Single-image inferred geometry; inspect hidden surfaces and passage continuity.',
                             'Native model units; no physical scale or walkability asserted.',
                             'Low bushes, sculpture separation and gazebo posts require multiview geometry review.']}
    record.write_text(json.dumps(report, indent=2) + '\n')
    for name in ['TENCENT-HUNYUAN-3D-2.0-LICENSE.txt', 'HUNYUAN-NOTICE.txt']:
        shutil.copy2(ROOT / 'src/prototype/assets' / name, OUTPUT / name)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
