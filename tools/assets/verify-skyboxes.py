"""Check skybox coverage, full decoding and generation/source provenance."""
from pathlib import Path
import datetime, hashlib, json
from PIL import Image, ImageChops, ImageStat

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/assets/skyboxes'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def verify():
 manifest=json.loads((BASE/'manifest.json').read_text())
 rooms=json.loads((ROOT/'games/zork2/assets/rooms/manifest.json').read_text())['rooms']
 expected={r['identity'] for r in rooms}
 assignments=manifest['rooms']
 assert {r['identity'] for r in assignments}==expected and len(assignments)==len(expected)
 assets={a['id']:a for a in manifest['assets']}
 assert len(assets)==len(manifest['assets'])
 for room in assignments:
  assert room['skybox'] is None or room['skybox'] in assets
  context=ROOT/'games/zork2/assets/rooms'/next(r['context'] for r in rooms if r['identity']==room['identity'])
  assert json.loads(context.read_text())['sourceHash']==room['sourceHash'], room['identity']
 rows=[]
 hashes=set()
 style=ROOT/'games/zork2/planning/style-bible.md'
 for key,asset in assets.items():
  assert asset['status'] in ['existing','generated'], key
  image=ROOT/asset['image']
  assert sha(image)==asset['imageSha256'], key
  assert sha(image) not in hashes, key
  hashes.add(sha(image))
  with Image.open(image) as im:
   im.load()
   assert im.format=='PNG' and im.width==2*im.height and im.width>=1536, key
   dimensions=list(im.size)
   seam=ImageStat.Stat(ImageChops.difference(im.convert('RGB').crop((0,0,1,im.height)), im.convert('RGB').crop((im.width-1,0,im.width,im.height)))).mean
  if asset['status']=='generated':
   assert dimensions==asset['dimensions'], key
   assert sha(ROOT/asset['prompt'])==asset['promptSha256'], key
   assert sha(style)==asset['styleSha256'], key
   assert style.read_text() in (ROOT/asset['prompt']).read_text(), key
   assert sha(BASE/key/'source-context.json')==asset['sourceContextSha256'], key
   packets=json.loads((BASE/key/'source-context.json').read_text())
   for packet in packets:
    context=ROOT/'games/zork2/assets/rooms'/packet['room'].lower()/'source-context.json'
    assert packet==json.loads(context.read_text()), key
   record=json.loads(image.with_suffix('.json').read_text())
   assert record['mode']=='built-in-imagegen' and record['unmodified'], key
   for field in ['imageSha256','promptSha256','sourceContextSha256','styleSha256']:
    assert record[field]==asset[field], (key,field)
   for old in asset.get('previousRevisions',[]):
    assert sha(ROOT/old['image'])==old['imageSha256'], key
    assert sha(ROOT/old['prompt'])==old['promptSha256'], key
    with Image.open(ROOT/old['image']) as im: im.verify()
  rows.append({'id':key,'status':'pass','dimensions':dimensions,'image':asset['image'], 'edgeMeanAbsoluteDifferenceRGB':[round(v,2) for v in seam]})
 report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rooms':len(assignments),'assignedRooms':sum(r['skybox'] is not None for r in assignments),'deliberatelyWithoutSkybox':[r['identity'] for r in assignments if r['skybox'] is None], 'newSkyboxes':sum(a['status']=='generated' for a in assets.values()),'existingSkyboxes':sum(a['status']=='existing' for a in assets.values()),'failed':0,'assets':rows,'limits':'Edge values are diagnostic only; file checks do not certify seamless poles, geometry, parallax, gameplay integration or headset quality.'}
 (BASE/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({k:v for k,v in report.items() if k not in ['assets','limits','checkedAt']}))

if __name__=='__main__': verify()
