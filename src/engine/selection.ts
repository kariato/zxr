import { actionLabel, operandLabel, walkLabel } from './labels.ts';
import type { LabelContext } from './labels.ts';
import { prepareOperand, selectionSchema } from './action-plan.ts';
import type { GameAction, Operand, Selection } from './action-plan.ts';
import type { LoadedGame } from './bundle-loader.ts';
import type { ActionFamily, CandidateSet, CandidateSlot, RankedOperand } from './candidates.ts';
import { canonicalJson } from '../zil/integrity.ts';
import type { Schema } from '../zil/schema.ts';
import { buildWordCatalog, pickedWords, wordPage } from './word-picker.ts';
import type { WordCatalog, WordChoice, WordPage } from './word-picker.ts';

export interface SelectionRequest {expected:{epoch:number;revision:number};actor:string;family:string;operands:Selection[];words?:number[]}
export interface OperandChoice extends RankedOperand {label:string;spellings:Operand[]}
export interface SelectionView {
  expected:{epoch:number;revision:number};actor:string;family:string;selected:Selection[];
  label:string;ready:boolean;next:{index:number;slot:CandidateSlot;choices:OperandChoice[];allowAll:boolean}|null;
  words?:WordChoice[];wordPicker?:WordPage;
  placement?:'primary'|'more';gates?:string[];
}
const counter:Schema={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
export const selectionRequestSchema:Schema={type:'object',additionalProperties:false,required:['expected','actor','family','operands'],properties:{
  expected:{type:'object',additionalProperties:false,required:['epoch','revision'],properties:{epoch:counter,revision:counter}},
  actor:{type:'string',pattern:'^[A-Z][A-Z0-9?.!\\-]{0,63}$'},family:{type:'string',pattern:'^[A-Za-z0-9?.!:\\-]{1,128}$'},
  operands:{type:'array',items:selectionSchema,maxItems:2},
  words:{type:'array',items:{type:'integer',minimum:1},maxItems:57},
}};
export const operandIdentity=(operand:Operand)=>typeof operand==='string'?operand:'pseudo' in operand?operand.pseudo.room+'/'+operand.pseudo.word:operand.object;
const multiple=(selection:Selection)=>selection==='ALL'||Array.isArray(selection)&&selection.length>1;
const own=<T>(value:T):T=>JSON.parse(canonicalJson(value)) as T;

/** Source spellings only; no ID minting, world execution, speculative scope search or RNG. */
export function operandSpellings(game:LoadedGame,operand:Operand):Operand[] {
  if(typeof operand!=='string')return [own(operand)];
  const e=game.bundle.payload.world.entities.find(e=>e.name===operand)!;
  const nouns=e.properties.flatMap(p=>p.kind==='words'&&p.property.name==='SYNONYM'?p.words:[]);
  const adjectives=e.properties.flatMap(p=>p.kind==='adjectives'?p.adjectives:[]);
  const proposed:Operand[]=[...adjectives.flatMap(a=>nouns.map(n=>({object:operand,noun:n.name,adjective:a.name}))),operand,
    ...nouns.map(n=>({object:operand,noun:n.name})),...adjectives.map(a=>({object:operand,adjective:a.name}))];
  return proposed.filter(value=>{try{prepareOperand(game,value);return true;}catch{return false;}});
}
/** Validate a partial selection against the freshly generated actor-relative families. */
export function reviewSelection(game:LoadedGame,set:CandidateSet,request:SelectionRequest,catalog:WordCatalog=buildWordCatalog(game.bundle.payload.vocabulary),labels?:LabelContext):SelectionView {
  if(set.buildHash!==game.buildHash)throw new Error('Selection candidates belong to another build');
  if(request.family.startsWith('walk:')){
    if(!set.exits.some(e=>request.family==='walk:'+e.direction))throw new Error('Unknown walk selection');
    if(request.operands.length)throw new Error('Walk selection has no operands');
    if(request.words!==undefined)throw new Error('Walk selection has no words');
    return {expected:own(request.expected),actor:request.actor,family:request.family,label:walkLabel(request.actor,request.family.slice(5),labels),selected:[],ready:true,next:null};
  }
  const family=set.families.find(f=>f.id===request.family);
  if(!family)throw new Error('Unknown action family');
  if(family.shadowedBy)throw new Error('Action syntax is shadowed by '+family.shadowedBy);
  if(family.input!=='say'&&request.words!==undefined)throw new Error('Action family has no word selection');
  if(request.operands.length>family.slots.length)throw new Error('Too many selected operands');
  const selected=request.operands.map((selection,index):Selection=>{
    const slot=family.slots[index]!;
    if(multiple(selection)&&!slot.many)throw new Error('Syntax slot does not allow multiple objects');
    if(selection==='ALL')return selection;
    const values=Array.isArray(selection)?selection:[selection],identities=values.map(operandIdentity);
    if(new Set(identities).size!==identities.length)throw new Error('Duplicate selected operand');
    const normalized=values.map(value=>{
      if(!family.operands[index]!.some(o=>operandIdentity(o.operand)===operandIdentity(value)))throw new Error('Selected operand is outside actor scope');
      const spelling=typeof value==='string'?operandSpellings(game,value)[0]:value;
      if(!spelling)throw new Error('Selected operand has no supported source spelling');
      prepareOperand(game,spelling);return own(spelling);
    });return Array.isArray(selection)?normalized:normalized[0]!;
  });
  if(selected.filter(multiple).length>1)throw new Error('Unsupported simultaneous multiplicity');
  const pseudos=selected.flatMap(s=>s==='ALL'?[]:(Array.isArray(s)?s:[s]).filter(o=>typeof o!=='string'&&'pseudo' in o).map(operandIdentity));
  if(new Set(pseudos).size>1)throw new Error('Different pseudo features share one runtime object');
  const nextIndex=selected.length,slot=family.slots[nextIndex];
  const choices=slot?family.operands[nextIndex]!.map(o=>{
    const spellings=operandSpellings(game,o.operand);return {...own(o),label:operandLabel(o.operand,labels),operand:own(spellings[0]??o.operand),spellings};
  }):[];
  const words=family.input==='say'?pickedWords(catalog,request.words??[]):undefined;
  return {expected:own(request.expected),actor:request.actor,family:request.family,label:actionLabel(family,request.actor,selected,words?.map(w=>w.word),labels),selected,ready:!slot&&(words===undefined||words.length>0),
    next:slot?{index:nextIndex,slot:own(slot),choices,allowAll:slot.many&&!selected.some(multiple)}:null,
    ...(words===undefined?{}:{words,wordPicker:wordPage(catalog)})};
}
/** Called only at commit after review against fresh scope and session identity. */
export function selectedAction(view:SelectionView,families:readonly ActionFamily[]):GameAction {
  if(!view.ready)throw new Error('Selection is incomplete');
  if(view.family.startsWith('walk:'))return {kind:'walk',actor:view.actor,direction:view.family.slice(5)};
  const f=families.find(f=>f.id===view.family);if(!f)throw new Error('Unknown action family');
  if(f.input==='say'){
    if(view.selected.length>1||Array.isArray(view.selected[0])||view.selected[0]==='ALL')throw new Error('Unsupported quoted operand selection');
    return {kind:'say',actor:view.actor,lexicalTable:f.lexicalTable,syntax:f.syntax,verb:f.verb,words:view.words!.map(w=>w.word),
      ...(view.selected[0]===undefined?{}:{prso:own(view.selected[0])})};
  }
  return {kind:'act',actor:view.actor,lexicalTable:f.lexicalTable,syntax:f.syntax,verb:f.verb,
    ...(view.selected[0]===undefined?{}:{prso:own(view.selected[0])}),...(view.selected[1]===undefined?{}:{prsi:own(view.selected[1])})};
}
