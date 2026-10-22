import { expect, it } from 'vitest';
import { Interpreter, TurnLoop, loadGame } from '../src/engine/index.ts';
import type { GameAction, LoadedGame, WorldState } from '../src/engine/index.ts';
import { analyzeSymbols, atomName, BUNDLE_VERSIONS, compileMemory, compileVocabulary, compileWorldMetadata, createBundle, expandMacros, head, linkMemoryLogic, loadProgram, logicExpressions, mapLogicSources, packBundle, print, runtimeLogic, translateLogic } from '../src/zil/index.ts';
import type { Sequence } from '../src/zil/index.ts';
import { compileSourcePath, runtimeSymbols } from '../tools/zil/compile.ts';
import { sourceFiles } from '../tools/zil/program.ts';
import { auditClock, auditInterruptReachability } from '../tools/engine/clock.ts';
import { runReference } from '../tools/reference/runner.ts';
import type { ReferenceContext } from '../tools/reference/runner.ts';
import { loadSymbols } from '../tools/reference/symbols.ts';
import { decodeState, memories } from '../tools/reference/state.ts';
const full=loadGame(packBundle(compileSourcePath('reference/zork2'))),interrupts=loadSymbols().routines.filter(r=>r.name.startsWith('I-')).map(r=>r.name);
const original=loadProgram(sourceFiles('reference/zork2'),{entry:'zork2.zil'}),expanded=expandMacros(original.forms,original.definitions,original.globals).forms;
const wait=expanded.find(n=>head(n)==='ROUTINE'&&atomName((n as Sequence).items[1])==='V-WAIT')!;
// Original QUEUE/INT/CLOCKER and expanded V-WAIT. Callbacks are deliberately small
// test doubles for ordering/requeue/failure cases; story tests below run real I-*.
function fixture(overrides:Record<string,string>={}){
  const source='<GLOBAL HERE FIRST> <GLOBAL P-WON 1> <GLOBAL MOVES 0> <ROOM FIRST (DESC "First")> <ROUTINE GO () 1>\n'+sourceFiles('reference/zork2').get('gclock.zil')+'\n'+print(wait)+'\n'+interrupts.map((name,i)=>'<ROUTINE '+name+' () '+(overrides[name] ?? '<PRINTN '+(i+1)+'> <PRINTI ","> <RFALSE>')+'>').join('\n')+'\n<ROUTINE V-LOOK () 1> <SYNTAX LOOK = V-LOOK>';
  const files=new Map([['clock.zil',source]]),program=loadProgram(files,{entry:'clock.zil'}),forms=expandMacros(program.forms,program.definitions,program.globals).forms;
  const names=(kind:string)=>forms.filter(n=>head(n)===kind).map(n=>atomName((n as Sequence).items[1])!);
  const analysis=analyzeSymbols(program,forms,{objects:['FIRST'],globals:names('GLOBAL'),routines:names('ROUTINE'),words:[{name:'LOOK'}],constants:{'ACT?LOOK':255,'V?LOOK':0}});
  const world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis),operations=translateLogic(forms,analysis),memory=compileMemory(forms,analysis,world,vocabulary,operations.strings),logic=linkMemoryLogic(operations,memory),mapped=mapLogicSources(logic,files,{forms});
  return loadGame(packBundle(createBundle({game:{id:'clock-test',title:'Original clock fixture'},versions:BUNDLE_VERSIONS,initialization:{kind:'call-entry',routine:{name:'GO',id:1},checkpoint:'pre-GO',rng:{algorithm:'xorshift32-v1',seed:2}},gateRules:[],world,vocabulary,memory,strings:operations.strings,symbols:runtimeSymbols(analysis,memory),logic:runtimeLogic(mapped)},{sources:mapped.sources,report:mapped.report,parser:null},[{spdx:'MIT',text:'Original GCLOCK/V-WAIT: reference/zork2/LICENSE; synthetic test callbacks.'}])));
}
const clock=fixture();
const routine=(game:LoadedGame,name:string)=>game.bundle.payload.logic.routines.find(r=>r.name===name)!.id;
function call(game:LoadedGame,world:WorldState,name:string,args:number[]=[]){const vm=new Interpreter(game,{world,routine:routine(game,name),args}),result=vm.run();return {vm,result,world:vm.world()};}
function queued(game:LoadedGame,world:WorldState,name:string,tick:number,options:{enabled?:number;demon?:boolean}={}){
  const allocation=call(game,world,options.demon?'INT':'QUEUE',options.demon?[routine(game,name),1]:[routine(game,name),tick&65535]);expect(allocation.result.status).toBe('returned');
  if(allocation.result.status!=='returned')throw new Error('queue failed');const address=allocation.result.value,next=allocation.world;
  next.putWord(address,1,tick&65535);next.putWord(address,0,options.enabled ?? 1);return {world:next,address};
}
it('allocates fixed six-byte slots backwards, preserves enable state and reuses an existing routine without changing demon bounds',()=>{
  const initial=new Interpreter(clock).world(),base=initial.global('C-TABLE'),a=call(clock,initial,'QUEUE',[routine(clock,'I-SWORD'),5]);
  expect(a.result).toMatchObject({status:'returned',value:base+174});expect([a.world.global('C-INTS'),a.world.global('C-DEMONS')]).toEqual([174,180]);expect(a.world.getWord(base+174)).toBe(0);
  a.world.putWord(base+174,0,1);const b=call(clock,a.world,'QUEUE',[routine(clock,'I-SWORD'),9]);expect(b.result).toMatchObject({value:base+174});expect(b.world.getWord(base+174)).toBe(1);expect(b.world.getWord(base+174,1)).toBe(9);expect(b.world.global('C-INTS')).toBe(174);
  const demon=call(clock,b.world,'INT',[routine(clock,'I-SWORD'),1]);expect(demon.world.global('C-DEMONS')).toBe(180);
  const c=call(clock,demon.world,'INT',[routine(clock,'I-MATCH'),1]);expect(c.result).toMatchObject({value:base+168});expect([c.world.global('C-INTS'),c.world.global('C-DEMONS')]).toEqual([168,174]);
  expect(initial.global('C-INTS')).toBe(180);
});
it('skips disabled and zero ticks, decrements positive ticks, and executes signed negative ticks repeatedly',()=>{
  let world=new Interpreter(clock).world();const slots=[];
  for(const [name,tick,enabled] of [['I-SWORD',1,0],['I-MATCH',0,1],['I-LANTERN',2,1],['I-WAND',-1,1]] as const){const q=queued(clock,world,name,tick,{enabled});world=q.world;slots.push(q.address);}
  const first=call(clock,world,'CLOCKER');expect(first.result).toMatchObject({status:'returned',value:0});expect(first.result.text.join('')).toBe((interrupts.indexOf('I-WAND')+1)+',');
  expect(slots.map(a=>first.world.getWord(a,1))).toEqual([1,0,1,65534]);expect(first.world.global('MOVES')).toBe(1);
  const second=call(clock,first.world,'CLOCKER');expect(second.result.text.join('')).toBe((interrupts.indexOf('I-WAND')+1)+','+(interrupts.indexOf('I-LANTERN')+1)+',');expect(slots.map(a=>second.world.getWord(a,1))).toEqual([1,0,0,65533]);
});
it('selects the demon window when P-WON is false and suppresses one CLOCKER when CLOCK-WAIT is set',()=>{
  const initial=new Interpreter(clock).world(),demon=queued(clock,initial,'I-SWORD',-1,{demon:true}),timer=queued(clock,demon.world,'I-MATCH',1);
  timer.world.setGlobal('P-WON',0);const first=call(clock,timer.world,'CLOCKER');expect(first.result.text.join('')).toBe('1,');expect(first.world.getWord(timer.address,1)).toBe(1);
  first.world.setGlobal('P-WON',1);first.world.setGlobal('CLOCK-WAIT',1);const skipped=call(clock,first.world,'CLOCKER');expect(skipped.result).toMatchObject({value:0,text:[]});expect(skipped.world.global('MOVES')).toBe(1);expect(skipped.world.global('CLOCK-WAIT')).toBe(0);expect(skipped.world.getWord(timer.address,1)).toBe(1);
  const next=call(clock,skipped.world,'CLOCKER');expect(next.result.text.join('')).toBe((interrupts.indexOf('I-MATCH')+1)+',1,');expect(next.world.global('MOVES')).toBe(2);
});
it('keeps scanning after a true callback and returns whether any callback handled the tick',()=>{
  const game=fixture({'I-SWORD':'<PRINTI "s"> <RTRUE>','I-MATCH':'<PRINTI "m"> <RFALSE>'});let world=new Interpreter(game).world();
  world=queued(game,world,'I-SWORD',1).world;world=queued(game,world,'I-MATCH',1).world;const tick=call(game,world,'CLOCKER');expect(tick.result).toMatchObject({status:'returned',value:1,text:['m','s']});expect(tick.world.global('MOVES')).toBe(1);
});
it('honors callback writes to later slots while newly allocated earlier slots wait for the next scan',()=>{
  const game=fixture({'I-MATCH':'<PRINTI "m"> <PUT <INT I-SWORD> 0 0> <PUT <QUEUE I-WAND 1> 0 1> <RFALSE>','I-SWORD':'<PRINTI "s"> <RFALSE>','I-WAND':'<PRINTI "w"> <RFALSE>'});
  let world=new Interpreter(game).world();world=queued(game,world,'I-SWORD',1).world;world=queued(game,world,'I-MATCH',1).world;
  const first=call(game,world,'CLOCKER');expect(first.result.text.join('')).toBe('m');expect(first.world.global('C-INTS')).toBe(162);const second=call(game,first.world,'CLOCKER');expect(second.result.text.join('')).toBe('w');
});
it('preserves source signed wrapping and callback requeue timing without replaying a fired one-shot',()=>{
  const game=fixture({'I-SWORD':'<PRINTI "s"> <QUEUE I-SWORD 2> <RFALSE>'});const q=queued(game,new Interpreter(game).world(),'I-SWORD',1);
  const first=call(game,q.world,'CLOCKER');expect(first.result.text.join('')).toBe('s');expect(first.world.getWord(q.address,1)).toBe(2);
  const second=call(game,first.world,'CLOCKER');expect(second.result.text).toEqual([]);expect(second.world.getWord(q.address,1)).toBe(1);expect(call(game,second.world,'CLOCKER').result.text.join('')).toBe('s');
  const edge=queued(clock,new Interpreter(clock).world(),'I-SWORD',-32768);edge.world.setGlobal('MOVES',65535);const wrapped=call(clock,edge.world,'CLOCKER');expect(wrapped.world.getWord(edge.address,1)).toBe(32767);expect(wrapped.world.global('MOVES')).toBe(0);expect(wrapped.result.text.join('')).toBe('1,');
});
it('lets V-WAIT stop after a handled tick and prevents the following main-loop CLOCKER from adding a move',()=>{
  const game=fixture({'I-SWORD':'<PRINTI "event"> <RTRUE>'}),q=queued(game,new Interpreter(game).world(),'I-SWORD',2),waited=call(game,q.world,'V-WAIT');
  expect(waited.result.text.join('')).toBe('Time passes...\nevent');expect(waited.world.global('MOVES')).toBe(2);expect(waited.world.global('CLOCK-WAIT')).toBe(1);
  const skipped=call(game,waited.world,'CLOCKER');expect(skipped.world.global('MOVES')).toBe(2);expect(skipped.world.global('CLOCK-WAIT')).toBe(0);
  const all=call(clock,new Interpreter(clock).world(),'V-WAIT');expect(all.world.global('MOVES')).toBe(3);expect(all.world.global('CLOCK-WAIT')).toBe(1);
});
it('rolls back queue edits, callback output, random draws and move counts on a failing callback',()=>{
  const game=fixture({'I-SWORD':'<PRINTI "lost"> <RANDOM 10> <QUEUE I-SWORD 5> </ 1 0>'}),q=queued(game,new Interpreter(game).world(),'I-SWORD',1),vm=new Interpreter(game,{world:q.world,routine:routine(game,'CLOCKER')}),hash=vm.stateHash();
  expect(vm.run()).toMatchObject({status:'error',cause:'Division by zero',text:[],random:[]});expect(vm.stateHash()).toBe(hash);
});
it('registers all 23 original interrupt identities and exercises every slot through source CLOCKER/APPLY',()=>{
  const readiness=auditInterruptReachability(full);expect(readiness).toHaveLength(23);expect(readiness.map(r=>r.name)).toEqual(interrupts);
  let world=new Interpreter(clock).world();for(const name of interrupts)world=queued(clock,world,name,1).world;
  expect(world.global('C-INTS')).toBe(180-23*6);const tick=call(clock,world,'CLOCKER');expect(tick.result.text.join('')).toBe(interrupts.map((_,i)=>(23-i)+',').join(''));expect(tick.world.global('MOVES')).toBe(1);
  let actual=new Interpreter(full).world();for(const row of readiness){const allocation=call(full,actual,'QUEUE',[row.id,2]);expect(allocation.result.status).toBe('returned');actual=allocation.world;}
  actual.setGlobal('P-WON',1);for(let offset=42;offset<180;offset+=6)actual.putWord(actual.global('C-TABLE')+offset,0,1);
  const scheduled=call(full,actual,'CLOCKER');expect(scheduled.result).toMatchObject({status:'returned',value:0,text:[]});expect(scheduled.world.global('MOVES')).toBe(1);expect(Array.from({length:23},(_,n)=>scheduled.world.getWord(scheduled.world.global('C-TABLE')+42+6*n,1))).toEqual(Array(23).fill(1));
  expect(actual.global('C-INTS')).toBe(42);expect(Array.from({length:23},(_,n)=>actual.getWord(actual.global('C-TABLE')+42+6*n,2))).toEqual([...readiness].reverse().map(r=>r.id));
});

