import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBundle, packBundle, unpackBundle } from '../../src/zil/bundle.ts';
import type { GameBundle } from '../../src/zil/bundle.ts';
import { sha256Bytes } from '../../src/zil/integrity.ts';
import { compileSourcePath } from '../zil/compile.ts';
import { FuzzRandom } from './fuzz.ts';
/** Shuffle object insertion order recursively; array order is always semantic. */
export function shuffleKeys<T>(value:T,random:FuzzRandom):T {
  if(Array.isArray(value))return value.map(v=>shuffleKeys(v,random)) as T;
  if(value&&typeof value==='object'){
    const entries=Object.entries(value);for(let i=entries.length-1;i>0;i--){const j=random.index(i+1);[entries[i],entries[j]]=[entries[j]!,entries[i]!];}
    return Object.fromEntries(entries.map(([k,v])=>[k,shuffleKeys(v,random)])) as T;
  }return value;
}
/** gates.json is the compiler's JSON source input. Also reconstruct all emitted
 * JSON components and repack a parsed bundle, preserving every ordered array. */
export function checkKeyOrder(bundle:GameBundle,seeds:readonly number[]=[1,0x5a5852,0xffffffff]){
  const baseline=packBundle(bundle),directory=mkdtempSync(join(tmpdir(),'zxr-key-order-')),gateRules=JSON.parse(readFileSync('games/zork2/gates.json','utf8'));
  const equal=(bytes:Uint8Array,label:string)=>{if(!Buffer.from(bytes).equals(Buffer.from(baseline)))throw new Error('Shuffled JSON changes '+label);};
  try{for(const seed of seeds){
    const random=new FuzzRandom(seed),path=join(directory,'gates.json');writeFileSync(path,JSON.stringify(shuffleKeys(gateRules,random))+'\n');
    equal(packBundle(compileSourcePath('reference/zork2',{gateRulesPath:path})),'source compilation at seed '+seed);
    const shuffled=shuffleKeys(bundle,random);
    equal(packBundle(createBundle(shuffled.payload,shuffled.debug,shuffled.licenses)),'component linking at seed '+seed);
    equal(packBundle(unpackBundle(JSON.stringify(shuffled))),'bundle loading at seed '+seed);
  }}finally{rmSync(directory,{recursive:true,force:true});}
  return {format:'zxr-key-order-results-v1',buildHash:bundle.buildHash,seeds:[...seeds],compilerCases:seeds.length,componentCases:seeds.length,bundleCases:seeds.length,byteHash:sha256Bytes(baseline)};
}
