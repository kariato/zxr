import { readFileSync } from 'node:fs';
import { atomName, head, compileVocabulary } from '../../src/zil/index.ts';
import type { Vocabulary } from '../../src/zil/index.ts';
import { worldSymbolAnalysis } from './world.ts';
import { referenceSymbolLayout } from './symbols.ts';
import { sourceFiles } from './program.ts';
import { loadSymbols, sha256, STORY, STORY_SHA256 } from '../reference/symbols.ts';

export function buildVocabulary(){const {forms,analysis}=worldSymbolAnalysis();return compileVocabulary(forms,analysis);}
/** Independent assembly/data-image oracle, including exact row order and all dictionary roles. */
export function auditVocabulary(v:Vocabulary){
  const {forms}=worldSymbolAnalysis();
  const symbols=loadSymbols(),layout=referenceSymbolLayout(),story=readFileSync(STORY),data=readFileSync('reference/zork2/zork2dat.zap','utf8');
  const equal=(a:unknown,b:unknown,label:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Vocabulary audit: ${label} differs\nactual ${JSON.stringify(a)}\nexpected ${JSON.stringify(b)}`);};
  equal(sha256(story),STORY_SHA256,'story hash');
  equal([v.format,v.semantics,v.stage],['zxr-vocabulary-v1','zxr-zork2-semantics-v1','vocabulary'],'format/semantics/stage');
  equal(v.counts,{words:v.words.length,verbs:v.verbs.length,syntax:v.verbs.reduce((n,t)=>n+t.rows.length,0),synonyms:v.synonyms.length,buzz:v.buzz.length,directions:v.directions.length,prepositions:v.prepositions.length,actions:v.actions.length},'counts');
  const constant=(expression:string):number=>expression.trim().split('+').reduce((sum,term)=>{
    const t=term.trim(),n=/^-?\d+$/.test(t)?Number(t):symbols.constants[t];if(n===undefined)throw new Error('Unknown vocabulary assembly constant '+t);return sum+n;
  },0);
  const table=(name:string)=>{
    const start=data.indexOf(name+'::');if(start<0)throw new Error('Missing vocabulary table '+name);
    const body=data.slice(start).match(/\.TABLE\s*\n([\s\S]*?)\t.ENDT/)?.[1];if(!body)throw new Error('Missing table body '+name);
    return body.split('\n').map(l=>l.split(';')[0]!.trim()).filter(Boolean);
  };
  const g=(name:string)=>{const index=symbols.globals.indexOf(name);if(index<0)throw new Error('Missing global '+name);return story.readUInt16BE(story.readUInt16BE(12)+2*index);};
  const words=new Map(v.words.map(w=>[w.name,w]));
  const referenceWord=(name:string,index:number)=>{
    const w=layout.words[index-1];equal(name,w?.name,'dictionary index '+name);return w!.referenceAddress!;
  };
  equal(v.words.map(w=>w.name),layout.words.map(w=>w.name),'dictionary order/completeness');
  const dictionaryAssembly=new Map([...data.matchAll(/^W\?([^:]+)::\s*\.ZWORD[^\n]*\n([\s\S]*?)(?=^W\?|$(?![\s\S]))/gm)].map(m=>[m[1]!,[...m[2]!.matchAll(/\.BYTE\s+([^\n]+)/g)].map(b=>constant(b[1]!))]));
  for(const w of v.words){
    const address=referenceWord(w.name,w.dictionaryIndex),raw=[...story.subarray(address+4,address+7)],assembly=dictionaryAssembly.get(w.name);
    equal(raw,assembly,w.name+' assembly/binary dictionary');
    const selector=raw[0]!&3;
    const actual:Record<string,number>={};
    for(const [key,mask,part] of [['object',128,0],['verb',64,1],['adjective',32,2],['direction',16,3],['preposition',8,0],['buzz',4,-1]] as const)if(raw[0]!&mask)actual[key]=raw[part===-1||selector===part?1:2]!;
    const expected:Record<string,number>={};
    for(const [key,role] of Object.entries(w.roles))expected[key]=typeof role==='object'?role.number:role===true?1:role;
    const sorted=(x:Record<string,number>)=>Object.fromEntries(Object.entries(x).sort());
    equal(sorted(expected),sorted(actual),w.name+' dictionary roles');
    for(const [role,ref] of Object.entries(w.roles))if(typeof ref==='object'){
      const prefix=({verb:'ACT?',preposition:'PR?',adjective:'A?',direction:'P?'} as Record<string,string>)[role];
      equal(ref.number,symbols.constants[prefix+ref.name],w.name+' '+role+' name/code');
    }
  }
  const verbPointers=table('VTBL');equal(v.verbs.map(t=>'ST?'+t.name),verbPointers,'lexical table order');
  let syntax=0;
  const actionTable=table('ATBL'),preactions=table('PATBL');
  equal(v.actions.map(a=>a.number),Array.from({length:actionTable.length},(_,i)=>i),'action dispatch completeness/order');
  for(const a of v.actions){
    equal(a.number,symbols.constants['V?'+a.name],a.name+' action number');
    equal(a.routine.name,actionTable[a.number],a.name+' assembly action');equal(a.preaction?.name ?? '0',preactions[a.number],a.name+' assembly preaction');
    for(const [ref,pointer,kind] of [[a.routine,g('ACTIONS'),'action'],[a.preaction,g('PREACTIONS'),'preaction']] as const){
      if(ref){equal(ref.id,symbols.routines.findIndex(r=>r.name===ref.name)+1,a.name+' '+kind+' routine ID');}
      equal(ref?symbols.routines.find(r=>r.name===ref.name)?.packed:0,story.readUInt16BE(pointer+2*a.number),a.name+' binary '+kind);
    }
  }
  for(const t of v.verbs){
    equal(t.number,symbols.constants['ACT?'+t.name],t.name+' lexical number');referenceWord(t.word.name,t.word.dictionaryIndex);equal(t.word.name,t.name,t.name+' verb word');
    const bytes=table('ST?'+t.name).map(l=>{if(!l.startsWith('.BYTE '))throw new Error('Unexpected syntax assembly '+l);return constant(l.slice(6));});
    equal([t.rows.length,...t.rows.flatMap(r=>r.bytes)],bytes,t.name+' exact assembly syntax rows');
    const pointer=story.readUInt16BE(g('VERBS')+2*(255-t.number));
    equal([t.rows.length,...t.rows.flatMap(r=>r.bytes)],[...story.subarray(pointer,pointer+1+t.rows.length*8)],t.name+' binary syntax rows');
    for(const [i,row] of t.rows.entries()){
      equal(row.id,i+1,t.name+' row ID');
      const dispatch=v.actions.find(a=>a.number===row.action.number);if(!dispatch)throw new Error('Missing action dispatch');
      equal(row.action.name,dispatch.name,t.name+' row action name');equal(row.preaction,dispatch.preaction,t.name+' row preaction');
      equal(row.bytes,[row.slots.length,...[0,1].map(i=>row.slots[i]?.preposition?.number ?? 0),...[0,1].map(i=>row.slots[i]?.find?.number ?? 0),...[0,1].map(i=>row.slots[i]?.flags ?? 0),row.action.number],t.name+' readable row');
      for(const slot of row.slots){
        if(slot.preposition)equal(slot.preposition.number,symbols.constants['PR?'+slot.preposition.name],t.name+' preposition name/code');
        if(slot.find)equal(slot.find.number,symbols.constants[slot.find.name],t.name+' FIND name/code');
        const assemblyFlag:Record<string,string>={HELD:'SH',CARRIED:'SC','ON-GROUND':'SOG','IN-ROOM':'SIR',MANY:'SMANY',HAVE:'SHAVE',TAKE:'STAKE'};
        equal(new Set(slot.rules).size,slot.rules.length,t.name+' unique slot rules');
        equal(slot.flags,slot.rules.reduce((mask,rule)=>mask|constant(assemblyFlag[rule]!),0),t.name+' rule mask');
      }
      syntax++;
    }
  }
  const prep=table('PRTBL');equal(prep[0],'.WORD '+v.prepositions.length,'preposition count');
  equal(story.readUInt16BE(g('PREPOSITIONS')),v.prepositions.length,'binary preposition count');
  for(const [i,p] of v.prepositions.entries()){
    equal([prep[1+2*i],prep[2+2*i]],['W?'+p.name,'PR?'+p.name],'assembly preposition '+p.name);
    equal(p.word.name,p.name,'preposition word');equal(p.number,symbols.constants['PR?'+p.name],'preposition code');
    const address=referenceWord(p.word.name,p.word.dictionaryIndex),base=g('PREPOSITIONS')+2+4*i;
    equal([address,p.number],[story.readUInt16BE(base),story.readUInt16BE(base+2)],'binary preposition '+p.name);
  }
  // Source declaration evidence is independent of the lowering routine and pins spans/order.
  const manifest=JSON.parse(readFileSync('reference/active-program.json','utf8')) as {synonyms:{words:string[];file:string;line:number}[];syntax:{file:string;line:number;verb:string;row:number[];action:string;preaction:string}[]};
  const sourceRows=new Map(manifest.syntax.map(r=>[r.file+':'+r.line,r]));
  for(const t of v.verbs)for(const row of t.rows){
    const original=sourceRows.get(row.source.file+':'+row.source.start.line);if(!original)throw new Error('Vocabulary audit: missing source row');
    equal([t.name,row.bytes,'V-'+row.action.name,row.preaction?.name ?? '0'],[original.verb,original.row,original.action,original.preaction],t.name+' source row identity');
  }
  equal(v.synonyms.map(s=>({words:[s.canonical.name,...s.aliases.map(w=>w.name)],file:s.source.file,line:s.source.start.line})),manifest.synonyms,'all active synonym declarations');
  for(const s of v.synonyms){referenceWord(s.canonical.name,s.canonical.dictionaryIndex);for(const w of s.aliases)referenceWord(w.name,w.dictionaryIndex);}
  for(const b of v.buzz){referenceWord(b.word.name,b.word.dictionaryIndex);equal(b.number,symbols.constants['B?'+b.word.name],'buzz code '+b.word.name);equal(words.get(b.word.name)?.roles.buzz,b.number,'buzz word role');}
  for(const d of v.directions){referenceWord(d.word.name,d.word.dictionaryIndex);equal(d.word.name,d.name,'direction word');equal(d.number,symbols.constants['P?'+d.name],'direction code');equal(words.get(d.word.name)?.roles.direction,{name:d.name,number:d.number},'direction role');}
  const declarations=(op:string)=>forms.filter(n=>head(n)===op).flatMap(n=>n.kind==='form'?n.items.slice(1).map(w=>{
    const raw=atomName(w) ?? '';return ({'.':'PERIOD',',':'COMMA','"':'QUOTE'} as Record<string,string>)[raw] ?? raw;
  }):[]);
  equal(v.buzz.map(b=>b.word.name),declarations('BUZZ'),'buzz declaration completeness/order');
  equal(v.directions.map(d=>d.word.name),declarations('DIRECTIONS'),'direction declaration completeness/order');
  return {format:'zxr-vocabulary-audit-v1',storySha256:STORY_SHA256,vocabularySha256:sha256(JSON.stringify(v)),
    sourceHashes:[...sourceFiles()].map(([file,text])=>({file,sha256:sha256(text)})),
    checked:{words:v.words.length,syntax,verbs:v.verbs.length,actions:v.actions.length,prepositions:v.prepositions.length,synonyms:v.synonyms.length,buzz:v.buzz.length,directions:v.directions.length},
    limits:['Word roles are semantic data; dictionary primary-slot packing, addresses and syntax/table allocation remain step 2.7.','This is a vocabulary-stage artifact, not compiled logic or a playable bundle. JSON Schemas and bundle validation remain step 2.10.']};
}
