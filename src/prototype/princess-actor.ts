import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { addPrincess } from './lair.ts';

type Load = (url:string,ready:(gltf:GLTF)=>void,failed:()=>void)=>void;
export type PrincessStatus = 'loading'|'ready'|'failed';

/** Own the model, animation and GPU resources for one visible princess instance. */
function release(root:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
  root.traverse(node=>{
    if(node instanceof THREE.Mesh){
      geometries.add(node.geometry);
      for(const material of Array.isArray(node.material)?node.material:[node.material]){
        materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
      }
    }
    if(node instanceof THREE.SkinnedMesh)skeletons.add(node.skeleton);
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());skeletons.forEach(s=>s.dispose());root.clear();root.removeFromParent();
}

/** URL is supplied explicitly by the local preview; restricted assets are never bundled. */
export function mountPrincessActor(parent:THREE.Group,url:string,status:(state:PrincessStatus)=>void=()=>{},load:Load=(url,ready,failed)=>{
  new GLTFLoader().load(url,ready,undefined,failed);
}){
  const fallback=new THREE.Group();parent.add(fallback);addPrincess(fallback);
  let disposed=false,model:THREE.Group|undefined,mixer:THREE.AnimationMixer|undefined,idle:THREE.AnimationAction|undefined,talk:THREE.AnimationAction|undefined;
  status('loading');
  load(url,gltf=>{
    if(disposed){release(gltf.scene);return;}
    release(fallback);model=gltf.scene;
    // The GLB faces +Z; the lair camera approaches from -Z.
    model.rotation.y=Math.PI-.12;parent.add(model);
    mixer=new THREE.AnimationMixer(model);
    const idleClip=gltf.animations.find(c=>c.name==='Idle'),talkClip=gltf.animations.find(c=>c.name==='Talk');
    if(idleClip){idle=mixer.clipAction(idleClip);idle.play();}
    if(talkClip){talk=mixer.clipAction(talkClip);talk.setLoop(THREE.LoopOnce,1);talk.clampWhenFinished=true;}
    mixer.addEventListener('finished',event=>{if(event.action===talk){talk?.fadeOut(.25);idle?.reset().fadeIn(.25).play();}});
    status('ready');
  },()=>{if(!disposed)status('failed');});
  return {
    update(dt:number){if(!disposed)mixer?.update(dt);},
    gesture(){if(disposed||!talk)return;idle?.fadeOut(.25);talk.reset().fadeIn(.25).play();},
    idle(){if(disposed)return;talk?.fadeOut(.25);idle?.reset().fadeIn(.25).play();},
    dispose(){if(disposed)return;disposed=true;mixer?.stopAllAction();if(model){mixer?.uncacheRoot(model);release(model);}release(fallback);},
  };
}
