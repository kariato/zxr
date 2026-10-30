"""Author a rotation-consistent garden with real structures and no image projection."""
from pathlib import Path
import bpy, math, random, json, hashlib, struct
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'games/zork2/planning/scenes/underground-garden/rebuilt-v1'
OUT.mkdir(exist_ok=True)
rng=random.Random(1042)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
root=bpy.data.collections.new('Underground garden - rebuilt rotation study'); scene.collection.children.link(root)
def group(name):
    c=bpy.data.collections.new(name); root.children.link(c); return c
terrain=group('Cavern, hedges and gravel'); planting=group('Roses and formal flower beds'); gazebo=group('White gazebo - real posts roof and table'); topiary=group('Source topiary forms'); rig=group('Review cameras and lights')
def material(name,col,rough=.9):
    m=bpy.data.materials.new(name); m.diffuse_color=(*col,1); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*col,1); b.inputs['Roughness'].default_value=rough
    return m
stone=[material('Cavern stone '+str(i),(.085+i*.014,.105+i*.014,.10+i*.014)) for i in range(5)]
leaf=[material('Leaf green '+str(i),(.023+i*.009,.065+i*.014,.014+i*.005)) for i in range(6)]
soil=material('Bed soil',(.055,.032,.018)); grass=material('Garden earth and moss',(.04,.065,.025))
gravel=[material('Crushed white stone '+str(i),(.36+i*.04,.35+i*.04,.29+i*.04)) for i in range(4)]
white=material('Weathered white paint',(.68,.65,.54)); wood=material('Gazebo roof shingles',(.17,.13,.075)); trim=material('Roof trim',(.31,.27,.18))
rose=[material('Rose '+str(i),c) for i,c in enumerate([(.36,.015,.025),(.58,.035,.055),(.50,.12,.16),(.64,.34,.27),(.63,.56,.39)])]
def mesh(name,verts,faces,mat,coll):
    d=bpy.data.meshes.new(name); d.from_pydata(verts,[],faces); d.update()
    o=bpy.data.objects.new(name,d); coll.objects.link(o); d.materials.append(mat); return o
def move(o,name,mat,coll):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    coll.objects.link(o); o.data.materials.append(mat); return o
def cube(name,p,s,mat,coll):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p); o=move(bpy.context.object,name,mat,coll); o.scale=s; return o
def ball(name,p,s,mat,coll,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=p); o=move(bpy.context.object,name,mat,coll); o.scale=s
    for f in o.data.polygons: f.use_smooth=True
    return o
def cylinder(name,a,b,r,mat,coll,vertices=10,r2=None):
    a,b=Vector(a),Vector(b); v=b-a
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=v.length,location=(a+b)/2)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r2,depth=v.length,location=(a+b)/2)
    o=move(bpy.context.object,name,mat,coll); o.rotation_euler=v.to_track_quat('Z','Y').to_euler(); return o
def path(name,coords,width):
    vs=[]
    for i,p in enumerate(coords):
        prev=Vector(coords[max(0,i-1)]); nxt=Vector(coords[min(len(coords)-1,i+1)])
        t=nxt-prev; t.z=0; t.normalize(); n=Vector((-t.y,t.x,0))*width/2
        vs.extend([tuple(Vector(p)+n),tuple(Vector(p)-n)])
    o=mesh(name,vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(coords)-1)],gravel[1],terrain)
    return o
# Actual earth floor and stable white gravel pathways.
cube('Earth base',(0,0,-.3),(29,43,.6),grass,terrain)
main=[(.5*math.sin(y*.29),y,.035) for y in range(-21,20)]
path('Winding north south gravel',main,2.1)
path('Formal garden west gap',[(-14,2,.04),(-8,2.5,.04),(-3,2,.04),(0,1.5,.04)],1.8)
path('Topiary rose arbor path',[(-14,-12,.04),(-8,-12,.04),(-4,-12.5,.04),(0,-12,.04)],1.8)
# Cavern rock ring with source exit gaps; overhead is omitted for review.
for side in [-1,1]:
    for y in range(-21,23,3):
        if side==-1 and (abs(y-2)<2 or abs(y+12)<2): continue
        x=side*14.1
        ball('Irregular cavern boundary',(x,y,2.5+rng.uniform(-.3,.5)),(1.8,2.3,3.2+rng.random()),rng.choice(stone),terrain,2)
    for y in range(-20,22):
        if side==-1 and (abs(y-2)<1.5 or abs(y+12)<1.5): continue
        for j in range(3):
            ball('Wall screening hedge',(side*12.2+rng.uniform(-.3,.3),y+rng.uniform(-.3,.3),.7+j*.65),(.85,.88,.75),rng.choice(leaf),terrain,1)
