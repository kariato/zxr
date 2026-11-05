"""Package standard Blender GLBs and optional compressed browser variants."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base', type=Path)
parser.add_argument('--partial', action='store_true')
args = parser.parse_args()
base = args.base.resolve(); root = Path(__file__).resolve().parents[2]
meshes = base/'meshes'; browser = meshes/'browser'; browser.mkdir(exist_ok=True)
parts = json.loads((base/'manifest.json').read_text())['parts']
tool = root/'out/asset-tools/assetfurnace/vendor/gltfpack/gltfpack'
records = {}
for p in parts:
    name = p['id']; src = meshes/f'{name}.glb'; out = browser/src.name
    if args.partial and not src.exists():
        continue
    digest = hashlib.sha256(src.read_bytes()).hexdigest()
    record_path = browser/f'{name}.json'
    if not (out.exists() and record_path.exists() and json.loads(record_path.read_text()).get('sourceSha256') == digest):
        subprocess.run([str(tool),'-i',str(src),'-o',str(out),'-cc','-tc','color','-tu','normal','-tq','8',
                        '-kn','-ke','-vp','16','-vt','16','-si','0.5','-se','0.002','-slb'],check=True)
    data = out.read_bytes(); size = struct.unpack_from('<I',data,12)[0]
    gltf = json.loads(data[20:20+size]); access = gltf['accessors']
    records[name] = {'file':out.name,'sourceSha256':digest,'sha256':hashlib.sha256(data).hexdigest(),
                     'standardBytes':src.stat().st_size,'browserBytes':len(data),
                     'browserTriangles':sum(access[p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives']),
                     'extensionsRequired':gltf.get('extensionsRequired',[])}
    record_path.write_text(json.dumps(records[name],indent=2)+'\n')
    print(name,records[name]['browserBytes'],flush=True)
(browser/'verification.json').write_text(json.dumps(records,indent=2)+'\n')
if not args.partial:
    readme = '''Eleven atomic ravine components

Standard GLBs: embedded PNG textures, ordinary Blender/glTF compatibility.
browser/: smaller Meshopt + KTX2 variants. Loader needs MeshoptDecoder and KTX2Loader/Basis support.
ravine-atomic-kit.blend: editable staged kit, not a complete assembled ravine.
Units: metres. GLB Y up; front +Z. Local bottom-centre pivots.
Floor references are staged upright for inspection; rotate -90 degrees around X for an upward-facing floor in glTF coordinates.

Generated with local Tencent Hunyuan3D-2 turbo. Raw inference is retained in the project raw/ directory.
Blender panels resample the Tencent front relief into shallow straight-backed modules.
Cave/arch alpha silhouettes become actual open geometry. Textures project the source references.
Residual-height normal maps retain smaller relief detail. Boulder retains a decimated Tencent volume with a baked reference projection.
Hidden faces use neutral stone; these are not learned unseen textures or guaranteed seamless tiles.
See verification.json for input hashes, mesh checks and dimensions (Blender X/Y/Z).
'''
    (meshes/'README.txt').write_text(readme)
    archive = root/'out/ravine-atomic-textured-glbs.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for f in meshes.rglob('*'):
            if f.is_file() and f.suffix in ['.glb','.blend','.json','.txt','.png']:
                z.write(f, f.relative_to(meshes))
    print('PACKAGE',archive,archive.stat().st_size,flush=True)
    compact = root/'out/ravine-atomic-glbs.zip'
    with zipfile.ZipFile(compact,'w',zipfile.ZIP_DEFLATED) as z:
        for f in meshes.rglob('*'):
            if f.is_file() and f.suffix in ['.glb','.json','.txt']:
                z.write(f,f.relative_to(meshes))
    print('GLBS',compact,compact.stat().st_size,flush=True)
