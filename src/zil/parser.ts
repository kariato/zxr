import { assertFullyLoweredLogic, logicExpressions } from './logic.ts';
import type { LinkedLogic, LogicExpression, LogicRoutine } from './logic.ts';
import type { MemoryImage } from './memory.ts';
import type { Span } from './ast.ts';
import { validateMemoryImage } from './memory.ts';
import { ZilError } from './diagnostics.ts';

type Expression=LogicExpression;
export interface RoutineEffects {
  globalWrites:string[];memoryWrites:string[];objectWrites:string[];host:string[];output:boolean;random:boolean;
}
export interface ParserRoutine {
  name:string;id:number;source:Span;policy:'adapter'|'kept'|'replaced-middle';reasons:string[];
  calls:string[];closure:string[];direct:RoutineEffects;effects:RoutineEffects;
}
export interface ParserSplit {
  format:'zxr-parser-split-v1';semantics:'zxr-zork2-semantics-v1';
  routines:ParserRoutine[];runtimeRoutineIds:number[];adapterRoutineId:number;
  indirect:{routine:string;source:Span;kind:string;targets:string[]}[];
  routineValues:{name:string;source:Span;owner:string}[];
  consumers:{routine:string;global:string;mode:string;source:Span;ledger:string;plan:string}[];
  reads:{routine:string;source:Span;policy:'adapter-input'|'pending-decision'}[];
  limits:string[];
}
export interface ParserProgram {format:'zxr-parser-program-v1';semantics:'zxr-zork2-semantics-v1';routines:LogicRoutine[];partition:ParserSplit;strings:LinkedLogic['strings']}
const sorted=(values:Iterable<string>)=>[...new Set(values)].sort();
const empty=():RoutineEffects=>({globalWrites:[],memoryWrites:[],objectWrites:[],host:[],output:false,random:false});
const fixedValue=(e:Expression|undefined)=>e?.op==='literal'||e?.op==='symbol'?e.value:undefined;

