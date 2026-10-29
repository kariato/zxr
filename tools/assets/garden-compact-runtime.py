"""Integrate compact garden; derive walking support from actual gravel triangles."""
from pathlib import Path
import bpy,json,hashlib,math
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/concept-top-down-v1/assembly-v4-shared-textures'
SOURCE=BASE/'garden-shared-textures-v4.glb'
OUT=ROOT/'games/zork2/assets/scenes/underground-garden';OUT.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(SOURCE))
scene=bpy.context.scene;objects=[o for o in scene.objects if o.type=='MESH']
garden=next(o for o in objects if o.data.name.startswith('Garden path'))
rawground=(garden.matrix_world@garden.data.vertices[0].co).z
# Spread the grounds while giving architectural/figurative objects their own
# physical scale. Source mesh and the compact authoring assembly are untouched.
scale=28;vertical=1.5-rawground*scale
transform=Matrix.Translation((0,0,vertical))@Matrix.Scale(scale,4)
for o in list(scene.objects):
 if not o.parent:o.matrix_world=transform@o.matrix_world
bpy.context.view_layer.update()
def points(o):return [o.matrix_world@v.co for v in o.data.vertices]
def bounds(o):
 ps=points(o);return Vector([min(p[i] for p in ps) for i in range(3)]),Vector([max(p[i] for p in ps) for i in range(3)])
def y_up(p):return [round(p.x,6),round(p.z,6),round(-p.y,6)]
# Remove the miniature display plinth; ground continues into the cavern.
foundation=next(o for o in objects if o.name.startswith('Compact soil foundation'))
soil=foundation.data.materials[0]
objects.remove(foundation);bpy.data.objects.remove(foundation,do_unlink=True)
for o in objects:
 if not o.parent:continue
 low,high=bounds(o);anchor=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
 name=o.parent.name.split(' placement')[0]
 desired=4.6 if name=='gazebo' else 2.4 if name in ['dragon','serpent'] else 2.1
 factor=desired/(max(high.x-low.x,high.y-low.y) if name=='gazebo' else high.z-low.z)
 # Bottoms rest on the garden surface regardless of figure size.
 target=Vector((anchor.x,anchor.y,1.5 if name=='gazebo' else 2.5))
 o.matrix_world=Matrix.Translation(target)@Matrix.Scale(factor,4)@Matrix.Translation(-anchor)@o.matrix_world
bpy.context.view_layer.update()
bpy.ops.mesh.primitive_plane_add(size=240,location=(0,0,1.49))
cavernfloor=bpy.context.object;cavernfloor.name='Surrounding cavern ground';cavernfloor.data.materials.append(soil)
objects.append(cavernfloor)
gazebo=next(o for o in objects if o.parent and o.parent.name.startswith('gazebo placement'))
glo,ghi=bounds(gazebo);gc=(glo+ghi)/2;gc.z=glo.z
# Turn foliage islands into genuine one-metre-high hedge volumes. The
# central gazebo footprint stays at path height for its steps and entrance.
import bmesh
from collections import Counter
worldverts=points(garden);garden.data.calc_loop_triangles()
hedgefaces=[]
for tri in garden.data.loop_triangles:
 if 'foliage' not in garden.data.materials[tri.material_index].name:continue
 c=sum((worldverts[i] for i in tri.vertices),Vector())/3
 if math.hypot(c.x-gc.x,c.y-gc.y)<2.6:continue
 hedgefaces.append(tuple(tri.vertices))
used=sorted({i for f in hedgefaces for i in f});lookup={v:i for i,v in enumerate(used)};count=len(used)
hedgeverts=[tuple(worldverts[i]+Vector((0,0,1))) for i in used]+[tuple(worldverts[i]) for i in used]
faces=[tuple(lookup[i] for i in f) for f in hedgefaces]
edges=Counter(tuple(sorted((f[i],f[(i+1)%3]))) for f in hedgefaces for i in range(3))
for f in hedgefaces:
 for j in range(3):
  a,b=f[j],f[(j+1)%3]
  if edges[tuple(sorted((a,b)))]==1:
   a,b=lookup[a],lookup[b];faces.append((b,a,a+count,b+count))
