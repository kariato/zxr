import { expect, it } from 'vitest';
import { Interpreter, loadGame } from '../src/engine/index.ts';
import { logicExpressions, packBundle, projectParserAdapter } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { buildSourceMapProgram } from '../tools/zil/source-maps.ts';
import { runReference } from '../tools/reference/runner.ts';
import { auditStartup } from '../tools/engine/startup.ts';
const bundle=compileSourcePath('reference/zork2'),game=loadGame(packBundle(bundle)),startup=new Interpreter(game);startup.run();const initial=startup.world(),adapter=game.bundle.payload.logic.adapter!;
const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
function checkWorld(lexical:string,row:number,direct:number[],indirect:number[]=[]){
  const world=initial.fork(),base=game.bundle.payload.memory.segments.find(s=>s.name==='syntax:'+lexical)!.base;
  world.setGlobal('P-SYNTAX',base+1+8*(row-1));
  for(const [name,values] of [['P-PRSO',direct],['P-PRSI',indirect]] as const){const table=world.global(name);world.putWord(table,0,values.length);values.forEach((v,i)=>world.putWord(table,i+1,v));}
  return world;
}
it('projects original entry code and check order, retaining source sites while excluding lexical-middle calls',()=>{
  const original=buildSourceMapProgram().result.referenceRoutines.find(r=>r.name==='PARSER')!,projection=projectParserAdapter(original);
  expect(projection).toEqual(adapter);expect(projection.entry.body.slice(0,10)).toEqual(original.body.slice(0,10));expect(projection.entry.bindings).toEqual(original.bindings);
  const mode=projection.entry.body[10]!.expression,originalMode=original.body[10]!.expression;
  if(mode.op!=='cond'||originalMode.op!=='cond')throw new Error('bad fixture');expect(mode.clauses).toEqual(originalMode.clauses.slice(1));
  const calls=[...logicExpressions(projection.checks)].filter(e=>e.op==='call').map(e=>e.routine.name);expect(calls).toEqual(['MANY-CHECK','TAKE-CHECK']);
  expect([...logicExpressions(projection.entry)].filter(e=>e.op==='suspend').map(e=>e.operator)).toEqual(['READ']);
  for(const program of [projection.entry,projection.checks])expect([...logicExpressions(program)].some(e=>e.op==='call'&&['SYNTAX-CHECK','SNARF-OBJECTS','STUFF'].includes(e.routine.name))).toBe(false);
},30000);
it('fails closed when the original parser entry or epilogue boundaries change',()=>{
  const original=buildSourceMapProgram().result.referenceRoutines.find(r=>r.name==='PARSER')!;
  const shorter=structuredClone(original);shorter.body.pop();expect(()=>projectParserAdapter(shorter)).toThrow('projection');
  const changed=structuredClone(original),mode=changed.body[10]!.expression;if(mode.op!=='cond')throw new Error('bad fixture');mode.clauses.reverse();expect(()=>projectParserAdapter(changed)).toThrow('projection');
},30000);
it('executes the retained fresh prologue to original READ, matching original startup memory and prompt',()=>{
  const vm=new Interpreter(game,{world:initial,fragment:'entry'}),before=initial.worldHash(),result=vm.run();
  expect(result).toMatchObject({status:'suspended',wait:{kind:'READ',routine:adapter.id},text:['\n','>']});expect(initial.worldHash()).toBe(before);
  expect(auditStartup(game,vm.world(),runReference([]))).toMatchObject({globals:168,objects:251,tables:45});
  const restored=Interpreter.restore(game,JSON.parse(JSON.stringify(vm.checkpoint())));expect(restored.stateHash()).toBe(vm.stateHash());
  expect(restored.resumeParserRead('look')).toMatchObject({status:'returned',value:1,text:[]});expect(restored.world().getByte(restored.world().global('P-LEXV'),1)).toBe(1);
});
it('copies/clears ten input-table words, resets counts only, and preserves prior context in locals',()=>{
  const world=initial.fork(),input=world.global('P-ITBL'),old=world.global('P-OTBL');
  for(let n=0;n<10;n++){world.putWord(input,n,n+11);world.putWord(old,n,100+n);}
  for(const name of ['P-PRSO','P-PRSI','P-BUTS']){world.putWord(world.global(name),0,2);world.putWord(world.global(name),1,id('LAMP'));}
  world.setGlobal('P-MERGED',7);world.setGlobal('P-ADVERB',3);world.setGlobal('P-END-ON-PREP',1);
  const vm=new Interpreter(game,{world,fragment:'entry'});expect(vm.run()).toMatchObject({status:'suspended'});const after=vm.world();
  expect(Array.from({length:10},(_,n)=>after.getWord(input,n))).toEqual(Array(10).fill(0));expect(Array.from({length:10},(_,n)=>after.getWord(old,n))).toEqual(Array.from({length:10},(_,n)=>n+11));
  for(const name of ['P-PRSO','P-PRSI','P-BUTS']){expect(after.getWord(after.global(name),0)).toBe(0);expect(after.getWord(after.global(name),1)).toBe(id('LAMP'));}
  expect(after.global('P-MERGED')).toBe(0);const locals=vm.inspect().frames[0]!.locals;expect(locals[6]).toBe(world.global('WINNER'));expect(locals[7]).toBe(7);
});
it('preserves old-table contents for P-OFLAG and follows the original internal continuation arm',()=>{
  const world=initial.fork(),old=world.global('P-OTBL');world.setGlobal('P-OFLAG',1);world.putWord(old,0,123);world.setGlobal('P-CONT',5);
  const vm=new Interpreter(game,{world,fragment:'entry'});expect(vm.run()).toMatchObject({status:'returned',value:0,text:['\n']});expect(vm.world().getWord(old,0)).toBe(123);expect(vm.world().global('P-CONT')).toBe(0);
  const reserved=initial.fork();reserved.setGlobal('RESERVE-PTR',1);expect(()=>new Interpreter(game,{world:reserved,fragment:'entry'})).toThrow('Reserved');
});
it('rejects unsupported reserve checkpoints, invalid program IDs and accidental ordinary PARSER calls',()=>{
  expect(()=>new Interpreter(game,{routine:adapter.id})).toThrow('removed');
  const vm=new Interpreter(game,{world:initial,fragment:'entry'}),snapshot=vm.checkpoint(),global=game.bundle.payload.memory.globals.find(g=>g.name==='RESERVE-PTR')!;
  snapshot.world.bytes[global.address+1]=1;expect(()=>Interpreter.restore(game,snapshot)).toThrow('Reserved');
  const invalid=vm.checkpoint();invalid.frames[0]!.routine=game.bundle.payload.initialization.routine.id;expect(()=>Interpreter.restore(game,invalid)).toThrow();
});
it('executes original MANY-CHECK refusal before TAKE-CHECK without moving objects',()=>{
  const world=checkWorld('LOOK',1,[id('LAMP'),id('SWORD')]),vm=new Interpreter(game,{world,fragment:'checks'});
  const result=vm.run();expect(result).toMatchObject({status:'returned',value:0});expect(result.text.join('')).toContain('multiple direct objects');expect(vm.world().parent(id('LAMP'))).toBe(world.parent(id('LAMP')));
});
it('runs translated implicit taking under a syntax TAKE rule, without counting a move',()=>{
  const row=game.bundle.payload.vocabulary.verbs.flatMap(v=>v.rows.map(r=>({v,r}))).find(({r})=>r.slots.length===1&&r.slots[0]!.rules.includes('TAKE')&&r.slots[0]!.rules.includes('HAVE'))!;
  expect(row).toBeDefined();const world=checkWorld(row.v.name,row.r.id,[id('LAMP')]),vm=new Interpreter(game,{world,fragment:'checks'}),result=vm.run();
  expect(result).toMatchObject({status:'returned',value:1});expect(result.text.join('')).toBe('(Taken)\n');expect(vm.world().parent(id('LAMP'))).toBe(world.global('PLAYER'));expect(vm.world().global('MOVES')).toBe(world.global('MOVES'));
});
it('allows valid TAKE multiplicity and restores fragment state and memory on output-budget failure',()=>{
  const world=checkWorld('TAKE',8,[id('LAMP'),id('SWORD')]);expect(new Interpreter(game,{world,fragment:'checks'}).run()).toMatchObject({status:'returned',value:1});
  const failed=new Interpreter(game,{world:checkWorld('GIVE',2,[id('LAMP'),id('SWORD')]),fragment:'checks',limits:{output:2}}),before=failed.stateHash();expect(failed.run()).toMatchObject({status:'error',text:[]});expect(failed.stateHash()).toBe(before);
});

