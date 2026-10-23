import type { Operand, Selection } from './action-plan.ts';
import type { ActionFamily } from './candidates.ts';
import type { LoadedGame } from './bundle-loader.ts';
import type { WorldState } from './world-state.ts';
import { decodeZText } from './text.ts';

/** Names for already scoped operands only. No descriptions or handler output. */
export interface LabelContext {player:string;names:Readonly<Record<string,string>>}
const identity=(operand:Operand)=>typeof operand==='string'?operand:'pseudo' in operand?operand.pseudo.room+'/'+operand.pseudo.word:operand.object;
const words=(value:string)=>value.replace(/^[#$]+/,'').replace(/[-_]+/g,' ').toLowerCase();
const title=(value:string)=>{const text=words(value);return text.charAt(0).toUpperCase()+text.slice(1);};
const defaultContext:LabelContext={player:'PLAYER',names:{}};
export function operandLabel(operand:Operand,context:LabelContext=defaultContext):string {
  if(typeof operand!=='string'&&'pseudo' in operand)return words(operand.pseudo.word);
  return context.names[identity(operand)]?.trim()||words(identity(operand))||'object';
}
export function selectionLabel(selection:Selection,context:LabelContext=defaultContext):string {
  return selection==='ALL'?'all objects':Array.isArray(selection)?selection.map(o=>operandLabel(o,context)).join(', ')||'no objects':operandLabel(selection,context);
}
const actorPrefix=(actor:string,context:LabelContext)=>actor==='PLAYER'||actor===context.player?'':`${context.names[actor]?.trim()||words(actor)} — `;
/** Source lexical spelling and prepositions distinguish syntax; never infer an answer. */
export function actionLabel(family:ActionFamily,actor:string,operands:readonly Selection[]=[],selectedWords?:readonly string[],context:LabelContext=defaultContext):string {
  let head=title(family.lexicalTable),body='';
  for(const [index,slot] of family.slots.entries()){
    const prep=slot.preposition?words(slot.preposition):'';
    if(index===0&&prep)head+=' '+prep;
    const target=operands[index]===undefined?'[object]':selectionLabel(operands[index]!,context);
    body+=(index===0?'':prep?' '+prep+' ':' / ')+target;
  }
  if(family.input==='say')body+=(body?' ':'')+(selectedWords?.length?'“'+selectedWords.map(words).join(' ')+'”':'[words]');
  return actorPrefix(actor,context)+head+(body?': '+body:'');
}
export function walkLabel(actor:string,direction:string,context:LabelContext=defaultContext):string {
  return actorPrefix(actor,context)+'Go: '+words(direction);
}
/** Reads live short-name bytes for supplied identities, never ZIL or remote contents. */
export function createLabelContext(game:LoadedGame,world:WorldState,actor:string,operands:readonly Operand[]):LabelContext {
  if(game.buildHash!==world.buildHash)throw new Error('Label world belongs to another build');
  const entities=new Map(game.bundle.payload.world.entities.map(e=>[e.name,e.id]));
  const player=game.bundle.payload.world.entities.find(e=>e.id===world.global('PLAYER'))!.name;
  const names:Record<string,string>={};
  for(const name of new Set([actor,player,...operands.filter(o=>typeof o==='string'||!('pseudo' in o)).map(identity)])){
    const id=entities.get(name);if(id===undefined)throw new Error('Unknown label entity '+name);
    const address=game.bundle.payload.memory.objects.find(o=>o.id===id)!.propertyTable;
    names[name]=decodeZText(a=>world.getByte(a),address+1,world.getByte(address));
  }
  return {player,names};
}