function act(table:string,verb:string,prso?:string,preposition?:string):GameAction {
  const rows=full.bundle.payload.vocabulary.verbs.find(v=>v.name===table)!.rows.filter(r=>r.action.name===verb&&r.slots.length===(prso?1:0)&&(preposition===undefined||r.slots[0]?.preposition?.name===preposition)),row=rows.find(r=>!r.slots[0]?.preposition) ?? rows[0]!;
  if(!row)throw new Error('Missing test syntax '+table+'/'+verb);
  return {kind:'act',actor:'PLAYER',verb,lexicalTable:table,syntax:row.id,...(prso?{prso}:{})};
}
const walk=(direction:string):GameAction=>({kind:'walk',actor:'PLAYER',direction});
function compareClockTurns(actions:GameAction[],commands:string[],context?:ReferenceContext){
  const reference=runReference(commands,2,{context,maxInstructions:20_000_000}),snapshots=[...memories(reference)],tape=reference.random.filter(r=>r.category==='game');
  let loop=new TurnLoop(full,{replay:tape});expect(loop.start().text.join('')).toBe(reference.transcript[0]);
  if(context){
    const world=loop.world(),id=(name:string)=>full.bundle.payload.world.entities.find(e=>e.name===name)!.id;
    world.move(world.global('PLAYER'),id(context.room));world.setGlobal('HERE',id(context.room));world.setGlobal('LIT',1);
    for(const name of context.inventory)world.move(id(name),world.global('PLAYER'));
    const cp=loop.checkpoint();cp.interpreter.world=world.snapshot();loop=TurnLoop.restore(full,cp,{replay:tape});
  }
  const initial=reference.checkpoints.findLastIndex(c=>c.input===-1&&c.kind==='read');auditClock(full,loop.world(),snapshots[initial]!);
  const ticks:number[]=[],warnings:{before:ReturnType<TurnLoop['checkpoint']>;action:GameAction;text:string}[]=[];
  for(const [i,action] of actions.entries()){
    const before=loop.checkpoint(),priorMoves=loop.world().global('MOVES'),result=loop.execute(action),chunks=[...result.text];let delta=result.clockTicks;
    if(result.status==='host'){
      expect(result.boundary).toEqual({kind:'host',operation:'SAVE'});expect(result.clockTicks).toBe(0);
      // The reference host succeeds at SAVE. Neither storage nor session import
      // is part of this clock test; supply the same primitive success once.
      const resumed=loop.resumePrimitive(1);expect(resumed).toMatchObject({status:'resolved',boundary:{kind:'input'},clockTicks:0});chunks.push(...resumed.text);delta+=resumed.clockTicks;
    }else expect(result,commands[i]+' '+i).toMatchObject({status:'resolved',boundary:{kind:'input'}});
    const text=chunks.join('');expect(text,commands[i]+' '+i).toBe(reference.transcript[i+1]);
    const index=reference.checkpoints.findLastIndex(c=>c.input===i&&c.kind==='read'),ram=snapshots[index]!;
    const audit=auditClock(full,loop.world(),ram);expect(delta,commands[i]+' '+i).toBe((audit.moves-priorMoves+65536)%65536);ticks.push(delta);
    expect(loop.checkpoint().interpreter.rng.cursor).toBe(reference.random.slice(0,reference.checkpoints[index]!.randomPosition).filter(r=>r.category==='game').length);
    if(/The lamp (appears|is definitely|is nearly)|You'd better have more light/.test(text))warnings.push({before,action,text});
    const hash=loop.stateHash();loop=TurnLoop.restore(full,JSON.parse(JSON.stringify(loop.checkpoint())),{replay:tape});expect(loop.stateHash()).toBe(hash);
  }
  return {loop,reference,tape,ticks,warnings};
}
it('matches the complete lantern lifetime and every clock slot after LOOK, INVENTORY, SCORE, SAVE, WAIT and a game-level failure',()=>{
  const opening=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),act('LOOK','LOOK'),act('INVENTORY','INVENTORY'),act('SCORE','SCORE'),act('SAVE','SAVE'),act('WAIT','WAIT'),act('EXAMINE','EXAMINE','ROBOT')];
  const actions=[...opening,...Array.from({length:225},()=>act('WAIT','WAIT')),act('TURN','LAMP-ON','LAMP'),act('LOOK','LOOK')],commands=['take lamp','turn on lamp','look','inventory','score','save','wait','examine robot',...Array(225).fill('wait'),'turn on lamp','look'];
  const {loop,reference,tape,ticks,warnings}=compareClockTurns(actions,commands);
  expect(ticks.slice(0,6)).toEqual([1,1,1,1,0,0]);expect(ticks[7]).toBe(1);expect(ticks).toContain(3);
  expect(warnings).toHaveLength(4);expect(warnings.map(w=>w.text)).toEqual([expect.stringContaining('appears a bit dimmer'),expect.stringContaining('definitely dimmer'),expect.stringContaining('nearly out'),expect.stringContaining("You'd better have more light")]);
  expect(reference.transcript.at(-2)).toContain("A burned-out lamp won't light.");expect(reference.routineCoverage).toContain('I-LANTERN');
  const lamp=full.bundle.payload.world.entities.find(e=>e.name==='LAMP')!.id,flag=(name:string)=>full.bundle.payload.symbols.symbols.find(s=>s.name===name)!.number!;
  expect(loop.world().hasFlag(lamp,flag('ONBIT'))).toBe(false);expect(loop.world().hasFlag(lamp,flag('RMUNGBIT'))).toBe(true);
  // Fail after the original callback has requeued itself and advanced its table
  // cursor, but before its new prompt is returned. All writes must roll back.
  const warning=warnings[0]!,cp=warning.before;cp.interpreter.output=0;cp.interpreter.limits.output=warning.text.length-1;
  const limited=TurnLoop.restore(full,cp,{replay:tape}),hash=limited.stateHash();expect(limited.execute(warning.action)).toMatchObject({status:'error',clockTicks:0,text:[],random:[],error:{cause:expect.stringContaining('output budget')}});expect(limited.stateHash()).toBe(hash);
},60000);
it('matches lantern disable/re-enable without resetting its remaining ticks',()=>{
  const actions=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),act('TURN','LAMP-OFF','LAMP'),act('WAIT','WAIT'),act('LOOK','LOOK'),act('TURN','LAMP-ON','LAMP'),act('WAIT','WAIT')];
  const {reference}=compareClockTurns(actions,['take lamp','turn on lamp','turn off lamp','wait','look','turn on lamp','wait']);expect(reference.final.deaths).toBe(0);
});
it('matches match expiry, zero-turn meta actions, WAIT early return and explicit extinguishing',()=>{
  const actions=[act('TURN','LAMP-ON','MATCH'),act('SCORE','SCORE'),act('SAVE','SAVE'),act('INVENTORY','INVENTORY'),act('TURN','LAMP-ON','MATCH'),act('WAIT','WAIT'),act('TURN','LAMP-ON','MATCH'),act('TURN','LAMP-OFF','MATCH'),act('WAIT','WAIT')];
  const {reference,ticks}=compareClockTurns(actions,['turn on match','score','save','inventory','turn on match','wait','turn on match','turn off match','wait'],{room:'INSIDE-BARROW',inventory:['MATCH']});
  expect(reference.routineCoverage).toContain('I-MATCH');expect(reference.transcript[4]).toContain('The match has gone out.');expect(reference.transcript[6]).toContain('The match has gone out.');expect(reference.transcript[8]).toContain('The match is out.');expect(ticks[5]).toBe(1);
});
it('matches clock state and remaining lantern life through a direct death and following turns',()=>{
  const actions=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),walk('SOUTH'),walk('SOUTH'),act('JUMP','LEAP','BRIDGE','OFF'),act('LOOK','LOOK'),act('INVENTORY','INVENTORY'),act('SCORE','SCORE'),act('SAVE','SAVE'),act('WAIT','WAIT')];
  const {reference}=compareClockTurns(actions,['take lamp','turn on lamp','south','south','jump off bridge','look','inventory','score','save','wait']);expect(reference.final.deaths).toBe(1);expect(reference.transcript[5]).toContain('You have died');
});
it('matches a scheduled sphere death inside V-WAIT and the clock cleanup after the callback',()=>{
  const actions=[walk('EAST'),walk('SOUTH'),act('TAKE','TAKE','PALANTIR-1'),act('WAIT','WAIT'),act('WAIT','WAIT'),act('WAIT','WAIT'),act('LOOK','LOOK')];
  const {reference,ticks}=compareClockTurns(actions,['east','south','take sphere','wait','wait','wait','look'],{room:'MAGNET-ROOM',inventory:['LAMP']});
  expect(reference.routineCoverage).toContain('I-SPHERE');expect(reference.final.deaths).toBe(1);expect(reference.transcript[6]).toContain('obscure poisoning');expect(ticks[5]).toBeLessThan(3);
});
it('detects corrupt enabled/tick/routine words, bounds, allocation tail, lantern cursor and lamp flags independently',()=>{
  const loop=new TurnLoop(full);loop.start();const world=loop.world(),ram=[...memories(runReference([]))].at(-1)!;
  const lamp=full.bundle.payload.world.entities.find(e=>e.name==='LAMP')!.id,on=full.bundle.payload.symbols.symbols.find(s=>s.name==='ONBIT')!.number!;
  for(const corrupt of [(w:WorldState)=>w.putWord(w.global('C-TABLE')+174,0,0),(w:WorldState)=>w.putWord(w.global('C-TABLE')+174,1,3),(w:WorldState)=>w.putWord(w.global('C-TABLE')+174,2,routine(full,'I-MATCH')),(w:WorldState)=>w.setGlobal('C-INTS',162),(w:WorldState)=>w.putByte(w.global('C-TABLE')+180,0,1),(w:WorldState)=>w.setGlobal('LAMP-TABLE',w.global('LAMP-TABLE')+4),(w:WorldState)=>w.setFlag(lamp,on)]){const damaged=world.fork();corrupt(damaged);expect(()=>auditClock(full,damaged,ram)).toThrow('Clock');}
});


it('keeps CLOCKER invocation confined to the original MAIN-LOOP-1 and V-WAIT call sites',()=>{
  const callers=full.bundle.payload.logic.routines.flatMap(r=>[...logicExpressions(r)].filter(e=>e.op==='call'&&e.routine.name==='CLOCKER').map(()=>r.name));
  expect(callers.sort()).toEqual(['MAIN-LOOP-1','V-WAIT']);
});