it('restores player context on a fresh entry and preserves actor/lighting on quoted SAY continuation',()=>{
  const world=initial.fork(),player=world.global('PLAYER');world.move(player,id('NARROW-TUNNEL'));world.setGlobal('WINNER',id('ROBOT'));world.setGlobal('LIT',0);
  const fresh=new Interpreter(game,{world,fragment:'entry'});expect(fresh.run()).toMatchObject({status:'suspended',wait:{kind:'READ'}});expect(fresh.world().global('WINNER')).toBe(player);expect(fresh.world().global('HERE')).toBe(id('NARROW-TUNNEL'));expect(fresh.world().global('LIT')).toBe(1);
  const quoted=initial.fork();quoted.setGlobal('WINNER',id('ROBOT'));quoted.setGlobal('QUOTE-FLAG',1);quoted.setGlobal('P-CONT',5);quoted.setGlobal('LIT',0);quoted.setGlobal('PRSA',game.bundle.payload.symbols.symbols.find(s=>s.name==='V?SAY')!.number!);
  const continued=new Interpreter(game,{world:quoted,fragment:'entry'});expect(continued.run()).toMatchObject({status:'returned',value:0,text:[]});expect(continued.world().global('WINNER')).toBe(id('ROBOT'));expect(continued.world().global('LIT')).toBe(0);
});

it('rejects synthetic reference contexts as startup conformance evidence',()=>{
  expect(()=>auditStartup(game,initial,runReference([],2,{context:{room:'TEA-ROOM',inventory:[]}}))).toThrow('first reference READ');
});
