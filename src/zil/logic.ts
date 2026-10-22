import { atomName, head } from './ast.ts';
import type { MacroOrigin, Node, Sequence, Span } from './ast.ts';
import { ZilError } from './diagnostics.ts';
import { compileStringPool } from './strings.ts';
import type { StringPool } from './strings.ts';
import { decodeZilText } from './text.ts';
import { print } from './printer.ts';
import { RUNTIME_OPERATIONS } from './operations.ts';
import type { LocalDefinition, SymbolAnalysis, SymbolDefinition } from './symbols.ts';

export const CORE_OPERATIONS=('+ - * / MOD BAND BOR BTST EQUAL? ==? N==? L? G? 0? ZERO? 1? NOT '+
  'IGRTR? DLESS? SET SETG VALUE COND AND OR PROG REPEAT RETURN AGAIN RTRUE RFALSE PUSH RSTACK APPLY').split(' ');
interface Site { source:Span; origin?:MacroOrigin[] }
export type Variable = {scope:'local';name:string;number:number}|{scope:'global';name:string;number:number};
export type ReturnTarget = {kind:'routine'}|{kind:'block';id:number};
export interface LogicBinding extends Site {name:string;slot:number;kind:LocalDefinition['kind'];initializer:LogicExpression|null}
export interface LogicCommand extends Site {op:'evaluate';expression:LogicExpression}
export type LogicExpression = Site & (
  | {op:'literal';value:number}
  | {op:'symbol';name:string;kind:Exclude<SymbolDefinition['kind'],'global'|'word'>;value:number}
  | {op:'variable-number';variable:Variable}
  | {op:'load';variable:Variable}
  | {op:'store';variable:Variable;value:LogicExpression}
  | {op:'update-compare';operator:'IGRTR?'|'DLESS?';variable:Variable;bound:LogicExpression}
  | {op:'value';variable:LogicExpression}
  | {op:'primitive';operator:string;args:LogicExpression[]}
  | {op:'and'|'or';args:LogicExpression[]}
  | {op:'cond';clauses:{test:LogicExpression;body:LogicCommand[]}[]}
  | {op:'block';kind:'prog'|'repeat';id:number;bindings:LogicBinding[];body:LogicCommand[]}
  | {op:'return';target:ReturnTarget;value:LogicExpression}
  | {op:'again';target:ReturnTarget}
  | {op:'push';value:LogicExpression}
  | {op:'return-stack'}
  | {op:'call';routine:{name:string;id:number};args:LogicExpression[]}
  | {op:'apply';routine:LogicExpression;args:LogicExpression[]}
  | {op:'string';handle:number}
  | {op:'memory';operator:'GET'|'PUT'|'GETB'|'PUTB'|'REST'|'BACK';args:LogicExpression[]}
  | {op:'address';value:number;allocation:string;addend:number;name:string;tableConstructor?:string}
  | {op:'object';operator:string;args:LogicExpression[]}
  | {op:'output';operator:string;args:LogicExpression[]}
  | {op:'random';bound:LogicExpression}
  | {op:'suspend';operator:'READ'|'SAVE'|'RESTORE'|'RESTART'|'QUIT';args:LogicExpression[]}
  | {op:'verify'}
  | {op:'unsupported-host';operator:'DIRIN'|'DIROUT';args:LogicExpression[]}
  | {op:'untranslated';construct:string;phase:'2.6'|'2.7';sourceText:string;args:LogicExpression[]}
);
export interface LogicRoutine extends Site {
  name:string;id:number;required:number;optional:number;slotCount:number;
  bindings:LogicBinding[];body:LogicCommand[];fullyLowered:boolean;
}
export interface UntranslatedSite extends Site {routine:string;construct:string;phase:'2.6'|'2.7'}
export interface CoreLogic {
  format:'zxr-logic-core-v1';semantics:'zxr-zork2-semantics-v1';stage:'core';
  routines:LogicRoutine[];untranslated:UntranslatedSite[];
}
export interface OperationsLogic {
  format:'zxr-logic-v1';semantics:'zxr-zork2-semantics-v1';stage:'operations';
  routines:LogicRoutine[];untranslated:UntranslatedSite[];strings:StringPool;
}
export interface LinkedLogic extends Omit<OperationsLogic,'stage'> {stage:'linked'}
export const OBJECT_OPERATIONS={LOC:1,'FIRST?':1,'NEXT?':1,'IN?':2,MOVE:2,REMOVE:1,FSET:2,FCLEAR:2,'FSET?':2,GETP:2,PUTP:3,GETPT:2,PTSIZE:1,NEXTP:2} as const;
export const OUTPUT_OPERATIONS={PRINT:1,PRINTI:1,PRINTB:1,PRINTC:1,PRINTD:1,PRINTN:1,CRLF:0} as const;
const memory=new Set(['GET','PUT','GETB','PUTB','REST','BACK','TABLE','LTABLE','ITABLE']);
const primitives=new Set(['+','-','*','/','MOD','BAND','BOR','BTST','EQUAL?','==?','N==?','L?','G?','0?','ZERO?','1?','NOT']);
const declaration=(n:Node)=>n.kind==='typed'&&atomName(n.tag)==='DECL';

