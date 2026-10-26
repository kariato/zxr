import {walkingSurfaces} from './walking-surfaces.generated.ts';
import * as THREE from 'three';
import type {ObjectAction} from '../player/object-actions.ts';
import {mountCavernScene} from './cavern-scene.ts';

/** Surface samples converted from Blender Z-up into the exported GLB's Y-up. */
export const ravineOrigins:Record<string,readonly [number,number,number]>=Object.fromEntries(['STREAM-PATH', 'MARBLE-HALL', 'DEEP-FORD', 'RAVINE-LEDGE', 'LEDGE-TUNNEL'].map(id=>[id,walkingSurfaces[id]!.origin]));
export function ravineSceneOffset(room:string|null){
  const p=room?ravineOrigins[room]:undefined;
  return p?[-p[0],-p[1],-p[2]] as const:undefined;
}
/** Uses the same tested cancellation and shared resource lifetime as the cavern. */
export const mountRavineScene=mountCavernScene;
export function addRavineTargets(parent:THREE.Group,room:string,visible:ReadonlySet<string>,actions:readonly ObjectAction[]){
  const definitions:[string,number[],number[]][]=[['STREAM',[3,.3,2],[0,-.2,0]],['CHASM',[4,1,2],[0,-1,-1]]];
  if(room==='DEEP-FORD')definitions.push(['GLOBAL-WATER',[3,.3,2],[0,.3,0]]);
  return definitions.flatMap(([id,size,position])=>{
    if(!visible.has(id))return [];
    const target=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),new THREE.MeshBasicMaterial({visible:false}));
    target.name='source-target-'+id;target.position.set(position[0]!,position[1]!,position[2]!);target.userData.object=id;target.userData.action=actions.find(a=>a.object===id);parent.add(target);return [target];
  });
}
