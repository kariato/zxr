"""Strip display props from a complete authored Barrow before runtime compression.

The app owns portable objects; they must not be permanently baked into the room.
Pass the standard authoring GLB, then compress the emitted environment-only GLB.
"""
from pathlib import Path
import argparse,json,struct,hashlib
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args();data=args.source.read_bytes();length=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+length]);binary=data[28+length:]
assert not doc.get('skins') and not doc.get('animations'),'Only static environment exports are supported'
removed=set()
def remove(index):
 removed.add(index)
 for child in doc['nodes'][index].get('children',[]):remove(child)
for i,node in enumerate(doc['nodes']):
 if node.get('extras',{}).get('engineIdentity') in ['SWORD','LAMP'] or node.get('name','').startswith('prop-'):remove(i)
assert removed,'No display prop nodes found; inspect the source before publishing'
keep=[i for i in range(len(doc['nodes'])) if i not in removed];node_map={old:new for new,old in enumerate(keep)}
doc['nodes']=[doc['nodes'][i] for i in keep]
for node in doc['nodes']:
 if 'children' in node:node['children']=[node_map[i] for i in node['children'] if i in node_map]
for scene in doc['scenes']:scene['nodes']=[node_map[i] for i in scene['nodes'] if i in node_map]
used_meshes=sorted({n['mesh'] for n in doc['nodes'] if 'mesh' in n});mesh_map={old:new for new,old in enumerate(used_meshes)}
doc['meshes']=[doc['meshes'][i] for i in used_meshes]
for node in doc['nodes']:
 if 'mesh' in node:node['mesh']=mesh_map[node['mesh']]
used_materials=sorted({p['material'] for m in doc['meshes'] for p in m['primitives']});mat_map={old:new for new,old in enumerate(used_materials)}
doc['materials']=[doc['materials'][i] for i in used_materials]
for mesh in doc['meshes']:
 for primitive in mesh['primitives']:primitive['material']=mat_map[primitive['material']]
slots=[]
def texture_slots(obj):
 if not isinstance(obj,dict):return
 for key,value in obj.items():
  if isinstance(value,dict) and key.endswith('Texture') and 'index' in value:slots.append(value)
  elif isinstance(value,dict):texture_slots(value)
for material in doc['materials']:texture_slots(material)
used_textures=sorted({s['index'] for s in slots});tex_map={old:new for new,old in enumerate(used_textures)}
doc['textures']=[doc['textures'][i] for i in used_textures]
for slot in slots:slot['index']=tex_map[slot['index']]
used_images=sorted({t['source'] for t in doc['textures']});image_map={old:new for new,old in enumerate(used_images)}
doc['images']=[doc['images'][i] for i in used_images]
for texture in doc['textures']:texture['source']=image_map[texture['source']]
js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
output=struct.pack('<III',0x46546C67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(output)
print(json.dumps({'removedPropNodes':len(removed),'remainingImages':len(doc['images']),'sourceSha256':hashlib.sha256(data).hexdigest()}))
