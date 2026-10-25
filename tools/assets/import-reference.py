"""Copy a generated reference into its source-identity directory without overwrites."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
def main():
    if (ROOT/'out/asset-tools/stop-reference-queue').exists():
        raise RuntimeError('Bulk reference queue paused for bounded scene work')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('identity');parser.add_argument('source',type=Path)
    parser.add_argument('--prompt',type=Path,required=True)
    args=parser.parse_args()
    entries=json.loads((ROOT/'games/zork2/assets/catalog.json').read_text())['objects']
    entry=next(e for e in entries if e['sourceIdentity']==args.identity)
    if not entry['reference']:raise ValueError('Identity requires no reference')
    destination=ROOT/'games/zork2/assets'/entry['reference']
    if destination.exists():raise FileExistsError('Keep the existing reference; use a new version for edits: '+str(destination))
    im=Image.open(args.source)
    if im.mode!='RGBA' or im.getchannel('A').getextrema()[0]!=0:raise ValueError('Expected alpha reference, not an opaque backdrop')
    destination.parent.mkdir(parents=True,exist_ok=True)
    prompt=destination.with_suffix('.prompt.txt')
    if prompt.exists() and prompt.read_bytes()!=args.prompt.read_bytes():raise FileExistsError('Existing prompt differs')
    shutil.copy2(args.source,destination)
    if prompt.resolve()!=args.prompt.resolve():shutil.copy2(args.prompt,prompt)
    digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    record={'format':'zxr-generated-reference-v1','sourceIdentity':args.identity,'mode':'built-in-imagegen',
        'image':destination.name,'imageSha256':digest(destination),'prompt':prompt.name,'promptSha256':digest(prompt),
        'imageSize':list(im.size),'review':'draft','modelStatus':'not-started'}
    destination.with_suffix('.json').write_text(json.dumps(record,indent=2)+'\n')
    print(args.identity+': reference saved',flush=True)
if __name__=='__main__':main()
