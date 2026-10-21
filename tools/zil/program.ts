import { readdirSync, readFileSync } from 'node:fs';
import { loadProgram, expandMacros, head, atomName, shape, walk, lex, read, MACROS } from '../../src/zil/index.ts';
import type { Node, Sequence, LoadedProgram } from '../../src/zil/index.ts';
import { loadSymbols, sha256 } from '../reference/symbols.ts';
export function sourceFiles(directory='reference/zork2'):Map<string,string> {
  return new Map(readdirSync(directory).filter(f=>f.toLowerCase().endsWith('.zil')).sort().map(f=>[f,readFileSync(`${directory}/${f}`,'utf8')]));
}
function requireEqual(actual:unknown,expected:unknown,label:string) {
  if (JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error(`Active-program audit: ${label} differs\nactual ${JSON.stringify(actual)}\nexpected ${JSON.stringify(expected)}`);
}
const symbol=(node:Node|undefined)=>atomName(node) ?? (()=>{throw new Error('Expected a source symbol');})();
/** Check each source syntax against its eight-byte assembly row, including preaction dispatch. */
export function auditSyntax(program:LoadedProgram) {
  const data=readFileSync('reference/zork2/zork2dat.zap','utf8'), constants=loadSymbols().constants;
  const flags:Record<string,string>={HELD:'SH',CARRIED:'SC','ON-GROUND':'SOG','IN-ROOM':'SIR',MANY:'SMANY',HAVE:'SHAVE',TAKE:'STAKE'};
  const value=(expression:string):number=>expression.trim().split('+').reduce((n,part)=>{
    const v=/^-?\d+$/.test(part)?Number(part):constants[part];if(v===undefined) throw new Error(`Unknown assembly constant ${part}`);return n+v;
  },0);
  const table=(name:string)=>{
    const body=data.match(new RegExp(`^${name}::\\s*\\.TABLE\\n([\\s\\S]*?)\\t.ENDT`,'m'))?.[1];
    if (!body) throw new Error(`Missing assembly table ${name}`);
    return body.split('\n').map(s=>s.split(';')[0]!.trim()).filter(Boolean);
  };
  const actions=table('ATBL'),preactions=table('PATBL');
  const dictionary=new Map<string,string>();
  const wordBytes=new Map<string,number[]>();
  for(const match of data.matchAll(/^W\?([^:]+)::\s*\.ZWORD[^\n]*\n([\s\S]*?)(?=^W\?|$(?![\s\S]))/gm)) {
    const action=match[2]!.match(/\.BYTE ACT\?([^\s]+)/)?.[1];if(action)dictionary.set(match[1]!,action);
    wordBytes.set(match[1]!,[...match[2]!.matchAll(/\.BYTE\s+([^\n]+)/g)].map(m=>value(m[1]!.trim())));
  }
  for(const form of program.forms.filter(n=>head(n)==='SYNONYM') as Sequence[]) {
    const words=form.items.slice(1).map(symbol),canonical=wordBytes.get(words[0]!);
    if(!canonical)throw new Error(`Missing canonical dictionary word ${words[0]}`);
    for(const alias of words.slice(1)) {
      const bytes=wordBytes.get(alias);if(!bytes)throw new Error(`Missing dictionary synonym ${alias}`);
      for(const [mask,part] of [[128,0],[64,1],[32,2],[16,3],[8,0],[4,-1]]) {
        if(canonical[0]! & mask!) {
          if(!(bytes[0]! & mask!))throw new Error(`Missing synonym role ${alias}`);
          if(part!==-1) requireEqual(bytes[(bytes[0]! & 3)===part?1:2],canonical[(canonical[0]! & 3)===part?1:2],`synonym ${words[0]} -> ${alias}`);
        }
      }
    }
  }
  const compiled=[...data.matchAll(/^ST\?([^:]+)::\s*\.TABLE\n([\s\S]*?)\t.ENDT/gm)].map(m=>{
    const bytes=[...m[2]!.matchAll(/\.BYTE\s+([^;\n]+)/g)].map(b=>value(b[1]!.trim()));
    if (bytes.length!==1+bytes[0]!*8) throw new Error(`Bad syntax table ${m[1]}`);
    return {verb:m[1]!,rows:Array.from({length:bytes[0]!},(_,i)=>bytes.slice(1+i*8,9+i*8))};
  });
  const source=program.forms.filter(f=>head(f)==='SYNTAX').map(f=>{
    const form=f as Sequence, items=form.items.slice(1), verb=symbol(items[0]);
    const equals=items.findIndex(n=>atomName(n)==='=');if(equals<0)throw new Error('SYNTAX missing =');
    const action=symbol(items[equals+1]),preaction=items[equals+2]?symbol(items[equals+2]):'0';
    const slots:{prep:string;find:number;flags:number}[]=[];let prep='0';
    for(const item of items.slice(1,equals)) {
      if(item.kind==='atom') {
        if(item.value==='OBJECT') {slots.push({prep,find:0,flags:0});prep='0';}
        else prep='PR?'+item.value;
      } else if(item.kind==='list') {
        const slot=slots.at(-1);if(!slot)throw new Error('Slot rules without object');
        if(atomName(item.items[0])==='FIND') slot.find=value(symbol(item.items[1]));
        else for(const rule of item.items){const flag=flags[symbol(rule)];if(!flag)throw new Error('Unknown syntax rule '+symbol(rule));slot.flags|=value(flag);}
      } else throw new Error('Unsupported syntax item');
    }
    if(slots.length>2)throw new Error('Too many syntax slots');
    const actionValue=value(action.replace(/^V-/,'V?'));
    requireEqual(actions[actionValue],action,`action ${action}`);
    requireEqual(preactions[actionValue],preaction,`preaction ${action}`);
    const row=[slots.length,value(slots[0]?.prep ?? '0'),value(slots[1]?.prep ?? '0'),slots[0]?.find ?? 0,slots[1]?.find ?? 0,slots[0]?.flags ?? 0,slots[1]?.flags ?? 0,actionValue];
    const canonical=dictionary.get(verb) ?? verb;
    return {verb,canonical,row,action,preaction,file:form.span.file,line:form.span.start.line};
  });
  const sorted=(rows:number[][])=>rows.map(r=>r.join(',')).sort();
  for (const table of compiled) requireEqual(sorted(source.filter(s=>s.canonical===table.verb).map(s=>s.row)),sorted(table.rows),`syntax ${table.verb}`);
  requireEqual(source.length,compiled.reduce((n,t)=>n+t.rows.length,0),'total syntax rows');
  const known=new Set(compiled.map(t=>t.verb));for(const s of source)if(!known.has(s.canonical))throw new Error('Missing compiled verb '+s.verb);
  return source;
}
export function activeManifest() {
  const sources=sourceFiles(), program=loadProgram(sources), expanded=expandMacros(program.forms,program.definitions,program.globals), symbols=loadSymbols();
  const declarations=(kinds:string[])=>program.forms.filter(f=>kinds.includes(head(f) ?? '')).map(n=>({name:symbol((n as Sequence).items[1]),file:n.span.file,line:n.span.start.line}));
  const routines=declarations(['ROUTINE']),objects=declarations(['OBJECT','ROOM']),globals=declarations(['GLOBAL']);
  const sorted=(names:string[])=>[...names].sort();
  requireEqual(sorted(routines.map(r=>r.name)),sorted(symbols.routines.map(r=>r.name)),'routine names');
  requireEqual(sorted(objects.map(r=>r.name)),sorted(symbols.objects.slice(1)),'object/room names');
  requireEqual(sorted([...globals.map(r=>r.name),'PREPOSITIONS','ACTIONS','PREACTIONS','VERBS']),sorted(symbols.globals),'global names plus four compiler tables');
  const syntax=auditSyntax(program);
  const activeLocations=new Set([...program.forms,...program.definitions.values()].map(f=>`${f.span.file}:${f.span.start.offset}`));
  const excluded:{kind:string;name:string;file:string;line:number;reason:string}[]=[];
  const inspect=(nodes:readonly Node[],commented=false)=>{
    for(const node of nodes){
      const kind=head(node);
      if(kind && ['ROUTINE','OBJECT','ROOM','GLOBAL','SYNTAX','SYNONYM','DEFMAC','DEFINE'].includes(kind) && !activeLocations.has(`${node.span.file}:${node.span.start.offset}`)){
        excluded.push({kind,name:symbol((node as Sequence).items[1]),file:node.span.file,line:node.span.start.line,
          reason:!program.files.includes(node.span.file)?'file not inserted':commented?'object comment':program.redefinitions.some(r=>r.previous.file===node.span.file&&r.previous.start.offset===node.span.start.offset)?'REDEFINE replaced by later declaration':'unselected compile-time branch'});
      }
      if(node.kind==='form'||node.kind==='list'||node.kind==='vector') inspect(node.items,commented);
      else if(node.kind==='prefix')inspect([...node.comments,node.value],commented||node.operator==='comment');
      else if(node.kind==='typed')inspect([node.tag,node.value],commented);
    }
  };
  const files=[...sources].map(([file,text])=>{
    const parsed=read(text,file);inspect(parsed.nodes);
    return {file,sha256:sha256(text),tokens:lex(text,file).length-1,nodes:[...walk(parsed.nodes)].length,treeHash:sha256(JSON.stringify(parsed.nodes.map(shape)))};
  });
  for(const node of walk(expanded.forms))if(MACROS.includes(head(node) as typeof MACROS[number]))throw new Error('Unexpanded macro '+head(node));
  return {format:'zxr-active-program-v1',settings:{PREDGEN:'assigned',ZILCH:'assigned','ZORK-NUMBER':2,REDEFINE:true},
    files,includeOrder:program.files,counts:{routines:routines.length,rooms:declarations(['ROOM']).length,objects:declarations(['OBJECT']).length,globals:globals.length,compilerGlobals:4,syntax:syntax.length,synonyms:declarations(['SYNONYM']).length},
    routines,objects,globals,constants:declarations(['CONSTANT']),compilerGlobals:['PREPOSITIONS','ACTIONS','PREACTIONS','VERBS'],syntax,
    synonyms:program.forms.filter(n=>head(n)==='SYNONYM').map(n=>({words:(n as Sequence).items.slice(1).map(symbol),file:n.span.file,line:n.span.start.line})),
    excluded,redefinitions:program.redefinitions,
    propertyDefaults:[...program.properties].map(([name,value])=>({name,value:shape(value)})),
    definitions:[...program.definitions].map(([name,n])=>({name,file:n.span.file,line:n.span.start.line})),
    branches:program.branches.map(b=>({file:b.span.file,line:b.span.start.line,selected:b.selected})),macroCalls:expanded.counts,
    expandedTreeHash:sha256(JSON.stringify(expanded.forms.map(shape))),expandedNodes:[...walk(expanded.forms)].length };
}
