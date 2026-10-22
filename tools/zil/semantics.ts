import { readFileSync } from 'node:fs';
import { loadProgram, expandMacros, head, atomName, print } from '../../src/zil/index.ts';
import type { Node, Sequence } from '../../src/zil/index.ts';
import { sourceFiles } from './program.ts';
import { loadSymbols, sha256, STORY_SHA256 } from '../reference/symbols.ts';
import { primitiveGroups, scratchGroups, parserBufferGlobals, protocolGlobals, verifyPrimitiveInventory } from './semantics-contract.ts';

/** Runtime candidates only. DECL and quoted type descriptions are not instructions. */
export function* executable(nodes:readonly Node[]):Generator<Node> {
  for(const node of nodes) {
    if(node.kind==='typed' && atomName(node.tag)==='DECL') continue;
    if(node.kind==='prefix' && ['comment','quote'].includes(node.operator)) continue;
    yield node;
    if(['form','list','vector'].includes(node.kind)) yield* executable((node as Sequence).items);
    else if(node.kind==='prefix') yield* executable([node.value]);
    else if(node.kind==='typed') throw new Error(`Unclassified executable typed data at ${node.span.file}:${node.span.start.line}`);
  }
}
const site=(node:Node)=>({file:node.span.file,line:node.span.start.line,column:node.span.start.column});
export function semanticsInventory() {
  const files=sourceFiles(),p=loadProgram(files),expanded=expandMacros(p.forms,p.definitions,p.globals);
  const routines=expanded.forms.filter(n=>head(n)==='ROUTINE') as Sequence[];
  const names=new Set(routines.map(n=>atomName(n.items[1])!));
  const globals=p.forms.filter(n=>head(n)==='GLOBAL').map(n=>atomName((n as Sequence).items[1])!);
  const operations=new Map<string,{routine:string;file:string;line:number;column:number}[]>();
  const headerAccesses:{routine:string;operation:string;expression:string;file:string;line:number;column:number}[]=[];
  const parserReads:{routine:string;global:string;file:string;line:number;column:number}[]=[];
  const routineDetails=routines.map(r=>{
    const name=atomName(r.items[1])!,nodes=[...executable(r.items.slice(2))];
    const calls=new Set<string>(),writes=new Set<string>(),reads=new Set<string>(),tableWrites=new Set<string>();
    for(const n of nodes) {
      const op=head(n);
      if(n.kind==='prefix' && n.operator==='global') { const g=atomName(n.value);if(g)reads.add(g); }
      if(!op)continue;
      const form=n as Sequence;
      if(names.has(op)) calls.add(op);
      else {if(!operations.has(op))operations.set(op,[]);operations.get(op)!.push({routine:name,...site(n)});}
      if(op==='SETG') writes.add(atomName(form.items[1]) ?? '<computed>');
      if(['PUT','PUTB'].includes(op)) tableWrites.add(print(form.items[1]!));
      if(['GET','GETB','PUT','PUTB'].includes(op) && form.items[1]?.kind==='number' && form.items[1].value===0)
        headerAccesses.push({routine:name,operation:op,expression:print(n),...site(n)});
      if(!name.startsWith('P-') && r.span.file!=='gparser.zil') {
        for(const arg of form.items.slice(1))if(arg.kind==='prefix'&&arg.operator==='global'){
          const g=atomName(arg.value);if(g&&(g.startsWith('P-')||g==='QUOTE-FLAG'||g==='AGAIN-DIR'))parserReads.push({routine:name,global:g,...site(arg)});
        }
      }
    }
    return {name,...site(r),calls:[...calls].sort(),reads:[...reads].filter(g=>globals.includes(g)).sort(),writes:[...writes].sort(),tableWrites:[...tableWrites].sort()};
  });
  const sortedOps=[...operations].sort(([a],[b])=>a.localeCompare(b,'en')).map(([operation,sites])=>({operation,count:sites.length,sites}));
  verifyPrimitiveInventory(sortedOps.map(o=>o.operation));
  const parser=new Set(routineDetails.filter(r=>r.file==='gparser.zil').map(r=>r.name));
  const keep=new Set(['MANY-CHECK','TAKE-CHECK','LIT?','META-LOC','GLOBAL-CHECK']);
  for(const r of routineDetails.filter(r=>r.file!=='gparser.zil'))for(const call of r.calls)if(parser.has(call)&&call!=='PARSER')keep.add(call);
  let changed=true;while(changed){changed=false;for(const r of routineDetails.filter(r=>keep.has(r.name)))for(const call of r.calls)if(parser.has(call)&&!keep.has(call)&&call!=='PARSER'){keep.add(call);changed=true;}}
  const allGlobals=loadSymbols().globals;
  const policies=allGlobals.map(name=>({name,policy:
    scratchGroups.some(g=>(g.names as readonly string[]).includes(name))?'excluded-scratch':
    (parserBufferGlobals as readonly string[]).includes(name)?'parser-buffer':
    (protocolGlobals as readonly string[]).includes(name)?'parser-protocol':'included-game-state'}));
  return {format:'zxr-semantics-inventory-v1',storySha256:STORY_SHA256,
    sourceHashes:[...files].map(([file,text])=>({file,sha256:sha256(text)})),
    scope:'All 439 active routines, including optional/AUX initializers; conservative superset of runtime reachability. No constant-folding or indirect-call exclusion.',
    counts:{routines:routines.length,parserRoutines:routineDetails.filter(r=>r.file==='gparser.zil').length,operations:sortedOps.length},
    operations:sortedOps,primitiveContracts:primitiveGroups,headerAccesses,parserConsumers:parserReads,routines:routineDetails,
    parserClassification:routineDetails.filter(r=>parser.has(r.name)).map(r=>({name:r.name,policy:r.name==='PARSER'?'adapter':keep.has(r.name)?'kept':'replaced-middle',calls:r.calls,writes:r.writes,tableWrites:r.tableWrites})),
    scratchExclusions:scratchGroups,globalPolicies:policies};
}