/** Partition only after complete memory linking. No routines execute during this analysis. */
export function splitParserLibrary(logic:LinkedLogic,memory:MemoryImage):ParserProgram {
  assertFullyLoweredLogic(logic);validateMemoryImage(memory);
  const fail=(message:string,source:Span):never=>{throw new ZilError('ZIL012',message,source);};
  const byName=new Map(logic.routines.map(r=>[r.name,r])),byId=new Map(logic.routines.map(r=>[r.id,r]));
  const parser=logic.routines.filter(r=>r.source.file==='gparser.zil'),parserNames=new Set(parser.map(r=>r.name)),adapter=byName.get('PARSER');
  if(!adapter||!parserNames.has('PARSER'))throw new Error('Parser split requires the PARSER adapter entry');
  if(byName.size!==logic.routines.length||byId.size!==logic.routines.length)throw new Error('Parser split requires unique routine names/IDs');
  const expressions=new Map(logic.routines.map(r=>[r.name,[...logicExpressions(r)]]));
  const calls=new Map(logic.routines.map(r=>[r.name,sorted(expressions.get(r.name)!.filter(e=>e.op==='call').map(e=>{
    const target=byName.get(e.routine.name);if(!target||target.id!==e.routine.id)fail('Invalid direct routine reference '+e.routine.name,e.source);return e.routine.name;
  }))]));
  const keep=new Map<string,Set<string>>();
  const retain=(name:string,reason:string)=>{if(!parserNames.has(name)||name==='PARSER')return;const reasons=keep.get(name) ?? new Set<string>();reasons.add(reason);keep.set(name,reasons);};
  for(const name of ['MANY-CHECK','TAKE-CHECK','LIT?','META-LOC','GLOBAL-CHECK','UNKNOWN-WORD','CANT-USE']){
    if(!parserNames.has(name))throw new Error('Missing required adapter helper '+name);retain(name,'adapter-helper');
  }
  for(const r of logic.routines)if(!parserNames.has(r.name))for(const c of calls.get(r.name)!)retain(c,'external-call:'+r.name);
  let changed=true;
  while(changed){const size=keep.size;for(const name of [...keep.keys()])for(const c of calls.get(name)!)retain(c,'helper-call:'+name);changed=size!==keep.size;}
  const removed=new Set(parser.filter(r=>r.name!=='PARSER'&&!keep.has(r.name)).map(r=>r.name));
  const routineValues:ParserSplit['routineValues']=[];
  const reference=(name:string,source:Span,owner:string)=>{
    if(!byName.has(name))return fail('Unknown first-class routine '+name,source);
    if(removed.has(name)||name==='PARSER')return fail('First-class reference reaches replaced parser routine '+name+'; classify before compiling',source);
    routineValues.push({name,source,owner});
  };
  for(const r of logic.routines)for(const e of expressions.get(r.name)!)if(e.op==='symbol'&&e.kind==='routine'){
    if(byName.get(e.name)?.id!==e.value)fail('Invalid first-class routine ID '+e.name,e.source);reference(e.name,e.source,r.name);
  }
  for(const s of memory.segments)for(const f of s.fields)if(f.domain==='routine'&&f.target!==undefined){
    const id=f.width===1?memory.bytes[s.base+f.offset]!:memory.bytes[s.base+f.offset]!*256+memory.bytes[s.base+f.offset+1]!;
    if(byName.get(f.target)?.id!==id)throw new Error('Parser split: memory routine ID mismatch '+f.target);
    reference(f.target,s.source ?? adapter.source,s.name);
  }
  const allTargets=sorted(routineValues.map(v=>v.name)),indirect:ParserSplit['indirect']=[];
  for(const r of logic.routines)for(const e of expressions.get(r.name)!)if(e.op==='apply'){
    const value=e.routine;let kind:string,targets=allTargets;
    if(value.op==='symbol'&&value.kind==='routine'){kind='named-routine';targets=[value.name];}
    else if(value.op==='literal'&&value.value===0){kind='null-routine';targets=[];}
    else if(value.op==='object'&&value.operator==='GETP'&&value.args[1]?.op==='symbol'&&value.args[1].kind==='property'&&['P?ACTION','P?CONTFCN','P?DESCFCN'].includes(value.args[1].name))kind='property:'+value.args[1].name;
    else if(value.op==='memory'&&value.operator==='GET'&&value.args[0]?.op==='load'&&value.args[0].variable.scope==='global'&&['ACTIONS','PREACTIONS'].includes(value.args[0].variable.name))kind='dispatch:'+value.args[0].variable.name;
    else if(r.name==='CLOCKER'&&value.op==='memory'&&value.operator==='GET'&&value.args[0]?.op==='load'&&value.args[0].variable.scope==='local'&&value.args[0].variable.name==='C'&&value.args[1]?.op==='symbol'&&value.args[1].name==='C-RTN'&&fixedValue(value.args[1])===2)kind='clock-record';
    else if(r.name==='V-WALK'&&value.op==='memory'&&value.operator==='GET'&&value.args[0]?.op==='load'&&value.args[0].variable.scope==='local'&&value.args[0].variable.name==='PT'&&value.args[1]?.op==='symbol'&&value.args[1].name==='FEXITFCN'&&fixedValue(value.args[1])===0)kind='functional-exit';
    else return fail('Unclassified indirect call in '+r.name+'; review its routine-value domain',e.source);
    indirect.push({routine:r.name,source:e.source,kind,targets});
  }
  // First-class targets form an intentional over-approximation, not a points-to proof.
  const edges=new Map(logic.routines.map(r=>[r.name,sorted([...calls.get(r.name)!,...indirect.filter(s=>s.routine===r.name).flatMap(s=>s.targets)])]));
  for(const r of logic.routines)if(!removed.has(r.name)&&r.name!=='PARSER')for(const c of edges.get(r.name)!)if(removed.has(c)||c==='PARSER'&&r.name!=='MAIN-LOOP-1')fail('Retained routine '+r.name+' reaches replaced parser entry '+c,r.source);
  const effects=analyzeEffects(logic.routines,expressions,indirect);
  const closure=(name:string)=>{const seen=new Set<string>(),queue=[...edges.get(name)!];while(queue.length){const n=queue.pop()!;if(seen.has(n))continue;seen.add(n);queue.push(...edges.get(n)!);}return sorted(seen);};
  const consumers:ParserSplit['consumers']=[],reads:ParserSplit['reads']=[];
  for(const r of logic.routines)for(const e of expressions.get(r.name)!){
    if(!parserNames.has(r.name)&&['load','store','update-compare','variable-number'].includes(e.op)){
      const v=(e as Extract<Expression,{op:'load'|'store'|'update-compare'|'variable-number'}>).variable;
      if(v.scope==='global'&&['P-LEXV','P-CONT'].includes(v.name)){
        if(e.op==='store'&&fixedValue(e.value)!==0)fail('Unclassified continuation/buffer assignment in '+r.name,e.source);
        const site={routine:r.name,global:v.name,mode:e.op,source:e.source};
        try {consumers.push({...site,...parserConsumerPlan(site)});}catch(error){fail(error instanceof Error?error.message:String(error),e.source);}
      }
    }
    if(e.op==='suspend'&&e.operator==='READ'){
      if(!['PARSER','YES?','FINISH'].includes(r.name))fail('Unclassified READ site in '+r.name,e.source);
      reads.push({routine:r.name,source:e.source,policy:r.name==='PARSER'?'adapter-input':'pending-decision'});
    }
  }
  const partition:ParserSplit={format:'zxr-parser-split-v1',semantics:logic.semantics,
    routines:parser.map(r=>({name:r.name,id:r.id,source:r.source,policy:r.name==='PARSER'?'adapter':keep.has(r.name)?'kept':'replaced-middle',reasons:r.name==='PARSER'?['explicit-options-adapter']:sorted(keep.get(r.name) ?? ['typed-input-middle']),calls:calls.get(r.name)!,closure:closure(r.name),direct:effects.direct.get(r.name)!,effects:effects.total.get(r.name)!})),
    runtimeRoutineIds:logic.routines.filter(r=>!parserNames.has(r.name)||keep.has(r.name)).map(r=>r.id),adapterRoutineId:adapter.id,indirect,routineValues,consumers,reads,
    limits:['Effects are flow-insensitive may-effects, including defaults, all branches and recursive callees. They do not establish reachability or purity.',
      'Memory bases are symbolic runtime global values, argument slots, allocation names or unknown. They may alias; unknown means any memory, including global slots. Named globalWrites covers explicit variable writes, not every possible raw-memory alias.',
      'Indirect targets conservatively include every named first-class routine in IR and initial memory. New unknown APPLY domains and first-class references to removed parser entries fail. Runtime must reject unknown/replaced IDs, including numeric or corrupted references.',
      'All translated routines are prohibited in options queries. Kept parser helpers execute only inside action/adapter transactions. No engine or parser adapter executes in this stage.']};
  return {format:'zxr-parser-program-v1',semantics:logic.semantics,routines:logic.routines.filter(r=>partition.runtimeRoutineIds.includes(r.id)),partition,strings:logic.strings};
}

