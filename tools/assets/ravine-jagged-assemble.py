"""Author a ravine diorama from the reusable Tencent/Blender module kit."""
from pathlib import Path
import hashlib
import json
import math
import random
import shutil
import sys
import bpy
import bmesh
import numpy as np
from PIL import Image
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/lower-ravine'
KIT=BASE/'atomic-parts-v2'
OUT=BASE/'assembled-v3';OUT.mkdir(exist_ok=True)
if (OUT/'ravine.blend').exists() and '--refresh' not in sys.argv:raise RuntimeError('Keep the existing assembly; choose a new revision')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
specs={p['id']:p for p in json.loads((KIT/'manifest.json').read_text())['parts']}
templates={};sources={};placements=[];roots=[]
for name,spec in specs.items():
    path=KIT/'meshes'/f'{name}.glb'
    before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    imported=[o for o in scene.objects if o not in before]
    templates[name]=[(o.data,o.matrix_world.copy()) for o in imported if o.type=='MESH']
    sources[name]={'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    for o in imported:bpy.data.objects.remove(o,do_unlink=True)

# Only the moss/leaf colour remains visible, so patches blend into other rock.
rgb=np.array(Image.open(KIT/'meshes/moss-patch-color.png').convert('RGB'))
linear=rgb.astype(float)/255
green=linear[:,:,1];red=linear[:,:,0];blue=linear[:,:,2]
alpha=np.clip((green-blue-.015)/.13,0,1)*np.clip((green-red+.005)/.055,0,1)
yy,xx=np.meshgrid(np.linspace(0,1,rgb.shape[0]),np.linspace(0,1,rgb.shape[1]),indexing='ij')
alpha*=np.clip(np.minimum.reduce([xx,1-xx,yy,1-yy])/.05,0,1)
texture=OUT/'moss-overlay.png';Image.fromarray(np.dstack([rgb,(alpha*255).astype('uint8')])).save(texture)
mossmat=bpy.data.materials.new('Moss foliage overlay');mossmat.use_nodes=True;mossmat.surface_render_method='DITHERED'
tex=mossmat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(texture));tex.image.pack()
shader=mossmat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=1
mossmat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);mossmat.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
for mesh,local in templates['moss-patch']:
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index!=0],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(mesh);bm.free();mesh.materials.clear();mesh.materials.append(mossmat)
    for f in mesh.polygons:f.material_index=0

def place(name,kind,transform):
    root=bpy.data.objects.new(name,None);scene.collection.objects.link(root);root.matrix_world=transform
    root['module']=kind
    for i,(data,local) in enumerate(templates[kind]):
        obj=bpy.data.objects.new(name+f'-mesh-{i}',data);scene.collection.objects.link(obj)
        obj.parent=root;obj.matrix_basis=local
    roots.append(root);placements.append({'name':name,'module':kind,'blenderMatrix':[list(row) for row in transform]})
    return root

def wall(name,kind,location,width,height,yaw=0):
    sw,sh=specs[kind]['sizeMetres'][:2]
    return place(name,kind,Matrix.Translation(location)@Matrix.Rotation(yaw,4,'Z')@Matrix.Diagonal((width/sw,1,height/sh,1)))

def floor(name,kind,center,width,length,slope=0):
    sw,sh=specs[kind]['sizeMetres'][:2]
    return place(name,kind,Matrix.Translation(center)@Matrix.Rotation(slope,4,'X')@Matrix.Rotation(-math.pi/2,4,'X')@Matrix.Diagonal((width/sw,1,length/sh,1))@Matrix.Translation((0,0,-sh/2)))

def tunnel(name,origin,yaw,width=2.1,height=2.7,depth=10):
    transform=Matrix.Translation(origin)@Matrix.Rotation(yaw,4,'Z')
    def local_wall(label,pos,w,h,turn):
        sw,sh=specs['cliff-face']['sizeMetres'][:2]
        return place(name+'-'+label,'cliff-face',transform@Matrix.Translation(pos)@Matrix.Rotation(turn,4,'Z')@Matrix.Diagonal((w/sw,1,h/sh,1)))
    local_wall('left',(-width/2,depth/2,0),depth,height,math.pi/2)
    local_wall('right',(width/2,depth/2,0),depth,height,-math.pi/2)
    local_wall('far',(0,depth,0),width,height,0)
    sw,sh=specs['ledge-top']['sizeMetres'][:2]
    place(name+'-floor','ledge-top',transform@Matrix.Translation((0,depth/2,-.01))@Matrix.Rotation(-math.pi/2,4,'X')@Matrix.Diagonal((width/sw,1,depth/sh,1))@Matrix.Translation((0,0,-sh/2)))
    place(name+'-roof','cliff-face',transform@Matrix.Translation((0,depth/2,height))@Matrix.Rotation(math.pi/2,4,'X')@Matrix.Diagonal((width/4,1,depth/4,1))@Matrix.Translation((0,0,-2)))
    for i,d in enumerate([2.8,6.2]):
        sw,sh=specs['wide-cave']['sizeMetres'][:2]
        place(name+f'-recessed-frame-{i}','wide-cave',transform@Matrix.Translation((0,d,0))@Matrix.Diagonal((width*1.65/sw,1,height*1.24/sh,1)))

