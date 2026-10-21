import { readFileSync } from 'node:fs';
import { expandMacros,loadProgram,head,atomName,print } from '../../src/zil/index.ts';
import { sourceFiles } from './program.ts';
import { loadSymbols,sha256 } from '../reference/symbols.ts';
export interface ExpansionCheck {routine:string;expanded:string[];assembly:string[];review:string}
export function expansionSamples() {
  const checks=JSON.parse(readFileSync('reference/expansion-checks.json','utf8')) as ExpansionCheck[];
  if(checks.length!==20 || new Set(checks.map(c=>c.routine)).size!==20)throw new Error('Twenty distinct expansion samples required');
  const program=loadProgram(sourceFiles()),expanded=expandMacros(program.forms,program.definitions,program.globals),symbols=loadSymbols();
  return checks.map(check=>{
    const node=expanded.forms.find(n=>head(n)==='ROUTINE'&&n.kind==='form'&&atomName(n.items[1])===check.routine);
    if(!node)throw new Error('Missing expansion sample '+check.routine);
    const source=print(node)+'\n',routine=symbols.routines.find(r=>r.name===check.routine)!;
    const lines=readFileSync(routine.file,'utf8').split('\n').slice(routine.line-1),next=lines.findIndex((line,i)=>i>0&&line.includes('.FUNCT'));
    const assembly=lines.slice(0,next<0?undefined:next).join('\n');
    for(const anchor of check.expanded)if(!source.includes(anchor))throw new Error(`${check.routine}: missing expanded anchor ${anchor}`);
    for(const anchor of check.assembly)if(!assembly.includes(anchor))throw new Error(`${check.routine}: missing assembly anchor ${anchor}`);
    return {name:check.routine,source,sourceSpan:node.span,expandedHash:sha256(source),assemblyFile:routine.file,assemblyLine:routine.line,assemblyHash:sha256(assembly),review:check.review};
  });
}