/** Future dispatch boundary: preserve original IDs, intercept PARSER, reject removed entries. */
export function resolveParserEntry(program:ParserProgram,id:number,context:'action'|'options',call?:{kind:'direct';caller:string}):{kind:'adapter'}|{kind:'routine';routine:LogicRoutine}|null {
  if(context==='options')throw new Error('Translated routines cannot run during options queries');
  if(id===0)return null;
  if(id===program.partition.adapterRoutineId){
    if(call?.kind!=='direct'||call.caller!=='MAIN-LOOP-1')throw new Error('PARSER requires the MAIN-LOOP-1 direct adapter boundary');
    return {kind:'adapter'};
  }
  const routine=program.routines.find(r=>r.id===id);if(!routine)throw new Error('Unknown or replaced routine ID '+id);
  return {kind:'routine',routine};
}

function analyzeEffects(routines:LogicRoutine[],expressions:Map<string,Expression[]>,indirect:ParserSplit['indirect']){
  const direct=new Map<string,RoutineEffects>(),total=new Map<string,RoutineEffects>(),originsByRoutine=new Map<string,(e:Expression|undefined)=>string[]>();
  for(const r of routines){
    const nodes=expressions.get(r.name)!,locals=new Map<number,Set<string>>(),globals=new Map<string,Set<string>>();
    for(const b of r.bindings)if(b.kind==='required'||b.kind==='optional')locals.set(b.slot,new Set(['argument:'+b.slot]));
    const origins=(e:Expression|undefined):string[]=>{
      if(!e)return ['unknown'];
      if(e.op==='load')return e.variable.scope==='global'?sorted(['global:'+e.variable.name,...globals.get(e.variable.name) ?? []]):[...locals.get(e.variable.number) ?? []];
      if(e.op==='address')return ['allocation:'+e.allocation];
      if(e.op==='store')return origins(e.value);
      if(e.op==='memory'&&['REST','BACK'].includes(e.operator))return origins(e.args[0]);
      if(e.op==='primitive'&&['+','-'].includes(e.operator))return sorted(e.args.flatMap(origins));
      if(e.op==='object'&&e.operator==='GETPT')return ['property:'+(e.args[1]?.op==='symbol'?e.args[1].name:'unknown')];
      if(e.op==='literal'||e.op==='symbol'||e.op==='variable-number'||e.op==='string')return [];
      return ['unknown'];
    };
    const add=<K extends string|number>(map:Map<K,Set<string>>,key:K,values:string[])=>{const old=map.get(key) ?? new Set<string>();const size=old.size;for(const v of values)old.add(v);map.set(key,old);return old.size!==size;};
    let changed=true;while(changed){changed=false;
      for(const b of [...r.bindings,...nodes.filter(e=>e.op==='block').flatMap(e=>e.bindings)])if(b.initializer)changed=add(locals,b.slot,origins(b.initializer))||changed;
      for(const e of nodes)if(e.op==='store')changed=(e.variable.scope==='local'?add(locals,e.variable.number,origins(e.value)):add(globals,e.variable.name,origins(e.value)))||changed;
    }
    const bases=(e:Expression|undefined)=>{const values=origins(e);return values.length?values:['unknown'];};originsByRoutine.set(r.name,bases);
    const d=empty();for(const e of nodes){
      if((e.op==='store'||e.op==='update-compare')&&e.variable.scope==='global')d.globalWrites.push(e.variable.name);
      if(e.op==='memory'&&['PUT','PUTB'].includes(e.operator))d.memoryWrites.push(...bases(e.args[0]));
      if(e.op==='object'&&['MOVE','REMOVE','PUTP','FSET','FCLEAR'].includes(e.operator))d.objectWrites.push(e.operator);
      if(e.op==='suspend'||e.op==='unsupported-host')d.host.push(e.operator);
      if(e.op==='suspend'&&e.operator==='READ')d.memoryWrites.push(...e.args.flatMap(bases));
      if(e.op==='output')d.output=true;if(e.op==='random')d.random=true;
    }
    for(const k of ['globalWrites','memoryWrites','objectWrites','host'] as const)d[k]=sorted(d[k]);direct.set(r.name,d);total.set(r.name,JSON.parse(JSON.stringify(d)) as RoutineEffects);
  }
  let changed=true;while(changed){changed=false;
    for(const r of routines){const next=JSON.parse(JSON.stringify(direct.get(r.name)!)) as RoutineEffects,bases=originsByRoutine.get(r.name)!;
      const merge=(name:string,args:Expression[])=>{const callee=total.get(name)!;next.globalWrites.push(...callee.globalWrites);next.objectWrites.push(...callee.objectWrites);next.host.push(...callee.host);next.output ||= callee.output;next.random ||= callee.random;
        for(const base of callee.memoryWrites){if(base.startsWith('argument:'))next.memoryWrites.push(...bases(args[Number(base.slice(9))-1]));
          else if(base.startsWith('global:'))next.memoryWrites.push(...bases({op:'load',variable:{scope:'global',name:base.slice(7),number:0},source:r.source}));
          else next.memoryWrites.push(base);}
      };
      for(const e of expressions.get(r.name)!){if(e.op==='call')merge(e.routine.name,e.args);else if(e.op==='apply')for(const target of indirect.find(s=>s.routine===r.name&&s.source.start.offset===e.source.start.offset)!.targets)merge(target,e.args);}
      for(const k of ['globalWrites','memoryWrites','objectWrites','host'] as const)next[k]=sorted(next[k]);
      if(JSON.stringify(next)!==JSON.stringify(total.get(r.name))){total.set(r.name,next);changed=true;}
    }
  }
  return {direct,total};
}

