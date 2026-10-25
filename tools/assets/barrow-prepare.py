"""Reproject natural stone grain on saved Hunyuan meshes, without re-running AI."""
import hashlib
import json
from pathlib import Path
import trimesh
from generate import prepare
ROOT=Path(__file__).resolve().parents[2]
directory=ROOT/'out/asset-production/barrow-natural-v1'
for name,triangles,dimensions in [('arch',4000,[3.5,3.05,.7]),('boulder',2200,[1.4,.85,1.1]),('ledge',1600,[1.6,.5,1])]:
    target=directory/name;raw=trimesh.load(target/'raw.glb',force='mesh')
    mesh,_=prepare(raw,ROOT/'games/zork2/assets/experiments/barrow-natural-v1'/name/'reference.png',triangles,dimensions,stone_projection=True)
    output=target/'candidate.glb'
    if not (target/'candidate-front-only.glb').exists():output.rename(target/'candidate-front-only.glb')
    mesh.export(output);record=json.loads((target/'candidate.json').read_text());record['sha256']=hashlib.sha256(output.read_bytes()).hexdigest();record['textureMethod']='Three-axis reference projection for natural stone; reused grain, not a learned multiview paint pass.'
    (target/'candidate.json').write_text(json.dumps(record,indent=2)+'\n');print(name,flush=True)
