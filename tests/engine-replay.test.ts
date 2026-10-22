import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GameSession, Interpreter, TurnLoop, loadGame, prepareAction } from '../src/engine/index.ts';
import type { GameAction, Selection } from '../src/engine/index.ts';
import { createDebugTurnLoop } from '../src/engine/testing.ts';
import { packBundle } from '../src/zil/index.ts';
import { hashJson } from '../src/zil/integrity.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { checkReplayCase, replaySources } from '../tools/engine/replay.ts';
import type { ReplayFixtures } from '../tools/engine/replay.ts';
import { createProjection, compareProjection } from '../tools/engine/projection.ts';
import { authorActions, splitCommands } from '../tools/engine/replay-actions.ts';
import { runReference } from '../tools/reference/runner.ts';
import { memories } from '../tools/reference/state.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),projection=createProjection(game);
const fixtures=JSON.parse(readFileSync('reference/structured-replay.json','utf8')) as ReplayFixtures;
const evidence=JSON.parse(readFileSync('reference/engine-replay.json','utf8'));
const sources=replaySources();
function act(table:string,prso?:Selection):GameAction {
  const row=game.bundle.payload.vocabulary.verbs.find(v=>v.name===table)!.rows.find(r=>r.action.name===table&&r.slots.length===(prso?1:0))!;
  return {kind:'act',actor:'PLAYER',verb:table,lexicalTable:table,syntax:row.id,...(prso?{prso}:{})};
}
it('accounts for every original area, the full solve, and the combined random/death/recovery scenario',()=>{
  expect(fixtures.format).toBe('zxr-structured-replay-v1');expect(fixtures.buildHash).toBe(game.buildHash);expect(fixtures.cases.map(c=>c.id)).toEqual(sources.map(s=>s.id));
  expect(sources.filter(s=>s.id.startsWith('area-'))).toHaveLength(12);
  const solve=evidence.cases.find((c:any)=>c.id==='walkthrough');expect(solve.final).toMatchObject({score:400,won:true,deaths:0,room:'ZORK3'});
  expect(solve.adaptations.filter((a:any)=>a.kind==='excluded-typed-input').map((a:any)=>[a.input,a.command])).toEqual([[142,'take key'],[224,'take off crown']]);
  expect(solve.projection).toMatchObject({objects:251,tables:29});
  expect(evidence.cases.find((c:any)=>c.id==='random-death-recovery').activeSpellBoundaries).toBeGreaterThan(0);
});
it.each(sources.map(s=>[s.id,s] as const))('matches the complete %s replay with exact text, state, ranges, call sites and no unused tape',(id,source)=>{
  const result=checkReplayCase(game,source,fixtures.cases.find(c=>c.id===id)!);expect(result.evidence).toEqual(evidence.cases.find((c:any)=>c.id===id));
},120000);
it('rejects changed authored actions and reference identities rather than rebuilding expected actions',()=>{
  const source=sources.find(s=>s.id==='area-barrow')!,fixture=structuredClone(fixtures.cases.find(c=>c.id===source.id)!);
  fixture.actions[0]={kind:'walk',actor:'PLAYER',direction:'NORTH'};expect(()=>checkReplayCase(game,source,fixture)).toThrow('text differs');
  fixture.originalHash='0'.repeat(64);expect(()=>checkReplayCase(game,source,fixture)).toThrow('identity');
});
it('rejects unreviewed detached sibling exceptions and requires exact names at each boundary',()=>{
  const run=runReference([]),ram=[...memories(run)].at(-1)!;expect(()=>projection.reference(ram,['LAMP'])).toThrow('Unreviewed REF-001');
});
it('projects all defined gameplay globals and all non-parser tables without broadly excluding parser state',()=>{
  const loop=new TurnLoop(game);loop.start();const projected=projection.own(loop.world());
  for(const name of ['PRSA','PRSO','PRSI','WINNER','HERE','LIT','P-ONEOBJ','P-NAM','P-GETFLAGS','P-IT-OBJECT','P-WON','P-MULT','P-NOT-HERE'])expect(Object.hasOwn(projected,'global.'+name)).toBe(true);
  for(const name of ['P-LEN','P-DIR','P-NCN','P-SYNTAX','P-LEXV'])expect(Object.hasOwn(projected,'global.'+name)).toBe(false);
  const before=hashJson(projected),world=loop.world();world.putByte(world.global('P-INBUF'),1,99);expect(hashJson(projection.own(world))).toBe(before);
});
it.each(['flag','clock','property-string','location','pick-one','message-order','interior-pointer','gameplay-word','pronoun'] as const)('detects a deliberate %s corruption in the semantic projection',kind=>{
  const loop=new TurnLoop(game);loop.start();const world=loop.world(),before=projection.own(world),memory=game.bundle.payload.memory,lamp=memory.objects.find(o=>o.name==='LAMP')!;
  const base=world.global('HELLOS'),hello=memory.segments.find(s=>s.name==='table:HELLOS')!;
  if(kind==='flag')world.setFlag(lamp.id,31,!world.hasFlag(lamp.id,31));
  if(kind==='clock')world.putWord(world.global('C-TABLE')+174,1,world.getWord(world.global('C-TABLE')+174,1)+1);
  if(kind==='property-string'){
    const p=memory.objects.find(o=>o.name==='INSIDE-BARROW')!.properties.find(p=>p.name==='LDESC')!;world.putWord(p.address,0,game.bundle.payload.strings.entries.find(s=>s.id!==world.getWord(p.address))!.id);
  }
  if(kind==='location')world.move(lamp.id,world.global('PLAYER'));
  if(kind==='pick-one'){const f=hello.fields.find(f=>f.domain==='integer'&&f.offset>0)!;world.putWord(base+f.offset,0,world.getWord(base+f.offset)+1);}
  if(kind==='message-order'){const [a,b]=hello.fields.filter(f=>f.domain==='string'),x=world.getWord(base+a!.offset),y=world.getWord(base+b!.offset);world.putWord(base+a!.offset,0,y);world.putWord(base+b!.offset,0,x);}
  if(kind==='interior-pointer')world.setGlobal('LAMP-TABLE',world.global('LAMP-TABLE')+2);
  if(kind==='gameplay-word')world.putWord(world.global('DUMMY'),0,world.getWord(world.global('DUMMY'))+1);
  if(kind==='pronoun')world.setGlobal('P-ONEOBJ',memory.words.find(w=>w.name==='KEY')!.address);
  expect(()=>compareProjection(projection.own(world),before,'mutation '+kind)).toThrow('differs');
});
it('fails closed on invalid typed pointers and string handles instead of treating them as integers',()=>{
  const loop=new TurnLoop(game);loop.start();
  const pointer=loop.world();pointer.setGlobal('SPELL-USED',65535);expect(()=>projection.own(pointer)).toThrow('Pointer outside dictionary');
  const strings=loop.world();strings.setGlobal('FATAL-VAPORS',65535);expect(()=>projection.own(strings)).toThrow('Unknown string');
});
it('reports the first misaligned random request with its cursor/ranges/source and rolls back the segment',()=>{
  const fixture=fixtures.cases.find(c=>c.id==='area-barrow')!,run=runReference(fixture.commands),tape=run.random.filter(r=>r.category==='game').map(r=>({range:r.range,result:r.result}));tape[0]!.range++;
  const {loop,debug}=createDebugTurnLoop(game,{replay:tape});loop.start();let failed=false;
  for(const action of fixture.actions){const before=loop.checkpoint(),result=loop.execute(action);if(result.status==='error'){
    expect(result.error!.cause).toContain('at cursor 0: expected '+tape[0]!.range);expect(result.error!.source!.file).toBe('2actions.zil');expect(loop.checkpoint()).toEqual(before);expect(debug.trace().attempts.at(-1)!.error!.source).toEqual(result.error!.source);failed=true;break;
  }}expect(failed).toBe(true);
});
it('detects exhausted and unused oracle tapes through Interpreter, TurnLoop and GameSession',()=>{
  const fixture=fixtures.cases.find(c=>c.id==='area-barrow')!,run=runReference(fixture.commands),tape=run.random.filter(r=>r.category==='game').map(r=>({range:r.range,result:r.result}));
  const extra=[...tape,{range:100,result:1}],loop=new TurnLoop(game,{replay:extra});loop.start();for(const action of fixture.actions)expect(loop.execute(action).status).toBe('resolved');const hash=loop.stateHash();expect(()=>loop.assertReplayComplete()).toThrow('Unused');expect(loop.stateHash()).toBe(hash);
  const empty=new TurnLoop(game,{replay:[]});empty.start();let failed=false;for(const a of fixture.actions){const r=empty.execute(a);if(r.status==='error'){expect(r.error!.cause).toContain('end of tape');failed=true;break;}}expect(failed).toBe(true);
  const vm=new Interpreter(game,{replay:extra});vm.run();expect(()=>vm.assertReplayComplete()).toThrow('Unused');
  const session=new GameSession(game,{replay:extra});const before=session.stateHash();expect(()=>session.assertReplayComplete()).toThrow('Unused');expect(session.stateHash()).toBe(before);expect(()=>new GameSession(game).assertReplayComplete()).not.toThrow();
});
it('restores oracle replay cursors and complete continuations across the random death and subsequent recovery',()=>{
  const fixture=fixtures.cases.find(c=>c.id==='random-death-recovery')!,run=runReference(fixture.commands),tape=run.random.filter(r=>r.category==='game'),control=new TurnLoop(game,{replay:tape});let restored=new TurnLoop(game,{replay:tape});expect(restored.start()).toEqual(control.start());
  for(const action of fixture.actions){expect(restored.execute(action)).toEqual(control.execute(action));expect(restored.stateHash()).toBe(control.stateHash());restored=TurnLoop.restore(game,JSON.parse(JSON.stringify(restored.checkpoint())),{replay:tape});}
  expect(restored.world().global('DEATHS')).toBe(1);expect(restored.world().global('DEAD')).toBe(0);expect(()=>restored.assertReplayComplete()).not.toThrow();
});
it('supports source adjective-only spellings while preserving P-ONEOBJ and full ordinary action semantics',()=>{
  const reference=runReference(['examine rare','examine candied','examine gold'],2,{context:{room:'INSIDE-BARROW',inventory:['CANDY','GOLD-KEY']}}),tape=reference.random.filter(r=>r.category==='game');
  let loop=new TurnLoop(game,{replay:tape});loop.start();const world=loop.world(),id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
  world.move(id('CANDY'),world.global('PLAYER'));world.move(id('GOLD-KEY'),world.global('PLAYER'));const cp=loop.checkpoint();cp.interpreter.world=world.snapshot();loop=TurnLoop.restore(game,cp,{replay:tape});
  const state=loop.world().global('P-ONEOBJ');for(const [n,operand] of [{object:'CANDY',adjective:'RARE'},{object:'CANDY',adjective:'CANDIED'},{object:'GOLD-KEY',adjective:'GOLD'}].entries()){
    const action=act('EXAMINE',operand),result=loop.execute(action);expect(result.text.join('')).toBe(reference.transcript[n+1]);expect(loop.world().global('P-ONEOBJ')).toBe(state);
  }
  for(const prso of [{object:'CANDY'},{object:'CANDY',adjective:'BOGUS'}])expect(()=>prepareAction(game,loop.world(),{...act('EXAMINE','CANDY'),prso})).toThrow();
});
it('applies reviewed sentence/orphan normalization only to the pinned inputs and never splits quoted words',()=>{
  expect(splitCommands(['say "hello. there"','open door. north']).commands).toEqual(['say "hello. there"','open door','north']);
  expect(splitCommands(['take key','take off crown']).commands).toEqual(['take key','take off crown']);
  expect(()=>splitCommands(['look..north'])).toThrow('Empty');
});
