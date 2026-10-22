import { ZilError } from './diagnostics.ts';
import type { MappedRoutine } from './source-maps.ts';
import { logicExpressions } from './logic.ts';
export interface ParserAdapter {name:'PARSER';id:number;entry:MappedRoutine;checks:MappedRoutine;noVerb:MappedRoutine;notHere:MappedRoutine}
/** Source-derived fragments, deliberately not an executable replacement for the complete parser. */
export function projectParserAdapter(parser:MappedRoutine,syntax:MappedRoutine,getObject:MappedRoutine):ParserAdapter {
  const fail=():never=>{throw new ZilError('ZIL014','Unsupported PARSER adapter projection; review the retained source boundaries',parser.source);};
  if(parser.name!=='PARSER'||parser.required||parser.optional||parser.body.length!==17)fail();
  const mode=parser.body[10]!.expression,tail=parser.body[16]!.expression;
  if(mode.op!=='cond'||mode.clauses.length!==3||tail.op!=='cond')return fail();
  const load=(e:typeof mode.clauses[number]['test'],name:string)=>e.op==='load'&&e.variable.scope==='global'&&e.variable.name===name;
  if(!load(mode.clauses[0]!.test,'RESERVE-PTR')||!load(mode.clauses[1]!.test,'P-CONT')||!['literal','symbol'].includes(mode.clauses[2]!.test.op)||!('value' in mode.clauses[2]!.test)||mode.clauses[2]!.test.value!==1)fail();
  const terminal=tail.clauses[1]?.body.at(-1)?.expression;
  if(terminal?.op!=='cond'||terminal.clauses.length!==1)return fail();
  const checks=terminal.clauses[0]!.test;
  if(checks.op!=='and'||checks.args.length!==4||checks.args.some((e,i)=>e.op!=='call'||e.routine.name!==['SYNTAX-CHECK','SNARF-OBJECTS','MANY-CHECK','TAKE-CHECK'][i]))return fail();
  // The reserve arm is outside the public language. Runtime rejects that state before entry.
  const entry:MappedRoutine={...parser,body:[...parser.body.slice(0,10),{...parser.body[10]!,expression:{...mode,clauses:mode.clauses.slice(1)}}]};
  const checkCommand=tail.clauses[1]!.body.at(-1)!;
  const epilogue:MappedRoutine={...parser,body:[{...checkCommand,expression:{...terminal,clauses:[{...terminal.clauses[0]!,test:{...checks,args:checks.args.slice(2)}}]}}]};
  for(const r of [entry,epilogue])for(const e of logicExpressions(r)){
    if(e.op==='call'&&['STUFF','SYNTAX-CHECK','SNARF-OBJECTS','PARSER'].includes(e.routine.name))fail();
    if(e.op==='untranslated'||e.op==='unsupported-host')fail();
  }
  const first=syntax?.body[0]?.expression;
  if(syntax?.name!=='SYNTAX-CHECK'||syntax.required||syntax.optional||first?.op!=='cond'||first.clauses.length!==1)return fail();
  const test=first.clauses[0]!.test;
  if(test.op!=='primitive'||test.operator!=='ZERO?'||test.args.length!==1||test.args[0]?.op!=='store'||test.args[0].variable.scope!=='local'||test.args[0].variable.name!=='VERB'||test.args[0].value.op!=='memory'||test.args[0].value.operator!=='GET')return fail();
  const args=test.args[0].value.args,last=first.clauses[0]!.body.at(-1)?.expression;
  if(args.length!==2||args[0]?.op!=='load'||args[0].variable.scope!=='global'||args[0].variable.name!=='P-ITBL'||args[1]?.op!=='symbol'||args[1].name!=='P-VERB'||args[1].value!==0||last?.op!=='return'||last.target.kind!=='routine'||last.value.op!=='literal'||last.value.value!==0)fail();
  const noVerb:MappedRoutine={...syntax,body:syntax.body.slice(0,1)};
  // Scope has already exhausted the original local/global search. Retain only
  // GET-OBJECT's missing-match arm and its original XBITS capture.
  const loop=getObject?.body[7]?.expression,capture=getObject?.body[0];
  if(getObject?.name!=='GET-OBJECT'||getObject.required!==1||getObject.optional!==1||getObject.body.length!==8||loop?.op!=='block'||capture?.expression.op!=='store'||capture.expression.variable.scope!=='local'||capture.expression.variable.name!=='XBITS'||!load(capture.expression.value,'P-SLOCBITS'))return fail();
  const missing=loop.body[3]?.expression;
  if(missing?.op!=='cond'||missing.clauses.length!==2)return fail();
  const guard=missing.clauses[0]!.test,body=missing.clauses[0]!.body,end=body.at(-1)?.expression;
  if(guard.op!=='and'||guard.args.length!==2||guard.args[0]?.op!=='primitive'||guard.args[0].operator!=='ZERO?'||guard.args[0].args[0]?.op!=='load'||guard.args[0].args[0].variable.name!=='LEN'||guard.args[1]?.op!=='load'||guard.args[1].variable.name!=='GCHECK'||body.length!==4||end?.op!=='return'||end.target.kind!=='routine'||end.value.op!=='literal'||end.value.value!==0)return fail();
  const notHere:MappedRoutine={...getObject,body:[capture,...body]};
  if([...logicExpressions(notHere)].some(e=>e.op==='call'&&e.routine.name!=='OBJ-FOUND'||e.op==='untranslated'||e.op==='unsupported-host'))fail();
  return {name:'PARSER',id:parser.id,entry,checks:epilogue,noVerb,notHere};
}