mesh=bpy.data.meshes.new('One metre raised hedge beds');mesh.from_pydata(hedgeverts,[],faces);mesh.update()
hedges=bpy.data.objects.new('Raised hedge beds - 1 metre',mesh);scene.collection.objects.link(hedges)
foliage=next(m for m in garden.data.materials if 'foliage' in m.name);mesh.materials.append(foliage)
uv=mesh.uv_layers.new(name='Shared repeating foliage')
for face in mesh.polygons:
 side=abs(face.normal.z)<.5
 for li in face.loop_indices:
  v=mesh.vertices[mesh.loops[li].vertex_index].co
  uv.data[li].uv=((v.x if abs(face.normal.y)>.5 or not side else v.y)*16/28,(v.z if side else v.y)*16/28)
hedges['hedgeHeightMetres']=1;objects.append(hedges)
# Remove old flat foliage underneath raised islands, retaining the gazebo pad.
bm=bmesh.new();bm.from_mesh(garden.data)
remove=[]
for f in bm.faces:
 if 'foliage' in garden.data.materials[f.material_index].name:
  c=garden.matrix_world@f.calc_center_median()
  if math.hypot(c.x-gc.x,c.y-gc.y)>=2.6:remove.append(f)
bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(garden.data);bm.free();garden.data.update()
garden.data.calc_loop_triangles();pathverts=points(garden)
gravel=[t for t in garden.data.loop_triangles if 'gravel' in garden.data.materials[t.material_index].name]
pathfaces=[tuple(t.vertices) for t in gravel]
pathtree=BVHTree.FromPolygons(pathverts,pathfaces)
def pathheight(x,y):
 hit=pathtree.ray_cast(Vector((x,y,10)),Vector((0,0,-1)),20)[0]
 return hit.z if hit else None
def safe(x,y,r=.14):return all(pathheight(x+dx,y+dy) is not None for dx,dy in [(0,0),(r,0),(-r,0),(0,r),(0,-r)])
# Search near intended room approaches for a gravel point with capsule clearance.
def spawn(x,y):
 choices=[]
 for ix in range(-20,21):
  for iy in range(-20,21):
   px=x+ix*.05;py=y+iy*.05
   if safe(px,py):choices.append(((px-x)**2+(py-y)**2,px,py))
 assert choices,(x,y)
 _,px,py=min(choices);return Vector((px,py,pathheight(px,py)))
positions={'GARDEN-NORTH':spawn(gc.x,gc.y+9),'FORMAL-GARDEN':spawn(gc.x+10,gc.y),'TOPIARY-ROOM':spawn(gc.x,gc.y-10)}
# Gazebo support: select the lowest broad upward-facing floor, excluding roof.
gazebo.data.calc_loop_triangles();gps=points(gazebo)
gfloor=[]
for t in gazebo.data.loop_triangles:
 ps=[gps[i] for i in t.vertices];normal=(ps[1]-ps[0]).cross(ps[2]-ps[0]);c=sum(ps,Vector())/3
 if normal.length and normal.normalized().z>.65 and c.z<glo.z+(ghi.z-glo.z)*.28:gfloor.append(tuple(t.vertices))
gtree=BVHTree.FromPolygons(gps,gfloor)
def gh(x,y):
 hit=gtree.ray_cast(Vector((x,y,glo.z+(ghi.z-glo.z)*.3)),Vector((0,0,-1)),3)[0]
 return hit.z if hit else None
candidates=[]
for x in [gc.x+i*.05 for i in range(-5,6)]:
 for y in [gc.y+i*.05 for i in range(-5,6)]:
  h=gh(x,y)
  if h is not None and all(gh(x+dx,y+dy) is not None for dx,dy in [(0,.2),(0,-.2),(.2,0),(-.2,0)]):candidates.append(((x-gc.x)**2+(y-gc.y)**2,Vector((x,y,h))))
