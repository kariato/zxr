import type { GameSession,LoadedGame,SelectionRequest } from '../engine/index.ts';
import { operandIdentity } from '../engine/index.ts';

export interface ObjectActionCatalog {buildHash:string;objects:{id:string;portable:boolean}[]}
export interface ObjectAction {buildHash:string;object:string;name:string;label:string;draft:SelectionRequest}
/** Static source traits suggest a default, never whether its attempt succeeds.
 * There is a record for every source object, including abstract/global objects;
 * only current visible observations can produce a spatial action. */
export function buildObjectActionCatalog(game:LoadedGame):ObjectActionCatalog {
  return {buildHash:game.buildHash,objects:game.bundle.payload.world.entities.filter(e=>e.kind==='object').map(e=>({
    id:e.name,portable:e.flags.some(f=>f.name==='TAKEBIT')&&!e.flags.some(f=>f.name==='ACTORBIT'),
  }))};
}

export function observeObjectActions(session:GameSession,catalog?:ObjectActionCatalog):ObjectAction[]{
  const state=session.observe();if(state.state!=='input')return [];
  const candidates=session.candidates();
  if(catalog&&catalog.buildHash!==candidates.buildHash)throw new Error('Object actions belong to another game build');
  const observed=session.observeAppearance(),profiles=new Map(catalog?.objects.map(o=>[o.id,o]));
  const appearance=new Map(observed.appearance.map(a=>[a.id,a]));
  // Match source verbs and complete one-object syntax, not label text or a
  // guessed parser command. Prefer the canonical lexical table, then stable ID.
  const canonical=(verb:string)=>verb==='LAMP-ON'?'LIGHT':verb;
  const families=candidates.families.filter(f=>!f.shadowedBy&&f.input==='act'&&f.slots.length===1&&f.slots[0]!.preposition===null)
    .sort((a,b)=>Number(b.lexicalTable===canonical(b.verb))-Number(a.lexicalTable===canonical(a.verb))||(a.id<b.id?-1:a.id>b.id?1:0));
  return observed.perception.objects.filter(o=>observed.perception.lit&&o.visible).flatMap(object=>{
    const surface=appearance.get(object.id),verbs:string[]=[];
    if(profiles.get(object.id)?.portable&&!object.carried&&object.reachable)verbs.push('TAKE');
    if(surface?.on===false&&object.carried)verbs.push('LAMP-ON');
    if(surface?.open===false&&object.reachable)verbs.push('OPEN');
    verbs.push('EXAMINE');
    for(const verb of verbs)for(const family of families.filter(f=>f.verb===verb)){
      const operand=family.operands[0]?.find(o=>operandIdentity(o.operand)===object.id);
      if(!operand)continue;
      const draft:SelectionRequest={expected:{epoch:state.epoch,revision:state.revision},actor:'PLAYER',family:family.id,operands:[operand.operand]};
      const selection=session.select(draft);
      // Do not promote a knowledge-gated action to a spatial default. The
      // complete source menu still exposes it through its existing placement.
      if(!selection.ready||selection.placement==='more'||selection.gates?.length)continue;
      return [{buildHash:candidates.buildHash,object:object.id,name:object.name,label:selection.label,draft}];
    }
    return [];
  });
}
