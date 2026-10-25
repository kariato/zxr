"""Run local SkinTokens/Blender humanoid jobs serially on the 24 GB Mac."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('identities',nargs='+');parser.add_argument('--finish-only',action='store_true');args=parser.parse_args()
    entries={e['sourceIdentity']:e for e in json.loads((ROOT/'games/zork2/assets/catalog.json').read_text())['objects']}
    vendor=ROOT/'out/asset-tools/assetfurnace/vendor/SkinTokens';python=vendor/'.venv/bin/python'
    failed=[]
    for identity in args.identities:
        entry=entries[identity]
        if entry['route']!='image-mesh-humanoid-rig':raise ValueError('Not a humanoid: '+identity)
        directory=ROOT/'out/asset-production'/entry['id'];source=directory/'candidate.glb';target=directory/'rigged.glb'
        if not source.exists():raise FileNotFoundError(source)
        if not args.finish_only:
            print('RIG '+identity,flush=True)
            with (directory/'rig.log').open('w') as log:
                result=subprocess.run([str(python),'-u','demo.py','--input',str(source),'--output',str(target),'--use_transfer','--num_beams','5','--model_ckpt','experiments/articulation_xl_quantization_256_token_4/grpo_1400.ckpt'],cwd=vendor,stdout=log,stderr=subprocess.STDOUT)
            if result.returncode:
                failed.append(identity+': SkinTokens failed');continue
        elif not target.exists():raise FileNotFoundError(target)
        with (directory/'finish.log').open('w') as log:
            result=subprocess.run([str(python),'-u',str(ROOT/'tools/assets/finish-humanoid.py'),identity],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        if result.returncode:failed.append(identity+': finishing needs individual rig review')
        else:print('ANIMATED '+identity,flush=True)
    print(json.dumps({'failed':failed}),flush=True)
    if failed:sys.exit(1)
if __name__=='__main__':main()
