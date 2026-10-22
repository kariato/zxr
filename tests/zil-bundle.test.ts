import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { assertSchema, BUNDLE_VERSIONS, canonicalJson, createBundle, definitions, hashJson, jsonSchema, packBundle, semanticBundleData, sha256Bytes, unpackBundle, utf8Decode, utf8Encode, validateBundle } from '../src/zil/index.ts';
import type { GameBundle } from '../src/zil/index.ts';
import { buildThreeRoom } from '../tools/zil/three-room.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
const small=buildThreeRoom(),full=compileSourcePath('reference/zork2');
const resign=(b:GameBundle)=>{b.buildHash=hashJson(semanticBundleData(b.payload));b.presentationHash=hashJson({title:b.payload.game.title});const {contentHash:ignored,...rest}=b;b.contentHash=hashJson(rest);return b;};

describe('canonical bundle schema, integrity and reference validation',()=>{
  it('checks SHA-256 and UTF-8 against the independent Node implementation at padding/multibyte boundaries',()=>{
    for(const text of ['','abc','a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'a'.repeat(1000),'é🙂\u0000\ud800']){
      expect(sha256Bytes(utf8Encode(text))).toBe(createHash('sha256').update(text).digest('hex'));
      expect([...utf8Encode(text)]).toEqual([...Buffer.from(text)]);
      expect(utf8Decode(utf8Encode(text))).toBe(Buffer.from(text).toString('utf8'));
    }
    for(const bytes of [[128],[192,128],[224,128,128],[237,160,128],[240,128,128,128],[244,144,128,128],[255],[226,130]])expect(()=>utf8Decode(new Uint8Array(bytes))).toThrow('UTF-8');
  });
  it('canonicalizes key order while preserving arrays and rejects non-JSON/inexact values',()=>{
    expect(canonicalJson({z:[3,2,1],a:{y:1,x:-0}})).toBe('{"a":{"x":0,"y":1},"z":[3,2,1]}');
    for(const value of [undefined,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1,BigInt(1),new Map(),[undefined],new Array(2)])expect(()=>canonicalJson(value)).toThrow();
    const cycle:any={};cycle.self=cycle;expect(()=>canonicalJson(cycle)).toThrow('cycles');
  });
  it('validates hand-written three-room logic and the full game with independent AJV 2020 schemas',()=>{
    const ajv=new Ajv2020({strict:true,validateFormats:false}),schema=ajv.compile(jsonSchema('bundle'));
    for(const b of [small,full]){expect(schema(b),JSON.stringify(schema.errors)).toBe(true);expect(()=>validateBundle(b)).not.toThrow();}
    expect(ajv.compile(jsonSchema('raw-logic'))(JSON.parse(readFileSync('tests/fixtures/three-room/logic.json','utf8')))).toBe(true);
    expect(full.payload.logic.routines).toHaveLength(414);expect(full.payload.memory.bytes).toHaveLength(19882);expect(full.licenses).toEqual([{spdx:'MIT',text:readFileSync('reference/zork2/LICENSE','utf8')}]);
  });
  it('packs and loads both games without changing canonical bytes or hashes',()=>{
    for(const b of [small,full]){const bytes=packBundle(b),loaded=unpackBundle(bytes);expect(loaded.buildHash).toBe(b.buildHash);expect(hashJson(loaded)).toBe(hashJson(b));expect(Buffer.from(packBundle(loaded)).equals(Buffer.from(bytes))).toBe(true);}
    expect(compileSourcePath('reference/zork2').buildHash).toBe(full.buildHash);
  },30000);
  it('treats diagnostic source positions as content, while rule changes alter build identity',()=>{
    const changed=structuredClone(small);changed.debug.sources.files[0]!.text+='\n;"diagnostic comment"';resign(changed);
    expect(changed.buildHash).toBe(small.buildHash);expect(changed.contentHash).not.toBe(small.contentHash);expect(()=>validateBundle(changed)).not.toThrow();
    const renamed=structuredClone(small);renamed.payload.game.title='Different title';resign(renamed);expect(renamed.buildHash).toBe(small.buildHash);expect(renamed.presentationHash).not.toBe(small.presentationHash);
    const rules=structuredClone(small);rules.payload.gateRules.push({} as never);resign(rules);expect(rules.buildHash).not.toBe(small.buildHash);
    const versions=structuredClone(small);Object.assign(versions.payload.versions,{vm:'unsupported'});resign(versions);expect(()=>validateBundle(versions)).toThrow('unsupported');
  });
  it('rejects byte/hash/schema corruption and unknown operations before exposing memory',()=>{
    for(const change of [(b:GameBundle)=>{b.payload.memory.bytes[0]=4;},(b:GameBundle)=>{b.buildHash='0'.repeat(64);},(b:GameBundle)=>{b.debug.sources.files[0]!.text+='x';}]){const b=structuredClone(small);change(b);expect(()=>unpackBundle(JSON.stringify(b))).toThrow(/hash mismatch/);}
    const b=structuredClone(small) as any;b.payload.logic.routines[0].body[0].expression.op='evil';resign(b);expect(()=>validateBundle(b)).toThrow('Schema');
    b.payload.logic.routines[0].body[0].op='primitive';expect(()=>validateBundle(b)).toThrow('Schema');
    expect(()=>unpackBundle({} as any)).toThrow('Expected bundle');expect(()=>unpackBundle('{')).toThrow('valid JSON');expect(()=>unpackBundle(new Uint8Array([255]))).toThrow('UTF-8');
  });
  it('checks data relationships even when a modified bundle has freshly recomputed hashes',()=>{
    const mutate=(change:(b:GameBundle)=>void,error:string)=>{const b=structuredClone(small);change(b);resign(b);expect(()=>validateBundle(b)).toThrow(error);};
    mutate(b=>{b.payload.world.entities[0]!.parent={name:'THIRD',id:3};},'parent mismatch');
    mutate(b=>{b.payload.world.entities[0]!.shortName.text='changed';},'short name');
    mutate(b=>{b.payload.world.entities[0]!.exits[0]!.view={kind:'UEXIT',to:'THIRD'};},'exit view');
    mutate(b=>{b.payload.memory.segments[0]!.writableRanges=[{offset:0,length:64}];},'header write');
    mutate(b=>{b.payload.vocabulary.verbs[0]!.rows[0]!.bytes[7]=99;},'syntax semantic bytes');
    mutate(b=>{b.payload.symbols.symbols.find(s=>s.kind==='global')!.number=99;},'global symbol mismatch');
    mutate(b=>{b.payload.logic.routines[0]!.body[0]!.expression={...b.payload.logic.routines[0]!.body[0]!.expression,op:'string',handle:65535} as any;},'unknown property');
    mutate(b=>{const e=b.payload.logic.routines[0]!.body[0]!.expression as any;e.args[0].handle=65535;},'invalid string handle');
    mutate(b=>{b.payload.logic.routines[0]!.body[0]!.nodeId='missing';},'source-map point');
    mutate(b=>{b.debug.sources.entries[0]!.points[0]!.policy='adapter';},'invalid source point');
    mutate(b=>{b.debug.report.unsupportedHost.push({routine:'GO',operator:'DIRIN',points:[{sourceMapId:b.payload.logic.routines[0]!.sourceMapId,nodeId:b.payload.logic.routines[0]!.nodeId}]});},'stream report');
  });
  it('rejects out-of-scope locals, bad calls, unsupported arities and relocated addresses',()=>{
    const mutate=(expression:any,error:string)=>{const b=structuredClone(small),old=b.payload.logic.routines[0]!.body[0]!.expression;b.payload.logic.routines[0]!.body[0]!.expression={...old,...expression};resign(b);expect(()=>validateBundle(b)).toThrow(error);};
    // Preserve only source-site fields so schema shape remains valid and semantic validation runs.
    const site=small.payload.logic.routines[0]!.body[0]!.expression,base={source:site.source,sourceMapId:site.sourceMapId,nodeId:site.nodeId};
    for(const [e,error] of [[{op:'load',variable:{scope:'local',name:'X',number:1}},'out-of-scope'],[{op:'call',routine:{name:'MISSING',id:3},args:[]},'invalid direct call'],[{op:'memory',operator:'GET',args:[]},'invalid array length'],[{op:'address',name:'W?LOOK',allocation:'dictionary',addend:0,value:0},'invalid linked address']] as const){const b=structuredClone(small);b.payload.logic.routines[0]!.body[0]!.expression={...base,...e} as any;resign(b);expect(()=>validateBundle(b)).toThrow(error);}
  });
  it('makes object-key order irrelevant and rejects extra/prototype-shaped fields',()=>{
    const reverse=(v:unknown):unknown=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,v])=>[k,reverse(v)])):v;
    expect(packBundle(reverse(small) as GameBundle)).toEqual(packBundle(small));
    const b=JSON.parse(JSON.stringify(small));Object.defineProperty(b.payload,'__proto__',{value:{bad:true},enumerable:true});expect(()=>validateBundle(b)).toThrow('unknown property');
    expect(()=>assertSchema({extra:1},{$ref:'#/$defs/target'},definitions)).toThrow();
  });
});
