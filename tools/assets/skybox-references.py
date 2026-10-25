"""Prepare shared skybox families and retain unmodified built-in ImageGen outputs."""
from pathlib import Path
import argparse, datetime, hashlib, html, json, shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'games/zork2/assets/skyboxes'
ROOMS = ROOT/'games/zork2/assets/rooms'

FAMILIES = {
 'bare-stone': ('Bare stone interior', 'An empty modest subterranean chamber with plain cool grey matte stone walls and a simple enclosed ceiling, dusty subdued neutral stone surfaces. No ornate masonry, elaborate vaults or decorative motifs. Generic undistinguished old dungeon interior. Distant neutral wall surfaces accommodate separate foreground room geometry.', 'BANK-ENTRANCE CAGE-ROOM DEPOSITORY DREARY-ROOM KENNEL LIBRARY MACHINE-ROOM OFFICE PEARL-ROOM PENTAGRAM-ROOM POOL-ROOM RIDDLE-ROOM SAFE-ROOM SMALL-ROOM TEA-ROOM TELLER-EAST TELLER-WEST TROPHY-ROOM VAULT VIEWING-EAST VIEWING-WEST WIZARDS-QUARTERS WIZARDS-WORKSHOP WORKBENCH-ROOM'),
 'dusty-corridor': ('Dusty stone corridor', 'An enclosed long underground stone corridor with smooth worn dusty grey walls, subdued earth tones and a low irregular ceiling. Distant empty corridor wall surfaces only. Cobwebs, leaves, cracks, branches and passage mouths will be separate foreground geometry; do not paint them.', 'AQUARIUM-ROOM COBWEBBY-CORRIDOR DARK-TUNNEL GUARDIAN-ROOM'),
 'marble-interior': ('Ancient marble interior', 'The empty distant interior of an ancient underground marble hall. Pale cool ivory-grey marble with restrained broad veins, subtly cracked and weathered, simple structural arching overhead. Empty walls and closed ceiling only. No columns in foreground, reliefs, sculptures, stairs, crypts, heads, inscriptions or doors; those are separate 3D geometry.', 'CERBERUS-ROOM CRYPT-ANTEROOM CRYPT-ROOM MARBLE-HALL STAIRWAY-TOP'),
 'diamond-maze': ('Angled maze stone', 'A small enclosed underground room with austere oddly angled grey stone wall planes. Repeated anonymous broad facets, even dim illumination, no unique visual landmark, no colored accents, no orientation cues. The nine maze rooms share EXACTLY this texture. Directional passage mouths are separate geometry; paint none.', 'DIAMOND-1 DIAMOND-2 DIAMOND-3 DIAMOND-4 DIAMOND-5 DIAMOND-6 DIAMOND-7 DIAMOND-8 DIAMOND-9'),
 'cave-garden': ('Moss-lit cavern garden', 'Deep inside an enormous enclosed limestone cave containing a formal garden. Distant unbroken dark muted green hedge canopy conceals the cavern walls. Very high rocky ceiling with soft diffuse moss illumination gives a cloudy-day impression but is visibly ROCK at the zenith. No real sky or sunlight. Sparse understated distant rose foliage, no paths, no gaps, no shaped topiary silhouettes, no arbor, no gazebo or buildings. All distinctive hedges, flowers, topiary, gazebo and pathways are separate foreground geometry.', 'FORMAL-GARDEN GARDEN-NORTH GAZEBO-ROOM TOPIARY-ROOM'),
 'ancient-lava': ('Cold ancient lava stone', 'An enclosed ancient chamber formed from solidified lava. Cold dark grey basalt walls with broad smooth flowing folds and rounded surfaces worn by long vanished ice. Restrained mineral variations and dim neutral illumination. All lava is ancient and cold: NO red glow, fire, molten material, ice, steam or glacier. Empty subdued floor, continuous ceiling. Large glacier, rubble, exits and changing steam are separate geometry.', 'GLACIER-ROOM LAVA-ROOM'),
 'lava-chimney': ('Vertical lava chimney', 'Suspended viewpoint inside a tight very tall vertical chimney of completely solidified cold grey lava, extending over one hundred feet upward and far downward. Rough flowing basalt encloses every horizontal direction. Zenith and nadir recede vertically into dim distance. No standing floor, no platform, no open sky, no red glow, lava, exits or cracks. This is a vertical shaft panorama, NOT a horizontal room.', 'LAVA-TUBE'),
 'volcano-bottom': ('Dormant volcano floor view', 'View from the bottom of a huge DORMANT volcano inside its cold hollow cone. Ancient dark ochre grey volcanic rock slopes steeply inward to a small very distant light aperture at the zenith. Empty rough stone ground below, massive bare walls in every direction. Subtle diffuse light from extremely high above. No active lava, fire, smoke plume, snow, grass, balloon, basket, ropes, ledges, exits or paths.', 'VOLCANO-BOTTOM'),
 'volcano-lower': ('Dormant volcano lower airborne view', 'Suspended view about one hundred feet above the floor INSIDE a large dormant volcano. Cold volcanic cone walls surround the full horizon. Floor distinctly far below in nadir, clearly visible cone top very high above, dim daylight filtering down the cone. The small rim opening stays near zenith, NOT a horizontal outdoor horizon. No standing floor beneath viewer. No active lava, fire, floating platforms, balloon, basket, ropes, ledges or exits.', 'VAIR-1'),
 'volcano-middle': ('Dormant volcano middle view', 'Suspended viewpoint around two hundred feet above the distant floor INSIDE a huge dormant volcano, about halfway between floor and rim. Large cold volcanic cone walls surround horizon, bottom far below at nadir, looming rim above near zenith. Atmospheric dim earthy grey volcanic stone. No walkable foreground floor. No active lava, fire, smoke, balloon, basket, ropes, landings, ledges, paths or exits; ledges and hooks are separate foreground geometry.', 'VAIR-2 LEDGE-1 LEDGE-2 LEDGE-TUNNEL VOLCANO-VIEW'),
 'volcano-upper': ('Dormant volcano upper airborne view', 'Suspended viewpoint high INSIDE the hollow cone of a dormant volcano, very near its narrowing rim. Bare cold volcanic walls surround viewer, distant tiny floor far down in nadir. Rim close above, light aperture at zenith; keep horizontal horizon enclosed by rock. No standing floor, no active lava, fire, floating platforms, balloon, basket, ropes, ledges or exits.', 'VAIR-3'),
 'volcano-rim': ('Dormant volcano rim view', 'Suspended viewpoint just INSIDE the upper rim of a vast dormant volcanic cone. Open muted overcast daylight SKY directly ABOVE viewer at zenith, jagged cold volcanic rim surrounding upper hemisphere, bare cone walls at eye level, enormous interior void descending to tiny distant floor at nadir. No walkable foreground floor, no outside mountain panorama on horizon, no active lava, fire, balloon, basket, ropes, ledges or exits. The western landing is separate geometry.', 'VAIR-4'),
 'brick-well': ('Damp brick well', 'Inside an ancient enclosed tall cylindrical well of damp brick and mortar. Broad matte weathered earth-grey brick courses wrap around viewer, subdued moisture staining, circular shaft extends upward into darkness with no visible roof, modest shadowy lower surface. No sky, open daylight, water, bucket, ropes, etchings, text, cracks, doors or exits. The upper landing and lower room will use separate physical floors and walls.', 'WELL-BOTTOM WELL-TOP'),
 'circular-high': ('High circular stone chamber', 'A large circular ancient stone chamber with a very high enclosed ceiling disappearing into gloom. Anonymous neutral grey stone walls with regular repeating surfaces and no unique orientation clues. Eight passage mouths will be separate geometry, do not paint any openings. No columns, compass marks, signs, symbols or furniture.', 'CAROUSEL-ROOM'),
 'circular-low': ('Low circular stone chamber', 'An empty circular underground room with a distinctly LOW flat enclosed stone ceiling, plain matte grey walls, even subdued neutral illumination. No machinery, metal fixtures, magnets, danger lights, floor markings, compass symbols, passages or doorways. Directional exits will be separate geometry.', 'MAGNET-ROOM'),
 'giant-room': ('Enormous stone room', 'An abnormally enormous enclosed underground room viewed from near floor level by a tiny observer. Immense distant plain stone walls and very high ceiling, monumental broad stone surfaces establish huge scale without adding any objects. Muted grey and earth stone. No wooden posts, roof-like table, furniture, chasms, paths, holes or exits: those belong to separate scale-correct foreground geometry.', 'POSTS-ROOM'),
}
EXISTING = {
 'barrow': ('src/prototype/assets/barrow-skybox-v1.png', 'INSIDE-BARROW ROOM-8 TINY-ROOM ZORK3'),
 'cavern': ('src/prototype/assets/cavern-skybox-v1.png', 'COOL-ROOM DEEP-FORD FOOT-BRIDGE GREAT-CAVERN MENHIR-ROOM NARROW-TUNNEL RAVINE-LEDGE SHALLOW-FORD STONE-BRIDGE STREAM-PATH'),
 'lair': ('src/prototype/assets/lair-skybox-v1.png', 'DRAGON-LAIR DRAGON-ROOM FRESCO-ROOM'),
}

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path, data): path.write_text(json.dumps(data, indent=2)+'\n')
def prepare():
 BASE.mkdir(parents=True, exist_ok=True)
 assert not (BASE/'manifest.json').exists(), 'Preparation is initial-only; preserve generated selections and prompts'
 style = ROOT/'games/zork2/planning/style-bible.md'
 room_manifest = json.loads((ROOMS/'manifest.json').read_text())
 contexts = {r['identity']: json.loads((ROOMS/r['context']).read_text()) for r in room_manifest['rooms']}
 assets, assignments = [], {}
 for key, (path, names) in EXISTING.items():
  assets.append({'id':key, 'status':'existing', 'image':path, 'imageSha256':sha(ROOT/path)})
  for name in names.split(): assignments[name] = {'skybox':key, 'reason':'Compatible existing distant rock shell; room-specific floor, exits, features and effects remain separate geometry.'}
 for key, (label, scene, names) in FAMILIES.items():
  folder = BASE/key
  folder.mkdir(exist_ok=True)
  packet = [contexts[n] for n in names.split()]
  save(folder/'source-context.json', packet)
  prompt = ('Use case: stylized-concept\nAsset type: seamless full-sphere 360-degree equirectangular skybox texture, a single 2:1 longitude-latitude panorama, 2048 by 1024 pixels. Full 360 horizontal and 180 vertical degrees, horizontal wrap edges match, poles converge, eye-level horizon at vertical center. NOT a perspective illustration, NOT a cubemap atlas or collage.\nPrimary request: '+scene+'\nStyle: Follow the COMPLETE approved guide below. Low-poly illustrated fantasy, broad faceted forms, restrained surface detail, matte readable materials, subtle ancient theatrical mystery.\nConstraints: Distant ambient backdrop only. No foreground props, characters, monsters, treasure, furniture, vehicles, text, numbers, symbols, UI, borders, watermarks or baked directional exits. Keep revealable, movable, interactive and state-dependent features out of the panorama. No added puzzle clues. Source descriptions override style. Dim readable authoring illumination represents a hypothetical carried light, not permission to reveal a dark room during play. Each room keeps its engine visibility and logical identity.\n\nCOMPLETE APPROVED STYLE GUIDE:\n'+style.read_text()+'\n\nSOURCE PACKETS (authoring constraints; do not paint the listed objects or text):\n'+json.dumps([{"room":c["room"],"description":c["literalRoomDescription"],"profile":c["safeSceneProfile"],"separateObjects":[o["identity"] for o in c["visibleInitialObjects"]]} for c in packet], indent=2)+'\n')
  (folder/'reference-v1.prompt.txt').write_text(prompt)
  assets.append({'id':key, 'label':label, 'status':'pending', 'image':str((folder/'reference-v1.png').relative_to(ROOT)), 'prompt':str((folder/'reference-v1.prompt.txt').relative_to(ROOT)), 'promptSha256':sha(folder/'reference-v1.prompt.txt'), 'styleSha256':sha(style), 'sourceContextSha256':sha(folder/'source-context.json')})
  for name in names.split():
   assert name not in assignments, name
   assignments[name] = {'skybox':key, 'reason':'Shares compatible '+label.lower()+' distant surfaces. Distinctive room features, exits, scale, light and changing state remain separate geometry.'}
 for name in ['DEAD-PALANTIR-1','DEAD-PALANTIR-2','DEAD-PALANTIR-3','DEAD-PALANTIR-4','IN-AQUARIUM','IN-CAGE']:
  assignments[name] = {'skybox':None, 'reason':'Nonphysical palantir interlude; no invented environment.' if name.startswith('DEAD') else 'Source does not disclose surroundings. Use only separate observed enclosure or sand, with no invented room vista.'}
 assert set(assignments) == set(contexts), (set(contexts)-set(assignments), set(assignments)-set(contexts))
 save(BASE/'manifest.json', {'format':'zxr-shared-skyboxes-v1','review':'draft','mode':'built-in-imagegen','runtimeIntegrated':False,'assets':assets,'rooms':[{'identity':name, 'sourceHash':contexts[name]['sourceHash'], **assignments[name]} for name in sorted(contexts)]})
 gallery()

