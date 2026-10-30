"""Place each topiary on a distinct island selected in the front review view."""
from pathlib import Path
import bpy, json, hashlib, struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'games/zork2/planning/scenes/underground-garden/modular-references-v1'
OUT=BASE/'hedge-models-centered-v2';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'hedge-models-v1/garden-hedge-models.blend'))
scene=bpy.context.scene;camera=bpy.data.objects['front'];scene.camera=camera
meshes=[o for o in scene.objects if o.type=='MESH']
def geometry():
 h=hashlib.sha256()
 for o in sorted(meshes,key=lambda o:o.name):
  for v in o.data.vertices:h.update(struct.pack('<3f',*v.co))
  for f in o.data.polygons:h.update(struct.pack('<'+'I'*len(f.vertices),*f.vertices))
 return h.hexdigest()
before=geometry()
shell=next(o for o in meshes if o.name.startswith('garden-shell -'))
tree=BVHTree.FromPolygons([shell.matrix_world@v.co for v in shell.data.vertices],[tuple(p.vertices) for p in shell.data.polygons])
# Pixel locations mark the centers of six separate planted interiors, not paths.
islands={'dragon':(850,805),'unicorn':(1120,740),'serpent':(1340,540),'dog':(1400,710),'woman-violet':(820,414),'woman-rose':(675,515)}
rotation=camera.matrix_world.to_quaternion()
right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0));direction=rotation@Vector((0,0,-1))
width=camera.data.ortho_scale;height=width/(1920/1080)
rows=[]
for name,(px,py) in islands.items():
 root=bpy.data.objects[name+' - MOVE AND SCALE']
 obj=next(o for o in meshes if o.name.startswith(name+' -'))
 old=list(root.location);scale=list(root.scale)
 origin=camera.matrix_world.translation+right*((px/1920-.5)*width)+up*((.5-py/1080)*height)
 hit,normal,face,distance=tree.ray_cast(origin,direction,1000)
 assert hit is not None,name
 # Ground the existing mesh's lowest point at the selected island surface.
 bottom=min((obj.matrix_world@v.co).z for v in obj.data.vertices)
 offset=bottom-root.location.z
 root.location=Vector((hit.x,hit.y,hit.z-offset+.025))
 root['placement']='Centered on a distinct planted garden island in front review view'
 bpy.context.view_layer.update()
 assert list(root.scale)==scale
 rows.append({'name':name,'previousLocation':old,'location':list(root.location),'islandCenterReviewPixel':[px,py]})
assert before==geometry()
assert len({tuple(round(v,3) for v in r['location'][:2]) for r in rows})==6
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.cycles.samples=32;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(OUT/'garden-centered-topiary-1080p.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'garden-centered-topiary.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True);o.parent.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'garden-centered-topiary.glb'),export_format='GLB',use_selection=True,export_extras=True)
bpy.ops.render.render(write_still=True)
(OUT/'verification.json').write_text(json.dumps({'geometryUnchanged':True,'placements':rows,'distinctIslands':6,'previewResolution':[1920,1080]},indent=2)+'\n')
print('CENTERED TOPIARY COMPLETE',flush=True)
