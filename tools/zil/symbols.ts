import { readFileSync } from 'node:fs';
import { loadSymbols, STORY, STORY_SHA256, sha256 } from '../reference/symbols.ts';
import { loadProgram, expandMacros, analyzeSymbols } from '../../src/zil/index.ts';
import type { SymbolLayout } from '../../src/zil/index.ts';
import { sourceFiles } from './program.ts';
import { normalizeReferenceProgram } from './reference-program.ts';

/** Independent V3 dictionary packing, limited to the reference's ASCII alphabet. */
export function dictionaryBytes(text:string):number[] {
  const chars:number[]=[],a2='\n0123456789.,!?_#\'"/\\-:()';
  for(const c of text){const code=c.charCodeAt(0);
    if(c===' ')chars.push(0);
    else if(c>='a'&&c<='z')chars.push(code-97+6);
    else if(c>='A'&&c<='Z')chars.push(4,code-65+6);
    else if(a2.includes(c))chars.push(5,a2.indexOf(c)+7);
    else {if(code>127)throw new Error('Non-ASCII reference dictionary text');chars.push(5,6,code>>>5,code&31);}
  }
  while(chars.length<6)chars.push(5);
  const words=[(chars[0]!<<10)|(chars[1]!<<5)|chars[2]!,0x8000|(chars[3]!<<10)|(chars[4]!<<5)|chars[5]!];
  return words.flatMap(w=>[w>>>8,w&255]);
}

/** The reference supplies observable numbering, never missing source declarations. */
export function referenceSymbolLayout():SymbolLayout {
  const symbols=loadSymbols(),data=readFileSync('reference/zork2/zork2dat.zap','utf8'),story=readFileSync(STORY);
  if(sha256(story)!==STORY_SHA256)throw new Error('Symbol layout: reference story hash differs');
  const dictionary=story.readUInt16BE(8),header=dictionary+1+story[dictionary]!;
  const entryWidth=story[header]!,entries=story.readUInt16BE(header+1),start=header+3;
  const words=[...data.matchAll(/^W\?([^:]+)::\s*\.ZWORD "(.*)"$/gm)].map((m,i)=>{
    const address=start+i*entryWidth,encoded=dictionaryBytes(m[2]!.replaceAll('""','"'));
    if(!Buffer.from(encoded).equals(story.subarray(address,address+4)))throw new Error(`Dictionary numbering mismatch for ${m[1]}`);
    return {name:m[1]!,referenceAddress:address};
  });
  if(entryWidth!==7 || entries!==689 || words.length!==entries)throw new Error('Symbol layout: dictionary evidence differs');
  return {objects:symbols.objects.slice(1),globals:symbols.globals,routines:symbols.routines.map(r=>r.name),constants:symbols.constants,words};
}
export function symbolManifest() {
  const sources=sourceFiles(),program=loadProgram(sources),expanded=expandMacros(program.forms,program.definitions,program.globals);
  const normalized=normalizeReferenceProgram(expanded.forms),analysis=analyzeSymbols(program,normalized.forms,referenceSymbolLayout());
  const kinds=Object.fromEntries([...new Set(analysis.symbols.map(s=>s.kind))].sort().map(kind=>[kind,analysis.symbols.filter(s=>s.kind===kind).length]));
  const position=(span:{file:string;start:{line:number;column:number}})=>({file:span.file,line:span.start.line,column:span.start.column});
  return {format:'zxr-symbols-v1',mode:'reference-assisted',semantics:'zxr-zork2-semantics-v1',
    sourceHashes:[...sources].map(([file,text])=>({file,sha256:sha256(text)})),
    normalizations:normalized.normalizations,counts:{...kinds,references:analysis.references.length,diagnostics:analysis.diagnostics.length},
    symbols:analysis.symbols.map(({source,...s})=>({...s,...(source?{source:position(source)}:{})})),
    routines:analysis.routines.map(({source,locals,...r})=>({...r,source:position(source),locals:locals.map(({source,...l})=>({...l,source:position(source)}))})),
    referenceHash:sha256(JSON.stringify(analysis.references)),diagnostics:analysis.diagnostics};
}
