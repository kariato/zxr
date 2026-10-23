import type { LoadedGame } from './bundle-loader.ts';
import type { Operand } from './action-plan.ts';
import type { SyntaxRow, SyntaxRule } from '../zil/vocabulary.ts';
import type { LogicExpression } from '../zil/logic.ts';
import { logicExpressions } from '../zil/logic.ts';

export const DISPATCH_LAYERS = ['actor', 'room', 'preaction', 'indirect', 'container', 'direct', 'default', 'pseudo'] as const;
export type DispatchLayer = typeof DISPATCH_LAYERS[number];
export interface RankEvidence { layer:DispatchLayer; owner:string; handler:string; mentions:string[]; dynamic:boolean }
export interface CandidateSlot {
  preposition:string|null;
  /** An omitted-operand inference hint, never an eligibility condition. */
  find:string|null;
  possession:SyntaxRule[];
  scopeHints:SyntaxRule[];
  many:boolean;
}
export interface ActionFamily {
  id:string; lexicalTable:string; syntax:number; verb:string; slots:CandidateSlot[];
  handler:string; preaction:string|null;
  input:'act'|'say';
  /** Retained for audit; the action planner accepts the first matching row. */
  shadowedBy:string|null;
}
interface Handler { owner:string; property:'ACTION'|'CONTFCN'; routine:string; dynamic:boolean }
export interface HandlerProfile { routine:string; actions:{verb:string; mentions:string[]}[] }
export interface DynamicAssignment { writer:string; target:string; property:string; handlers:string[]; unresolved:boolean }
export interface CandidateCatalog {
  format:'zxr-candidates-v1'; buildHash:string; families:ActionFamily[]; directions:string[];
  handlers:Handler[]; profiles:HandlerProfile[]; dynamicAssignments:DynamicAssignment[];
  /** Indirect APPLY targets cannot be proved statically. They do not remove candidates. */
  unresolvedApplies:{routine:string; line:number}[];
}
const isSymbol=(e:LogicExpression|undefined,kind:string):e is Extract<LogicExpression,{op:'symbol'}>=>e?.op==='symbol'&&e.kind===kind;
const familyId=(verb:string,row:number)=>verb+':'+row;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const slot=(row:SyntaxRow):CandidateSlot[]=>row.slots.map(s=>({preposition:s.preposition?.name??null,find:s.find?.name??null,
  possession:s.rules.filter(r=>r==='HAVE'||r==='TAKE'),scopeHints:s.rules.filter(r=>['HELD','CARRIED','ON-GROUND','IN-ROOM'].includes(r)),many:s.rules.includes('MANY')}));

