import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Interpreter, TurnLoop, loadGame } from '../src/engine/index.ts';
import type { GameAction, Selection } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { runReference } from '../tools/reference/runner.ts';
import type { ReferenceContext } from '../tools/reference/runner.ts';
import { decodeState, memories } from '../tools/reference/state.ts';
import { auditStartup } from '../tools/engine/startup.ts';
import { STORY } from '../tools/reference/symbols.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),story=readFileSync(STORY);
const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
const flag=(name:string)=>game.bundle.payload.symbols.symbols.find(s=>s.name===name)!.number!;
function act(table:string,verb:string,prso?:Selection,prsi?:Selection,preposition?:string):GameAction {
  const rows=game.bundle.payload.vocabulary.verbs.find(v=>v.name===table)!.rows.filter(r=>r.action.name===verb&&r.slots.length===(prsi?2:prso?1:0)&&(preposition===undefined||r.slots[1]?.preposition?.name===preposition)),row=rows.find(r=>!r.slots[0]?.preposition) ?? rows[0]!;
  return {kind:'act',actor:'PLAYER',verb,lexicalTable:table,syntax:row.id,...(prso?{prso}:{}),...(prsi?{prsi}:{})};
}
function say(verb:string,words:string[]):GameAction {
  const row=game.bundle.payload.vocabulary.verbs.find(v=>v.name===verb)!.rows.find(r=>r.action.name===verb&&!r.slots.length)!;
  return {kind:'say',actor:'PLAYER',verb,lexicalTable:verb,syntax:row.id,words};
}
const walk=(directions:string[]):GameAction[]=>directions.map(direction=>({kind:'walk',actor:'PLAYER',direction}));
function context(loop:TurnLoop,room:ReferenceContext,replay?:Parameters<typeof TurnLoop.restore>[2]){
  const world=loop.world();world.move(world.global('PLAYER'),id(room.room));world.setGlobal('HERE',id(room.room));world.setGlobal('WINNER',world.global('PLAYER'));world.setGlobal('LIT',1);
  for(const name of room.inventory)world.move(id(name),world.global('PLAYER'));
  const cp=loop.checkpoint();cp.interpreter.world=world.snapshot();return TurnLoop.restore(game,cp,replay);
}
function compare(actions:GameAction[],commands:string[],prepared?:ReferenceContext){
  const reference=runReference(commands,2,{context:prepared}),tape=reference.random.filter(r=>r.category==='game'),snapshots=[...memories(reference)];
  let loop=new TurnLoop(game,{replay:tape});expect(loop.start().text.join('')).toBe(reference.transcript[0]);
  if(prepared)loop=context(loop,prepared,{replay:tape});
  let moves=0;
  for(const [i,action] of actions.entries()){
    const result=loop.execute(action);expect(result,commands[i]).toMatchObject({status:'resolved',boundary:{kind:'input'},actionSequence:i+1});
    expect(result.text.join(''),commands[i]).toBe(reference.transcript[i+1]);
    const index=reference.checkpoints.findLastIndex(c=>c.kind==='read'&&c.input===i),ram=snapshots[index]!,state=decodeState(ram),world=loop.world();
    expect(result.moves,commands[i]).toBe(state.globals.MOVES);expect(result.clockTicks,commands[i]).toBe(result.moves-moves);moves=result.moves;
    for(const name of ['HERE','WINNER','LIT','PRSA','PRSO','PRSI','P-WON','P-NCN','P-LEN','P-CONT','QUOTE-FLAG','P-GETFLAGS','P-WALK-DIR','AGAIN-DIR','P-MULT','P-NOT-HERE','P-NAM','P-ADJ','P-XADJ'])expect(world.global(name),commands[i]+' '+name).toBe(state.globals[name]);
    const dictionary=game.bundle.payload.memory.segments.find(s=>s.name==='dictionary')!.base;
    for(const name of ['P-ONEOBJ','P-ADJN','P-XNAM','P-XADJN','SPELL-USED']){const own=world.global(name),original=state.globals[name]!;expect(own?own-dictionary:null,commands[i]+' '+name).toBe(original?original-ram.readUInt16BE(8):null);}
    for(const name of ['P-PRSO','P-PRSI','P-BUTS'])for(let n=0;n<50;n++)expect(world.getWord(world.global(name),n),commands[i]+' '+name+' '+n).toBe(ram.readUInt16BE(state.globals[name]!+2*n));
    for(const table of ['P-ITBL','P-OTBL'])for(let n=0;n<10;n++){
      const own=world.getWord(world.global(table),n),original=ram.readUInt16BE(state.globals[table]!+2*n);
      if(n===1&&own)expect(own-world.global('P-VTBL')).toBe(original-state.globals['P-VTBL']!);
      else if((n===3||n===5)&&own)expect(own-dictionary).toBe(original-ram.readUInt16BE(8));
      else if(n>=6&&own)expect(own-world.global('P-LEXV')).toBe(original-state.globals['P-LEXV']!);
      else expect(own,commands[i]+' '+table+' '+n).toBe(original);
    }
    const syntax=world.global('P-SYNTAX'),originalSyntax=state.globals['P-SYNTAX']!;
    if(syntax)expect(Array.from({length:8},(_,n)=>world.getByte(syntax,n))).toEqual([...story.subarray(originalSyntax,originalSyntax+8)]);
    for(const interrupt of state.interrupts){const base=world.global('C-TABLE')+interrupt.offset,ticks=world.getWord(base,1);expect([world.getWord(base),ticks>=32768?ticks-65536:ticks,game.routine(world.getWord(base,2))?.name ?? world.getWord(base,2)]).toEqual([interrupt.enabled,interrupt.ticks,interrupt.routine]);}
    for(const object of state.objects){expect([world.parent(object.id),world.nextSibling(object.id),world.firstChild(object.id)],commands[i]+' '+object.name).toEqual([object.parent,object.sibling,object.child]);expect(Array.from({length:32},(_,n)=>world.hasFlag(object.id,n)),commands[i]+' '+object.name+' flags').toEqual(Array.from({length:32},(_,n)=>(parseInt(object.attributes.slice(2*(n>>>3),2*(n>>>3)+2),16)&(128>>>(n%8)))!==0));}
    expect(loop.checkpoint().interpreter.rng.cursor).toBe(reference.random.slice(0,reference.checkpoints[index]!.randomPosition).filter(r=>r.category==='game').length);
    const hash=loop.stateHash();loop=TurnLoop.restore(game,JSON.parse(JSON.stringify(loop.checkpoint())),{replay:tape});expect(loop.stateHash()).toBe(hash);
  }
  return {loop,reference};
}
it('publishes original startup at READ, validates all startup memory, and restores without repeating output',()=>{
  const loop=new TurnLoop(game),before=loop.stateHash();expect(loop.execute(act('LOOK','LOOK'))).toMatchObject({status:'rejected',text:[],clockTicks:0});expect(loop.stateHash()).toBe(before);
  const initial=loop.start();expect(initial).toMatchObject({status:'resolved',actionSequence:0,clockTicks:0,boundary:{kind:'input'}});expect(initial.text.join('')).toBe(runReference([]).transcript[0]);
  expect(auditStartup(game,loop.world(),runReference([]))).toMatchObject({globals:168,objects:251,tables:45});
  const restored=TurnLoop.restore(game,JSON.parse(JSON.stringify(loop.checkpoint()))),hash=restored.stateHash();expect(restored.start()).toMatchObject({status:'rejected',text:[]});expect(restored.stateHash()).toBe(hash);
  expect(restored.execute(act('LOOK','LOOK')).text.join('')).toBe(runReference(['look']).transcript[1]);
});
it('assembles exact turns through failed actions, multiplicity, implicit taking, speech, walks and source clock exemptions',()=>{
  const actions=[act('TAKE','TAKE','LAMP'),act('DROP','DROP','LAMP'),act('GIVE','GIVE','LAMP','ROBOT'),act('WAVE','WAVE','LAMP'),act('TAKE','TAKE',['LAMP','SWORD']),act('EXAMINE','EXAMINE',['LAMP','SWORD']),act('DROP','DROP','ALL'),act('TAKE','TAKE','ALL'),act('LOOK','LOOK'),say('SAY',['HELLO']),act('SCORE','SCORE'),act('INVENTORY','INVENTORY'),act('WAIT','WAIT'),...walk(['SOUTH','NORTH'])];
  compare(actions,['take lamp','drop lamp','give lamp to robot','wave lamp','take lamp and sword','examine lamp and sword','drop all','take all','look','say "hello"','score','inventory','wait','south','north']);
});
it('finishes actor commands with player context restored before the next choice, including cage rescue',()=>{
  const actions=[act('GIVE','GIVE','LAMP','ROBOT'),{...act('DROP','DROP','LAMP'),actor:'ROBOT'},{...act('TAKE','TAKE','LAMP'),actor:'ROBOT'},{...act('LOOK','LOOK'),actor:'ROBOT'},{kind:'walk',actor:'ROBOT',direction:'EAST'},...walk(['EAST']),{kind:'walk',actor:'ROBOT',direction:'SOUTH'},...walk(['SOUTH']),act('TAKE','TAKE','PALANTIR-1'),{...act('RAISE','RAISE','CAGE'),actor:'ROBOT'},act('LOOK','LOOK')] as GameAction[];
  compare(actions,['give lamp to robot','robot, drop lamp','robot, take lamp','robot, look','robot, east','east','robot, south','south','take sphere','robot, raise cage','look'],{room:'MAGNET-ROOM',inventory:['LAMP']});
});
it('preserves vehicle context through the bucket trip and its M-END rise and disembark',()=>{
  const a=['SOUTH','SOUTH','SOUTH','SW','SOUTH','SE','IN'],b=['OUT','NORTH','NE'],c=['SOUTH','SW','SW','SE'];
  const actions=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),...walk(a),act('TAKE','TAKE','TEAPOT'),...walk(b),act('FILL','FILL','TEAPOT'),...walk(c),say('ANSWER',['WELL']),...walk(['EAST','EAST']),act('PUT','PUT','LAMP','BUCKET'),act('TAKE','TAKE','LAMP'),act('ENTER','THROUGH','BUCKET'),act('TAKE','TAKE','LAMP'),act('LOOK','LOOK'),act('POUR','DROP','WATER','BUCKET','IN'),act('STAND','STAND')];
  compare(actions,['take lamp','turn on lamp',...a.map(d=>d.toLowerCase()),'take teapot',...b.map(d=>d.toLowerCase()),'fill teapot',...c.map(d=>d.toLowerCase()),'answer "well"','east','east','put lamp in bucket','take lamp','enter bucket','take lamp','look','pour water in bucket','stand']);
});
it('binds room pseudo operands and source missing matches at a real fresh input boundary',()=>{
  const hole={pseudo:{room:'TEA-ROOM',word:'HOLE'}};
  compare([act('EXAMINE','EXAMINE',hole),act('PUT','PUT','LAMP',hole),act('EXAMINE','EXAMINE','ROBOT'),act('LOOK','LOOK')],['examine hole','put lamp in hole','examine robot','look'],{room:'TEA-ROOM',inventory:['LAMP']});
});
it('returns pending decisions and resumes their translated routines without another action or clock tick',()=>{
  const reference=runReference(['quit','no','look']),loop=new TurnLoop(game);loop.start();const pending=loop.execute(act('QUIT','QUIT'));
  expect(pending).toMatchObject({status:'pending',clockTicks:0,actionSequence:1,boundary:{kind:'decision',routine:'YES?',choices:['YES','NO']}});expect(pending.text.join('')).toBe(reference.transcript[1]);
  const hash=loop.stateHash();expect(loop.execute(act('LOOK','LOOK'))).toMatchObject({status:'rejected',text:[]});expect(loop.answer('RESTORE')).toMatchObject({status:'rejected',text:[]});expect(loop.stateHash()).toBe(hash);
  const restored=TurnLoop.restore(game,JSON.parse(JSON.stringify(loop.checkpoint()))),answer=restored.answer('NO');expect(answer).toMatchObject({status:'resolved',clockTicks:0,actionSequence:1,boundary:{kind:'input'}});expect(answer.text.join('')).toBe(reference.transcript[2]);
  expect(restored.execute(act('LOOK','LOOK'))).toMatchObject({status:'resolved',actionSequence:2,clockTicks:1});
});
it('exposes host primitives once and resumes failures or SAVE success through the original loop',()=>{
  for(const success of [0,1]){
    const loop=new TurnLoop(game);loop.start();const save=loop.execute(act('SAVE','SAVE'));expect(save).toMatchObject({status:'host',clockTicks:0,actionSequence:1,boundary:{kind:'host',operation:'SAVE'}});
    const hash=loop.stateHash();expect(loop.execute(act('LOOK','LOOK'))).toMatchObject({status:'rejected',text:[]});expect(loop.stateHash()).toBe(hash);
    const resumed=loop.resumePrimitive(success);expect(resumed).toMatchObject({status:'resolved',clockTicks:0,actionSequence:1,boundary:{kind:'input'}});expect(resumed.text.join('')).toContain(success?'Ok.':'Failed.');
    expect(loop.execute(act('LOOK','LOOK'))).toMatchObject({status:'resolved',clockTicks:1,actionSequence:2});
  }
  const loop=new TurnLoop(game);loop.start();expect(loop.execute(act('RESTORE','RESTORE'))).toMatchObject({status:'host',boundary:{kind:'host',operation:'RESTORE'}});
  const hash=loop.stateHash();expect(loop.resumePrimitive(1)).toMatchObject({status:'rejected',text:[]});expect(loop.stateHash()).toBe(hash);expect(loop.resumePrimitive(0)).toMatchObject({status:'resolved',clockTicks:0,boundary:{kind:'input'}});
});
it('rolls back an entire action and next prologue on late budget errors, retaining the committed prior prompt',()=>{
  const loop=new TurnLoop(game);loop.start();const action=act('TAKE','TAKE',['LAMP','ROBOT']),before=loop.checkpoint(),successful=TurnLoop.restore(game,before),result=successful.execute(action);expect(result.status).toBe('resolved');
  for(const [key,limit] of [['steps',successful.checkpoint().interpreter.steps-1],['output',result.text.join('').length-1]] as const){
    const cp=JSON.parse(JSON.stringify(before));cp.interpreter.steps=0;cp.interpreter.output=0;cp.interpreter.limits[key]=limit;
    const bounded=TurnLoop.restore(game,cp),hash=bounded.stateHash();expect(bounded.execute(action)).toMatchObject({status:'error',actionSequence:0,clockTicks:0,text:[],random:[]});expect(bounded.stateHash()).toBe(hash);
  }
});
it('rejects malformed actions and diagnostic checkpoints without changing a live turn',()=>{
  const loop=new TurnLoop(game);loop.start();const hash=loop.stateHash();
  for(const action of [{kind:'walk',actor:'PLAYER',direction:'XYZZY'},{...act('TAKE','TAKE','LAMP'),syntax:255},{...act('LOOK','LOOK'),unexpected:true}])expect(loop.execute(action)).toMatchObject({status:'rejected',text:[],clockTicks:0});
  expect(loop.answer('NO')).toMatchObject({status:'rejected',text:[]});expect(loop.resumePrimitive(0)).toMatchObject({status:'rejected',text:[]});expect(loop.stateHash()).toBe(hash);
  for(const change of [(cp:any)=>cp.actionSequence=-1,(cp:any)=>cp.interpreter.inputBoundary='parser',(cp:any)=>cp.started=false,(cp:any)=>cp.extra=true,(cp:any)=>cp.interpreter.frames.at(-1).routine=1]){const cp=loop.checkpoint();change(cp);expect(()=>TurnLoop.restore(game,cp)).toThrow();expect(loop.stateHash()).toBe(hash);}
  const raw=new Interpreter(game,{inputBoundary:'read'});expect(raw.run()).toMatchObject({status:'suspended',wait:{kind:'READ'}});expect(raw.atInput()).toBe(true);const rawHash=raw.stateHash();expect(()=>raw.resumeParserRead('look')).toThrow('diagnostic');expect(raw.stateHash()).toBe(rawHash);expect(Interpreter.restore(game,raw.checkpoint()).stateHash()).toBe(raw.stateHash());
});
it('handles an exhausted ALL search with the original missing-match branch instead of an integration error',()=>{
  const loop=new TurnLoop(game);loop.start();const world=loop.world();
  // Deliberately synthetic: remove every searchable noun from scope. Real story
  // oracle fixtures separately verify global fallback; this covers its empty end.
  for(const object of game.bundle.payload.world.entities)if(object.properties.some(p=>p.property.name==='SYNONYM'))world.setFlag(object.id,flag('INVISIBLE'));
  const cp=loop.checkpoint();cp.interpreter.world=world.snapshot();const empty=TurnLoop.restore(game,cp),result=empty.execute(act('TAKE','TAKE','ALL'));
  expect(result).toMatchObject({status:'resolved',boundary:{kind:'input'},clockTicks:1});expect(result.text.join('')).toContain("The object that you mentioned isn't here.");
});