# Continuous curved strips replace the rectangular banks and tiled floor pieces.
BOTTOM=-18.0
def centre(y):return .8*math.sin(y*.19)+.25*math.sin(y*.57)
def smooth_inner(side,y):return centre(y)+side*(3.7+.35*math.sin(y*.41+side)+.2*math.sin(y*1.12))
def chips(y):
    t=(y+40)/.35;k=math.floor(t);t-=k
    def noise(n):return (math.sin(n*12.9898+78.233)*43758.5453)%1
    return .30*((noise(k)*(1-t)+noise(k+1)*t)*2-1)
def inner(side,y):return smooth_inner(side,y)+side*chips(y+side*2.7)
def width(side,y):return 1.75+.22*math.sin(y*.37+side*2)
def outer(side,y):return smooth_inner(side,y)+side*width(side,y)
def level(side,y):return (0 if side<0 else 2)+.22*math.sin(y*.18+side)
def riveredge(side,y):return centre(y)+side*(2.15+.2*math.sin(y*.33))

def periodic_material(name,source):
    rgb=np.array(Image.open(source).convert('RGB').resize((1024,1024))).astype(float)
    # Cross-fade a half-period shift at opposite borders to remove edge seams.
    for axis in [1,0]:
        t=np.arange(1024)/1024;w=(.5+.5*np.cos(2*math.pi*t))**3
        w=w[None,:,None] if axis==1 else w[:,None,None]
        rgb=rgb*(1-w)+np.roll(rgb,512,axis=axis)*w
    path=OUT/(name+'-periodic.png');Image.fromarray(np.clip(rgb,0,255).astype('uint8')).save(path)
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path));tex.image.pack();tex.extension='REPEAT'
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.98
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    return mat

ground=periodic_material('Continuous gravel',KIT/'meshes/ledge-top-color.png')
rock=periodic_material('Continuous deep cliff',KIT/'meshes/cliff-face-color.png')
bedmat=periodic_material('Continuous riverbed',KIT/'meshes/riverbed-color.png')
marble=periodic_material('Weathered marble',KIT/'meshes/marble-floor-color.png')

def surface_mesh(name,verts,faces,uvs,material):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);mesh.materials.append(material)
    uv=mesh.uv_layers.new(name='Continuous world scale')
    for face in mesh.polygons:
        for loop in face.loop_indices:uv.data[loop].uv=uvs[mesh.loops[loop].vertex_index]
    return obj

N=120
for side in [-1,1]:
    verts=[];uvs=[];faces=[]
    for j in range(N+1):
        y=-12+30*j/N
        for k in range(5):
            t=k/4;x=inner(side,y)+(outer(side,y)-inner(side,y))*t
            z=level(side,y)+.018*math.sin(y*3+x*4)
            verts.append((x,y,z));uvs.append((x*.32,y*.32))
    for j in range(N):
        for k in range(4):
            a=j*5+k;b=a+1;c=a+5;d=c+1
            faces.extend([(a,b,c),(b,d,c)] if side>0 else [(a,c,b),(b,c,d)])
    obj=surface_mesh(('west' if side<0 else 'east')+'-continuous-ledge',verts,faces,uvs,ground)
    # Uneven, faceted cliff faces drop 18–20m from the narrow paths to the water.
    verts=[];uvs=[];faces=[];bands=18
    for j in range(N+1):
        y=-12+30*j/N
        for k in range(bands+1):
            t=k/bands;z=BOTTOM+(level(side,y)-BOTTOM)*t
            x=riveredge(side,y)*(1-t)+inner(side,y)*t
            x+=side*.35*math.sin(y*.8+k*1.7)*math.sin(t*math.pi)
            verts.append((x,y,z));uvs.append((y*.22,z*.22))
    for j in range(N):
        for k in range(bands):
            a=j*(bands+1)+k;b=a+1;c=a+bands+1;d=c+1
            faces.extend([(a,c,b),(b,c,d)] if side<0 else [(a,b,c),(b,d,c)])
    surface_mesh(('west' if side<0 else 'east')+'-deep-drop',verts,faces,uvs,rock)

