import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { compileMemory, compileVocabulary, compileWorldMetadata, linkMemoryLogic, translateLogic, validateMemoryImage } from '../../src/zil/index.ts';
import type { MemoryField, MemoryImage } from '../../src/zil/index.ts';
import { worldSymbolAnalysis } from './world.ts';
import { referenceSymbolLayout } from './symbols.ts';
import { auditCoreLogic } from './logic.ts';
import { loadSymbols, STORY, STORY_SHA256, sha256 } from '../reference/symbols.ts';

export function buildMemory(){
  const {forms,analysis}=worldSymbolAnalysis(),operations=translateLogic(forms,analysis),world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis);
  const memory=compileMemory(forms,analysis,world,vocabulary,operations.strings),logic=linkMemoryLogic(operations,memory);
  return {memory,logic,world,vocabulary,strings:operations.strings};
}
/** Compare every initial data structure to assembly/binary after typed relocation. */
export function auditMemory(memory:MemoryImage,logic:ReturnType<typeof buildMemory>['logic']){
  validateMemoryImage(memory);const structural=auditCoreLogic(logic),reference=loadSymbols(),story=readFileSync(STORY),raw=Buffer.from(memory.bytes),data=readFileSync('reference/zork2/zork2dat.zap','utf8'),stringData=readFileSync('reference/zork2/zork2str.zap','utf8');
  if(sha256(story)!==STORY_SHA256)throw new Error('Memory audit: story hash differs');
  const equal=(a:unknown,b:unknown,label:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Memory audit: ${label} differs\nactual ${JSON.stringify(a)}\nexpected ${JSON.stringify(b)}`);};
  const require=createRequire(import.meta.url),{ZVM}=require('ifvms'),{MemoryView}=require('ifvms/src/common/utils.js');
  if(require('ifvms/package.json').version!=='1.1.6')throw new Error('Memory audit requires ifvms 1.1.6');
  const decoder=(buffer:Buffer)=>{const vm=new ZVM();vm.prepare(buffer,{Glk:{glk_exit(){}}});vm.version=3;vm.eof=buffer.length;vm.m=MemoryView(buffer);vm.init_text();return (address:number,length?:number):string=>String(vm.decode(address,length)).replaceAll('\r','\n');};
  const ownText=decoder(raw),refText=decoder(story),dictionary=referenceSymbolLayout(),refGlobals=new Map(reference.globals.map((name,i)=>[name,story.readUInt16BE(story.readUInt16BE(12)+i*2)]));
  const refObjects=story.readUInt16BE(10)+62,routines=new Map(reference.routines.map((r,i)=>[r.name,{id:i+1,packed:r.packed}])),handles=new Map(logic.strings.entries.map(s=>[s.text,s.id]));
  const bases=new Map<string,number>([['globals',story.readUInt16BE(12)],['objects',story.readUInt16BE(10)],['dictionary',story.readUInt16BE(8)],['actions',refGlobals.get('ACTIONS')!],['preactions',refGlobals.get('PREACTIONS')!],['verbs',refGlobals.get('VERBS')!],['prepositions',refGlobals.get('PREPOSITIONS')!]]);
  for(const o of memory.objects)bases.set('properties:'+o.name,story.readUInt16BE(refObjects+(o.id-1)*9+7));
  for(const t of memory.tables){if(t.name!=='table:'+t.owner)throw new Error('Memory audit: unclassified nested table in reference game');const address=refGlobals.get(t.owner);if(address===undefined)throw new Error('Memory audit: unknown table owner '+t.owner);bases.set(t.name,address);}
  for(const s of memory.segments.filter(s=>s.kind==='syntax')){const name=s.name.slice(7),code=reference.constants['ACT?'+name];if(code===undefined)throw new Error('Missing syntax code');bases.set(s.name,story.readUInt16BE(refGlobals.get('VERBS')!+2*(255-code)));}
  const value=(f:MemoryField,current:number,expected:number,label:string)=>{
    if(f.domain==='string'){
      if(f.target===undefined){equal(current,0,label+' absent string');equal(expected,0,label+' absent reference string');}
      else {equal(current,handles.get(f.target),label+' string handle');equal(refText(expected*2),f.target,label+' binary string');}
    } else if(f.domain==='routine'){
      if(f.target===undefined){equal(current,0,label+' null routine');equal(expected,0,label+' null reference routine');}
      else {equal(current,routines.get(f.target)?.id,label+' routine ID');equal(expected,routines.get(f.target)?.packed,label+' reference routine');}
    } else if(f.domain==='address'&&f.target!==undefined){
      const base=bases.get(f.target);if(base===undefined)throw new Error('Memory audit: unknown pointer target '+f.target);
      equal(expected,base+(f.addend ?? 0),label+' reference pointer');
    } else equal(current,expected,label+' value');
  };
  equal(memory.globals.map(g=>[g.name,g.number]),reference.globals.map((name,i)=>[name,i+16]),'all global names/numbers');
  for(const g of memory.globals){const s=memory.segments.find(s=>s.name==='globals')!,f=s.fields.find(f=>f.offset===g.address-s.base)!;value(f,raw.readUInt16BE(g.address),refGlobals.get(g.name)!,'global '+g.name);}
  const assemblyStrings=new Map([...stringData.matchAll(/\.GSTR\s+([^,]+),"((?:[^"]|"")*)"/g)].map(m=>[m[1]!,m[2]!.replaceAll('""','"')]));
  const tableLabels=new Map([...data.matchAll(/\.GVAR\s+([^=\s]+)=(T\?\d+),/g)].map(m=>[m[1]!,m[2]!]));
  const tableBodies=new Map([...data.matchAll(/^(T\?\d+)::\s*\.TABLE[^\n]*\n([\s\S]*?)\t.ENDT/gm)].map(m=>[m[1]!,m[2]!]));
  const objectIds=new Map(reference.objects.map((name,id)=>[name,id]));
  const tokenValue=(token:string):number=>{
    if(/^-?\d+$/.test(token))return Number(token)&65535;
    const v=reference.constants[token] ?? objectIds.get(token) ?? routines.get(token)?.packed;
    if(v===undefined)throw new Error('Memory audit: unknown assembly table cell '+token);return v;
  };
  let tableCells=0;
  for(const t of memory.tables){
    const body=tableBodies.get(tableLabels.get(t.owner) ?? '');if(body===undefined)throw new Error('Missing assembly table '+t.owner);
    const cells=body.split('\n').map(l=>l.split(';')[0]!.trim()).filter(Boolean).map(l=>{const m=l.match(/^\.(BYTE|WORD)\s+(.+)$/);return {width:m?.[1]==='BYTE'?1:2,token:m?.[2] ?? l};});
    equal(cells.reduce((n,c)=>n+c.width,0),t.length,t.owner+' assembly allocation length');
    const segment=memory.segments.find(s=>s.name===t.name)!,refBase=bases.get(t.name)!;let offset=0;
    equal(segment.fields.map(f=>f.width),cells.map(c=>c.width),t.owner+' assembly cell widths');
    for(const [i,c] of cells.entries()){
      const f=segment.fields[i]!,current=c.width===1?raw[t.base+offset]!:raw.readUInt16BE(t.base+offset),expected=c.width===1?story[refBase+offset]!:story.readUInt16BE(refBase+offset),label=t.owner+'+'+offset;
      value(f,current,expected,label);
      if(c.token.startsWith('STR?')){equal(f.domain,'string',label+' assembly string domain');equal(f.target,assemblyStrings.get(c.token),label+' assembly string');}
      else equal(expected,tokenValue(c.token),label+' assembly bytes');
      offset+=c.width;tableCells++;
    }
  }
  const ownObj=memory.segments.find(s=>s.name==='objects')!;
  equal([...raw.subarray(ownObj.base,ownObj.base+62)],[...story.subarray(story.readUInt16BE(10),story.readUInt16BE(10)+62)],'property defaults');
  let properties=0,shortNames=0,exactShortNames=0;
  for(const o of memory.objects){
    const r=refObjects+(o.id-1)*9;equal(o.name,reference.objects[o.id],'object number/name');equal([...raw.subarray(o.address,o.address+7)],[...story.subarray(r,r+7)],o.name+' attributes/parent/sibling/child');
    const refTable=story.readUInt16BE(r+7),ownLength=raw[o.propertyTable]!*2,refLength=story[refTable]!*2;
    equal(ownLength?ownText(o.propertyTable+1,ownLength):'',refLength?refText(refTable+1,refLength):'',o.name+' encoded short name');shortNames++;
    if(Buffer.from(raw.subarray(o.propertyTable,o.propertyTable+1+ownLength)).equals(story.subarray(refTable,refTable+1+refLength)))exactShortNames++;
    let cursor=refTable+1+refLength;const referenceProperties=[];while(story[cursor]){const header=story[cursor++]!,length=(header>>>5)+1;referenceProperties.push({number:header&31,length,address:cursor});cursor+=length;}
    equal(o.properties.map(p=>[p.number,p.length]),referenceProperties.map(p=>[p.number,p.length]),o.name+' property presence/length/order');
    const segment=memory.segments.find(s=>s.name==='properties:'+o.name)!;
    for(const [i,p] of o.properties.entries()){
      const ref=referenceProperties[i]!;for(const f of segment.fields.filter(f=>f.offset>=p.address-segment.base&&f.offset<p.address-segment.base+p.length)){
        const delta=segment.base+f.offset-p.address,current=f.width===1?raw[p.address+delta]!:raw.readUInt16BE(p.address+delta),expected=f.width===1?story[ref.address+delta]!:story.readUInt16BE(ref.address+delta);
        value(f,current,expected,o.name+'.'+p.name+'+'+delta);
      }properties++;
    }
  }
  for(const w of memory.words){const ref=dictionary.words[w.dictionaryIndex-1]!;equal(w.name,ref.name,'dictionary numbering');equal([...raw.subarray(w.address,w.address+7)],[...story.subarray(ref.referenceAddress!,ref.referenceAddress!+7)],'dictionary bytes '+w.name);}
  for(const s of memory.segments.filter(s=>['syntax','dispatch','prepositions'].includes(s.kind))){
    const ref=bases.get(s.name)!;for(const f of s.fields){
      if(f.width===1||f.width===2)value(f,f.width===1?raw[s.base+f.offset]!:raw.readUInt16BE(s.base+f.offset),f.width===1?story[ref+f.offset]!:story.readUInt16BE(ref+f.offset),s.name+'+'+f.offset);
      else equal([...raw.subarray(s.base+f.offset,s.base+f.offset+f.width)],[...story.subarray(ref+f.offset,ref+f.offset+f.width)],s.name+' row bytes');
    }
  }
  equal(raw.readUInt16BE(2),63,'header release');equal(raw.subarray(18,24).toString('ascii'),'860811','header serial');equal(raw.readUInt16BE(16),story.readUInt16BE(16),'header initial flags');
  return {format:'zxr-memory-audit-v1',storySha256:STORY_SHA256,memorySha256:sha256(JSON.stringify(memory)),logicSha256:sha256(JSON.stringify(logic)),
    checked:{bytes:memory.bytes.length,segments:memory.segments.length,staticBase:memory.staticBase,globals:memory.globals.length,tables:memory.tables.length,tableCells,objects:memory.objects.length,shortNames,exactShortNameEncodings:exactShortNames,properties,dictionaryEntries:memory.words.length,relocations:memory.relocations.length,routines:logic.routines.length,expressions:structural.counts.expressions,deferred:logic.untranslated.length},
    routines:structural.routines,
    limits:['ZXR assigns its own data addresses and routine/string IDs; comparisons relocate typed fields to original addresses/IDs.','Header entry point/checksum and abbreviation pointer are zero because this image has no Z-machine bytecode and short names use no abbreviations. VERIFY validates the future bundle.','No GO mutations are pre-applied. Runtime memory access, clock aliasing, missing-property defaults and execution conformance remain phase 3.']};
}
