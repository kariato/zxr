"""Verify the room image inventory and package its reproducible art inputs."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'games/zork2/assets/rooms'
DELIVERY = ROOT/'out/asset-production/room-reference-verification'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    manifest = json.loads((BASE/'manifest.json').read_text())
    source_index = json.loads((ROOT/'games/zork2/planning/context/index.json').read_text())
    source_contexts = [json.loads((ROOT/'games/zork2/planning/context'/row['file']).read_text())
                       for row in source_index['rooms']]
    expected = {context['room']['name'] for context in source_contexts}
    current_source_hashes = {context['room']['name']: context['inputHash'] for context in source_contexts}
    actual = [row['identity'] for row in manifest['rooms']]
    errors = []
    if set(actual) != expected or len(actual) != len(expected):
        errors.append('Room inventory differs from source index or contains duplicate identities')
    style = ROOT/manifest['style']
    style_hash = digest(style)
    rows = []
    hashes = set()
    for entry in manifest['rooms']:
        row_errors = []
        image = BASE/entry['image']
        prompt = BASE/entry['prompt']
        context = BASE/entry['context']
        dimensions = None
        image_hash = None
        try:
            with Image.open(image) as im:
                im.load()
                dimensions = list(im.size)
                if im.format != 'PNG' or im.size != (1536, 1024):
                    row_errors.append('Expected a 1536 x 1024 PNG')
            image_hash = digest(image)
            if image_hash in hashes:
                row_errors.append('Duplicate selected image')
            hashes.add(image_hash)
            record = json.loads(image.with_suffix('.json').read_text())
            packet = json.loads(context.read_text())
            if record['room'] != entry['identity'] or packet['room'] != entry['identity']:
                row_errors.append('Room identity mismatch')
            if record['mode'] != 'built-in-imagegen':
                row_errors.append('Wrong generator mode')
            if image_hash != record['imageSha256']:
                row_errors.append('Image hash mismatch')
            if digest(prompt) != entry['promptSha256'] or digest(prompt) != record['promptSha256']:
                row_errors.append('Prompt hash mismatch')
            if style_hash != entry['styleSha256'] or style_hash != record['styleSha256']:
                row_errors.append('Style hash mismatch')
            if packet['sourceHash'] != entry['sourceHash'] or packet['sourceHash'] != record['sourceHash']:
                row_errors.append('Source context hash mismatch')
            if packet['sourceHash'] != current_source_hashes.get(entry['identity']):
                row_errors.append('Reference uses stale source context')
            for old in entry.get('previousRevisions', []):
                with Image.open(BASE/old['image']) as im:
                    im.verify()
                if digest(BASE/old['prompt']) != old['promptSha256']:
                    row_errors.append('Retained revision prompt hash mismatch')
        except (OSError, ValueError, KeyError) as error:
            row_errors.append(str(error))
        rows.append({'room': entry['identity'], 'image': entry['image'],
                     'sha256': image_hash, 'dimensions': dimensions,
                     'status': 'fail' if row_errors else 'pass', 'errors': row_errors})
    if manifest.get('generated') != len(expected):
        errors.append('Manifest generated count is incomplete')
    failed = sum(row['status'] == 'fail' for row in rows)
    result = {'format': 'zxr-room-reference-verification-v1',
              'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'expected': len(expected), 'passed': len(rows)-failed, 'failed': failed,
              'errors': errors, 'review': 'draft-art-references',
              'checks': ['source identity coverage', 'PNG full decode and dimensions',
                         'image and prompt hashes', 'approved style hash',
                         'source packet hash', 'built-in ImageGen provenance',
                         'retained revision preservation'], 'rooms': rows}
    DELIVERY.mkdir(parents=True, exist_ok=True)
    (DELIVERY/'verification.json').write_text(json.dumps(result, indent=2)+'\n')
    if errors or failed:
        raise RuntimeError(json.dumps({'failed': failed, 'errors': errors,
                                       'rooms': [r for r in rows if r['errors']]}))
    shutil.copy2(style, BASE/'approved-style-guide.md')
    return manifest, result


def contact_sheets(manifest):
    directory = BASE/'contact-sheets'
    directory.mkdir(exist_ok=True)
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
    for offset in range(0, len(manifest['rooms']), 12):
        page_rooms = manifest['rooms'][offset:offset+12]
        canvas = Image.new('RGB', (1260, ((len(page_rooms)+2)//3)*320), '#142026')
        draw = ImageDraw.Draw(canvas)
        for index, row in enumerate(page_rooms):
            x, y = (index % 3)*420, (index//3)*320
            with Image.open(BASE/row['image']) as im:
                im.thumbnail((408, 272))
                canvas.paste(im.convert('RGB'), (x+6, y+6))
            draw.text((x+8, y+282), row['identity'], fill='#ecede7', font=font)
        canvas.save(directory/f'rooms-{offset//12+1:02}.jpg', quality=90)


def package(manifest, result):
    archive = DELIVERY/'all-room-references.zip'
    files = sorted(path for path in BASE.rglob('*') if path.is_file())
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_STORED) as z:
        for path in files:
            z.write(path, Path('zork2-room-references')/path.relative_to(BASE))
        z.write(DELIVERY/'verification.json', 'zork2-room-references/verification.json')
    with zipfile.ZipFile(archive) as z:
        bad = z.testzip()
        if bad:
            raise RuntimeError('ZIP integrity failed: '+bad)
    record = {'archive': str(archive), 'bytes': archive.stat().st_size,
              'sha256': digest(archive), 'selectedRoomImages': len(manifest['rooms']),
              'verifiedRooms': result['passed'], 'files': len(files)+1}
    (DELIVERY/'package-manifest.json').write_text(json.dumps(record, indent=2)+'\n')
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', action='store_true')
    args = parser.parse_args()
    manifest, result = verify()
    contact_sheets(manifest)
    print(json.dumps({'expected': result['expected'], 'passed': result['passed'],
                      'failed': result['failed'], 'errors': result['errors']}))
    if args.package:
        print(json.dumps(package(manifest, result)))


if __name__ == '__main__':
    main()
