import { beforeAll,describe,expect,it } from 'vitest';
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson,hashJson } from '../src/zil/index.ts';
import type { GameBundle,LogicExpression,SourceMapped } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { buildRoomContexts } from '../tools/planning/context.ts';
import { contextArtifacts,writeOrCheckContexts } from '../tools/planning/context-cli.ts';
let bundle:GameBundle,contexts:ReturnType<typeof buildRoomContexts>;
beforeAll(()=>{bundle=compileSourcePath('reference/zork2');contexts=buildRoomContexts(bundle);},60000);
const room=(name:string)=>contexts.rooms.find(r=>r.room.name===name)!;
const routine=(name:string)=>contexts.routines.routines.find(r=>r.name===name)!;

describe('offline scene planning source contexts',()=>{
  it('covers all 86 rooms and reproduces the committed artifacts',()=>{
    expect(contexts.rooms).toHaveLength(86);expect(new Set(contexts.rooms.map(r=>r.room.name)).size).toBe(86);
    expect(contexts.index.counts.objects).toBe(165);expect(contexts.routines.routines.every(r=>r.sourceText!==null)).toBe(true);
    expect(contexts.rooms.every(r=>r.routines.missing.length===0)).toBe(true);
    const artifacts=contextArtifacts(contexts,bundle.licenses.find(l=>l.spdx==='MIT')!.text);
    expect(()=>writeOrCheckContexts('games/zork2/planning/context',artifacts,'check')).not.toThrow();
  });
  it('keeps source text, nested initial locations, portable candidates and room light distinct',()=>{
    expect(room('INSIDE-BARROW').initialObjects).toEqual(['LAMP','SWORD']);
    expect(room('INSIDE-BARROW').room.initialRoomLightFlag).toBe(true);
    expect(room('INSIDE-BARROW').room.outdoors).toContain('not-encoded');
    expect(room('VAULT').room.initialRoomLightFlag).toBe(false);
    expect(room('INSIDE-BARROW').potentialArrivals).toContain('ROBOT');expect(room('INSIDE-BARROW').initialObjects).not.toContain('ROBOT');
    const nested=contexts.objects.objects.find(o=>o.name==='STATUETTE')!;
    expect(nested.parent).toBe('CHEST');expect(room(nested.ancestry.find(n=>contexts.rooms.some(r=>r.room.name===n))!).initialObjects).toContain('STATUETTE');
    expect(nested.visibilityWarnings.some(w=>w.includes('closed-opaque-container'))).toBe(true);
  });
  it('retains conditional, door, blocked and computed exits instead of inventing geometry',()=>{
    const blocked=room('INSIDE-BARROW').exits.find(e=>e.direction==='OUT')!;expect(blocked.neighbour).toBeNull();expect(blocked.view.kind).toBe('NEXIT');
    expect(room('TINY-ROOM').exits.find(e=>e.direction==='NORTH')!.view).toMatchObject({kind:'DEXIT',door:'PDOOR',to:'DREARY-ROOM'});
    expect(room('MENHIR-ROOM').exits.find(e=>e.direction==='SW')!.view).toMatchObject({kind:'CEXIT',global:'MENHIR-POSITION'});
    const dynamic=contexts.rooms.flatMap(r=>r.exits).filter(e=>e.view.kind==='FEXIT');expect(dynamic.length).toBeGreaterThan(0);expect(dynamic.every(e=>e.neighbour===null)).toBe(true);
  });
  it('keeps room routine fragments and source guards rather than synthesizing one unconditional description',()=>{
    expect(room('MENHIR-ROOM').routines.reachableHelpers).toContain('DESCRIBE-MENHIR');
    expect(routine('DESCRIBE-MENHIR').textFragments.some(f=>f.text?.includes('floating like a feather'))).toBe(true);
    expect(routine('DESCRIBE-MENHIR').sourceText).toContain('MENHIR-POSITION');
    expect(routine('TINY-ROOM-FCN').textFragments.some(f=>f.operator==='PRINTI'&&f.text)).toBe(true);
    expect(room('MENHIR-ROOM').stateDependencies.find(d=>d.name==='MENHIR-POSITION')!.writers.length).toBeGreaterThan(0);
    expect(contexts.routines.globalDefinitions.find(g=>g.name==='MENHIR-POSITION')!.sourceText).toContain('<GLOBAL MENHIR-POSITION');
    expect(contexts.routines.globalDefinitions.find(g=>g.name==='BASES')!.sourceText).toContain('"first"');
  });
  it('marks concealed objects and cross-routine reveal/removal evidence explicitly',()=>{
    const hidden=contexts.objects.objects.find(o=>o.flags.includes('INVISIBLE'))!;expect(hidden.visibilityWarnings).toContain('initially-INVISIBLE');
    const features=contexts.rooms.flatMap(r=>r.features);
    expect(features.some(f=>f.evidence.some(e=>e.operation==='FCLEAR'&&e.flags.includes('INVISIBLE')))).toBe(true);
    expect(features.some(f=>f.evidence.some(e=>e.operation==='REMOVE'))).toBe(true);
    expect(contexts.routines.unresolvedEffects.length).toBeGreaterThan(0);
  });
  it('does not mutate the bundle and returns owned source records',()=>{
    const before=hashJson(bundle),result=buildRoomContexts(bundle);expect(hashJson(bundle)).toBe(before);
    result.rooms[0]!.room.source.file='changed';result.objects.objects[0]!.flags.push('INVISIBLE');
    expect(hashJson(bundle)).toBe(before);expect(contexts.rooms[0]!.room.source.file).not.toBe('changed');
  });
  it('does not freeze doors/containers merely because mutation targets are computed',()=>{
    const changed=structuredClone(bundle);for(const r of changed.payload.logic.routines){r.body=[];r.bindings=[];}
    const door=buildRoomContexts(changed).rooms.find(r=>r.room.name==='TINY-ROOM')!.features.find(f=>f.name==='PDOOR')!;
    expect(door.evidence).toEqual([]);expect(door.changeable).toBe(true);expect(door.stateReviewRequired).toBe(true);
  });
  it('is deterministic when JSON object keys are shuffled and hashes the actual context',()=>{
    const shuffle=(v:unknown):unknown=>Array.isArray(v)?v.map(shuffle):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,shuffle(x)])):v;
    const shuffled=buildRoomContexts(shuffle(bundle) as GameBundle);expect(canonicalJson(shuffled)).toBe(canonicalJson(contexts));
    for(const context of contexts.rooms){const {inputHash,...data}=context;expect(inputHash).toBe(hashJson(data));}
    const changed=structuredClone(bundle);changed.payload.world.entities.find(e=>e.name==='INSIDE-BARROW')!.shortName.text='Changed room title';
    const next=buildRoomContexts(changed);expect(next.rooms.find(r=>r.room.name==='INSIDE-BARROW')!.inputHash).not.toBe(room('INSIDE-BARROW').inputHash);
    expect(next.rooms.find(r=>r.room.name==='VAULT')!.inputHash).toBe(room('VAULT').inputHash);
  });
  it('keeps unknown object targets and indirect routine calls unresolved',()=>{
    const changed=structuredClone(bundle),r=changed.payload.logic.routines.find(r=>r.name==='TINY-ROOM-FCN')!,source=r.source;
    const site={source,sourceMapId:'test-context',nodeId:'test-context'};
    const load:SourceMapped<LogicExpression>={op:'load',variable:{scope:'local',name:'TEST',number:0},...site};
    r.body.push({op:'evaluate',expression:{op:'object',operator:'REMOVE',args:[load],...site},...site});
    r.body.push({op:'evaluate',expression:{op:'apply',routine:load,args:[],...site},...site});
    const facts=buildRoomContexts(changed).routines.routines.find(r=>r.name==='TINY-ROOM-FCN')!;
    expect(facts.effects.some(e=>e.operation==='REMOVE'&&e.target===null)).toBe(true);expect(facts.unresolvedCalls).toContainEqual(source);
  });
  it('check mode detects edits and obsolete files without rewriting them',()=>{
    const path=mkdtempSync(join(tmpdir(),'zxr-context-'));
    try{
      const artifacts=new Map([['sample.json','original\n']]);writeOrCheckContexts(path,artifacts,'record');
      writeFileSync(join(path,'sample.json'),'edited\n');expect(()=>writeOrCheckContexts(path,artifacts,'check')).toThrow('differs');expect(readFileSync(join(path,'sample.json'),'utf8')).toBe('edited\n');
      writeFileSync(join(path,'stale.json'),'{}');expect(()=>writeOrCheckContexts(path,artifacts,'record')).toThrow('Unexpected');
    }finally{rmSync(path,{recursive:true,force:true});}
  });
});
