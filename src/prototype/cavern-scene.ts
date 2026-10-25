import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type {ObjectAction} from '../player/object-actions.ts';

export type CavernStatus='loading'|'ready'|'failed';
/** Room origins in one shared environment: the tunnel shelf, bridge deck and far bank. */
const origins:Record<string,readonly [number,number,number]>={
  'NARROW-TUNNEL':[0,0,0],
  'FOOT-BRIDGE':[0,-.69,-6.9],
  'GREAT-CAVERN':[0,-1,-12],
};
export function cavernSceneOffset(room:string|null){return room?origins[room]:undefined;}
type Load=(url:string,ready:(gltf:GLTF)=>void,failed:()=>void)=>void;
function release(root:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
  for(const material of materials)for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
  geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());root.clear();root.removeFromParent();
}
/** Shared-environment loading: leaving the cavern rooms or darkness cancels attachment. */
export function mountCavernScene(parent:THREE.Group,url:string,status:(state:CavernStatus)=>void=()=>{},load:Load=(url,ready,failed)=>{
  new GLTFLoader().load(url,ready,undefined,failed);
}){
  const root=new THREE.Group();root.name='shared-cavern-scene';parent.add(root);
  let disposed=false;status('loading');
  load(url,gltf=>{if(disposed){release(gltf.scene);return;}root.add(gltf.scene);status('ready');},()=>{if(!disposed)status('failed');});
  return {dispose(){if(disposed)return;disposed=true;release(root);}};
}

/** Fused scenery never determines object presence or action availability. */
export function addCavernTargets(parent:THREE.Group,visible:ReadonlySet<string>,actions:readonly ObjectAction[]){
  const targets:THREE.Mesh[]=[];
  const definitions:[string,number[],number[]][]=[
    ['BRIDGE',[2.2,.4,8.5],[0,.7,7]],
    ['CHASM',[9,2,7],[0,-1.6,7]],
    ['STREAM',[1.5,.35,8],[0,-4.3,7]],
    ['MOSS',[10,2.2,1],[0,5.4,12]],
  ];
  for(const [id,size,position] of definitions){
    if(!visible.has(id))continue;
    const target=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),new THREE.MeshBasicMaterial({visible:false}));
    target.name='source-target-'+id;target.position.set(position[0]!,position[1]!,position[2]!);
    target.userData.object=id;target.userData.action=actions.find(action=>action.object===id);
    parent.add(target);targets.push(target);
  }
  return targets;
}
