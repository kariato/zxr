import type { Operand, Selection } from './action-plan.ts';
import type { ActionFamily } from './candidates.ts';
import type { LoadedGame } from './bundle-loader.ts';
import type { WorldState } from './world-state.ts';
import { decodeZText } from './text.ts';

/** Names for already scoped operands only. No descriptions or handler output. */
export interface LabelTemplates {actions:Record<string,{template:string;slots:string[]}>;decisions:Record<string,string>}
export interface LabelContext {player:string;names:Readonly<Record<string,string>>;templates?:LabelTemplates}
export function validateLabelTemplates(input:LabelTemplates,families:readonly ActionFamily[]):LabelTemplates {
  const plain=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
  if(!plain(input)||Object.keys(input).sort().join(',')!=='actions,decisions'||!plain(input.actions)||!plain(input.decisions))throw new Error('Invalid label templates');
  for(const [id,value] of Object.entries(input.actions)){
    const family=families.find(f=>f.id===id&&!f.shadowedBy);if(!family||!plain(value)||Object.keys(value).sort().join(',')!=='slots,template'||typeof value.template!=='string'||!value.template.trim()||value.template.length>4000||!Array.isArray(value.slots))throw new Error('Invalid action label '+id);
    const required=[...(family.slots.length?['direct']:[]),...(family.slots.length>1?['indirect']:[]),...(family.input==='say'?['words']:[])];
    const placeholders=[...value.template.matchAll(/\{([^{}]+)\}/g)].map(m=>m[1]!);
    if(/[{}]/.test(value.template.replace(/\{([^{}]+)\}/g,''))||new Set(value.slots).size!==value.slots.length||required.some(s=>!value.slots.includes(s))||value.slots.some(s=>!['actor',...required].includes(s)||!placeholders.includes(s))||placeholders.some(s=>!value.slots.includes(s)))throw new Error('Action label slots differ '+id);
  }
  for(const [id,text] of Object.entries(input.decisions))if(!['yes-no:yes','yes-no:no','finish:restart','finish:restore','finish:quit'].includes(id)||typeof text!=='string'||!text.trim()||text.length>4000)throw new Error('Invalid decision label');
  return JSON.parse(JSON.stringify(input)) as LabelTemplates;
}
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
  const supplied=context.templates?.actions[family.id];
  if(supplied){const values:Record<string,string>={actor:actor==='PLAYER'||actor===context.player?'You':context.names[actor]??words(actor),direct:operands[0]===undefined?'[object]':selectionLabel(operands[0],context),indirect:operands[1]===undefined?'[object]':selectionLabel(operands[1],context),words:selectedWords?.length?'“'+selectedWords.map(words).join(' ')+'”':'[words]'};
    return (supplied.slots.includes('actor')?'':actorPrefix(actor,context))+supplied.template.replace(/\{([^{}]+)\}/g,(_match,slot:string)=>values[slot]!);}
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
