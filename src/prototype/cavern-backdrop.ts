import * as THREE from 'three';
import gardenUrl from '../../games/zork2/assets/skyboxes/cave-garden/reference-v1.png?url';
import {gardenSceneOffset} from './garden-scene.ts';
import cavernUrl from './assets/cavern-skybox-v1.png?url';
import lairUrl from './assets/lair-skybox-v1.png?url';
import barrowUrl from './assets/barrow-skybox-v1.png?url';

type View={lit:boolean;room:{id:string}|null};
type Key='cavern'|'barrow'|'lair'|'garden';
type Load=(ready:(texture:THREE.Texture)=>void,failed:()=>void,key:Key)=>void;
const keyFor=(view:View):Key|null=>!view.lit?null:gardenSceneOffset(view.room?.id??null)?'garden':view.room?.id==='DRAGON-LAIR'?'lair':view.room?.id==='INSIDE-BARROW'?'barrow':
  ['NARROW-TUNNEL','FOOT-BRIDGE','GREAT-CAVERN','SHALLOW-FORD'].includes(view.room?.id??'')?'cavern':null;
/** Distant painted shells only; never add interaction targets or lighting. */
export function mountCavernBackdrop(scene:THREE.Scene,load:Load=(ready,failed,key)=>{
  new THREE.TextureLoader().load(key==='garden'?gardenUrl:key==='barrow'?barrowUrl:key==='lair'?lairUrl:cavernUrl,ready,undefined,failed);
}){
  const entries=new Map<Key,{pending:boolean;failed:boolean;texture?:THREE.Texture}>();
  let wanted:Key|null=null,disposed=false;
  const apply=()=>{scene.background=wanted?entries.get(wanted)?.texture??null:null;};
  return {
    update(view:View){
      if(disposed)return;
      const key=keyFor(view);
      if(key&&!entries.has(key))entries.set(key,{pending:false,failed:false});
      const entry=key?entries.get(key):undefined;
      if(entry&&key!==wanted)entry.failed=false;
      wanted=key;apply();
      if(!key||!entry||entry.texture||entry.pending||entry.failed)return;
      entry.pending=true;
      load(loaded=>{
        if(disposed){loaded.dispose();return;}
        loaded.mapping=THREE.EquirectangularReflectionMapping;loaded.colorSpace=THREE.SRGBColorSpace;
        entry.texture=loaded;entry.pending=false;apply();
      },()=>{entry.pending=false;entry.failed=true;if(!disposed)apply();},key);
    },
    dispose(){if(disposed)return;disposed=true;wanted=null;scene.background=null;for(const entry of entries.values())entry.texture?.dispose();entries.clear();},
  };
}
