import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { decodeZText } from '../src/engine/index.ts';
import { encodeZText } from '../src/zil/index.ts';
const memory=JSON.parse(readFileSync('games/zork2/memory.zxr.json','utf8')) as {bytes:number[];objects:{name:string;propertyTable:number}[];words:{address:number}[]},world=JSON.parse(readFileSync('games/zork2/world.zxr.json','utf8')) as {entities:{name:string;shortName:{text:string}}[]};
it('decodes all 251 source short names from the compiled image',()=>{
  for(const o of memory.objects){const text=decodeZText(a=>memory.bytes[a]!,o.propertyTable+1,memory.bytes[o.propertyTable]!);expect(text,o.name).toBe(world.entities.find(e=>e.name===o.name)!.shortName.text);}
});
it('matches the independent original-story decoder on all 689 encoded dictionary entries',()=>{
  const require=createRequire(import.meta.url),{ZVM}=require('ifvms'),{MemoryView}=require('ifvms/src/common/utils.js'),bytes=Buffer.from(memory.bytes),vm=new ZVM();vm.prepare(bytes,{Glk:{glk_exit(){}}});vm.version=3;vm.eof=bytes.length;vm.m=MemoryView(bytes);vm.init_text();
  for(const w of memory.words)expect(decodeZText(a=>memory.bytes[a]!,w.address,2)).toBe(String(vm.decode(w.address,4)).replaceAll('\r','\n'));
});
it('handles uppercase shifts, punctuation, newlines, escapes and bounded empty names',()=>{
  for(const text of ['', 'A', 'Mixed Case', 'line\nnext', '@[]', '0-9: (yes!)']){const bytes=encodeZText(text);expect(decodeZText(a=>bytes[a]!,0,bytes.length/2)).toBe(text);}
  expect(decodeZText(()=>{throw new Error('unexpected read');},0,0)).toBe('');
  const bytes=encodeZText('one');expect(decodeZText(a=>a<bytes.length?bytes[a]!:0,0,4)).toBe('one');
});
it('rejects unsupported abbreviations, malformed escapes, bytes and ranges',()=>{
  const packed=(a:number,b:number,c:number)=>{const w=32768|(a<<10)|(b<<5)|c;return [w>>>8,w&255];};
  const abbreviation=packed(1,6,6),escape=packed(6,5,6);
  expect(()=>decodeZText(a=>abbreviation[a]!,0,1)).toThrow('Abbreviations');expect(()=>decodeZText(a=>escape[a]!,0,1)).toThrow('Truncated');
  expect(()=>decodeZText(()=>256,0,1)).toThrow('bytes');expect(()=>decodeZText(()=>0,65535,1)).toThrow('bounds');expect(()=>decodeZText(()=>0,0,256)).toThrow('bounds');
});
