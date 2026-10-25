"""Bounded three-piece Hunyuan experiment for the opening barrow."""
from pathlib import Path
import hashlib
import json
import time
import mlx.core as mx
from hy3dmlx.pipeline import Hunyuan3DShapePipeline
from generate import prepare,PIPELINE

ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'games/zork2/assets/experiments/barrow-natural-v1'
output=ROOT/'out/asset-production/barrow-natural-v1';output.mkdir(parents=True,exist_ok=True)
jobs=[('arch',4000,[3.5,3.05,.7]),('boulder',2200,[1.4,.85,1.1]),('ledge',1600,[1.6,.5,1])]
pipe=Hunyuan3DShapePipeline.from_pretrained(str(ROOT/'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'),dtype=mx.float16,quantize=8)
for name,triangles,dimensions in jobs:
    directory=output/name;directory.mkdir(exist_ok=True);reference=source/name/'reference.png'
    if (directory/'candidate.glb').exists():print('EXISTS '+name,flush=True);continue
    print('START '+name,flush=True);t=time.monotonic()
    mesh=pipe.generate(str(reference),num_inference_steps=8,guidance_scale=5,octree_resolution=256,seed=42,octree_decode=True)
    mesh.export(directory/'raw.glb');result,parts=prepare(mesh,reference,triangles,dimensions)
    path=directory/'candidate.glb';result.export(path)
    (directory/'candidate.json').write_text(json.dumps({'sourceRoom':'INSIDE-BARROW','piece':name,'pipeline':PIPELINE,'referenceSha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'triangles':len(result.faces),'bounds':result.bounds.tolist(),'seconds':round(time.monotonic()-t,2),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'review':'experiment','textureMethod':'front-reference-projection; approximate back colour'},indent=2)+'\n')
    print('DONE '+name,flush=True);del mesh,result;mx.clear_cache()