for y in [-21,21]:
    for x in range(-13,15,2):
        if y==21 and abs(x)<2: continue
        ball('End cavern rock',(x,y,2.2),(1.7,1.8,3.3),rng.choice(stone),terrain,2)
        for j in range(2): ball('End screening hedge',(x,y*.92,.8+j*.8),(1.3,.9,.8),rng.choice(leaf),terrain,2)
# Dense 3D foliage cluster helpers.
def foliage(name,p,s,coll=planting,count=12):
    ball(name,p,s,rng.choice(leaf),coll,2)
    for i in range(count):
        ang=rng.random()*math.tau; z=rng.uniform(-.7,.8)
        ball(name+' leaf cluster',(p[0]+math.cos(ang)*s[0]*.8,p[1]+math.sin(ang)*s[1]*.8,p[2]+z*s[2]),tuple(t*.27 for t in s),rng.choice(leaf),coll,1)
def hedge_segment(a,b,height=.9,width=.65,coll=planting):
    a,b=Vector(a),Vector(b); length=(b-a).length; n=max(2,int(length/.6))
    for i in range(n+1):
        p=a.lerp(b,i/n); foliage('Clipped hedge',(p.x,p.y,height*.55),(width,width,height*.65),coll,3)
def flowerbed(cx,cy,rx,ry):
    cylinder('Raised stone bed',(cx,cy,-.03),(cx,cy,.16),1,stone[2],planting,32)
    # Scale the circular plinth into the elliptical planting bed.
    pl=bpy.context.object; pl.scale=(rx,ry,1)
    cylinder('Dark soil',(cx,cy,.16),(cx,cy,.19),1,soil,planting,32); bpy.context.object.scale=(rx*.95,ry*.95,1)
    for i in range(38):
        a=rng.random()*math.tau; radius=math.sqrt(rng.random())*.88
        x=cx+rx*radius*math.cos(a); y=cy+ry*radius*math.sin(a)
        z=rng.uniform(.4,.85); foliage('Rose bush',(x,y,z),(.35,.35,.42),planting,2)
        for j in range(3):
            pos=(x+rng.uniform(-.23,.23),y+rng.uniform(-.23,.23),z+rng.uniform(.3,.5))
            ball('Rose bloom',pos,(.13,.13,.10),rng.choice(rose),planting,1)
# Formal beds bordering the winding path, north and middle.
for cx,cy,rx,ry in [(-5,3,3.2,2),(5,3,3.2,2),(-5,-3,3.2,2),(5,-3,3.2,2),(-5,10,2,3),(6,11,2,3)]: flowerbed(cx,cy,rx,ry)
# Gazebo rosebed as a ring of real bushes around the white structure.
gx,gy=1.5,13
for i in range(48):
    a=i*math.tau/48
    if math.sin(a)<-.8: continue
    x,y=gx+4.2*math.cos(a),gy+4.2*math.sin(a)
    foliage('Gazebo rosebed',(x,y,.55),(.65,.65,.65),planting,4)
    for j in range(4): ball('Gazebo rose bloom',(x+rng.uniform(-.4,.4),y+rng.uniform(-.4,.4),rng.uniform(1,1.3)),(.14,.14,.1),rng.choice(rose[:3]),planting,1)
