import { expect, it } from 'vitest';
import { loadGame } from '../src/engine/index.ts';
import type { WorldState } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { authorConformanceCase, checkConformanceCase, conformanceSources, conformanceSchedule, ConformanceError } from '../tools/engine/conformance.ts';

const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),sources=conformanceSources();
const source=sources.find(s=>s.id==='area-barrow')!,fixture=authorConformanceCase(game,source);
const object=(name:string)=>game.bundle.payload.memory.objects.find(o=>o.name===name)!;
const mutations:{name:string;field:string;apply:(world:WorldState)=>void}[]=[
  {name:'flag',field:'object.LAMP.flags',apply:world=>{const lamp=object('LAMP');world.putByte(lamp.address,0,world.getByte(lamp.address)^128);}},
  {name:'clock entry',field:'table.C-TABLE',apply:world=>{const address=world.global('C-TABLE');world.putWord(address,1,(world.getWord(address,1)+1)%65536);}},
  {name:'property string',field:'property.',apply:world=>{const o=game.bundle.payload.memory.objects.find(o=>o.properties.some(p=>p.name==='LDESC'))!,p=o.properties.find(p=>p.name==='LDESC')!;world.putWord(p.address,0,0);}},
  {name:'location',field:'.links',apply:world=>world.move(object('LAMP').id,object('CAROUSEL-ROOM').id)},
  {name:'PICK-ONE counter',field:'table.HELLOS',apply:world=>{const base=world.global('HELLOS');world.putWord(base,1,world.getWord(base,1)+1);}},
  {name:'message reference order',field:'table.HELLOS',apply:world=>{const base=world.global('HELLOS'),first=world.getWord(base,2),second=world.getWord(base,3);world.putWord(base,2,second);world.putWord(base,3,first);}},
  {name:'table interior pointer',field:'global.LAMP-TABLE',apply:world=>world.setGlobal('LAMP-TABLE',world.global('LAMP-TABLE')+2)},
  {name:'gameplay word',field:'global.SCORE',apply:world=>world.setGlobal('SCORE',world.global('SCORE')+1)},
];
it('compares every checkpoint of a frozen script and accounts for all 75 golden sources',()=>{
  expect(sources).toHaveLength(75);expect(new Set(sources.map(s=>s.id)).size).toBe(75);
  expect(checkConformanceCase(game,source,fixture)).toMatchObject({id:'area-barrow',inputs:6,checkpoints:7,internalCheckpoints:12,gameDraws:2});
});
it.each(mutations)('reports the first checkpoint divergence after corrupting a $name',mutation=>{
  let error:unknown;
  try{checkConformanceCase(game,source,fixture,{mutate:(world,turn)=>{if(turn===1)mutation.apply(world);}});}catch(caught){error=caught;}
  expect(error).toBeInstanceOf(ConformanceError);const failure=error as ConformanceError;
  expect(failure.detail).toMatchObject({caseId:'area-barrow',turn:1,originalInput:1,command:'take lamp',kind:'state'});
  expect(failure.message).toContain(mutation.field);expect(failure.message).toMatch(/ZIL: .*\.zil:\d+:\d+/);
});
it('reports the first mismatched RANDOM range or result at its exact ZIL expression',()=>{
  for(const kind of ['range','result']){
    let error:unknown;
    try{checkConformanceCase(game,source,fixture,{randomTape:tape=>{if(kind==='range')tape[0]!.range++;else tape[0]!.result=tape[0]!.result%tape[0]!.range+1;}});}catch(caught){error=caught;}
    expect(error).toBeInstanceOf(ConformanceError);const failure=error as ConformanceError;
    expect(failure.detail.kind).toBe('random');expect(failure.detail.turn).toBeGreaterThan(0);
    expect(failure.message).toContain(kind==='range'?'cursor 0':'request 0');expect(failure.message).toMatch(/ZIL: .*\.zil:\d+:\d+/);
  }
});
it('rejects missing inputs, changed original identity and unreviewed detached siblings',()=>{
  for(const alter of [(f:typeof fixture)=>f.inputs.pop(),(f:typeof fixture)=>{f.goldenHash='0'.repeat(64);},(f:typeof fixture)=>f.detachedSiblings[0]!.push('LAMP')]){
    const changed=structuredClone(fixture);alter(changed);expect(()=>checkConformanceCase(game,source,changed)).toThrow(/identity|disposition/);
  }
});
it.each(['special-reseed','special-quit','special-restart','special-save-restore','special-restore-failure'])('replays %s through source actions and host continuations',id=>{
  const source=sources.find(s=>s.id===id)!,fixture=authorConformanceCase(game,source);
  expect(checkConformanceCase(game,source,fixture).inputs).toBe(source.golden.commands.length);
});

it('checks parser match tables before gameplay can overwrite them',()=>{
  expect(()=>checkConformanceCase(game,source,fixture,{mutate:(world,turn,phase)=>{if(turn===1&&phase==='parser-return')world.putWord(world.global('P-PRSO'),1,object('SWORD').id);}})).toThrow(/turn 1.*parser.*parser-return/);
});

it('omits parser draws from tapes while preserving game draw positions',()=>{
  const source=sources.find(s=>s.id==='special-reseed')!,run=structuredClone(source.golden),inputs=authorConformanceCase(game,source).inputs;
  const parserDraw={...run.random[0]!,category:'parser' as const,range:5,result:2};run.random.unshift(parserDraw);
  const schedule=conformanceSchedule(run,inputs);
  expect(schedule.tapes[0]).toEqual(run.random.filter(r=>r.category==='game').map(({range,result})=>({range,result})));
  expect(schedule.tapes[0]![0]).toEqual({range:-19,result:0});
});
it('authors operand adjectives from their own clauses and retains cancelled actor continuations',()=>{
  const solve=authorConformanceCase(game,sources.find(s=>s.id==='walkthrough')!);
  const put=solve.inputs[solve.commands.indexOf('put black sphere in pentagram')]!;
  expect(put.kind==='action'&&put.action.kind==='act'&&put.action.prsi).toEqual({object:'PENTAGRAM',noun:'PENTAGRAM'});
  const timer=authorConformanceCase(game,sources.find(s=>s.id==='timer-volcano-gnome')!);
  expect(timer.inputs[timer.commands.indexOf('gnome, hello')]).toEqual({kind:'action',action:{kind:'act',actor:'GNOME',verb:'HELLO',lexicalTable:'HELLO',syntax:2}});
});