# Independent upper cliff modules follow the meandering path. Their upper edges
# and outward lean vary, keeping the atomic source pieces intact on disk.
portals=[]
def portal(name,pos,yaw):
    outward=Vector((math.sin(yaw),-math.cos(yaw),0))
    p=Vector(pos)+outward*.5+Vector((0,0,.8))
    direction=-outward
    portals.append({'name':name,'origin':[p.x,p.z,-p.y],'direction':[direction.x,direction.z,-direction.y]})

def crag(root,base,height):
    bpy.context.view_layer.update()
    for obj in root.children:
        obj.data=obj.data.copy();matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        for vertex in obj.data.vertices:
            p=matrix@vertex.co;t=max(0,min(1,(p.z-base)/height))
            p.z+=t**3*(.9*math.sin(p.y*1.3)+.45*math.sin(p.y*3.3+p.x))
            p.x+=math.copysign(.025*(p.z-base),p.x)
            vertex.co=inverse@p
        obj.data.update()

for side in [-1,1]:
    for i in range(8):
        a=-12+i*3.75;b=a+3.75;y=(a+b)/2
        x=outer(side,y);dx=outer(side,b)-outer(side,a)
        yaw=math.atan2(b-a,dx)+(0 if side<0 else -math.pi)
        w=math.hypot(b-a,dx)+.12;z=level(side,y)
        height=14+2*math.sin(y*.3+side)+1.2*math.sin(y*.73)
        cave=i in ([4,6] if side<0 else [2,6])
        prefix=('west' if side<0 else 'east')
        if cave:
            kind='wide-cave' if i==6 else 'small-cave';h=3.6 if kind=='wide-cave' else 3.2
            wall(f'{prefix}-cave-{i}',kind,(x,y,z),w,h,yaw)
            tunnel(f'{prefix}-passage-{i}',(x,y,z),yaw,width=2.05 if kind=='wide-cave' else 1.6,height=2.7)
            portal(f'{prefix} cave {i}',(x,y,z),yaw)
    # A continuous cliff envelope joins the upper sections without paper-thin
    # panel gaps. Module cave surrounds sit over real cutouts in this envelope.
    verts=[];uvs=[];faces=[];rows=180;bands=28
    cave_y=[-12+(i+.5)*3.75 for i in ([4,6] if side<0 else [2,6])]
    for j in range(rows+1):
        y=-12+30*j/rows;height=14+2*math.sin(y*.3+side)+1.2*math.sin(y*.73)
        for k in range(bands+1):
            dz=k*.25 if k<=16 else 4+(height-4)*(k-16)/12
            t=dz/height
            x=outer(side,y)+side*(.65*t**1.7+.3*math.sin(y*.65+k*1.3)*math.sin(math.pi*t))
            verts.append((x,y,level(side,y)+dz));uvs.append((y*.22,(level(side,y)+dz)*.22))
    for j in range(rows):
        y=-12+30*(j+.5)/rows
        for k in range(bands):
            if k<13 and any(abs(y-cy)<1.3 for cy in cave_y):continue
            a=j*(bands+1)+k;b=a+1;c=a+bands+1;d=c+1
            faces.extend([(a,c,b),(b,c,d)] if side<0 else [(a,b,c),(b,d,c)])
    surface_mesh(('west' if side<0 else 'east')+'-continuous-upper-cliff',verts,faces,uvs,rock)

# The river enters far below the ledges; a high, rough end wall gives scale.
for x in [-5,5]:
    root=wall(f'far-cliff-{x}','cliff-face',(x,18,BOTTOM),4.5,34)
    crag(root,BOTTOM,34)
wall('river-source-opening','wide-cave',(centre(18),18,BOTTOM),6,4.5)
root=wall('river-source-upper-cliff','cliff-face',(centre(18),18,BOTTOM+4.5),6,29.5);crag(root,BOTTOM+4.5,29.5)
tunnel('river-source',(centre(18),18,BOTTOM),0,width=3.6,height=3.8,depth=12)
portal('river source',(centre(18),18,BOTTOM),0)

for i,y in enumerate([-9,-5.5,-2]):
    x=outer(-1,y)+.12
    wall(f'ruined-marble-arcade-{i}','marble-arch',(x,y,level(-1,y)),3.2,3.8,math.pi/2)
y=3;x=(inner(1,y)+outer(1,y))/2
wall('garden-gateway','garden-arch',(x,y,level(1,y)),2.0,3.4)
portal('garden gateway',(x,y,level(1,y)),0)

