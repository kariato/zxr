import { expect, it, vi } from 'vitest';
import { GameRandom, Interpreter, TurnLoop, loadGame, word } from '../src/engine/index.ts';
import type { GameAction } from '../src/engine/index.ts';
import { analyzeSymbols, BUNDLE_VERSIONS, compileMemory, compileVocabulary, compileWorldMetadata, createBundle, expandMacros, head, atomName, linkMemoryLogic, loadProgram, mapLogicSources, packBundle, print, runtimeLogic, translateLogic } from '../src/zil/index.ts';
import type { Sequence } from '../src/zil/index.ts';
import { compileSourcePath, runtimeSymbols } from '../tools/zil/compile.ts';
import { sourceFiles } from '../tools/zil/program.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2')));
const original=loadProgram(sourceFiles('reference/zork2'),{entry:'zork2.zil'});
// The real PROB macro and ZPROB body, in a minimal executable fixture. Normal
// play below separately exercises actual clock/game callbacks, without an oracle tape.
const probSource=print(original.definitions.get('PROB')!)+'\n'+print(original.forms.find(n=>head(n)==='ROUTINE'&&atomName((n as Sequence).items[1])==='ZPROB')!);
const source='<GLOBAL HERE FIRST> <GLOBAL LUCKY 0> <GLOBAL BASE 50> <ROOM FIRST (DESC "First")>\n<ROUTINE GO () <PRINTN <PROB ,BASE>> <PRINTN <PROB ,BASE T>> <PRINTN <RANDOM 17>>>\n'+probSource+'\n<ROUTINE V-LOOK () 1> <SYNTAX LOOK = V-LOOK>';
const files=new Map([['prob.zil',source]]),program=loadProgram(files,{entry:'prob.zil'}),forms=expandMacros(program.forms,program.definitions,program.globals).forms;
const names=(kind:string)=>forms.filter(n=>head(n)===kind).map(n=>atomName((n as Sequence).items[1])!);
const analysis=analyzeSymbols(program,forms,{objects:['FIRST'],globals:names('GLOBAL'),routines:names('ROUTINE'),words:[{name:'LOOK'}],constants:{'ACT?LOOK':255,'V?LOOK':0}});
const world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis),operations=translateLogic(forms,analysis),memory=compileMemory(forms,analysis,world,vocabulary,operations.strings),logic=linkMemoryLogic(operations,memory),mapped=mapLogicSources(logic,files,{forms});
const probGame=loadGame(packBundle(createBundle({game:{id:'prob-test',title:'Source PROB fixture'},versions:BUNDLE_VERSIONS,initialization:{kind:'call-entry',routine:{name:'GO',id:1},checkpoint:'pre-GO',rng:{algorithm:'xorshift32-v1',seed:2}},gateRules:[],world,vocabulary,memory,strings:operations.strings,symbols:runtimeSymbols(analysis,memory),logic:runtimeLogic(mapped)},{sources:mapped.sources,report:mapped.report,parser:null},[{spdx:'MIT',text:'Original PROB/ZPROB: reference/zork2/LICENSE; synthetic test entry.'}])));

// Independent arbitrary-precision model: no signed JavaScript bitwise arithmetic.
const mask=(1n<<32n)-1n;
function next(state:bigint){state^=(state<<13n)&mask;state^=state>>17n;state^=(state<<5n)&mask;return state;}
function modelDraw(state:bigint,range:number){const size=BigInt(range),limit=mask/size*size;let attempts=0,n:bigint;do{state=next(state);n=state-1n;attempts++;}while(n>=limit);return {state,result:Number(n%size+1n),attempts};}
function undoLeft(value:bigint,shift:bigint){let result=value;for(let i=0;i<32/Number(shift);i++)result=value^((result<<shift)&mask);return result;}
function undoRight(value:bigint,shift:bigint){let result=value;for(let i=0;i<32/Number(shift);i++)result=value^(result>>shift);return result;}
function act(table:string,verb:string,prso?:string):GameAction {
  const rows=game.bundle.payload.vocabulary.verbs.find(v=>v.name===table)!.rows.filter(r=>r.action.name===verb&&r.slots.length===(prso?1:0)),row=rows.find(r=>!r.slots[0]?.preposition) ?? rows[0]!;
  return {kind:'act',actor:'PLAYER',verb,lexicalTable:table,syntax:row.id,...(prso?{prso}:{})};
}
function speech():GameAction {const row=game.bundle.payload.vocabulary.verbs.find(v=>v.name==='SAY')!.rows.find(r=>r.action.name==='SAY'&&!r.slots.length)!;return {kind:'say',actor:'PLAYER',verb:'SAY',lexicalTable:'SAY',syntax:row.id,words:['HELLO']};}
const choices=[act('TAKE','TAKE','LAMP'),act('TAKE','TAKE','SWORD'),act('TURN','LAMP-ON','LAMP'),act('SCORE','SCORE'),act('SAVE','SAVE'),act('QUIT','QUIT'),speech(),{kind:'walk',actor:'PLAYER',direction:'SOUTH'},act('LOOK','LOOK'),act('INVENTORY','INVENTORY'),...Array.from({length:16},()=>act('WAIT','WAIT'))] as GameAction[];

