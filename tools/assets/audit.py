"""Audit generated GLB geometry, embedded textures, skin weights and body clips."""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path
import numpy as np
from PIL import Image

DTYPES={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
DIMS={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def audit(path):
    data=Path(path).read_bytes()
    if len(data)<28 or data[:4]!=b'glTF' or struct.unpack_from('<II',data,4)!=(2,len(data)):raise ValueError('Invalid GLB header')
    length,kind=struct.unpack_from('<II',data,12)
    if kind!=0x4e4f534a:raise ValueError('Missing GLB JSON chunk')
    g=json.loads(data[20:20+length]);binary=data[28+length:]
    def accessor(i):
        a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dtype=np.dtype(DTYPES[a['componentType']]);dims=DIMS[a['type']]
        result=np.ndarray((a['count'],dims),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*dims),dtype.itemsize)).copy()
        if a.get('normalized'):result=result/np.iinfo(dtype).max
        if not np.isfinite(result).all():raise ValueError('Nonfinite accessor '+str(i))
        return result
    # Validate every payload, including normals, UVs, colours and inverse-bind
    # matrices that the geometry/animation summaries below do not otherwise read.
    for index in range(len(g.get('accessors',[]))):accessor(index)
    for node in g.get('nodes',[]):
        for name in ['matrix','translation','rotation','scale','weights']:
            if name in node and not np.isfinite(np.asarray(node[name],dtype=float)).all():raise ValueError('Nonfinite node '+name)
    triangles=0;vertices=0;max_weights=0;mesh_triangles=[]
    for mesh in g['meshes']:
        mesh_total=0
        for prim in mesh['primitives']:
            if prim.get('mode',4)!=4:raise ValueError('Expected triangle geometry')
            attributes=prim['attributes'];points=accessor(attributes['POSITION']);vertices+=len(points)
            for name,index in attributes.items():
                if len(accessor(index))!=len(points):raise ValueError('Mismatched vertex attribute '+name)
            indices=accessor(prim['indices']).ravel() if 'indices' in prim else np.arange(len(points))
            if len(indices)%3 or indices.max()>=len(points):raise ValueError('Invalid triangle indices')
            triangles+=len(indices)//3
            mesh_total+=len(indices)//3
            if 'WEIGHTS_0' in attributes:
                weights=accessor(attributes['WEIGHTS_0']);joints=accessor(attributes['JOINTS_0'])
                if np.any(weights<0) or not np.allclose(weights.sum(axis=1),1,atol=1e-4):raise ValueError('Invalid skin weights')
                if 'WEIGHTS_1' in attributes or 'JOINTS_1' in attributes:raise ValueError('More than four influences')
                if joints.max()>=max(len(s['joints']) for s in g['skins']):raise ValueError('Joint index out of range')
                max_weights=max(max_weights,int((weights>0).sum(axis=1).max()))
        mesh_triangles.append(mesh_total)
    active=[]
    def visit(index):
        node=g['nodes'][index];active.append(node)
        for child in node.get('children',[]):visit(child)
    for index in g['scenes'][g.get('scene',0)]['nodes']:visit(index)
    rendered_triangles=sum(mesh_triangles[n['mesh']] for n in active if 'mesh' in n)
    clips=[]
    for clip in g.get('animations',[]):
        duration=0
        for sampler in clip['samplers']:
            times=accessor(sampler['input']).ravel();accessor(sampler['output'])
            if not np.all(np.diff(times)>0):raise ValueError('Non-increasing animation times')
            duration=max(duration,float(times[-1]-times[0]))
        if duration<=0:raise ValueError('Empty animation')
        clips.append({'name':clip.get('name',''),'seconds':duration})
    textures=[]
    for image in g.get('images',[]):
        if 'uri' in image:raise ValueError('Candidate must embed its texture')
        v=g['bufferViews'][image['bufferView']];start=v.get('byteOffset',0)
        decoded=Image.open(io.BytesIO(binary[start:start+v['byteLength']]));decoded.load();textures.append(list(decoded.size))
    return {'file':str(path),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':rendered_triangles,'uniqueTriangles':triangles,'vertices':vertices,
        'materials':len(g.get('materials',[])),'joints':sum(len(s['joints']) for s in g.get('skins',[])),
        'maxInfluences':max_weights,'embeddedTextures':textures,'clips':clips,'checks':'passed'}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('paths',type=Path,nargs='+');args=parser.parse_args();results=[]
    for path in args.paths:
        files=sorted(path.rglob('candidate.glb'))+sorted(path.rglob('animated.glb')) if path.is_dir() else [path]
        for file in files:
            try:results.append(audit(file))
            except Exception as error:results.append({'file':str(file),'checks':'failed','error':str(error)})
    print(json.dumps(results,indent=2))
    if any(r['checks']=='failed' for r in results):raise SystemExit(1)
if __name__=='__main__':main()
