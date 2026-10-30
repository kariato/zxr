"""Generate one untouched shape per selected modular garden reference."""
from pathlib import Path
import hashlib,json,time,shutil
from generate import PIPELINE
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1'
OUT=BASE/'meshes-v1'; OUT.mkdir(exist_ok=True)
NAMES=['garden-shell','dragon','unicorn','serpent','dog','woman-violet','woman-rose','gazebo']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 import mlx.core as mx
 from hy3dmlx.pipeline import Hunyuan3DShapePipeline
 pipe=None
 for name in NAMES:
  ref=BASE/f'{name}.png'; mesh=OUT/f'{name}.glb'; record=OUT/f'{name}.json'
  if mesh.exists() and record.exists():
   old=json.loads(record.read_text())
   if old['referenceSha256']==sha(ref) and old['sha256']==sha(mesh):
    print('REUSE',name,flush=True); continue
   raise RuntimeError('Existing output differs; preserve and version it')
  if mesh.exists() or record.exists(): raise RuntimeError('Incomplete existing output; inspect before overwriting')
  if pipe is None:
   pipe=Hunyuan3DShapePipeline.from_pretrained(str(ROOT/'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'),dtype=mx.float16,quantize=8)
  print('START',name,flush=True); started=time.monotonic()
  raw=pipe.generate(str(ref),num_inference_steps=8,guidance_scale=5,octree_resolution=512,seed=42,octree_decode=True)
  raw.export(mesh)
  r={'name':name,'pipeline':{**PIPELINE,'octree':512},'reference':f'../{name}.png','referenceSha256':sha(ref),'file':mesh.name,'sha256':sha(mesh),'bytes':mesh.stat().st_size,'vertices':len(raw.vertices),'triangles':len(raw.faces),'boundsNativeUnits':raw.bounds.tolist(),'seconds':round(time.monotonic()-started,2),'geometryPostprocessing':'none','textureMethod':'none; shape only','status':'draft; inspect isolated hidden geometry and openings'}
  record.write_text(json.dumps(r,indent=2)+'\n'); print('DONE',name,r['triangles'],'triangles',flush=True)
  del raw; mx.clear_cache()
 for name in ['TENCENT-HUNYUAN-3D-2.0-LICENSE.txt','HUNYUAN-NOTICE.txt']:
  shutil.copy2(ROOT/'src/prototype/assets'/name,OUT/name)
 print('ALL EIGHT COMPLETE',flush=True)
if __name__=='__main__': main()
