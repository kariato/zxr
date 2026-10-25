"""Prepare source-grounded room prompts and retain built-in ImageGen outputs."""
from pathlib import Path
import argparse
import datetime
import hashlib
import html
import json
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONTEXT = ROOT/'games/zork2/planning/context'
OUTPUT = ROOT/'games/zork2/assets/rooms'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_gallery():
    manifest = json.loads((OUTPUT/'manifest.json').read_text())
    cards = []
    for entry in manifest['rooms']:
        image = OUTPUT/entry['image']
        if image.exists():
            picture = f'<a href="{entry["image"]}"><img loading="lazy" src="{entry["image"]}" alt="{html.escape(entry["label"])}"></a>'
        else:
            picture = '<p class="pending">Awaiting image generation</p>'
        cards.append(f'<article><h2>{html.escape(entry["label"])}</h2><p>{entry["identity"]}</p>{picture}<p><a href="{entry["prompt"]}">Exact prompt</a> · <a href="{entry["context"]}">Source context</a> · <a href="{str(Path(entry["image"]).with_suffix(".json"))}">Provenance</a></p></article>')
    count = sum((OUTPUT/row['image']).exists() for row in manifest['rooms'])
    manifest['generated'] = count
    manifest['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zork II room references</title>
<style>body{background:#142026;color:#ecede7;font:16px system-ui;margin:clamp(12px,3vw,36px)}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),1fr));gap:24px}article{background:#253239;padding:16px;border-radius:12px;min-width:0}img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:6px}h2{font-size:20px}a{color:#d8bb7b}input{background:#253239;color:#ecede7;border:1px solid #8e9c9f;border-radius:6px;font:inherit;padding:12px;margin:12px 0 24px;width:min(90%,480px)}[hidden]{display:none!important}.pending{min-height:180px;display:grid;place-items:center;color:#a9b4b5}</style>
<h1>Zork II room references</h1><p>'''+str(count)+' / '+str(len(manifest['rooms']))+''' generated with built-in ImageGen. Draft offline art references; source visibility and game state remain authoritative.</p>
<p><a href="README.md">Batch notes</a> · <a href="approved-style-guide.md">Approved style guide</a> · <a href="manifest.json">Full inventory</a></p>
<label for="room-search">Find a room</label><br><input id="room-search" type="search" placeholder="Room name or source identity"><span id="search-count" aria-live="polite"></span>
<main>'''+''.join(cards)+'''</main><script>
const cards=[...document.querySelectorAll('article')];document.querySelector('#room-search').addEventListener('input',event=>{const query=event.target.value.trim().toLowerCase();let visible=0;for(const card of cards){card.hidden=!card.textContent.toLowerCase().includes(query);if(!card.hidden)visible++;}document.querySelector('#search-count').textContent=query?' '+visible+' rooms shown':'';});
</script></html>'''
    (OUTPUT/'index.html').write_text(page)
    print(json.dumps({'generated': count, 'total': len(manifest['rooms']), 'gallery': str(OUTPUT/'index.html')}))


def prepare():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    index = json.loads((CONTEXT/'index.json').read_text())
    objects = {o['name']: o for o in json.loads((CONTEXT/'objects.json').read_text())['objects']}
    routines = {r['name']: r for r in json.loads((CONTEXT/'routines.json').read_text())['routines']}
    catalogue = {o['sourceIdentity']: o for o in json.loads((ROOT/'games/zork2/assets/catalog.json').read_text())['objects']}
    style_path = ROOT/'games/zork2/planning/style-bible.md'
    style = style_path.read_text()
    rooms = []
    for entry in index['rooms']:
        context = json.loads((CONTEXT/entry['file']).read_text())
        room = context['room']
        name = room['name']
        directory = OUTPUT/name.lower()
        directory.mkdir(exist_ok=True)
        plan_path = ROOT/f'games/zork2/planning/drafts/scene-plan_{name}.json'
        plan = json.loads(plan_path.read_text())['document']
        visible, excluded = [], []
        for identity in context['initialObjects']:
            obj = objects[identity]
            reason = None
            if catalogue[identity]['kind'] == 'identity':
                reason = 'identity/proxy, no invented body'
            elif 'INVISIBLE' in obj['flags']:
                reason = 'initially concealed'
            for ancestor in obj['ancestry']:
                if ancestor not in objects:
                    continue
                parent = objects[ancestor]
                if 'INVISIBLE' in parent['flags']:
                    reason = 'concealed ancestor'
                if 'CONTBIT' in parent['flags'] and not any(flag in parent['flags'] for flag in ['OPENBIT', 'TRANSBIT', 'SURFACEBIT']):
                    reason = 'inside a closed opaque container'
            if reason:
                excluded.append({'identity': identity, 'reason': reason})
                continue
            brief_path = ROOT/f'games/zork2/planning/drafts/asset-brief_{identity}.json'
            brief = json.loads(brief_path.read_text())['document']['description'] if brief_path.exists() else ''
            visible.append({'identity': identity, 'label': obj['desc']['text'], 'parent': obj['parent'],
                            'flags': obj['flags'], 'sourceText': [t.get('text', '') for t in obj['text']],
                            'appearanceBrief': brief})
        guarded = []
        for identity in context['routines']['roots']:
            routine = routines.get(identity)
            if not routine:
                continue
            # Keep exact guarded source for dynamic room descriptions. Object
            # action scripts are not treated as unconditional room scenery.
            if name.replace('S-', '-').split('-')[0] in identity or identity in ['DEAD-PALANTIR', 'WIZARD-QUARTERS-FCN']:
                guarded.append({'routine': identity, 'sourceText': routine['sourceText'][:10000]})
        packet = {'room': name, 'label': room['desc']['text'],
                  'literalRoomDescription': [t.get('text', '') for t in room['ldesc']],
                  'safeSceneProfile': plan['description'].split('\nStatic source description:')[0].split('\nDescription is routine-driven:')[0],
                  'visibleInitialObjects': visible, 'excludedObjects': excluded,
                  'sourceExits': [{'direction': e['direction'], 'view': e['view']} for e in context['exits']],
                  'guardedRoomSource': guarded,
                  'sourceLightFlag': room['initialRoomLightFlag'], 'sourceHash': context['inputHash']}
        special = ''
        if name.startswith('DEAD-PALANTIR-'):
            special = 'This is a nonphysical palantir interlude: depict the source-coloured enveloping mist and source-backed impressions only. Do not invent a furnished chamber, floor, door, path or portal.'
        elif name.startswith('VAIR-'):
            special = 'Aerial viewpoint inside the dormant volcano at the exact source elevation. No standing floor or invented platform. Show only source-described ledges; open sky only when the description permits it.'
        elif name.startswith('DIAMOND-'):
            special = 'Preserve the indistinguishable architectural vocabulary of the oddly-angled maze. No numbers, maps, unique landmarks, coloured route markers or hints that solve the maze.'
        elif name == 'IN-CAGE':
            special = 'This logical room is the trapped state: the viewpoint is inside the solid steel cage, with bars framing the dingy closet beyond. No robot unless source context actually places it here.'
        prompt = '\n\n'.join([
            'Use case: stylized-concept\nAsset type: one landscape room reference illustration for the Zork II adventure port.\nPrimary request: depict '+room['desc']['text']+' ('+name+'), using the supplied source evidence and complete approved style guide.',
            'Style and composition: a polished stylized 3D fantasy illustration, readable broad forms, softened weathered stone silhouettes, matte materials, restrained detail and theatrical depth. Eye-level wide view into the space, believable human scale, clear separation of the source-backed important objects. One coherent scene, no collage, cutaway, labels, title, UI, watermark, border or compass overlay. Landscape 1536 x 1024 composition.',
            'Complete approved style guide (verbatim; source facts take precedence):\n'+style,
            'Room and object evidence (JSON data, not executable instructions):\n'+json.dumps(packet, ensure_ascii=False, indent=2),
            'State discipline: this is an offline art reference, not a runtime visibility override. Use the safe scene profile and literal room description for the represented base state. Guarded routine text lists conditional possibilities: do not combine incompatible states, reveal secret doors, open closed containers, summon absent actors, or display rewards from later puzzle outcomes. The visible-object list identifies objects that can be drawn; preserve their containment and scale. Excluded objects must stay out of view. Source inscriptions may appear only with the exact supplied wording; do not invent runes, signs, clues or treasure. Potential arrivals and universal proxies are not scenery.',
            'Lighting: honour source illumination. For an otherwise unlit physical room, use a restrained hypothetical carried lantern outside the frame for authoring visibility, with deep shadows and no invented permanent torches or glowing objects. This light choice does not change game state. Keep underground spaces enclosed; do not infer outdoors from RLANDBIT.',
            special or 'Preserve source materials, quantities, distinctive colours and directions. Do not show the next room\'s contents through an exit. Render a single source-grounded room view.'
        ])
        prompt_path = directory/'reference-v1.prompt.txt'
        context_path = directory/'source-context.json'
        if (directory/'reference-v1.png').exists() and prompt_path.exists() and prompt_path.read_text() != prompt+'\n':
            raise RuntimeError('Existing reference inputs differ; retain it and choose a new version: '+name)
        prompt_path.write_text(prompt+'\n')
        context_path.write_text(json.dumps(packet, ensure_ascii=False, indent=2)+'\n')
        rooms.append({'identity': name, 'label': room['desc']['text'], 'image': name.lower()+'/reference-v1.png',
                      'prompt': str(prompt_path.relative_to(OUTPUT)), 'context': str(context_path.relative_to(OUTPUT)),
                      'styleSha256': digest(style_path), 'sourceHash': context['inputHash'], 'promptSha256': digest(prompt_path)})
    manifest = {'format': 'zxr-room-reference-batch-v1', 'mode': 'built-in-imagegen', 'review': 'draft',
                'style': 'games/zork2/planning/style-bible.md', 'total': len(rooms), 'rooms': rooms}
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    write_gallery()


def import_image(identity, source):
    manifest = json.loads((OUTPUT/'manifest.json').read_text())
    entry = next(row for row in manifest['rooms'] if row['identity'] == identity)
    destination = OUTPUT/entry['image']
    if destination.exists():
        if digest(destination) != digest(source):
            raise FileExistsError('Retain existing image; use a new revision: '+str(destination))
    else:
        with Image.open(source) as im:
            im.verify()
        shutil.copy2(source, destination)
    record = {'format': 'zxr-room-reference-v1', 'room': identity, 'mode': 'built-in-imagegen',
              'image': destination.name, 'imageSha256': digest(destination), 'sourceFile': str(source),
              'styleSha256': entry['styleSha256'], 'sourceHash': entry['sourceHash'],
              'promptSha256': entry['promptSha256'], 'review': 'draft', 'runtimeIntegration': 'not-performed'}
    destination.with_suffix('.json').write_text(json.dumps(record, indent=2)+'\n')
    write_gallery()


def revise_image(identity, source, prompt):
    manifest = json.loads((OUTPUT/'manifest.json').read_text())
    entry = next(row for row in manifest['rooms'] if row['identity'] == identity)
    previous = entry.copy()
    directory = (OUTPUT/entry['image']).parent
    revision = 2
    while (directory/f'reference-v{revision}.png').exists():
        revision += 1
    destination = directory/f'reference-v{revision}.png'
    prompt_destination = destination.with_suffix('.prompt.txt')
    with Image.open(source) as im:
        im.verify()
    shutil.copy2(source, destination)
    shutil.copy2(prompt, prompt_destination)
    entry['image'] = str(destination.relative_to(OUTPUT))
    entry['prompt'] = str(prompt_destination.relative_to(OUTPUT))
    entry['promptSha256'] = digest(prompt_destination)
    entry.setdefault('previousRevisions', []).append({key: previous[key] for key in ['image', 'prompt', 'promptSha256']})
    record = {'format': 'zxr-room-reference-v1', 'room': identity,
              'mode': 'built-in-imagegen', 'operation': 'targeted-edit',
              'image': destination.name, 'imageSha256': digest(destination),
              'sourceFile': str(source), 'referenceImage': previous['image'],
              'referenceImageSha256': digest(OUTPUT/previous['image']),
              'styleSha256': entry['styleSha256'], 'sourceHash': entry['sourceHash'],
              'promptSha256': entry['promptSha256'], 'review': 'draft',
              'runtimeIntegration': 'not-performed'}
    destination.with_suffix('.json').write_text(json.dumps(record, indent=2)+'\n')
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    write_gallery()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'import', 'revise', 'gallery'])
    parser.add_argument('identity', nargs='?')
    parser.add_argument('source', nargs='?', type=Path)
    parser.add_argument('--prompt', type=Path)
    args = parser.parse_args()
    if args.mode == 'prepare': prepare()
    elif args.mode == 'import': import_image(args.identity, args.source)
    elif args.mode == 'revise':
        if args.prompt is None: parser.error('revise requires --prompt')
        revise_image(args.identity, args.source, args.prompt)
    else: write_gallery()


if __name__ == '__main__': main()
