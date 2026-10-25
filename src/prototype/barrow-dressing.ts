import * as THREE from 'three';
import { GLTFLoader,type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { addBarrowGuardrails } from './cavern-rocks.ts';
import { addBarrowTunnel,addBarrowTunnelGlow } from './barrow-tunnel.ts';

type Load=(url:string,ready:(gltf:GLTF)=>void,failed:()=>void)=>void;
function release(root:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(node=>{
    if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}
    if(node instanceof THREE.Sprite)materials.add(node.material);
  });
  materials.forEach(m=>{for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.clear();root.removeFromParent();
}
/** Optional local experiment. The ordinary barrow remains the loading/error fallback. */
export function mountBarrowDressing(parent:THREE.Group,url:string,width:number,depth:number,status:(state:'loading'|'ready'|'failed')=>void=()=>{},load:Load=(url,ready,failed)=>{
  new GLTFLoader().load(url,ready,undefined,failed);
}){
  const root=new THREE.Group(),fallback=new THREE.Group();parent.add(root);root.add(fallback);
  addBarrowGuardrails(fallback,width,depth);addBarrowTunnel(fallback,depth/2);
  let disposed=false;status('loading');
  load(url,gltf=>{
    if(disposed){release(gltf.scene);return;}
    release(fallback);root.add(gltf.scene);addBarrowTunnelGlow(root,depth/2);status('ready');
  },()=>{if(!disposed)status('failed');});
  return {dispose(){if(disposed)return;disposed=true;release(root);}};
}