it.each([0,1,2,19,0xffffffff])('reproduces every normal-play result, draw and complete state hash from seed %i',seed=>{
  const options={seed},left=new TurnLoop(game,options);options.seed=123;let right=new TurnLoop(game,{seed});
  expect(left.checkpoint().interpreter.rng.initialSeed).toBe(seed);expect(left.start()).toEqual(right.start());expect(left.stateHash()).toBe(right.stateHash());
  const noise=new GameRandom(987654321);let requests=0;
  for(const [i,action] of choices.entries()){
    // Interleave unrelated RNG work and rebuild the right continuation at every
    // boundary. Neither can change the left run or its next accepted input.
    for(let n=0;n<5;n++)noise.random(32767);
    const a=left.execute(action),b=right.execute(Object.fromEntries(Object.entries(action).reverse()));expect(a,'input '+i).toEqual(b);expect(a.status).not.toBe('error');expect(a.status).not.toBe('rejected');
    requests+=a.random.length;expect(left.stateHash(),'input '+i).toBe(right.stateHash());
    if(a.status==='host'){
      expect(a.boundary).toEqual({kind:'host',operation:'SAVE'});right=TurnLoop.restore(game,JSON.parse(JSON.stringify(right.checkpoint())));
      const first=left.resumePrimitive(1),second=right.resumePrimitive(1);expect(first).toEqual(second);expect(first.status).toBe('resolved');requests+=first.random.length;
    }
    if(a.status==='pending'){
      expect(a.boundary).toMatchObject({kind:'decision',routine:'YES?'});right=TurnLoop.restore(game,JSON.parse(JSON.stringify(right.checkpoint())));
      const first=left.answer('NO'),second=right.answer('NO');expect(first).toEqual(second);expect(first.status).toBe('resolved');requests+=first.random.length;
    }
    expect(left.checkpoint().interpreter.rng.position).toBe(requests);expect(left.checkpoint().interpreter.rng.cursor).toBe(0);expect(left.stateHash()).toBe(right.stateHash());
    right=TurnLoop.restore(game,JSON.parse(JSON.stringify(right.checkpoint())));
  }
  expect(requests).toBeGreaterThan(0);
},60000);
it('preserves explicit seeds before startup, across serialized continuations, and independently of the bundle default',()=>{
  const bundleHash=game.buildHash,defaultSeed=game.bundle.payload.initialization.rng.seed;
  const seeded=new TurnLoop(game,{seed:0xffffffff}),unstarted=TurnLoop.restore(game,JSON.parse(JSON.stringify(seeded.checkpoint())));expect(unstarted.stateHash()).toBe(seeded.stateHash());expect(unstarted.start()).toEqual(seeded.start());
  const vm=new Interpreter(probGame,{seed:37}),restored=Interpreter.restore(probGame,JSON.parse(JSON.stringify(vm.checkpoint())));expect(restored.run()).toEqual(vm.run());expect(restored.stateHash()).toBe(vm.stateHash());
  const implicit=new TurnLoop(game),explicit=new TurnLoop(game,{seed:defaultSeed});expect(implicit.start()).toEqual(explicit.start());expect(implicit.stateHash()).toBe(explicit.stateHash());
  const first=game.createRandom(undefined,1),second=game.createRandom(undefined,2);expect(first.random(32767)).not.toBe(second.random(32767));expect(game.buildHash).toBe(bundleHash);expect(game.bundle.payload.initialization.rng.seed).toBe(defaultSeed);
});
it('produces different normal game draw streams for different selected seeds',()=>{
  const streams:number[][]=[];
  for(const seed of [1,2]){const loop=new TurnLoop(game,{seed});loop.start();const stream:number[]=[];
    for(let n=0;n<12;n++){const result=loop.execute(act('WAIT','WAIT'));expect(result.status).toBe('resolved');stream.push(...result.random.map(r=>r.result));}streams.push(stream);
  }
  expect(streams[0]!.length).toBeGreaterThan(0);expect(streams[0]).not.toEqual(streams[1]);
});
it.each([0,1,2,0x80000000,0xffffffff])('matches an independent BigInt RNG model for mixed request ranges from seed %i',seed=>{
  const rng=new GameRandom(seed);let state=BigInt(seed||0x6d2b79f5),requests=0;
  for(let i=0;i<1000;i++){const range=[1,2,3,7,100,300,32767][i%7]!,expected=modelDraw(state,range);state=expected.state;expect(rng.random(range)).toBe(expected.result);requests++;}
  expect(rng.snapshot()).toMatchObject({state:Number(state),position:requests,cursor:0,initialSeed:seed});expect(rng.drainEvents()).toHaveLength(requests);
});
it('rejects the high remainder without bias while counting one ZIL RANDOM request',()=>{
  const prior=undoLeft(undoRight(undoLeft(mask,5n),17n),13n);expect(next(prior)).toBe(mask);
  const rng=new GameRandom(1),snapshot=rng.snapshot();rng.restore({...snapshot,state:Number(prior)});const expected=modelDraw(prior,32767);expect(expected.attempts).toBeGreaterThan(1);
  expect(rng.random(32767)).toBe(expected.result);expect(rng.snapshot()).toMatchObject({state:Number(expected.state),position:1});expect(rng.drainEvents()).toEqual([{range:32767,result:expected.result}]);
});
it('counts reseeds as requests, preserves the configured RANDOM 0 seed, and handles the signed-word minimum',()=>{
  const rng=new GameRandom(37),first=rng.random(32767);expect(rng.random(word(-32768))).toBe(0);expect(rng.random(32767)).toBe(new GameRandom(32768).random(32767));
  expect(rng.random(0)).toBe(0);expect(rng.random(32767)).toBe(first);expect(rng.snapshot().position).toBe(5);expect(rng.drainEvents().map(e=>e.range)).toEqual([32767,-32768,32767,0,32767]);
});
it.each([0,1])('runs the original PROB and ZPROB strict thresholds and lucky range with LUCKY=%i',lucky=>{
  for(const roll of [49,50,100]){
    const vm=new Interpreter(probGame),world=vm.world();world.setGlobal('LUCKY',lucky);
    const expected=roll<50?'1':'0',tape=[{range:100,result:roll},{range:lucky?100:300,result:roll},{range:17,result:7}];
    const run=new Interpreter(probGame,{world,replay:tape}).run();expect(run).toMatchObject({status:'returned',text:[expected,expected,'7'],random:tape});
  }
  const world=new Interpreter(probGame).world();world.setGlobal('LUCKY',lucky);const vm=new Interpreter(probGame,{world,seed:19}),result=vm.run(),model=new GameRandom(19),a=model.random(100),b=model.random(lucky?100:300),c=model.random(17);
  expect(result).toMatchObject({status:'returned',text:[a<50?'1':'0',b<50?'1':'0',String(c)]});expect(vm.inspect().rng).toEqual(model.snapshot());
});
it('keeps queries, rejected inputs and caller mutations from consuming requests or changing the next accepted turn',()=>{
  const left=new TurnLoop(game,{seed:19}),right=new TurnLoop(game,{seed:19});left.start();right.start();const hash=left.stateHash();
  for(let i=0;i<5;i++){
    const view=left.world();view.setGlobal('MOVES',999);const cp=left.checkpoint();cp.interpreter.rng.state=1;cp.interpreter.world.bytes.fill(0);
    expect(left.execute({kind:'walk',actor:'PLAYER',direction:'UNKNOWN'}).status).toBe('rejected');expect(left.answer('NO').status).toBe('rejected');expect(left.resumePrimitive(0).status).toBe('rejected');expect(left.stateHash()).toBe(hash);
  }
  expect(left.execute(act('WAIT','WAIT'))).toEqual(right.execute(act('WAIT','WAIT')));expect(left.stateHash()).toBe(right.stateHash());
});
it('restores every random request and state word after a late action-budget failure, then retries identically',()=>{
  const base=new TurnLoop(game,{seed:19});base.start();base.execute(act('TAKE','TAKE','LAMP'));base.execute(act('TURN','LAMP-ON','LAMP'));
  const before=base.checkpoint(),control=TurnLoop.restore(game,before),action=act('WAIT','WAIT'),expected=control.execute(action);expect(expected.status).toBe('resolved');expect(expected.random.length).toBeGreaterThan(0);
  for(const [key,value] of [['steps',control.checkpoint().interpreter.steps-1],['output',expected.text.join('').length-1]] as const){
    const cp=JSON.parse(JSON.stringify(before));cp.interpreter.steps=0;cp.interpreter.output=0;cp.interpreter.limits[key]=value;
    let limited=TurnLoop.restore(game,cp);const hash=limited.stateHash();expect(limited.execute(action)).toMatchObject({status:'error',random:[],text:[],clockTicks:0});expect(limited.stateHash()).toBe(hash);
    const reset=limited.checkpoint();reset.interpreter.limits=before.interpreter.limits;reset.interpreter.steps=before.interpreter.steps;reset.interpreter.output=before.interpreter.output;limited=TurnLoop.restore(game,reset);
    expect(limited.stateHash()).toBe(base.stateHash());expect(limited.execute(action)).toEqual(expected);expect(limited.stateHash()).toBe(control.stateHash());
  }
});
it('does not consult ambient randomness or wall-clock entropy during normal execution or hashing',()=>{
  const loop=new TurnLoop(game,{seed:12345}),random=vi.spyOn(Math,'random').mockImplementation(()=>{throw new Error('ambient RNG');}),now=vi.spyOn(Date,'now').mockImplementation(()=>{throw new Error('wall clock');});
  try {expect(loop.start().status).toBe('resolved');for(let i=0;i<6;i++)expect(loop.execute(act('WAIT','WAIT')).status).toBe('resolved');expect(loop.stateHash()).toMatch(/^[a-f0-9]{64}$/);}finally{random.mockRestore();now.mockRestore();}
});
it('rejects invalid seeds and exhausted request counters without corrupting RNG or execution state',()=>{
  for(const seed of [-1,0.5,0x100000000,Infinity,NaN,null,'2']){
    expect(()=>new GameRandom(seed as number)).toThrow('Seed');expect(()=>new Interpreter(game,{seed:seed as number})).toThrow('Seed');expect(()=>new TurnLoop(game,{seed:seed as number})).toThrow('Seed');
  }
  const rng=new GameRandom(1);rng.restore({...rng.snapshot(),position:Number.MAX_SAFE_INTEGER});const before=rng.snapshot();expect(()=>rng.random(100)).toThrow('counter');expect(rng.snapshot()).toEqual(before);expect(rng.drainEvents()).toEqual([]);
  const fresh=new TurnLoop(game,{seed:37}),cp=fresh.checkpoint();cp.interpreter.rng.initialSeed=19;expect(()=>TurnLoop.restore(game,cp)).toThrow('unstarted');
});


it('preserves a selected seed and replay identity together when restoring a diagnostic checkpoint',()=>{
  const tape=[{range:100,result:13},{range:300,result:29},{range:17,result:7}],vm=new Interpreter(probGame,{seed:0xffffffff,replay:tape}),cp=JSON.parse(JSON.stringify(vm.checkpoint()));
  const restored=Interpreter.restore(probGame,cp,{replay:tape});expect(restored.run()).toEqual(vm.run());expect(restored.stateHash()).toBe(vm.stateHash());expect(restored.inspect().rng).toMatchObject({initialSeed:0xffffffff,position:3,cursor:3});
  expect(()=>Interpreter.restore(probGame,cp)).toThrow('snapshot');
});