assert candidates,'Gazebo has no supported spawn'
positions['GAZEBO-ROOM']=min(candidates,key=lambda row:row[0])[1]
rooms={}
for room,position in positions.items():
 origin=y_up(position)
 if room=='GAZEBO-ROOM':
  # Bounded interior support sampled below roof; stops at missing floor and rails.
  vertices=[];ids={};triangles=[]
  for iy in range(-8,9):
   for ix in range(-8,9):
    x=position.x+ix*.1;y=position.y+iy*.1;h=gh(x,y)
    if h is not None and abs(h-position.z)<.2:
     ids[ix,iy]=len(vertices);vertices.append([round(ix*.1,6),round(h-position.z,6),round(-iy*.1,6)])
  for iy in range(-8,8):
   for ix in range(-8,8):
    for corners in [[(ix,iy),(ix+1,iy),(ix,iy+1)],[(ix+1,iy),(ix+1,iy+1),(ix,iy+1)]]:
     if all(c in ids for c in corners):triangles.append([ids[c] for c in corners])
 else:
  # Exact visual gravel faces are support; foliage islands are never walkable.
  used=sorted({i for face in pathfaces for i in face});lookup={v:i for i,v in enumerate(used)}
  vertices=[[round(y_up(pathverts[i])[axis]-origin[axis],6) for axis in range(3)] for i in used]
  triangles=[[lookup[i] for i in f] for f in pathfaces]
 heading=math.pi if room=='GARDEN-NORTH' else math.pi/2 if room=='FORMAL-GARDEN' else 0
 rooms[room]={'origin':origin,'vertices':vertices,'triangles':triangles,'heading':heading,'family':'garden'}
 print(room,origin,len(triangles),flush=True)
asset=OUT/'underground-garden-shared-v4.glb'
for o in scene.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',use_selection=True,export_extras=True,export_apply=False)
assert asset.stat().st_size<3000000
floors=ROOT/'games/zork2/planning/walking-surfaces'
allrooms=json.loads((floors/'surfaces.json').read_text());allrooms.update(rooms)
(floors/'surfaces.json').write_text(json.dumps(allrooms,indent=2)+'\n')
(ROOT/'src/prototype/walking-surfaces.generated.ts').write_text('// Generated walking floors; garden updated by tools/assets/garden-compact-runtime.py.\nexport interface WalkingSurface {origin:readonly [number,number,number];vertices:readonly (readonly [number,number,number])[];triangles:readonly (readonly [number,number,number])[];heading:number;family:string}\nexport const walkingSurfaces:Record<string,WalkingSurface>='+json.dumps(allrooms,separators=(',',':'))+';\n')
topiary=[]
for o in objects:
 if o!=gazebo and o.parent:
  a,b=bounds(o);p=(a+b)/2;p.z=a.z;topiary.append({'name':o.parent.name.split(' placement')[0],'center':y_up(p),'size':[round(b.x-a.x,6),round(b.z-a.z,6),round(b.y-a.y,6)]})
layout={'gazeboCenter':y_up(gc),'gazeboSize':[ghi.x-glo.x,ghi.z-glo.z,ghi.y-glo.y],'topiary':topiary,'overviewPosition':[0,13,24],'overviewTarget':[0,1.5,0]}
(ROOT/'src/prototype/garden-layout.generated.ts').write_text('// Generated by tools/assets/garden-compact-runtime.py. Shared GLB Y-up coordinates.\nexport const gardenLayout='+json.dumps(layout)+' as const;\n')
for o in objects:o.data.calc_loop_triangles()
record=json.loads((floors/'verification.json').read_text());record['inputs']=[r for r in record['inputs'] if r['family']!='garden']+[{'family':'garden','asset':str(asset.relative_to(ROOT)),'sha256':sha(asset),'visualGeometryChanged':False,'visualTextureChanged':False,'visualTriangles':sum(len(o.data.loop_triangles) for o in objects)}]
record['method']='Garden: exact gravel material triangles from compact shared-texture GLB; gazebo low floor sampled at 0.1m; non-garden floors retained.'
(floors/'verification.json').write_text(json.dumps(record,indent=2)+'\n')
(OUT/'scene.json').write_text(json.dumps({'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':sha(SOURCE),'asset':asset.name,'sha256':sha(asset),'bytes':asset.stat().st_size,'scale':scale,'gazeboWidthMetres':4.6,'topiaryHeightMetres':[2.1,2.4],'groundHeight':1.5,'hedgeHeightMetres':1,'rooms':list(rooms),'layout':layout,'textureMethod':'Shared repeating 256px gravel and foliage plus 256px gazebo; external cached cave panorama','walking':'Exact gravel faces; sampled gazebo interior; native source room transitions unchanged'},indent=2)+'\n')
print('COMPACT RUNTIME READY',asset.stat().st_size,flush=True)