rng=random.Random(42)
for i in range(48):
    side=-1 if i%2==0 else 1;y=rng.uniform(-11.8,17.5)
    if i<20:
        x=riveredge(side,y)-side*rng.uniform(.05,.45);z=BOTTOM+rng.uniform(-.05,.1);size=rng.uniform(.5,1.6)
    else:
        x=inner(side,y)+side*rng.uniform(.02,.22);z=level(side,y)-.1;size=rng.uniform(.18,.5)
    place(f'rock-outcrop-{i}','boulder',Matrix.Translation((x,y,z))@Matrix.Rotation(rng.uniform(-math.pi,math.pi),4,'Z')@Matrix.Diagonal((size,size,size,1)))
for i in range(12):
    side=-1 if i%2==0 else 1;y=rng.uniform(-11,17)
    wall(f'cliff-moss-{i}','moss-patch',(outer(side,y)-side*.12,y,level(side,y)+rng.uniform(.5,4)),.8,1.3,math.pi/2 if side<0 else -math.pi/2)

verts=[];uvs=[];faces=[]
for j in range(N+1):
    y=-12+42*j/N
    for k in range(9):
        t=k/8;x=riveredge(-1,y)*(1-t)+riveredge(1,y)*t if y<=18 else centre(18)+(2*t-1)*1.72
        verts.append((x,y,BOTTOM+.08));uvs.append((x*.3,y*.3))
for j in range(N):
    for k in range(8):
        a=j*9+k;b=a+1;c=a+9;d=c+1;faces.extend([(a,b,c),(b,d,c)])
watermat=bpy.data.materials.new('Deep river water');watermat.use_nodes=True;watermat.surface_render_method='DITHERED'
shader=watermat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.008,.18,.24,1);shader.inputs['Alpha'].default_value=.85;shader.inputs['Roughness'].default_value=.2
water=surface_mesh('WATER-river-surface',verts,faces,uvs,watermat);water['water_surface']=True
surface_mesh('continuous-riverbed',[(x,y,BOTTOM-.22) for x,y,z in verts],faces,uvs,bedmat)

bpy.context.view_layer.update();bpy.ops.object.select_all(action='SELECT')
glb=OUT/'ravine.glb';bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_extras=True)
report={'scene':'Deep narrow ravine revision','sources':sources,'placements':placements,'placementCount':len(placements),'portals':portals,
        'water':'Separate river mesh, animated in the browser preview','ledgeWidthRangeMetres':[1.23,2.27],'ledgeDropToWaterMetres':[17.7,20.2],'sideTunnelDepthMetres':10,'riverSourceTunnelDepthMetres':12,
        'changes':['Chipped angular ledge contours, up to 30cm variation','10m side passages and 12m river-source tunnel','Recessed rock frames inside tunnels','Seam-blended periodic ground mapping','Deep faceted canyon walls'],
        'scope':'Visual prototype; no gameplay/navigation integration','standardBytes':glb.stat().st_size,'sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),
        'renderedTriangles':sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in scene.objects if o.type=='MESH')}
(OUT/'assembly.json').write_text(json.dumps(report,indent=2)+'\n')
scene.world=bpy.data.worlds.new('Deep ravine sky');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.18,.25,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.render.engine='CYCLES';scene.cycles.samples=20;scene.render.resolution_x=1500;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
for name,pos,power,size in [('Sky',(-2,-2,28),7000,18),('Entrance',(0,-18,10),2500,12)]:
    bpy.ops.object.light_add(type='AREA',location=pos);light=bpy.context.object;light.name='REVIEW-'+name;light.data.energy=power;light.data.size=size;light.rotation_euler=(Vector((0,3,-5))-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Deep ravine overview');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera);scene.camera=camera
data.type='PERSP';data.lens=25;camera.location=(1,-28,18);camera.rotation_euler=(Vector((0,3,-4))-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.data.orphans_purge(do_recursive=True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ravine.blend'))
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'preview-overview.png');bpy.ops.render.render(write_still=True)
camera.location=(-3.4,-10,2);camera.rotation_euler=(Vector((.5,6,-11))-camera.location).to_track_quat('-Z','Y').to_euler();data.lens=22
scene.render.filepath=str(OUT/'preview-depth.png');bpy.ops.render.render(write_still=True)
for f in ['TENCENT-HUNYUAN-3D-2.0-LICENSE.txt','HUNYUAN-NOTICE.txt']:shutil.copy2(KIT/'meshes'/f,OUT/f)
print('DEEP ASSEMBLY COMPLETE',report['renderedTriangles'],flush=True)

