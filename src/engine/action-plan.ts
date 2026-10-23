import type { LoadedGame } from './bundle-loader.ts';
import type { WorldState } from './world-state.ts';
import { canonicalJson } from '../zil/integrity.ts';
import { encodeReadText } from './read-input.ts';
import type { ReadEncoding } from './read-input.ts';
import { assertSchema } from '../zil/schema.ts';
import type { Schema } from '../zil/schema.ts';

export type Operand=string|{object:string;noun:string;adjective?:string}|{object:string;adjective:string}|{pseudo:{room:string;word:string}};
export type Selection=Operand|Operand[]|'ALL';
export type ActAction={kind:'act';actor:string;verb:string;lexicalTable:string;syntax:number;prso?:Selection;prsi?:Selection};
export type WalkAction={kind:'walk';actor:string;direction:string};
export type QuotedAction=(ActAction|WalkAction)&{actor:'PLAYER'};
export type GameAction=
  | ActAction
  | WalkAction
  | {kind:'say';actor:string;verb:string;lexicalTable:string;syntax:number;words:string[];prso?:Operand;continuation?:QuotedAction};
export interface PlannedOperand {id:number;name:string;words:string[];adjective?:number;adjectiveOnly?:boolean;pseudo?:{room:number;word:string;routine:number}}
export type PlannedSelection={kind:'all'}|{kind:'objects';objects:PlannedOperand[]};
export interface ActionPlan {
  format:'zxr-action-plan-v1';buildHash:string;optionId:string;action:GameAction;
  actor:{name:string;id:number};actorPass:boolean;input:ReadEncoding;
  dispatch:{kind:'walk';action:number;direction:number}|{kind:'syntax';lexical:number;action:number;address:number;row:number};
  direct:PlannedSelection|null;indirect:PlannedSelection|null;
  clauses:{slot:0|1;preposition:number;word:string|null;start:number;end:number}[];
  speech:{continuation:number;remaining:number}|null;
  quoted?:ActionPlan;
}
const name:Schema={type:'string',pattern:'^[A-Z][A-Z0-9?!.\\-]{0,63}$',minLength:1};
const object=(properties:Record<string,Schema>,optional:Record<string,Schema>={}):Schema=>({type:'object',properties:{...properties,...optional},required:Object.keys(properties),additionalProperties:false});
export const operandSchema:Schema={anyOf:[name,object({object:name,noun:name},{adjective:name}),object({object:name,adjective:name}),object({pseudo:object({room:name,word:name})})]};
export const selectionSchema:Schema={anyOf:[operandSchema,{type:'array',items:operandSchema,minItems:1,maxItems:49}]};
const syntax={actor:name,verb:name,lexicalTable:{anyOf:[name,{const:'$VERIFY'}]} as Schema,syntax:{type:'integer',minimum:1,maximum:255} as Schema};
const continuationSchema:Schema={anyOf:[object({kind:{const:'act'},...syntax,actor:{const:'PLAYER'}},{prso:selectionSchema,prsi:selectionSchema}),object({kind:{const:'walk'},actor:{const:'PLAYER'},direction:name})]};
const actionSchema:Schema={anyOf:[object({kind:{const:'act'},...syntax},{prso:selectionSchema,prsi:selectionSchema}),object({kind:{const:'walk'},actor:name,direction:name}),object({kind:{const:'say'},...syntax,words:{type:'array',items:{type:'string',pattern:'^[A-Z0-9]{1,119}$',minLength:1},minItems:1,maxItems:57}},{prso:operandSchema,continuation:continuationSchema})]};
/** Validate a source operand spelling without creating an action or option ID. */
export function prepareOperand(game:LoadedGame,value:Operand):PlannedOperand {
  const payload=game.bundle.payload;
  const entity=(key:string)=>{const e=payload.world.entities.find(e=>e.name===key);if(!e)throw new Error('Unknown action entity '+key);return e;};
  if(typeof value!=='string'&&'pseudo' in value){
    const room=entity(value.pseudo.room),entry=room.properties.flatMap(p=>p.kind==='pseudos'?p.entries:[]).find(e=>e.word.name===value.pseudo.word),proxy=entity('PSEUDO-OBJECT');
    if(room.kind!=='room'||!entry)throw new Error('Unknown room pseudo feature');
    return {id:proxy.id,name:proxy.name,words:[entry.word.name],pseudo:{room:room.id,word:entry.word.name,routine:entry.routine.id}};
  }
  const e=entity(typeof value==='string'?value:value.object),synonyms=e.properties.find(p=>p.property.name==='SYNONYM');
  if(synonyms?.kind!=='words'||!synonyms.words.length)throw new Error('Action entity has no noun spelling '+e.name);
  const word=typeof value==='string'?synonyms.words[0]!.name:'noun' in value?value.noun:undefined;
  if(word!==undefined&&!synonyms.words.some(w=>w.name===word))throw new Error('Noun is not a source synonym of '+e.name);
  const adjective=typeof value==='string'?undefined:value.adjective;
  let adjectiveNumber:number|undefined;
  if(adjective!==undefined){
    const property=e.properties.find(p=>p.property.name==='ADJECTIVE');
    const entry=property?.kind==='adjectives'?property.adjectives.find(a=>a.name===adjective):undefined;
    if(!entry)throw new Error('Adjective is not a source adjective of '+e.name);
    adjectiveNumber=entry.number;
  }
  const words=word===undefined?[adjective!]:adjective===undefined?[word]:[adjective,word];
  for(const spelling of words){
    const tokens=encodeReadText(game,spelling).tokens,vocabulary=payload.vocabulary.words.find(w=>w.name===spelling);
    if(tokens.length!==1||!tokens[0]!.address||vocabulary?.roles.buzz)throw new Error('Unsupported noun spelling '+spelling);
  }
  return {id:e.id,name:e.name,words,...(adjectiveNumber===undefined?{}:{adjective:adjectiveNumber}),...(word===undefined?{adjectiveOnly:true}:{})};
}
/** Prepare lexical data only. It never runs routines, resolves ALL/scope, or writes parser/world state. */
export function prepareAction(game:LoadedGame,world:WorldState,input:unknown):ActionPlan {
  assertSchema(input,actionSchema,{},'action');
  return buildActionPlan(game,world,JSON.parse(canonicalJson(input)) as GameAction);
}
/** Internal diagnostic fixture only: public action names cannot contain '#'. */
export function prepareRandomDiagnostic(game:LoadedGame,world:WorldState):ActionPlan {
  const lexical=game.bundle.payload.vocabulary.verbs.find(v=>v.name==='#RANDOM'),row=lexical?.rows.find(r=>r.action.name==='RANDOM'&&r.slots.length===1);
  if(!lexical||!row)throw new Error('Missing source debug RANDOM syntax');
  return buildActionPlan(game,world,{kind:'act',actor:'PLAYER',verb:'RANDOM',lexicalTable:lexical.name,syntax:row.id,prso:{object:'INTNUM',noun:'INTNUM'}});
}
function buildActionPlan(game:LoadedGame,world:WorldState,action:GameAction):ActionPlan {
  if(world.buildHash!==game.buildHash)throw new Error('Action world belongs to another build');
  const payload=game.bundle.payload;
  const entity=(key:string)=>{const e=payload.world.entities.find(e=>e.name===key);if(!e)throw new Error('Unknown action entity '+key);return e;};
  const actorId=action.actor==='PLAYER'?world.global('PLAYER'):entity(action.actor).id,actor=payload.world.entities.find(e=>e.id===actorId);
  const actorFlag=payload.symbols.symbols.find(s=>s.name==='ACTORBIT')?.number;
  if(!actor||actor.kind!=='object'||actorFlag==null||!world.hasFlag(actor.id,actorFlag))throw new Error('Action actor is not an initialized actor');
  const noun=(value:Operand)=>prepareOperand(game,value);
  const selected=(value:Selection|undefined):PlannedSelection|null=>{
    if(value===undefined)return null;if(value==='ALL')return {kind:'all'};
    const values=Array.isArray(value)?value:[value],objects=values.map(noun);
    if(new Set(objects.map(o=>o.pseudo?'pseudo:'+o.pseudo.room+':'+o.pseudo.word:o.id)).size!==objects.length)throw new Error('Duplicate action operand');
    return {kind:'objects',objects};
  };
  let command='',dispatch:ActionPlan['dispatch'],direct:PlannedSelection|null=null,indirect:PlannedSelection|null=null,speech:ActionPlan['speech']=null;
  const clauses:ActionPlan['clauses']=[],pieces:string[]=[];
  const player=world.global('PLAYER'),actorPass=actor.id!==player;
  if(actorPass){const spelling=noun(actor.name).words.join(' ');pieces.push(spelling+',');}
  if(action.kind==='walk'){
    const direction=payload.vocabulary.directions.find(d=>d.name===action.direction),walk=payload.symbols.symbols.find(s=>s.name==='V?WALK');
    if(!direction||walk?.number===undefined||walk.number===null)throw new Error('Unknown walk direction');
    pieces.push(direction.word.name);dispatch={kind:'walk',action:walk.number,direction:direction.number};
  }else {
    const lexical=payload.vocabulary.verbs.find(v=>v.name===action.lexicalTable),row=lexical?.rows.find(r=>r.id===action.syntax);
    if(!lexical||!row||row.action.name!==action.verb)throw new Error('Action syntax/action mismatch');
    if(action.kind==='say'&&!['ANSWER','SAY','INCANT'].includes(row.action.name))throw new Error('Unsupported speech action');
    const first=lexical.rows.find(r=>r.slots.length===row.slots.length&&r.slots.every((s,i)=>(s.preposition?.number ?? 0)===(row.slots[i]?.preposition?.number ?? 0)));
    if(first?.id!==row.id)throw new Error('Action syntax is shadowed by an earlier matching row');
    const table=payload.memory.segments.find(s=>s.name==='syntax:'+lexical.name);if(!table)throw new Error('Missing action syntax allocation');
    dispatch={kind:'syntax',lexical:lexical.number,action:row.action.number,address:table.base+1+8*(row.id-1),row:row.id};
    direct=selected(action.prso);indirect=action.kind==='act'?selected(action.prsi):null;
    const selections=[direct,indirect];
    if(row.slots.length!==selections.filter(Boolean).length||indirect&&!direct)throw new Error('Action operands do not match syntax slots');
    const multiple=(s:PlannedSelection|null)=>s?.kind==='all'||s?.kind==='objects'&&s.objects.length>1;
    if(multiple(direct)&&multiple(indirect))throw new Error('Unsupported simultaneous multiplicity');
    const pseudos=selections.flatMap(s=>s?.kind==='objects'?s.objects.filter(o=>o.pseudo).map(o=>canonicalJson(o.pseudo)):[]);
    if(new Set(pseudos).size>1)throw new Error('Different pseudo features share one runtime object');
    pieces.push(lexical.word.name);
    for(const [i,slot] of row.slots.entries()){
      const selection=selections[i]!;if(!selection)throw new Error('Missing action operand');
      const prep=slot.preposition?payload.vocabulary.prepositions.find(p=>p.number===slot.preposition!.number):null;
      if(slot.preposition&&!prep)throw new Error('Missing action preposition');
      if(prep)pieces.push(prep.word.name);
      const start=encodeReadText(game,pieces.join(' ')).tokens.length;
      const spelling=selection.kind==='all'?'ALL':selection.objects.map(o=>o.words.join(' ')).join(' AND ');
      pieces.push(spelling);const end=encodeReadText(game,pieces.join(' ')).tokens.length;
      clauses.push({slot:i as 0|1,preposition:slot.preposition?.number ?? 0,word:prep?.word.name ?? null,start,end});
    }
    if(action.kind==='say')pieces.push('"'+action.words.join(' ')+'"');
  }
  command=pieces.join(' ');const encoding=encodeReadText(game,command);
  if(encoding.text.length>=world.getByte(world.global('P-INBUF'))||encoding.tokens.length>world.getByte(world.global('P-LEXV')))throw new Error('Action exceeds input buffer capacity');
  if(action.kind==='say'){
    const open=encoding.tokens.findIndex(t=>t.text==='"');speech={continuation:1+2*(open+1),remaining:action.words.length+1};
  }
  let quoted:ActionPlan|undefined;
  if(action.kind==='say'&&action.continuation){
    const command=prepareAction(game,world,action.continuation);
    if(action.continuation.kind==='act'&&['ANSWER','SAY','INCANT'].includes(action.continuation.verb))throw new Error('Unsupported quoted action');
    if(command.input.text!==action.words.join(' ').toLowerCase())throw new Error('Quoted words do not match the structured continuation');
    const start=(speech!.continuation-1)/2;
    const last=command.clauses.at(-1),selection=last?.slot===0?command.direct:command.indirect;
    const terminalMany=selection?.kind==='all'||selection?.kind==='objects'&&selection.objects.length>1;
    quoted={...command,input:encoding,clauses:command.clauses.map(c=>({...c,start:c.start+start,end:c.end+start+(c===last&&terminalMany?1:0)}))};
  }
  return {format:'zxr-action-plan-v1',buildHash:game.buildHash,optionId:'zxr-action-v1:'+canonicalJson(action),action,actor:{name:actor.name,id:actor.id},actorPass,input:encoding,dispatch,direct,indirect,clauses,speech,...(quoted?{quoted}:{})};
}
