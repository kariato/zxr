import type * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

/** Vite emits the pinned local Basis JS/WASM alongside the app, including Pages. */
export function createRoomAssetLoader(renderer:THREE.WebGLRenderer){
  const textures=new KTX2Loader().setWorkerLimit(2).detectSupport(renderer);
  const loader=new GLTFLoader().setKTX2Loader(textures).setMeshoptDecoder(MeshoptDecoder);
  return {
    load(url:string,ready:(model:GLTF)=>void,failed:()=>void){loader.load(url,ready,undefined,failed);},
    dispose(){textures.dispose();},
  };
}