export function parserConsumerPlan(site:{routine:string;global:string;mode:string}){
  const plans:Record<string,{ledger:string;plan:string}>={
    GO:{ledger:'ADAPT-004',plan:'Preserve initial P-LEXV capacity setup before the first adapter input.'},
    FINISH:{ledger:'ADAPT-005',plan:'Pending RESTART/RESTORE/QUIT choice fills one dictionary-backed READ response, then resumes FINISH unchanged.'},
    'YES?':{ledger:'ADAPT-005',plan:'Pending YES/NO choice fills one dictionary-backed READ response, then resumes YES? unchanged.'},
    'V-INCANT':{ledger:'ADAPT-006',plan:'Quoted say/incant option supplies a vocabulary word at P-CONT; preserve its dictionary address in SPELL-USED and translated resets.'},
    'V-SAY':{ledger:'ADAPT-007',plan:'Quoted say option supplies canonical P-LEXV records and P-CONT. Preserve HELLO continuation and wand delegation; handlers own cancellation.'},
    'RIDDLE-ROOM-FCN':{ledger:'ADAPT-008',plan:'Quoted say/answer option supplies dictionary words at P-CONT and P-CONT+2. Keep WELL in either tested position and retain failure responses.'},
    'V-TELL':{ledger:'ADAPT-009',plan:'Actor option uses the original two-pass TELL continuation. Continue only if translated V-TELL leaves P-CONT live; preserve refusal resets.'},
  };
  if(plans[site.routine])return plans[site.routine]!;
  if(site.global==='P-CONT'&&site.mode==='store')return {ledger:'ADAPT-010',plan:'Keep translated continuation cancellation at this exact handler/turn-loop site; the adapter must not restore or pre-clear it.'};
  throw new Error('Unclassified parser consumer '+site.routine+' '+site.global+' '+site.mode);
}
