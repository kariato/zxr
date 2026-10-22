import { ZilError } from './diagnostics.ts';
import type { MappedRoutine } from './source-maps.ts';
import { logicExpressions } from './logic.ts';
export interface ParserAdapter {name:'PARSER';id:number;entry:MappedRoutine;checks:MappedRoutine}
/** Source-derived fragments, deliberately not an executable replacement for the complete parser. */
export function projectParserAdapter(parser:MappedRoutine):ParserAdapter {
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
  return {name:'PARSER',id:parser.id,entry,checks:epilogue};
}