# Gazebo has real volume, posts, railings, open entrances, roof and tea table.
for z,r in [(.12,3.25),(.30,3.0),(.48,2.75)]: cylinder('Gazebo stone step',(gx,gy,z-.12),(gx,gy,z),r,stone[3],gazebo,8)
for i in range(8):
    a=i*math.tau/8; x,y=gx+2.55*math.cos(a),gy+2.55*math.sin(a)
    cylinder('White gazebo post',(x,y,.48),(x,y,3.65),.11,white,gazebo,8)
    cylinder('Post base',(x,y,.48),(x,y,.7),.18,white,gazebo,8)
    b=(i+1)*math.tau/8; xx,yy=gx+2.55*math.cos(b),gy+2.55*math.sin(b)
    cylinder('Roof perimeter beam',(x,y,3.6),(xx,yy,3.6),.12,white,gazebo,6)
    if i not in [5,6]:
        cylinder('Gazebo handrail',(x,y,1.45),(xx,yy,1.45),.07,white,gazebo,6)
        for j in range(1,6):
            t=j/6; cylinder('Gazebo baluster',(x*(1-t)+xx*t,y*(1-t)+yy*t,.65),(x*(1-t)+xx*t,y*(1-t)+yy*t,1.4),.035,white,gazebo,6)
    # Each shingle is a real trapezoid on one of eight roof faces.
    for row in range(8):
        t0=row/8; t1=(row+1)/8
        r0=2.95*(1-t0); r1=2.95*(1-t1)
        z0=3.65+1.8*t0; z1=3.65+1.8*t1
        for col in range(5):
            aa=a+(b-a)*col/5; ab=a+(b-a)*(col+1)/5
            verts=[(gx+r0*math.cos(aa),gy+r0*math.sin(aa),z0),(gx+r0*math.cos(ab),gy+r0*math.sin(ab),z0),(gx+r1*math.cos(ab),gy+r1*math.sin(ab),z1),(gx+r1*math.cos(aa),gy+r1*math.sin(aa),z1)]
            mesh('Roof shingle',verts,[(0,1,2,3)],wood if row%2 else trim,gazebo)
    cylinder('Roof rib',(gx+2.95*math.cos(a),gy+2.95*math.sin(a),3.67),(gx,gy,5.47),.045,trim,gazebo,6)
ball('Roof finial',(gx,gy,5.55),(.12,.12,.2),white,gazebo,2)
cylinder('Tea table top',(gx,gy,1.3),(gx,gy,1.43),.8,white,gazebo,16)
cylinder('Tea table pedestal',(gx,gy,.48),(gx,gy,1.3),.12,white,gazebo,10)
# Low clipped hedges and source topiary at southern end.
for x in [-9,-5,5,9]: hedge_segment((x,-17,0),(x,-7,0),.65,.40,topiary)
def limb(name,a,b,r=.32): cylinder(name,a,b,r,rng.choice(leaf),topiary,8)
def creature(name,cx,cy,kind):
    foliage(name+' body',(cx,cy,1.15),(1.4,.65,.8),topiary,18)
    for dx in [-.9,.8]:
        for dy in [-.42,.42]: limb(name+' leg',(cx+dx,cy+dy,.15),(cx+dx,cy+dy,1.1),.23)
    limb(name+' neck',(cx+.95,cy,1.3),(cx+1.2,cy,2.4),.35)
    foliage(name+' head',(cx+1.35,cy,2.5),(.7,.4,.45),topiary,8)
    if kind=='unicorn': cylinder('Unicorn topiary horn',(cx+1.65,cy,2.75),(cx+2.2,cy,3.4),.13,leaf[3],topiary,6,r2=.005)
    if kind=='dragon':
        for side in [-1,1]:
            verts=[(cx,cy+side*.3,1.5),(cx-.5,cy+side*2.2,3.0),(cx+1,cy+side*1.9,2.1)]
            mesh('Dragon hedge wing',verts,[(0,1,2),(2,1,0)],leaf[2],topiary)
            limb('Wing hedge spine',verts[0],verts[1],.16)
        for i in range(8): ball('Dragon tail',(cx-1.1-i*.28,cy+math.sin(i*.45)*.6,1.1-i*.08),(.38,.28,.3),rng.choice(leaf),topiary,1)
    if kind=='dog':
        for side in [-1,1]: foliage('Dog topiary ear',(cx+1.3,cy+side*.38,2.45),(.22,.25,.55),topiary,3)
creature('Dragon',-7,-8,'dragon'); creature('Unicorn',6,-8,'unicorn'); creature('Misshapen dog',-7,-15,'dog')
for i in range(24):
    t=i/23; x=6+math.sin(t*math.tau)*1.6; y=-16+t*5
    foliage('Great serpent',(x,y,.5+t*.8),(.45,.45,.45),topiary,2)
foliage('Serpent raised head',(6,-11,1.9),(.6,.35,.5),topiary,5)
for x,y in [(-3,-10),(3,-15),(-3,-17)]:
    foliage('Human topiary torso',(x,y,1.1),(.4,.3,.7),topiary,6)
    foliage('Human topiary head',(x,y,2.0),(.3,.3,.35),topiary,4)
    for side in [-1,1]:
        limb('Human topiary leg',(x+side*.2,y,.1),(x+side*.15,y,.9),.16)
        limb('Human topiary arm',(x+side*.3,y,1.5),(x+side*.7,y,1.05),.16)