/** Partial, non-executable IR. Every deferred construct remains explicit; no game logic is dropped. */
export function translateCoreLogic(forms:readonly Node[],analysis:SymbolAnalysis):CoreLogic {
  return {format:'zxr-logic-core-v1',semantics:'zxr-zork2-semantics-v1',stage:'core',...lowerLogic(forms,analysis)};
}
export function translateLogic(forms:readonly Node[],analysis:SymbolAnalysis):OperationsLogic {
  const strings=compileStringPool(forms);
  return {format:'zxr-logic-v1',semantics:'zxr-zork2-semantics-v1',stage:'operations',...lowerLogic(forms,analysis,strings),strings};
}
function lowerLogic(forms:readonly Node[],analysis:SymbolAnalysis,strings?:StringPool) {
  const handles=new Map(strings?.entries.map(e=>[e.text,e.id]));
  if(analysis.diagnostics.length){const d=analysis.diagnostics[0]!;throw new ZilError(d.code,d.message,d.span);}
  const symbols=new Map(analysis.symbols.map(s=>[s.name,s])),runtime=new Set(RUNTIME_OPERATIONS);
  const routines:LogicRoutine[]=[],untranslated:UntranslatedSite[]=[];
  const fail=(message:string,node:Node|Span):never=>{throw new ZilError('ZIL009',message,'span' in node?node.span:node);};
  const numeric=(s:SymbolDefinition,node:Node)=>s.number ?? fail(`Unallocated numeric reference ${s.name}`,node);
  const site=(node:Node):Site=>({source:node.span,...(node.origin?{origin:node.origin}:{})});
  for(const form of forms){
    if(head(form)!=='ROUTINE')continue;const f=form as Sequence,name=atomName(f.items[1])!;
    const record=analysis.routines.find(r=>r.name===name),symbol=symbols.get(name);
    if(!record||!symbol||symbol.kind!=='routine')fail(`Missing resolved routine ${name}`,form);
    const scopeRecord=record!;
    // Numeric VALUE uses the V3 variable-number domain: locals 1..15, globals 16+.
    if(scopeRecord.locals.length>15)fail(`Routine ${name} exceeds 15 local variable numbers`,form);
    let nextSlot=0,nextBlock=0;
    type Scope=Map<string,LocalDefinition>;
    const literal=(value:number,node:Node):LogicExpression=>({op:'literal',value:value&65535,...site(node)});
    const variable=(node:Node,scope:Scope,globalOnly=false,localOnly=false):Variable=>{
      const key=atomName(node);if(!key)return fail('Expected a named variable',node);
      const local=scope.get(key);if(local&&!globalOnly)return {scope:'local',name:key,number:local.slot};
      const s=symbols.get(key);if(localOnly||!s||s.kind!=='global')return fail(`Unknown ${localOnly?'local':'global'} variable ${key}`,node);
      return {scope:'global',name:key,number:numeric(s,node)};
    };
    const deferred=(construct:string,phase:'2.6'|'2.7',node:Node,args:LogicExpression[]=[]):LogicExpression=>{
      untranslated.push({routine:name,construct,phase,...site(node)});
      return {op:'untranslated',construct,phase,sourceText:print(node),args,...site(node)};
    };
    const body=(nodes:readonly Node[],scope:Scope,blocks:number[]):LogicCommand[]=>nodes.filter(n=>!declaration(n)).map(n=>({op:'evaluate',expression:expression(n,scope,blocks),...site(n)}));
    const bindings=(node:Node|undefined,scope:Scope,blocks:number[],block:boolean):LogicBinding[]=>{
      if(node?.kind!=='list')return fail('Expected a binding list',node ?? form);
      let kind:LocalDefinition['kind']=block?'block':'required';const result:LogicBinding[]=[];
      for(const n of node.items){
        if(n.kind==='string'){kind=n.value==='OPTIONAL'?'optional':'aux';continue;}
        const key=n.kind==='list'?atomName(n.items[0]):atomName(n);if(!key)return fail('Expected a binding name',n);
        // Initializers see earlier bindings, before their own name shadows an outer variable.
        const initializer=n.kind==='list'?expression(n.items[1]!,scope,blocks):kind==='required'?null:literal(0,n);
        const definition=scopeRecord.locals[nextSlot++];
        if(!definition||definition.name!==key||definition.kind!==kind)return fail(`Local scope mismatch for ${name}.${key}`,n);
        scope.set(key,definition);result.push({name:key,slot:definition.slot,kind,initializer,...site(n)});
      }
      return result;
    };
    const expression=(node:Node,scope:Scope,blocks:number[]):LogicExpression=>{
      if(node.kind==='number')return literal(node.value,node);
      if(node.kind==='character'){
        const code=node.value==='\n'||node.value==='\r'?13:node.value.codePointAt(0)!;
        if(node.value.length!==1||code<13||(code>13&&code<32)||code>126)return fail('Unsupported ZSCII character literal',node);
        return literal(code,node);
      }
      if(node.kind==='string'){
        if(!strings)return deferred('string','2.6',node);
        const handle=handles.get(decodeZilText(node.value));if(handle===undefined)return fail('String literal is absent from the shared pool',node);
        return {op:'string',handle,...site(node)};
      }
      if(node.kind==='typed')return fail(`Typed ${atomName(node.tag) ?? '(non-atom)'} is not a supported routine expression`,node);
      if(node.kind==='prefix'||node.kind==='atom'){
        const reference=node.kind==='prefix'?node.value:node,key=atomName(reference);
        if(!key)return fail('Expected a reference name',node);
        if(node.kind==='prefix'&&node.operator==='local')return {op:'load',variable:variable(reference,scope,false,true),...site(node)};
        if(node.kind==='prefix'&&node.operator!=='global')return fail(`Unsupported expression prefix ${node.operator}`,node);
        const local=scope.get(key);
        // Comma references always select the global namespace, even with a shadowing local.
        if(node.kind==='atom'&&local)return {op:'variable-number',variable:variable(node,scope),...site(node)};
        const s=symbols.get(key);if(!s)return fail(`Undefined reference ${key}`,node);
        if(s.kind==='global')return {op:node.kind==='prefix'?'load':'variable-number',variable:variable(reference,scope,true),...site(node)};
        if(s.kind==='word')return deferred('dictionary-address','2.7',node);
        return {op:'symbol',name:s.name,kind:s.kind,value:numeric(s,node),...site(node)};
      }
      if(node.kind!=='form')return fail(`Unexpected executable ${node.kind}`,node);
      if(!node.items.length)return literal(0,node);
      const op=head(node);if(!op)return fail('Expected a named call head',node);
      const args=node.items.slice(1),arity=(min:number,max=min)=>{if(args.length<min||args.length>max)fail(`${op} expects ${min===max?min:`${min}..${max}`} argument(s), got ${args.length}`,node);};
      const lower=()=>args.map(n=>expression(n,scope,blocks));
      if(primitives.has(op)){
        if(op==='+'||op==='*')arity(2,65535);else if(op==='-')arity(1,2);else if(op==='EQUAL?')arity(2,4);
        else if(['0?','ZERO?','1?','NOT'].includes(op))arity(1);else arity(2);
        return {op:'primitive',operator:op,args:lower(),...site(node)};
      }
      if(op==='SET'||op==='SETG'){
        arity(2);const target=variable(args[0]!,scope,op==='SETG',op==='SET');
        return {op:'store',variable:target,value:expression(args[1]!,scope,blocks),...site(node)};
      }
      if(op==='IGRTR?'||op==='DLESS?'){
        arity(2);return {op:'update-compare',operator:op,variable:variable(args[0]!,scope),bound:expression(args[1]!,scope,blocks),...site(node)};
      }
      if(op==='VALUE'){arity(1);return {op:'value',variable:expression(args[0]!,scope,blocks),...site(node)};}
      if(op==='AND'||op==='OR')return {op:op==='AND'?'and':'or',args:lower(),...site(node)};
      if(op==='COND')return {op:'cond',clauses:args.map(c=>{
        if(c.kind!=='list'||!c.items.length)return fail('Expected a nonempty COND clause',c);
        return {test:atomName(c.items[0])==='ELSE'?literal(1,c.items[0]!):expression(c.items[0]!,scope,blocks),body:body(c.items.slice(1),scope,blocks)};
      }),...site(node)};
      if(op==='PROG'||op==='REPEAT'){
        arity(1,65535);const id=++nextBlock,nested=new Map(scope),targets=[...blocks,id],locals=bindings(args[0],nested,targets,true);
        return {op:'block',kind:op==='PROG'?'prog':'repeat',id,bindings:locals,body:body(args.slice(1),nested,targets),...site(node)};
      }
      if(op==='RETURN'||op==='RTRUE'||op==='RFALSE'){
        arity(0,op==='RETURN'?1:0);const block=blocks.at(-1),target:ReturnTarget=op==='RETURN'&&block!==undefined?{kind:'block',id:block}:{kind:'routine'};
        const value=op==='RFALSE'?literal(0,node):args[0]?expression(args[0],scope,blocks):literal(1,node);
        return {op:'return',target,value,...site(node)};
      }
      if(op==='AGAIN'){arity(0);const block=blocks.at(-1);return {op:'again',target:block===undefined?{kind:'routine'}:{kind:'block',id:block},...site(node)};}
      if(op==='PUSH'){arity(1);return {op:'push',value:expression(args[0]!,scope,blocks),...site(node)};}
      if(op==='RSTACK'){arity(0);return {op:'return-stack',...site(node)};}
      if(op==='APPLY'){arity(1,65535);return {op:'apply',routine:expression(args[0]!,scope,blocks),args:args.slice(1).map(n=>expression(n,scope,blocks)),...site(node)};}
      if(strings){
        if(Object.hasOwn(OBJECT_OPERATIONS,op)){arity(OBJECT_OPERATIONS[op as keyof typeof OBJECT_OPERATIONS]);return {op:'object',operator:op,args:lower(),...site(node)};}
        if(Object.hasOwn(OUTPUT_OPERATIONS,op)){
          arity(OUTPUT_OPERATIONS[op as keyof typeof OUTPUT_OPERATIONS]);
          if(op==='PRINTI'&&args[0]?.kind!=='string')return fail('PRINTI requires a literal string',node);
          return {op:'output',operator:op,args:lower(),...site(node)};
        }
        if(op==='RANDOM'){arity(1);return {op:'random',bound:expression(args[0]!,scope,blocks),...site(node)};}
        if(op==='READ'||op==='SAVE'||op==='RESTORE'||op==='RESTART'||op==='QUIT'){
          arity(op==='READ'?2:0);return {op:'suspend',operator:op,args:lower(),...site(node)};
        }
        if(op==='VERIFY'){arity(0);return {op:'verify',...site(node)};}
        if(op==='DIRIN'||op==='DIROUT'){arity(1);return {op:'unsupported-host',operator:op,args:lower(),...site(node)};}
      }
      if(memory.has(op))return deferred(op,'2.7',node,['TABLE','LTABLE','ITABLE'].includes(op)?[]:lower());
      if(runtime.has(op))return deferred(op,'2.6',node,lower());
      const callee=symbols.get(op),signature=analysis.routines.find(r=>r.name===op);
      if(!callee||callee.kind!=='routine'||!signature)return fail(`Unknown routine or operation ${op}`,node);
      arity(signature.required,signature.required+signature.optional);
      return {op:'call',routine:{name:op,id:numeric(callee,node)},args:lower(),...site(node)};
    };
    const scope:Scope=new Map(),locals=bindings(f.items[2],scope,[],false),commands=body(f.items.slice(3),scope,[]);
    if(nextSlot!==scopeRecord.locals.length)fail(`Unconsumed local definitions for ${name}`,form);
    routines.push({name,id:numeric(symbol!,form),required:scopeRecord.required,optional:scopeRecord.optional,slotCount:nextSlot,bindings:locals,body:commands,fullyLowered:!untranslated.some(s=>s.routine===name),...site(form)});
  }
  routines.sort((a,b)=>a.id-b.id);
  return {routines,untranslated};
}

