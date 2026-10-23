import type { ScopeObservation } from './scope.ts';
import type { LoadedGame } from './bundle-loader.ts';
export interface RememberedObject {id:string;name:string}
/** Learn only at committed boundaries; queries cannot change this history. */
export function rememberObjects(previous:readonly RememberedObject[],observation:ScopeObservation):RememberedObject[] {
  const names=new Map(previous.map(o=>[o.id,o.name]));
  for(const o of observation.objects)if(o.visible||o.carried)names.set(o.id,o.name.trim()||o.id.toLowerCase().replaceAll('-',' '));
  return [...names].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([id,name])=>({id,name}));
}
export function validateObjectMemory(game:LoadedGame,memory:readonly RememberedObject[]):void {
  const objects=new Set(game.bundle.payload.world.entities.filter(e=>e.kind==='object').map(e=>e.name));
  if(memory.some((o,i)=>!objects.has(o.id)||!o.name.trim()||o.name.length>2048||i>0&&memory[i-1]!.id>=o.id))throw new Error('Invalid saved object memory');
}