/** Read-only analysis of compiled IR. No interpreter, speculative turns or handler execution. */
export function buildCandidateCatalog(game:LoadedGame):CandidateCatalog {
  const p=game.bundle.payload;
  const families=p.vocabulary.verbs.flatMap(v=>v.rows.map(row=>{
    const first=v.rows.find(r=>r.slots.length===row.slots.length&&r.slots.every((s,i)=>(s.preposition?.number??0)===(row.slots[i]?.preposition?.number??0)))!;
    return {id:familyId(v.name,row.id),lexicalTable:v.name,syntax:row.id,verb:row.action.name,slots:slot(row),
      handler:p.vocabulary.actions.find(a=>a.number===row.action.number)!.routine.name,preaction:row.preaction?.name??null,
      input:['SAY','ANSWER','INCANT'].includes(row.action.name)?'say' as const:'act' as const,shadowedBy:first===row?null:familyId(v.name,first.id)};
  }));
  const handlers:Handler[]=[],dynamicAssignments:DynamicAssignment[]=[],unresolvedApplies:CandidateCatalog['unresolvedApplies']=[];
  for(const e of p.world.entities)for(const property of e.properties){
    if(property.kind==='routine'&&property.routine&&['ACTION','CONTFCN'].includes(property.property.name))
      handlers.push({owner:e.name,property:property.property.name as Handler['property'],routine:property.routine.name,dynamic:false});
    if(property.kind==='pseudos')for(const pseudo of property.entries)
      handlers.push({owner:e.name+'/'+pseudo.word.name,property:'ACTION',routine:pseudo.routine.name,dynamic:false});
  }
  const graph=new Map<string,Set<string>>(),mentions=new Map<string,Map<string,Set<string>>>();
  for(const r of p.logic.routines){
    const calls=new Set<string>(),actions=new Map<string,Set<string>>();
    for(const e of logicExpressions(r)){
      if(isSymbol(e,'action'))actions.set(e.name.slice(2),new Set([r.name]));
      if(e.op==='call'&&e.routine.name!=='PERFORM')calls.add(e.routine.name);
      if(e.op==='apply'){
        if(isSymbol(e.routine,'routine'))calls.add(e.routine.name);
        else unresolvedApplies.push({routine:r.name,line:e.source.start.line});
      }
      if(e.op==='object'&&e.operator==='PUTP'&&isSymbol(e.args[1],'property')&&['P?ACTION','P?CONTFCN'].includes(e.args[1].name)){
        const target=e.args[0],value=e.args[2]!,property=e.args[1].name.slice(2),knownTarget=isSymbol(target,'object')||isSymbol(target,'room');
        // Unknown values/targets conservatively include every routine literal in the writer.
        const targets=knownTarget?[target.name]:p.world.entities.map(o=>o.name);
        const routines=isSymbol(value,'routine')?[value.name]:value.op==='literal'&&value.value===0?[]:
          [...new Set([...logicExpressions(r)].filter(n=>isSymbol(n,'routine')).map(n=>(n as Extract<LogicExpression,{op:'symbol'}>).name))];
        dynamicAssignments.push({writer:r.name,target:knownTarget?target.name:'*',property,handlers:routines,unresolved:!knownTarget||!(isSymbol(value,'routine')||value.op==='literal'&&value.value===0)});
        for(const owner of targets)for(const routine of routines)if(!handlers.some(h=>h.owner===owner&&h.property===property&&h.routine===routine))
          handlers.push({owner,property:property as Handler['property'],routine,dynamic:true});
      }
    }
    graph.set(r.name,calls);mentions.set(r.name,actions);
  }
  // Monotone closure handles recursive helpers, retaining the actual mentioning routine.
  let changed=true;
  while(changed){changed=false;for(const [name,calls] of graph)for(const callee of calls)for(const [action,witnesses] of mentions.get(callee)??[]){
    const own=mentions.get(name)!,set=own.get(action)??new Set<string>();own.set(action,set);
    for(const witness of witnesses)if(!set.has(witness)){set.add(witness);changed=true;}
  }}
  const profiles=[...mentions].map(([routine,actions])=>({routine,actions:[...actions].sort(([a],[b])=>compare(a,b)).map(([verb,witnesses])=>({verb,mentions:[...witnesses].sort()}))}));
  return {format:'zxr-candidates-v1',buildHash:game.buildHash,families,directions:p.vocabulary.directions.map(d=>d.name),handlers,profiles,dynamicAssignments,unresolvedApplies};
}

