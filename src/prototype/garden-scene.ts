import {walkingSurfaces} from './walking-surfaces.generated.ts';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type {ObjectAction} from '../player/object-actions.ts';

/** Reviewed path samples in the exported GLB's Y-up coordinates. */
export const gardenOrigins:Record<string,readonly [number,number,number]>=Object.fromEntries(['GARDEN-NORTH', 'GAZEBO-ROOM', 'FORMAL-GARDEN', 'TOPIARY-ROOM'].map(id=>[id,walkingSurfaces[id]!.origin]));
export function gardenSceneOffset(room:string|null){
  const p=room?gardenOrigins[room]:undefined;
  return p?[-p[0],-p[1],-p[2]] as const:undefined;
}
export type GardenStatus='loading'|'ready'|'failed';
type Load=(url:string,ready:(gltf:GLTF)=>void,failed:()=>void)=>void;
function release(root:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
  for(const material of materials)for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.clear();root.removeFromParent();
}
/** One loaded GLB for all four lit garden rooms, including its packed sky sphere. */
export function mountGardenScene(parent:THREE.Group,url:string,status:(value:GardenStatus)=>void=()=>{},load:Load=(url,ready,failed)=>new GLTFLoader().load(url,ready,undefined,failed)){
  const root=new THREE.Group();root.name='shared-garden-scene';parent.add(root);
  let disposed=false;status('loading');
  load(url,gltf=>{
    if(disposed){release(gltf.scene);return;}
    gltf.scene.traverse(node=>{
      if(node instanceof THREE.Mesh&&(node.name==='CAVE_GARDEN_SKYBOX'||node.userData.role==='skybox')){
        node.renderOrder=-100;
        for(const material of Array.isArray(node.material)?node.material:[node.material]){
          material.fog=false;material.depthWrite=false;
        }
      }
    });
    root.add(gltf.scene);status('ready');
  },()=>{if(!disposed)status('failed');});
  return {dispose(){if(disposed)return;disposed=true;release(root);}};
}

/** Geometry suggests a hit location; observed source identities authorize actions. */
export function addGardenTargets(parent:THREE.Group,room:string,visible:ReadonlySet<string>,actions:readonly ObjectAction[]){
  const definitions:[string,number[],number[]][]=[['MOSS',[4,1,4],[0,5,0]]];
  if(room==='GARDEN-NORTH')definitions.push(['GAZEBO',[3.8,3.2,3.8],[1.36,1.5,-6.15]],['ROSE-BUSH',[2,1.3,1.5],[2,.65,-4]]);
  if(room==='TOPIARY-ROOM')definitions.push(['HEDGES',[3,2.8,2],[2,1.4,-1]],['ROSE-BUSH',[1.4,2.5,1],[-2,1.25,0]]);
  if(room==='GAZEBO-ROOM')definitions.push(['GAZEBO-TABLE',[1.7,.8,1.2],[0,.4,.9]],['GAZEBO',[3.5,3,.3],[0,1.5,-1.5]]);
  return definitions.flatMap(([id,size,position])=>{
    if(!visible.has(id))return [];
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),new THREE.MeshBasicMaterial({visible:false}));
    mesh.name='source-target-'+id;mesh.position.set(position[0]!,position[1]!,position[2]!);mesh.userData.object=id;mesh.userData.action=actions.find(a=>a.object===id);parent.add(mesh);return [mesh];
  });
}

/** The table is separate from the fused painting so source objects rest on a real surface. */
export function addGazeboTable(parent:THREE.Group){
  const material=new THREE.MeshStandardMaterial({color:0xaaa58c,roughness:.9});
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.85,.85,.1,24),material);top.position.set(0,.75,.9);parent.add(top);
  const leg=new THREE.Mesh(new THREE.CylinderGeometry(.12,.22,.7,8),material);leg.position.set(0,.35,.9);parent.add(leg);
}
