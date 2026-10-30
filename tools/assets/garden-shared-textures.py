"""Shared repeating garden materials and a compact, separately saved assembly."""
from pathlib import Path
import bpy,numpy as np,json,struct,hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/concept-top-down-v1'
SOURCE=BASE/'assembly-v2-reduced/garden-gazebo-topiary-reduced-v2.blend'
OUT=BASE/'assembly-v4-shared-textures';OUT.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();source_sha=sha(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
objects=[o for o in scene.objects if o.type=='MESH'];garden=next(o for o in objects if not o.parent)
reference=next(n.image for n in garden.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
rw,rh=reference.size[:];pixels=np.array(reference.pixels[:],dtype=np.float32).reshape(rh,rw,4)
rng=np.random.default_rng(42)
def tile(name,green):
 n=256;y,x=np.mgrid[:n,:n];a=np.empty((n,n,4),dtype=np.float32);a[:,:,3]=1
 if green:
  noise=rng.random((n,n));a[:,:,:3]=np.array([.075,.125,.025])[None,None,:]*(.7+noise[:,:,None]*.5)
  for i in range(1200):
   cx,cy=rng.uniform(0,n,2);theta=rng.uniform(0,6.28);dx=(x-cx+n/2)%n-n/2;dy=(y-cy+n/2)%n-n/2
   u=dx*np.cos(theta)+dy*np.sin(theta);v=-dx*np.sin(theta)+dy*np.cos(theta)
   mask=(u/rng.uniform(3,7))**2+(v/rng.uniform(1.5,3))**2<1
   color=np.array([.16,.25,.045])*rng.uniform(.55,1.5)
   a[mask,:3]=color
 else:
  noise=rng.random((n,n));a[:,:,:3]=np.array([.50,.48,.43])[None,None,:]*(.7+noise[:,:,None]*.55)
  for i in range(1900):
   cx,cy=rng.uniform(0,n,2);dx=(x-cx+n/2)%n-n/2;dy=(y-cy+n/2)%n-n/2
   mask=(dx/rng.uniform(.8,3))**2+(dy/rng.uniform(.8,2))**2<1
   a[mask,:3]=np.array([.56,.54,.49])*rng.uniform(.55,1.4)
 img=bpy.data.images.new(name,width=n,height=n);img.pixels.foreach_set(a.ravel());img.filepath_raw=str(OUT/(name+'.png'));img.file_format='PNG';img.save();img.pack()
 mat=bpy.data.materials.new(name+' shared repeating material');mat.use_nodes=True
 tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;tex.extension='REPEAT'
 bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.95
 mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
 return mat
foliage=tile('foliage-tile-256',True);gravel=tile('gravel-tile-256',False)
side=bpy.data.materials.new('Garden soil sides');side.diffuse_color=(.065,.045,.025,1);side.use_nodes=True
side.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.065,.045,.025,1)
# Reconstruct the almost planar top with a fine material grid, then dissolve
# coplanar cell edges within each material. Keep curved path boundaries.
import bmesh
from mathutils import Matrix
ps=[garden.matrix_world@v.co for v in garden.data.vertices]
lo=Vector([min(p[i] for p in ps) for i in range(3)]);hi=Vector([max(p[i] for p in ps) for i in range(3)])
nx,ny=256,172
mask=(pixels[:,:,1]>pixels[:,:,0]*1.08)&(pixels[:,:,1]>pixels[:,:,2]*1.25)
# Remove isolated foliage speckles in the gravel without changing broad beds.
for _ in range(3):
 padded=np.pad(mask.astype(np.int32),1,mode='edge')
 total=sum(padded[dy:dy+rh,dx:dx+rw] for dy in range(3) for dx in range(3))
 mask=total>=5
z=hi.z+.0003
verts=[(lo.x+(hi.x-lo.x)*x/nx,lo.y+(hi.y-lo.y)*y/ny,z) for y in range(ny+1) for x in range(nx+1)]
faces=[];indices=[]
for y in range(ny):
 for x in range(nx):
  i=y*(nx+1)+x;faces.append((i,i+1,i+nx+2,i+nx+1))
  indices.append(0 if mask[min(rh-1,int((y+.5)/ny*rh)),min(rw-1,int((x+.5)/nx*rw))] else 1)
mesh=bpy.data.meshes.new('Garden path and bed boundaries');mesh.from_pydata(verts,[],faces);mesh.update()
garden.data=mesh;garden.matrix_world=Matrix.Identity(4)
for mat in [foliage,gravel]:mesh.materials.append(mat)
for f,idx in zip(mesh.polygons,indices):f.material_index=idx
bm=bmesh.new();bm.from_mesh(mesh)
bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'},use_dissolve_boundaries=False)
bm.to_mesh(mesh);bm.free();mesh.update()
uv=mesh.uv_layers.new(name='Repeating ground tiles')
for loop in mesh.loops:
 p=mesh.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x*16,p.y*16)