/** Explicit input from the scope query (4.2). It contains no inferred visibility rules. */
export interface CandidateScope {
  actor:string; room:string; operands:Operand[];
  /** Current immediate parents; do not use initial parents after objects have moved. */
  parents:Record<string,string|null>;
  remembered?:string[];
  held?:string[]; carried?:string[]; onGround?:string[]; inRoom?:string[];
}
export interface RankedOperand { operand:Operand; score:number; evidence:RankEvidence[]; hints:string[];remembered?:boolean;placement?:'primary'|'more';gates?:string[] }
export interface CandidateFamily extends ActionFamily {
  score:number; evidence:RankEvidence[];
  placement?:'primary'|'more';gates?:string[];
  /** Independent slot lists, never a Cartesian product. Selection does not commit an action. */
  operands:RankedOperand[][];
}
export interface CandidateSet {
  buildHash:string; actor:string; families:CandidateFamily[];
  exits:{kind:'walk';actor:string;direction:string;placement?:'primary'|'more';gates?:string[]}[];
}
const operandOwner=(operand:Operand)=>typeof operand==='string'?operand:'pseudo' in operand?operand.pseudo.room+'/'+operand.pseudo.word:operand.object;
const weights:Record<DispatchLayer,number>={actor:100,room:100,preaction:10,indirect:100,container:100,direct:100,default:1,pseudo:100};
/** Candidate membership depends only on supplied scope, never FIND, possession, rank or handler results. */
export function generateCandidates(game:LoadedGame,catalog:CandidateCatalog,scope:CandidateScope):CandidateSet {
  if(catalog.buildHash!==game.buildHash)throw new Error('Candidate catalog belongs to another build');
  const entities=new Map(game.bundle.payload.world.entities.map(e=>[e.name,e]));
  if(!entities.has(scope.actor)||entities.get(scope.room)?.kind!=='room')throw new Error('Unknown candidate actor or room');
  for(const operand of scope.operands){
    const owner=operandOwner(operand);
    if(typeof operand!=='string'&&'pseudo' in operand){
      if(!catalog.handlers.some(h=>h.owner===owner))throw new Error('Unknown candidate pseudo '+owner);
    }else if(!entities.has(owner))throw new Error('Unknown candidate operand '+owner);
  }
  for(const [owner,parent] of Object.entries(scope.parents)){
    if(!entities.has(owner)&&!catalog.handlers.some(h=>h.owner===owner))throw new Error('Unknown candidate parent owner '+owner);
    if(parent!==null&&!entities.has(parent))throw new Error('Unknown candidate parent '+parent);
  }
  const profiles=new Map(catalog.profiles.map(p=>[p.routine,new Map(p.actions.map(a=>[a.verb,a.mentions]))]));
  const evidence=(verb:string,layer:DispatchLayer,owner:string,property:Handler['property']='ACTION'):RankEvidence[]=>catalog.handlers
    .filter(h=>h.owner===owner&&h.property===property&&profiles.get(h.routine)?.has(verb))
    .map(h=>({layer,owner,handler:h.routine,mentions:[...profiles.get(h.routine)!.get(verb)!],dynamic:h.dynamic}));
  const score=(items:RankEvidence[])=>items.reduce((sum,e)=>sum+weights[e.layer],0);
  const families=catalog.families.map(f=>{
    // PERFORM dispatches M-BEG through LOC WINNER, which can be a vehicle/container.
    const actorLocation=scope.parents[scope.actor]??scope.room;
    const shared=[...evidence(f.verb,'actor',scope.actor),...evidence(f.verb,'room',actorLocation)];
    for(const [layer,routine] of [['preaction',f.preaction],['default',f.handler]] as const){
      if(routine)shared.push({layer,owner:f.verb,handler:routine,mentions:[...(profiles.get(routine)?.get(f.verb)??[])],dynamic:false});
    }
    const operands=f.slots.map((slot,index)=>scope.operands.map(operand=>{
      const owner=operandOwner(operand),pseudo=typeof operand!=='string'&&'pseudo' in operand;
      const items=[...evidence(f.verb,pseudo?'pseudo':index===0?'direct':'indirect',owner)];
      const parent=scope.parents[owner];if(index===0&&parent)items.push(...evidence(f.verb,'container',parent,'CONTFCN'));
      const sources:Record<string,string[]|undefined>={HELD:scope.held,CARRIED:scope.carried,'ON-GROUND':scope.onGround,'IN-ROOM':scope.inRoom};
      const hints=slot.scopeHints.filter(h=>sources[h]?.includes(owner));
      const owned:Operand=typeof operand==='string'?operand:'pseudo' in operand?{pseudo:{...operand.pseudo}}:{...operand};
      return {operand:owned,score:score(items)+hints.length-(scope.remembered?.includes(owner)?10000:0),evidence:items,hints,...(scope.remembered?.includes(owner)?{remembered:true}:{})};
    }).sort((a,b)=>b.score-a.score||compare(operandOwner(a.operand),operandOwner(b.operand))));
    return {...f,slots:f.slots.map(s=>({...s,possession:[...s.possession],scopeHints:[...s.scopeHints]})),
      score:score(shared)+operands.reduce((sum,list)=>sum+(list[0]?.score??0),0),evidence:shared,operands};
  }).sort((a,b)=>b.score-a.score||compare(a.id,b.id));
  return {buildHash:game.buildHash,actor:scope.actor,families,exits:catalog.directions.map(direction=>({kind:'walk',actor:scope.actor,direction}))};
}
