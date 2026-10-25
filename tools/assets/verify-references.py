"""Inventory existing reference images and audit their actual GLB exports."""
from pathlib import Path
import argparse
import datetime
import hashlib
import html
import json
import shutil
import sys
import zipfile
from audit import audit

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'games/zork2/assets'
OUT = ROOT/'out/asset-production'
REPORT = OUT/'reference-verification'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def references():
    catalog = json.loads((BASE/'catalog.json').read_text())
    rows = []
    for entry in catalog['objects']:
        reference = BASE/entry['reference'] if entry.get('reference') else None
        if not reference or not reference.exists():
            continue
        directory = OUT/entry['id']
        if entry['sourceIdentity'] == 'PRINCESS':
            model = ROOT/'out/asset-tools/princess/princess-v1.glb'
            record = None
        else:
            model = directory/'candidate.glb'
            record = directory/'candidate.json'
        rows.append({'id': entry['id'], 'identity': entry['sourceIdentity'], 'reference': str(reference.relative_to(ROOT)),
                     'model': str(model.relative_to(ROOT)), 'record': str(record.relative_to(ROOT)) if record else None,
                     'sourceHash': entry['sourceHash'], 'briefHash': entry['briefHash'], 'kind': entry['kind']})
    for name in ['arch', 'boulder', 'ledge']:
        rows.append({'id': 'barrow_'+name, 'identity': 'BARROW '+name.upper(),
                     'reference': f'games/zork2/assets/experiments/barrow-natural-v1/{name}/reference.png',
                     'model': f'out/asset-production/barrow-natural-v1/{name}/candidate.glb',
                     'record': f'out/asset-production/barrow-natural-v1/{name}/candidate.json', 'kind': 'scene-piece'})
    for version in [1, 2]:
        rows.append({'id': f'bridge_rocks_v{version}', 'identity': f'BRIDGE ROCKS v{version}',
                     'reference': f'games/zork2/assets/experiments/foot-bridge-rocks-v1/reference-v{version}.png',
                     'model': f'out/asset-production/foot-bridge-rocks-v1/version{version}/candidate.glb',
                     'record': f'out/asset-production/foot-bridge-rocks-v1/version{version}/candidate.json',
                     'kind': 'scene-piece', 'selected': version == 2})
    known = {row['reference'] for row in rows}
    # Room illustrations and skyboxes have separate generation manifests and are not
    # standalone object-to-GLB conversion inputs.
    discovered = {str(path.relative_to(ROOT)) for path in BASE.rglob('*.png')
                  if not any(path.is_relative_to(BASE/folder) for folder in ['rooms', 'skyboxes'])}
    assert known == discovered, {'unmappedImages': sorted(discovered-known), 'missingImages': sorted(known-discovered)}
    return rows


