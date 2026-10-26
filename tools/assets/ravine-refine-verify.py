"""Verify artwork preservation, packed files, guides and GLB round trip."""
from pathlib import Path
import bpy,json,struct,hashlib
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'games/zork2/planning/scenes/lower-ravine';OUT=BASE/'mesh-v4'
r=json.loads((OUT/'refinement.json').read_text())
assert r['geometryUnchanged'] and r['frontMaterialUVsUnchanged']
for name,meta in r['files'].items():assert hashlib.sha256((OUT/name).read_bytes()).hexdigest()==meta['sha256']
bpy.ops.wm.open_mainfile(filepath=str(OUT/'lower-ravine-v4.blend'))
assert not any(x in bpy.data.collections for x in ['TINY-ROOM','DREARY-ROOM'])
assert bpy.data.collections['Walking guides - hidden from render'].hide_render
assert len(bpy.data.collections['Walking guides - hidden from render'].objects)==5
assert bpy.data.objects['TINY_ROOM_ENTRANCE_ONLY']['destination_room']=='TINY-ROOM'
meshes=list(bpy.data.collections['Shared generated geometry'].objects)
assert sum(len(o.data.polygons) for o in meshes)==60000
h=hashlib.sha256()
for obj in meshes:
 for v in obj.data.vertices:h.update(struct.pack('<3f',*v.co))
 for p in obj.data.polygons:h.update(struct.pack('<3I',*p.vertices))
assert h.hexdigest()==r['geometrySha256']
assert all(n.image.packed_file for o in meshes for m in o.data.materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE')
data=(OUT/'lower-ravine-v4.glb').read_bytes();size=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+size])
assert len(g['images'])==2 and all('bufferView' in image for image in g['images'])
assert {n.get('extras',{}).get('source_room') for n in g['nodes'] if n.get('extras',{}).get('source_room')}==set(r['viewpoints'])
assert not any(n.get('extras',{}).get('role')=='authoring_collision_guide' for n in g['nodes'])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/'lower-ravine-v4.glb'))
assert sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')==60000
report={'checks':'passed','geometryMatchesOriginalTencentMesh':True,'frontArtworkUVsPreserved':True,'hiddenAuthoringGuides':5,'glbRoundTrip':True,'embeddedTextures':2,'triangles':60000,'deferredInteriorsAbsent':True,'entranceBoundaryRetained':True,'runtimeReady':False}
(OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
