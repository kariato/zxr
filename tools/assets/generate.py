"""Local Hunyuan shape + lightweight reference-projection candidate generation.

Run with out/asset-tools/shape-env/bin/python. Models are drafts, never approved
or published here. GPU jobs run serially; completed matching inputs are resumable.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
import trimesh

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = {"implementation": "Hunyuan3D-Swift/MLX", "revision": "292331f4d26ddb80b9dcea6bcb5629ff82f12b82",
    "weights": "tencent/Hunyuan3D-2/hunyuan3d-dit-v2-0-turbo", "weightsRevision": "9cd649ba6913f7a852e3286bad86bfa9a2d83dcf",
    "steps": 8, "guidance": 5, "octree": 256, "seed": 42, "quantize": 8,
    "licence": "Tencent Hunyuan 3D 2.0 Community License", "scope": "US-only local prototype"}

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def prepare(mesh, reference: Path, triangles: int, dimensions: list[float], upright_sword=False,stone_projection=False):
    """Project the actual reference on the front; the back uses row-median colour.

    This is explicitly a projection approximation, not a learned paint pass.
    Never reuse the princess-specific skin/hair swatches for unrelated props.
    """
    if not np.isfinite(mesh.vertices).all() or len(mesh.faces) < 20:
        raise ValueError("Invalid/empty generated mesh")
    components = mesh.split(only_watertight=False)
    mesh = trimesh.util.concatenate([p for p in components if len(p.faces) >= max(12, len(mesh.faces)*.00005)])
    if len(mesh.faces) > triangles:
        mesh = mesh.simplify_quadric_decimation(face_count=triangles)
    mesh.remove_unreferenced_vertices()
    lo, hi = mesh.bounds.copy()
    if np.min(hi-lo) <= 1e-7:
        raise ValueError("Degenerate mesh extent")
    mesh.vertices -= [(lo[0]+hi[0])/2, lo[1], (lo[2]+hi[2])/2]
    # Height controls characters; props fit a reviewed bounding box uniformly,
    # never stretch the mesh independently along three axes.
    scale = dimensions[1]/(hi[1]-lo[1])
    if upright_sword:
        scale = dimensions[0]/(hi[1]-lo[1])
    elif dimensions[1] < .2:
        scale = max(dimensions)/max(hi-lo)
    mesh.vertices *= scale
    lo, hi = mesh.bounds.copy()
    image = np.array(Image.open(reference).convert('RGBA'))
    mask = image[:,:,3] > 127
    if mask.sum() < 100:
        raise ValueError("Reference has no usable alpha foreground")
    yy, xx = np.where(mask)
    nearest = distance_transform_edt(~mask, return_distances=False, return_indices=True)
    rgb = image[:,:,:3][tuple(nearest)]
    atlas = Image.new('RGB', (1024,1024))
    atlas.paste(Image.fromarray(rgb).resize((768,1024),Image.Resampling.LANCZOS),(0,0))
    rows = []
    for y in range(image.shape[0]):
        selected = image[y,:,:3][mask[y]]
        rows.append(np.median(selected,axis=0) if len(selected) else np.median(rgb[y],axis=0))
    back = np.repeat(np.array(rows,dtype=np.uint8)[:,None,:],256,axis=1)
    atlas.paste(Image.fromarray(back).resize((256,1024),Image.Resampling.BILINEAR),(768,0))
    points = mesh.vertices[mesh.faces]
    u = (xx.min()+(points[:,:,0]-lo[0])/(hi[0]-lo[0])*(xx.max()-xx.min()))/image.shape[1]
    v = (yy.max()-(points[:,:,1]-lo[1])/(hi[1]-lo[1])*(yy.max()-yy.min()))/image.shape[0]
    uv = np.stack([u*.75,1-v],axis=-1)
    rear = mesh.face_normals[:,2] <= .05
    uv[rear,:,0] = .875
    if stone_projection:
        # Featureless stone can reuse the photographed grain on every side.
        # Give broad upper surfaces a separate planar projection instead of
        # stretching a single image row across the entire top of a boulder.
        uv=np.stack([u*.75,1-v],axis=-1)
        normalized=(points-lo)/(hi-lo)
        axis=np.abs(mesh.face_normals).argmax(axis=1)
        top=axis==1;side=axis==0
        uv[top,:,0]=.75*(.15+.7*normalized[top,:,0]);uv[top,:,1]=1-(.2+.6*normalized[top,:,2])
        uv[side,:,0]=.75*(.15+.7*normalized[side,:,2]);uv[side,:,1]=1-(.1+.8*normalized[side,:,1])
    material = trimesh.visual.material.PBRMaterial(baseColorTexture=atlas,roughnessFactor=.9,metallicFactor=0,doubleSided=True)
    result = trimesh.Trimesh(vertices=points.reshape(-1,3),faces=np.arange(len(mesh.faces)*3).reshape(-1,3),
        vertex_normals=mesh.vertex_normals[mesh.faces].reshape(-1,3),process=False)
    result.visual = trimesh.visual.TextureVisuals(uv=uv.reshape(-1,2),material=material)
    if upright_sword:
        # Reference is point-down upright; the approved resting prop lies along +X.
        transform=np.eye(4)
        transform[:3,:3]=[[0,1,0],[0,0,1],[1,0,0]]
        result.apply_transform(transform)
        result.vertices -= [result.centroid[0],result.bounds[0,1],result.centroid[2]]
    return result, len(components)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('identities',nargs='*',help='Explicit source identities, e.g. SWORD LAMP CHEST ROBOT')
    parser.add_argument('--available',action='store_true',help='Process every current image-to-mesh reference, skipping matching candidates')
    args=parser.parse_args()
    catalog=json.loads((ROOT/'games/zork2/assets/catalog.json').read_text())
    entries={e['sourceIdentity']:e for e in catalog['objects']}
    if args.available and args.identities:raise ValueError('Use explicit identities or --available')
    if args.available:args.identities=[e['sourceIdentity'] for e in catalog['objects'] if e['route'].startswith('image-mesh') and e['reference'] and (ROOT/'games/zork2/assets'/e['reference']).exists() and e['sourceIdentity']!='PRINCESS']
    if not args.identities:raise ValueError('No source identities selected')
    jobs=[]
    for identity in args.identities:
        entry=entries.get(identity)
        if not entry or not entry['route'].startswith('image-mesh'):
            raise ValueError('Not an image-to-mesh source identity: '+identity)
        reference=ROOT/'games/zork2/assets'/entry['reference']
        if not reference.exists():
            raise FileNotFoundError('Create the reference before meshing: '+str(reference))
        # Overrides are explicit artistic size estimates; source draft defaults
        # remain flagged for review. Chest is a trunk, not a 30 cm jewellery box.
        dimensions={'CHEST':[1,.65,.65],'ROBOT':[.65,1.55,.45]}.get(identity,entry['estimatedSizeMetres'])
        options={'pipeline':PIPELINE,'referenceSha256':digest(reference),'sourceHash':entry['sourceHash'],
            'briefHash':entry['briefHash'],'triangles':10000 if entry['kind']=='character' else 3000,'sizeMetres':dimensions,
            'textureMethod':'front-projection-with-row-median-back-v1'}
        key=hashlib.sha256(json.dumps(options,sort_keys=True).encode()).hexdigest()
        directory=ROOT/'out/asset-production'/entry['id'];directory.mkdir(parents=True,exist_ok=True)
        record=directory/'candidate.json'
        if record.exists():
            old=json.loads(record.read_text())
            if old.get('inputHash')==key and (directory/'candidate.glb').exists() and old.get('sha256')==digest(directory/'candidate.glb'):
                print(identity+': matching candidate already exists; skipping',flush=True);continue
            raise RuntimeError('Existing candidate inputs differ; retain it and choose a new version before regeneration: '+identity)
        jobs.append((identity,entry,reference,options,key,directory))
    if not jobs:return
    import mlx.core as mx
    from hy3dmlx.pipeline import Hunyuan3DShapePipeline
    pipe=Hunyuan3DShapePipeline.from_pretrained(str(ROOT/'out/asset-tools/weights/hunyuan2-turbo/hunyuan3d-dit-v2-0-turbo'),dtype=mx.float16,quantize=8)
    for identity,entry,reference,options,key,directory in jobs:
        print('\nSTART '+identity,flush=True);started=time.monotonic()
        raw=pipe.generate(str(reference),num_inference_steps=8,guidance_scale=5,octree_resolution=256,seed=42,octree_decode=True)
        raw.export(directory/'raw.glb')
        mesh,components=prepare(raw,reference,options['triangles'],options['sizeMetres'],identity=='SWORD')
        output=directory/'candidate.glb';mesh.export(output)
        report={'format':'zxr-local-candidate-v1','sourceIdentity':identity,'inputHash':key,**options,
            'rawTriangles':len(raw.faces),'triangles':len(mesh.faces),'componentsBeforeCleanup':components,
            'boundsMetres':mesh.bounds.tolist(),'materials':1,'textureSize':[1024,1024],
            'file':'candidate.glb','bytes':output.stat().st_size,'sha256':digest(output),'seconds':round(time.monotonic()-started,2),
            'rigStatus':'required' if entry['kind']=='character' else 'not-applicable',
            'review':'draft','publication':'US-only-local-prototype',
            'limitations':['Front-projected colour; back/side texture approximate.','Thin parts, hinges, glass and topology require visual review.','No automatic approval or game-state binding.']}
        temporary=directory/'candidate.json.tmp';temporary.write_text(json.dumps(report,indent=2)+'\n');temporary.replace(directory/'candidate.json')
        print('DONE '+identity+' '+str(len(mesh.faces))+' triangles in '+str(report['seconds'])+' seconds',flush=True)
        del raw,mesh;mx.clear_cache()

if __name__=='__main__':main()