def check(row):
    result = dict(row)
    reference, model = ROOT/row['reference'], ROOT/row['model']
    result['referenceSha256'] = sha(reference)
    result['visualReview'] = 'pending'
    if not model.exists():
        return {**result, 'status': 'missing'}
    try:
        if row.get('record'):
            record = json.loads((ROOT/row['record']).read_text())
            assert record['sha256'] == sha(model), 'Output hash differs from generation record'
            assert record['referenceSha256'] == result['referenceSha256'], 'Reference differs from generation input'
            for key in ['sourceHash', 'briefHash']:
                if key in row:
                    assert record[key] == row[key], key+' differs from current source brief'
        result['audit'] = audit(model)
        result['status'] = 'passed'
        result['additionalExports'] = []
        for name, record_name in [('rigged.glb', None), ('animated.glb', 'animation.json')]:
            path = model.parent/name
            if not path.exists():
                continue
            checked = audit(path)
            if record_name:
                animation = json.loads((model.parent/record_name).read_text())
                assert animation['sha256'] == checked['sha256'], 'Animation output hash mismatch'
                assert animation['inputMeshSha256'] == result['audit']['sha256'], 'Animation derived from a different mesh'
            result['additionalExports'].append(checked)
        result['renderModel'] = next((item['file'] for item in result['additionalExports'] if item['file'].endswith('/animated.glb')), str(model))
        finished = model.parent/'finished.glb'
        if finished.exists():
            record = json.loads((model.parent/'finished.json').read_text())
            checked = audit(finished)
            assert record['inputMeshSha256'] == result['audit']['sha256'], 'Finished mesh input mismatch'
            assert record['referenceSha256'] == result['referenceSha256'], 'Finished reference mismatch'
            assert record['sha256'] == checked['sha256'], 'Finished output hash mismatch'
            result['additionalExports'].append(checked)
            result['renderModel'] = str(finished)
            result['finishing'] = record
        render_record = REPORT/'renders'/f'{row["id"]}.json'
        if render_record.exists():
            rendered = json.loads(render_record.read_text())
            result['renderVerification'] = rendered['status'] if rendered.get('sha256') == sha(Path(result['renderModel'])) else 'stale'
            result['renderViews'] = rendered.get('views', [])
            if rendered.get('error'):
                result['renderError'] = rendered['error']
        else:
            result['renderVerification'] = 'pending'
        result['limitations'] = ['Projection-based back/side appearance and source-specific scale still require art review.']
        if result.get('finishing'):
            result['limitations'] = result['finishing']['limitations']
        if row['kind'] == 'character' and not any(item['joints'] for item in [result['audit']]+result['additionalExports']):
            result['limitations'].append('Static character mesh; creature rig and animation are separate work.')
        return result
    except Exception as error:
        return {**result, 'status': 'failed', 'error': str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-complete', action='store_true')
    parser.add_argument('--require-renders', action='store_true')
    parser.add_argument('--package', action='store_true')
    args = parser.parse_args()
    REPORT.mkdir(parents=True, exist_ok=True)
    rows = [check(row) for row in references()]
    extras = []
    for relative in ['barrow-natural-v1/barrow-natural-v1.glb', 'barrow-natural-v2/barrow-natural-v2.glb']:
        try:
            extras.append(audit(OUT/relative))
        except Exception as error:
            extras.append({'file': relative, 'checks': 'failed', 'error': str(error)})
    counts = {status: sum(row['status'] == status for row in rows) for status in ['passed', 'missing', 'failed']}
    counts['rendered'] = sum(row.get('renderVerification') == 'passed' for row in rows)
    report = {'format': 'zxr-reference-glb-verification-v1', 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'scope': 'Every existing reference PNG under games/zork2/assets; includes superseded bridge v1 and selected v2.',
              'totalReferences': len(rows), 'counts': counts, 'assets': rows, 'assemblies': extras,
              'reviewBoundary': 'Technical verification and rendered previews do not approve puzzle function, topology, animation quality or headset performance.'}
    temporary = REPORT/'manifest.json.tmp'
    temporary.write_text(json.dumps(report, indent=2)+'\n')
    temporary.replace(REPORT/'manifest.json')
    lines = ['# Reference-to-GLB verification', '', f'{len(rows)} existing references: {counts["passed"]} passed, {counts["missing"]} missing, {counts["failed"]} failed.', '',
             'Checks: source/reference/output hashes, valid triangles and finite positions, embedded textures, skin weights/joints, animation keys and durations. Blender load/render results are stored separately in `renders/`.', '',
             '| Asset | GLB | Check |', '|---|---|---|']
    cards = []
    for row in rows:
        selected_path = str(Path(row['renderModel']).relative_to(ROOT)) if row.get('renderModel') else row['model']
        lines.append(f'| {row["identity"]} | `{selected_path}` | {row["status"]} |')
        label = html.escape(row['identity'])
        model_path = Path(row.get('renderModel', str(ROOT/row['model'])))
        model = html.escape('/'+str(model_path.relative_to(ROOT)))
        reference = html.escape('/'+row['reference'])
        cards.append(f'<article><h2>{label}</h2><p>Binary: {row["status"]} · Blender render: {row.get("renderVerification", "pending")}</p><div class="pictures"><img loading="lazy" src="{reference}" alt="Reference"><img loading="lazy" src="renders/{row["id"]}-front.png" alt="Front render"><img loading="lazy" src="renders/{row["id"]}-back.png" alt="Back render"><img loading="lazy" src="renders/{row["id"]}-side.png" alt="Side render"></div><p><a href="{model}">GLB</a></p></article>')
    (REPORT/'report.md').write_text('\n'.join(lines)+'\n\n'+report['reviewBoundary']+'\n')
    (REPORT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Reference GLB verification</title><style>body{font:16px system-ui;background:#162126;color:#eee;margin:24px}article{padding:16px;background:#243137;margin:18px 0;border-radius:12px}.pictures{display:flex;gap:12px}.pictures img{width:23%;max-height:320px;object-fit:contain;background:#344148}a{color:#9bdbdb}h2{font-size:18px}</style><h1>Reference GLB verification</h1><p>'+html.escape(lines[2])+'</p><p>'+html.escape(report['reviewBoundary'])+'</p>'+''.join(cards))
    print(json.dumps({'total': len(rows), **counts, 'report': str(REPORT/'manifest.json')}), flush=True)
    incomplete = counts['missing'] or counts['failed'] or any(item['checks'] != 'passed' for item in extras)
    if (args.require_complete or args.package) and incomplete:
        sys.exit(1)
    if (args.require_renders or args.package) and counts['rendered'] != len(rows):
        sys.exit(1)
    if args.require_renders or args.package:
        for row in rows:
            assert {'front', 'back', 'side'} <= set(row.get('renderViews', [])), 'Missing render view: '+row['identity']
            for view in ['front', 'back', 'side']:
                from PIL import Image
                with Image.open(REPORT/'renders'/f'{row["id"]}-{view}.png') as rendered:
                    rendered.verify()
    if args.package:
        files = REPORT/'glbs'
        files.mkdir(exist_ok=True)
        package_rows = []
        for row in rows:
            source = Path(row['renderModel'])
            target = files/f'{row["id"]}.glb'
            shutil.copy2(source, target)
            assert sha(target) == sha(source)
            package_rows.append({'id': row['id'], 'identity': row['identity'], 'file': 'glbs/'+target.name,
                                 'sha256': sha(target), 'reference': row['reference'], 'referenceSha256': row['referenceSha256'],
                                 'binaryVerification': 'passed', 'renderVerification': 'passed', 'limitations': row['limitations']})
        scene_files = REPORT/'scenes'
        scene_files.mkdir(exist_ok=True)
        packaged_scenes = []
        for checked in extras:
            source = Path(checked['file'])
            target = scene_files/source.name
            shutil.copy2(source, target)
            assert sha(target) == checked['sha256']
            packaged_scenes.append({'file': 'scenes/'+target.name, 'sha256': checked['sha256'], 'binaryVerification': 'passed'})
        (REPORT/'package-manifest.json').write_text(json.dumps({'scope': report['scope'], 'assets': package_rows,
            'assemblies': packaged_scenes, 'reviewBoundary': report['reviewBoundary']}, indent=2)+'\n')
        archive = REPORT/'all-reference-glbs.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as bundle:
            for path in [REPORT/item['file'] for item in package_rows]:
                bundle.write(path, str(path.relative_to(REPORT)))
            for path in [REPORT/item['file'] for item in packaged_scenes]:
                bundle.write(path, str(path.relative_to(REPORT)))
            bundle.write(REPORT/'package-manifest.json', 'manifest.json')
            bundle.write(REPORT/'report.md', 'verification.md')
            for path in sorted((REPORT/'renders').glob('*.png')):
                bundle.write(path, str(path.relative_to(REPORT)))
        with zipfile.ZipFile(archive) as bundle:
            assert bundle.testzip() is None, 'Archive CRC check failed'
        print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size, 'referenceGlbs': len(package_rows), 'sceneGlbs': len(packaged_scenes), 'sha256': sha(archive)}), flush=True)


if __name__ == '__main__':
    main()