/** Preorder traversal of expressions, including parameter defaults and block initializers. */
export function* logicExpressions(routine:LogicRoutine):Generator<LogicExpression> {
  function* bindings(items:LogicBinding[]):Generator<LogicExpression>{for(const b of items)if(b.initializer)yield* visit(b.initializer);}
  function* body(items:LogicCommand[]):Generator<LogicExpression>{for(const c of items)yield* visit(c.expression);}
  function* visit(e:LogicExpression):Generator<LogicExpression>{
    yield e;
    switch(e.op){
      case 'store':case 'push':case 'return':yield* visit(e.value);break;
      case 'random':case 'update-compare':yield* visit(e.bound);break;
      case 'value':yield* visit(e.variable);break;
      case 'memory':case 'object':case 'output':case 'suspend':case 'unsupported-host':case 'primitive':case 'and':case 'or':case 'call':case 'untranslated':for(const a of e.args)yield* visit(a);break;
      case 'apply':yield* visit(e.routine);for(const a of e.args)yield* visit(a);break;
      case 'cond':for(const c of e.clauses){yield* visit(c.test);yield* body(c.body);}break;
      case 'block':yield* bindings(e.bindings);yield* body(e.body);break;
    }
  }
  yield* bindings(routine.bindings);yield* body(routine.body);
}

/** A partial artifact cannot be accepted as fully translated logic. This does not certify runtime conformance. */
export function assertFullyLoweredLogic(logic:CoreLogic|OperationsLogic|LinkedLogic):void {
  for(const r of logic.routines)for(const e of logicExpressions(r))if(e.op==='untranslated')throw new ZilError('ZIL009',`Deferred ${e.construct} requires step ${e.phase}`,e.source);
  if(logic.untranslated.length||logic.routines.some(r=>!r.fullyLowered))throw new Error('Inconsistent partial logic report');
}