def retain(key, source):
 manifest = json.loads((BASE/'manifest.json').read_text())
 entry = next(a for a in manifest['assets'] if a['id']==key)
 revision = 1
 while (BASE/key/f'reference-v{revision}.png').exists(): revision += 1
 path = BASE/key/f'reference-v{revision}.png'
 prompt = path.with_suffix('.prompt.txt')
 assert prompt.exists(), 'Save the exact revision prompt before retaining an output'
 with Image.open(source) as im:
  im.load()
  assert im.width == im.height*2, f'Expected 2:1 panorama, got {im.size}'
  size = list(im.size)
 shutil.copy2(source, path)
 if revision > 1:
  entry.setdefault('previousRevisions', []).append({k:entry[k] for k in ['image','imageSha256','prompt','promptSha256','dimensions']})
 entry.update(status='generated', image=str(path.relative_to(ROOT)), imageSha256=sha(path), prompt=str(prompt.relative_to(ROOT)), promptSha256=sha(prompt), dimensions=size)
 save(path.with_suffix('.json'), {**entry, 'mode':'built-in-imagegen','generatedFile':str(source),'retainedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'unmodified':True})
 save(BASE/'manifest.json', manifest)
 gallery()

def gallery():
 m = json.loads((BASE/'manifest.json').read_text())
 cards=[]
 for a in m['assets']:
  names=', '.join(r['identity'] for r in m['rooms'] if r['skybox']==a['id'])
  image=ROOT/a['image']
  import os
  url=os.path.relpath(image, BASE)
  cards.append('<article><h2>'+html.escape(a.get('label',a['id']))+'</h2>'+('<img src="'+url+'" alt="'+a['id']+'" loading="lazy">' if image.exists() else '<p>Pending generation</p>')+'<p><a href="viewer.html#'+a['id']+'">Look around in 360°</a> · <a href="'+url+'">PNG</a></p><p>'+html.escape(names)+'</p></article>')
 (BASE/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zork II skyboxes</title><style>body{background:#142026;color:#ecede7;font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px}article{background:#253239;padding:16px;border-radius:12px}img{width:100%;aspect-ratio:2/1}p{overflow-wrap:anywhere}</style><h1>Zork II shared skyboxes</h1><p>Draft environment textures. Full room mapping: <a href="manifest.json">manifest</a>. Foreground geometry and engine visibility remain separate.</p><main>'+''.join(cards)+'</main></html>')

if __name__=='__main__':
 parser=argparse.ArgumentParser()
 parser.add_argument('action', choices=['prepare','retain','gallery'])
 parser.add_argument('key', nargs='?')
 parser.add_argument('source', nargs='?')
 args=parser.parse_args()
 if args.action=='prepare': prepare()
 elif args.action=='retain': retain(args.key,Path(args.source))
 else: gallery()
