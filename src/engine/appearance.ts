import type { LoadedGame } from './bundle-loader.ts';
import type { WorldState } from './world-state.ts';
import { queryScope } from './scope.ts';
import type { ScopeObservation } from './scope.ts';

export interface ObjectAppearance {id:string;open:boolean|null;on:boolean|null}
export interface AppearanceObservation {perception:ScopeObservation;appearance:ObjectAppearance[]}
/** Observable surface state only. No lock state, arbitrary flags/globals,
 * remote actor view or unobserved container contents. No handlers are run. */
export function queryAppearance(game:LoadedGame,world:WorldState):AppearanceObservation {
  const perception=queryScope(game,world).observation;
  const entities=new Map(game.bundle.payload.world.entities.map(e=>[e.name,e]));
  const flags=new Map(game.bundle.payload.symbols.symbols.filter(s=>s.kind==='attribute').map(s=>[s.name,s.number!]));
  const flag=(id:number,name:string)=>{const bit=flags.get(name);return bit===undefined?null:world.hasFlag(id,bit);};
  const appearance=perception.objects.filter(o=>o.visible&&perception.lit).map(o=>{
    const entity=entities.get(o.id)!,declared=new Set(entity.flags.map(f=>f.name));
    const openable=!declared.has('ACTORBIT')&&!declared.has('SURFACEBIT')&&(declared.has('DOORBIT')||declared.has('CONTBIT'));
    return {id:o.id,open:openable?flag(entity.id,'OPENBIT'):null,
      on:declared.has('LIGHTBIT')?flag(entity.id,'ONBIT'):null};
  });
  return {perception,appearance};
}
