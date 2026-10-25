import * as THREE from 'three';
import { GLTFLoader,type GLTF } from 'three/addons/loaders/GLTFLoader.js';

type Load=(url:string)=>Promise<GLTF>;
const cache=new Map<string,Promise<GLTF>>();
const cachedLoad:Load=url=>{
  let pending=cache.get(url);
  if(!pending){pending=new GLTFLoader().loadAsync(url);pending.catch(()=>cache.delete(url));cache.set(url,pending);}
  return pending;
};

/** Pose a generated prop from engine-observed state only; contents stay separate objects. */
export function posePropModel(id:string,model:THREE.Object3D,state:{open:boolean}){
  // Generated props face +Z; the procedural props and camera approach face -Z.
  if(id==='CHEST'){model.rotation.y=Math.PI;const hinge=model.getObjectByName('chest_lid_hinge');if(hinge)hinge.rotation.x=state.open?-1.9:0;}
}

/** Replace a prop's procedural body with a cached generated model once it loads.
 * Clones share GPU resources with the cache, so room rebuilds must skip nodes
 * marked `shared`; the procedural body remains the loading and failure fallback. */
export function mountPropModel(body:THREE.Object3D,url:string,pose:(model:THREE.Object3D)=>void=()=>{},load:Load=cachedLoad){
  let disposed=false;
  load(url).then(gltf=>{
    if(disposed||!body.parent)return;
    const model=gltf.scene.clone(true);model.traverse(node=>{node.userData.shared=true;});pose(model);
    body.visible=false;body.parent.add(model);
  },()=>{});
  return {dispose(){disposed=true;}};
}

/** Free every cached model when the presenter is destroyed. */
export function releasePropModels(){
  for(const pending of cache.values())void pending.then(gltf=>gltf.scene.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;node.geometry.dispose();
    for(const material of Array.isArray(node.material)?node.material:[node.material]){
      for(const value of Object.values(material))if(value instanceof THREE.Texture)value.dispose();material.dispose();
    }
  }),()=>{});
  cache.clear();
}