# West rose arbor: physical curved members, vines and rose blooms.
for t in range(17):
    a=math.pi*t/16; y=-12+1.3*math.cos(a); z=.4+3.1*math.sin(a)
    for x in [-13,-11.8]:
        ball('Arbor rose vine',(x,y,z),(.22,.22,.27),rng.choice(leaf),planting,1)
        if t%2==0: ball('Arbor bloom',(x,y-.1,z+.1),(.14,.14,.12),rng.choice(rose[:3]),planting,1)
# Studio review lighting suggests cave moss illumination, not runtime lighting.
world=bpy.data.worlds.new('Cavern ambient'); world.use_nodes=True; world.node_tree.nodes['Background'].inputs['Color'].default_value=(.07,.09,.085,1); world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5; scene.world=world
for name,off,power,color in [('Moss canopy',(-10,-10,30),22000,(.8,1,.87)),('Warm review key',(20,-20,25),16000,(1,.89,.7)),('Cave rim',(-15,20,20),18000,(.7,.83,1))]:
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.size=25; d.color=color
    o=bpy.data.objects.new(name,d); rig.objects.link(o); o.location=off; o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Rotation review'); d.type='ORTHO'; d.clip_end=500
cam=bpy.data.objects.new(d.name,d); rig.objects.link(cam); scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=24; scene.cycles.use_denoising=True
scene.render.resolution_x=3840; scene.render.resolution_y=2160; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='JPEG'; scene.render.image_settings.quality=98
scene.view_settings.view_transform='AgX'
geo=[o for o in scene.objects if o.type=='MESH']; points=[o.matrix_world@Vector(c) for o in geo for c in o.bound_box]
# Ensure transforms are evaluated before fitting the review cameras.
bpy.context.view_layer.update(); points=[o.matrix_world@Vector(c) for o in geo for c in o.bound_box]
center=Vector((0,0,1.5))
for degrees,offset in [(0,(0,-70,49)),(90,(70,0,49)),(180,(0,70,49))]:
    cam.location=center+Vector(offset); cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    rot=cam.rotation_euler.to_matrix(); right=rot@Vector((1,0,0)); up=rot@Vector((0,1,0))
    w=max(right.dot(p) for p in points)-min(right.dot(p) for p in points); h=max(up.dot(p) for p in points)-min(up.dot(p) for p in points)
    d.ortho_scale=max(w,h*3840/2160)*1.08
    scene.render.filepath=str(OUT/f'review-{degrees:03d}-4k.jpg'); bpy.ops.render.render(write_still=True); print('RENDERED',degrees,flush=True)
scene['status']='Rebuilt rotation-consistent authoring study, not runtime integration'
scene['texture_method']='Real meshes and uniform material families; no projected reference image'
notes=bpy.data.texts.new('READ ME'); notes.write('Rebuilt from source descriptions and garden concept. Actual gazebo, flower beds, foliage and topiary meshes. No image projection. Original generated garden retained separately. Approximate layout and creature shapes, cutaway cave, review lighting only. No gameplay changes.\n')
for obj in scene.objects: obj.select_set(obj.type=='MESH')
blend=OUT/'underground-garden-rebuilt-v1.blend'; glb=OUT/'underground-garden-rebuilt-v1.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
blob=glb.read_bytes(); length=struct.unpack_from('<I',blob,12)[0]; doc=json.loads(blob[20:20+length])
assert not doc.get('images') and not doc.get('textures')
triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=str(glb))
reimport=0
for obj in bpy.context.scene.objects:
    if obj.type=='MESH': obj.data.calc_loop_triangles(); reimport+=len(obj.data.loop_triangles)
assert reimport==triangles
(OUT/'verification.json').write_text(json.dumps({'method':'Authored volumetric meshes and consistent material families; no image projection','triangles':triangles,'reimportedTriangles':reimport,'meshObjects':len(geo),'materials':len(doc.get('materials',[])),'projectedTextures':False,'renderAngles':[0,90,180],'renderResolution':[3840,2160],'source':'reference/zork2/2dungeon.zil:282-345','status':'authoring study; not runtime integrated','files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [blend,glb]}},indent=2)+'\n')