it('preserves the command budget and action sequence across an exposed decision',()=>{
  const loop=new TurnLoop(game);loop.start();const initial=loop.checkpoint(),success=TurnLoop.restore(game,initial);
  expect(success.execute(act('QUIT','QUIT')).status).toBe('pending');expect(success.answer('NO').status).toBe('resolved');
  const cp=JSON.parse(JSON.stringify(initial));cp.interpreter.steps=0;cp.interpreter.limits.steps=success.checkpoint().interpreter.steps-1;
  const limited=TurnLoop.restore(game,cp);expect(limited.execute(act('QUIT','QUIT'))).toMatchObject({status:'pending',actionSequence:1});const hash=limited.stateHash();
  expect(limited.answer('NO')).toMatchObject({status:'error',actionSequence:1,clockTicks:0,text:[],random:[],boundary:{kind:'decision'}});expect(limited.stateHash()).toBe(hash);
});

it('pauses an actor quotation at a later YES? without losing its committed speech tick or repeating TELL',()=>{
  const reference=runReference(['robot, say "quit"','no'],2,{context:{room:'MAGNET-ROOM',inventory:[]}}),tape=reference.random.filter(r=>r.category==='game');
  let loop=new TurnLoop(game,{replay:tape});loop.start();loop=context(loop,{room:'MAGNET-ROOM',inventory:[]},{replay:tape});
  const speech={...say('SAY',['QUIT']),actor:'ROBOT'} as GameAction,pending=loop.execute(speech);
  expect(pending).toMatchObject({status:'pending',actionSequence:1,clockTicks:1,boundary:{kind:'decision',routine:'YES?'}});expect(pending.text.join('')).toBe(reference.transcript[1]);
  loop=TurnLoop.restore(game,JSON.parse(JSON.stringify(loop.checkpoint())),{replay:tape});const resumed=loop.answer('NO');expect(resumed).toMatchObject({status:'resolved',actionSequence:1,clockTicks:0,boundary:{kind:'input'}});expect(resumed.text.join('')).toBe(reference.transcript[2]);
});
it('restores a pristine unstarted loop and keeps a failed startup completely atomic',()=>{
  const fresh=new TurnLoop(game),restored=TurnLoop.restore(game,JSON.parse(JSON.stringify(fresh.checkpoint())));expect(restored.start().text.join('')).toBe(fresh.start().text.join(''));
  const limited=new TurnLoop(game,{limits:{output:1}}),hash=limited.stateHash();expect(limited.start()).toMatchObject({status:'error',actionSequence:0,clockTicks:0,text:[],random:[],boundary:null});expect(limited.stateHash()).toBe(hash);
  const cp=fresh.checkpoint(),fragment=new Interpreter(game,{world:fresh.world(),fragment:'entry',inputBoundary:'read'});fragment.run();cp.interpreter=fragment.checkpoint();expect(()=>TurnLoop.restore(game,cp)).toThrow('startup continuation');
});