counts=[indices.count(0),indices.count(1),0]
# A simple soil base replaces the old stretched perimeter texture.
bpy.ops.mesh.primitive_cube_add(size=1,location=((lo.x+hi.x)/2,(lo.y+hi.y)/2,(lo.z+hi.z)/2))
base=bpy.context.object;base.name='Compact soil foundation';base.scale=((hi.x-lo.x),(hi.y-lo.y),(hi.z-lo.z));base.data.materials.append(side)
objects.append(base)
rows=[]
for o in objects:
 name=o.parent.name.split(' placement')[0] if o.parent else 'garden' if o==garden else 'foundation'
 if name not in ['garden','gazebo','foundation']:
  o.data.materials.clear();o.data.materials.append(foliage)
  for f in o.data.polygons:f.material_index=0;f.use_smooth=True
  # Reuse the existing unwrap, tiled across every statue with one shared image.
  for data in o.data.uv_layers.active.data:data.uv*=8
 if name=='gazebo':
  for mat in o.data.materials:
   for node in mat.node_tree.nodes:
    if node.type=='TEX_IMAGE' and node.image:
     img=node.image;img.scale(256,256);img.filepath_raw=str(OUT/'gazebo-color-256.jpg');img.file_format='JPEG';img.save();img.pack()
 o.data.calc_loop_triangles();before=len(o.data.loop_triangles)
 target=12000 if name=='garden' else 8000 if name=='gazebo' else 5000
 if before>target and name!='garden':
  bpy.context.view_layer.objects.active=o
  mod=o.modifiers.new('Compact geometry budget','DECIMATE');mod.ratio=target/before;mod.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.calc_loop_triangles();rows.append({'asset':name,'originalTriangles':before,'triangles':len(o.data.loop_triangles)})
for o in scene.objects:o.select_set(o.type in {'MESH','EMPTY'})
blend=OUT/'garden-shared-textures-v4.blend';glb=blend.with_suffix('.glb')
scene.render.filepath=str(OUT/'garden-shared-45-elevation-45-azimuth.png')
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=False,export_extras=True)
print('GLB BYTES',glb.stat().st_size,flush=True)
assert glb.stat().st_size<3000000,glb.stat().st_size
bpy.ops.render.render(write_still=True)
blob=glb.read_bytes();n=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+n])
assert len(doc['images'])==3
tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb))
check=0
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();check+=len(o.data.loop_triangles)
assert check==tris and sha(SOURCE)==source_sha
r={'bytes':glb.stat().st_size,'triangles':tris,'reimportedTriangles':check,'embeddedImages':len(doc['images']),'meshes':rows,'gardenMaterialFaceCountsBeforeReduction':counts,'sourceUnchanged':True,'sha256':sha(glb),'textureMethod':'Shared 256px repeating gravel and foliage tiles; foliage shared across garden and six statues; separate 256px gazebo image','limitations':['Garden bed boundaries reconstructed from a 256 by 172 material grid; shallow inferred top relief replaced by a flat top.','More aggressive focal geometry reduction; small details simplified.']}
(OUT/'verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r),flush=True)
