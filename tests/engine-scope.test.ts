import { expect, it } from 'vitest';
import { GameSession, Interpreter, ScopeQuery, buildCandidateCatalog, generateCandidates, loadGame, queryScope } from '../src/engine/index.ts';
import type { WorldState } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { hashJson } from '../src/zil/integrity.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),catalog=buildCandidateCatalog(game);
const initial=new Interpreter(game);initial.run();
const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
const flag=(name:string)=>game.bundle.payload.symbols.symbols.find(s=>s.name===name)!.number!;
const move=(w:WorldState,object:string,parent:string)=>w.move(id(object),id(parent));
const set=(w:WorldState,object:string,attribute:string,value=true)=>w.setFlag(id(object),flag(attribute),value);
function call(w:WorldState,name:string,args:number[]){
  const vm=new Interpreter(game,{world:w,routine:game.bundle.payload.logic.routines.find(r=>r.name===name)!.id,args}),result=vm.run();
  expect(result.status).toBe('returned');if(result.status!=='returned')throw new Error(name+' did not return');return {value:result.value,world:vm.world()};
}
/** Controlled object layouts with real source flags/properties and unmodified helpers. */
function layout(){
  const w=initial.world();
  for(const e of game.bundle.payload.world.entities)if(e.kind==='object'&&!['ROOMS','GLOBAL-OBJECTS','LOCAL-GLOBALS','ADVENTURER'].includes(e.name)&&w.parent(e.id)!==id('GLOBAL-OBJECTS')&&w.parent(e.id)!==id('LOCAL-GLOBALS'))w.remove(e.id);
  move(w,'ADVENTURER','INSIDE-BARROW');w.setGlobal('HERE',id('INSIDE-BARROW'));w.setGlobal('WINNER',id('ADVENTURER'));
  w.setGlobal('ALWAYS-LIT',0);w.setGlobal('P-NAM',0);w.setGlobal('P-ADJ',0);
  for(const name of ['LAMP','SWORD','TEAPOT','PEARL','ROBOT'])set(w,name,'INVISIBLE',false);
  set(w,'LAMP','ONBIT',false);return w;
}
const samples:{name:string;setup:(w:WorldState)=>void;expected:string[];actor?:string}[]=[
  {name:'lit room',setup:w=>{move(w,'LAMP','INSIDE-BARROW');move(w,'SWORD','INSIDE-BARROW');},expected:['LAMP','SWORD']},
  {name:'dark room',setup:w=>{set(w,'INSIDE-BARROW','ONBIT',false);move(w,'SWORD','INSIDE-BARROW');},expected:[]},
  {name:'dark inventory',setup:w=>{set(w,'INSIDE-BARROW','ONBIT',false);move(w,'LAMP','ADVENTURER');move(w,'SWORD','INSIDE-BARROW');},expected:['LAMP']},
  {name:'carried light',setup:w=>{set(w,'INSIDE-BARROW','ONBIT',false);move(w,'LAMP','ADVENTURER');set(w,'LAMP','ONBIT');move(w,'SWORD','INSIDE-BARROW');},expected:['LAMP','SWORD']},
  {name:'opaque closed container',setup:w=>{move(w,'TEAPOT','INSIDE-BARROW');move(w,'PEARL','TEAPOT');set(w,'TEAPOT','OPENBIT',false);set(w,'TEAPOT','TRANSBIT',false);},expected:['TEAPOT']},
  {name:'open container',setup:w=>{move(w,'TEAPOT','INSIDE-BARROW');move(w,'PEARL','TEAPOT');set(w,'TEAPOT','OPENBIT');},expected:['PEARL','TEAPOT']},
  {name:'transparent closed container',setup:w=>{move(w,'TEAPOT','INSIDE-BARROW');move(w,'PEARL','TEAPOT');set(w,'TEAPOT','OPENBIT',false);set(w,'TEAPOT','TRANSBIT');},expected:['PEARL','TEAPOT']},
  {name:'invisible object',setup:w=>{move(w,'SWORD','INSIDE-BARROW');set(w,'SWORD','INVISIBLE');move(w,'LAMP','INSIDE-BARROW');},expected:['LAMP']},
  {name:'robot inventory',actor:'ROBOT',setup:w=>{move(w,'ROBOT','MACHINE-ROOM');move(w,'LAMP','ROBOT');move(w,'SWORD','ADVENTURER');},expected:['LAMP','ROBOT']},
  {name:'player inventory distinct from robot',setup:w=>{move(w,'ROBOT','MACHINE-ROOM');move(w,'LAMP','ROBOT');move(w,'SWORD','ADVENTURER');},expected:['SWORD']},
];
it.each(samples)('offers the hand-written object list for $name',sample=>{
  const w=layout();sample.setup(w);const result=queryScope(game,w,{actor:sample.actor});
  const set=generateCandidates(game,catalog,result.candidates),take=set.families.find(f=>f.id==='TAKE:8')!;
  const physical=take.operands[0]!.map(o=>o.operand).filter(o=>typeof o==='string'&&![id('GLOBAL-OBJECTS'),id('LOCAL-GLOBALS')].includes(w.parent(id(o))));
  expect(physical.sort()).toEqual(sample.expected);
  const q=new ScopeQuery(game,w,{actor:sample.actor});
  const comparison=w.fork();comparison.setGlobal('WINNER',q.actor);comparison.setGlobal('HERE',q.here);
  expect(q.lit()).toBe(Boolean(call(comparison,'LIT?',[q.here]).value));
  for(const name of ['LAMP','PEARL','ROBOT']){
    expect(q.accessible(id(name)),name).toBe(Boolean(call(comparison,'ACCESSIBLE?',[id(name)]).value));
    expect(q.metaLocation(id(name)),name).toBe(call(comparison,'META-LOC',[id(name)]).value);
  }
});
it('matches ACCESSIBLE? and META-LOC for every source entity at startup',()=>{
  const w=initial.world(),q=new ScopeQuery(game,w);
  for(const e of game.bundle.payload.world.entities){
    expect(q.accessible(e.id),e.name).toBe(Boolean(call(w,'ACCESSIBLE?',[e.id]).value));
    expect(q.metaLocation(e.id),e.name).toBe(call(w,'META-LOC',[e.id]).value);
  }
},120000);
it('keeps transparent visibility, touch access and remembered knowledge separate',()=>{
  const w=layout();move(w,'TEAPOT','INSIDE-BARROW');move(w,'PEARL','TEAPOT');set(w,'TEAPOT','OPENBIT',false);set(w,'TEAPOT','TRANSBIT');
  const result=queryScope(game,w),pearl=result.observation.objects.find(o=>o.id==='PEARL')!;
  expect(pearl).toMatchObject({visible:true,reachable:false,known:false});
  const q=new ScopeQuery(game,w,{known:['SWORD']});expect(q.knows(id('SWORD'))).toBe(true);
  expect(q.result().observation.objects.some(o=>o.id==='SWORD')).toBe(false);
  expect(q.result().candidates.operands).not.toContain('SWORD');
  set(w,'TEAPOT','OPENBIT');expect(queryScope(game,w).observation.objects.find(o=>o.id==='PEARL')!.reachable).toBe(true);
});
it('reproduces SEARCHBIT/SURFACEBIT depth and source ordering without revealing opaque contents',()=>{
  const w=layout();move(w,'TEAPOT','INSIDE-BARROW');move(w,'FLASK','TEAPOT');move(w,'PEARL','FLASK');
  set(w,'TEAPOT','OPENBIT');set(w,'TEAPOT','SEARCHBIT',false);set(w,'TEAPOT','SURFACEBIT',false);set(w,'FLASK','OPENBIT');
  const q=new ScopeQuery(game,w);expect(q.search(id('INSIDE-BARROW'))).toContain(id('FLASK'));expect(q.search(id('INSIDE-BARROW'))).not.toContain(id('PEARL'));
  set(w,'TEAPOT','SEARCHBIT');expect(q.search(id('INSIDE-BARROW'))).toContain(id('PEARL'));
  set(w,'TEAPOT','INVISIBLE');expect(q.search(id('INSIDE-BARROW'))).not.toContain(id('TEAPOT'));
  expect(q.search(id('INSIDE-BARROW'))).toContain(id('PEARL')); // source still descends through the container
  // The original SEARCH-LIST writes its output table; compare only in an isolated interpreter.
  for(const level of [0,1,2] as const){
    const copy=w.fork(),table=copy.global('P-MERGE');copy.putWord(table,0,0);copy.setGlobal('P-GWIMBIT',0);
    const ref=call(copy,'SEARCH-LIST',[id('INSIDE-BARROW'),table,level]).world;
    expect(q.search(id('INSIDE-BARROW'),level)).toEqual(Array.from({length:ref.getWord(table)},(_,i)=>ref.getWord(table,i+1)));
  }
});
it('matches light through containers, invisible sources, remote rooms and non-player actors',()=>{
  const w=layout();set(w,'INSIDE-BARROW','ONBIT',false);set(w,'MACHINE-ROOM','ONBIT',false);
  move(w,'TEAPOT','INSIDE-BARROW');move(w,'LAMP','TEAPOT');set(w,'LAMP','ONBIT');set(w,'TEAPOT','OPENBIT',false);set(w,'TEAPOT','TRANSBIT',false);
  const compare=(actor='ADVENTURER',room='INSIDE-BARROW',bit=true)=>{
    const q=new ScopeQuery(game,w,{actor}),copy=w.fork();copy.setGlobal('WINNER',q.actor);copy.setGlobal('HERE',q.here);
    expect(q.lit(id(room),bit)).toBe(Boolean(call(copy,'LIT?',[id(room),bit?1:0]).value));return q.lit(id(room),bit);
  };
  expect(compare()).toBe(false);set(w,'TEAPOT','TRANSBIT');expect(compare()).toBe(true);
  set(w,'LAMP','INVISIBLE');expect(compare()).toBe(false);set(w,'LAMP','INVISIBLE',false);
  move(w,'LAMP','ADVENTURER');move(w,'ROBOT','INSIDE-BARROW');expect(compare('ROBOT')).toBe(true);
  move(w,'ROBOT','MACHINE-ROOM');expect(compare('ROBOT','MACHINE-ROOM')).toBe(false);
  w.setGlobal('ALWAYS-LIT',1);expect(compare()).toBe(true);expect(compare('ROBOT','MACHINE-ROOM')).toBe(false);
  w.setGlobal('ALWAYS-LIT',0);expect(compare('ADVENTURER','MACHINE-ROOM')).toBe(false);
  set(w,'INSIDE-BARROW','ONBIT');move(w,'LAMP','MACHINE-ROOM');expect(compare('ADVENTURER','INSIDE-BARROW',false)).toBe(false);
});
it('preserves the source lighting helper noun/adjective selector semantics without scratch writes',()=>{
  const w=layout();set(w,'INSIDE-BARROW','ONBIT',false);move(w,'LAMP','ADVENTURER');set(w,'LAMP','ONBIT');
  w.setGlobal('P-NAM',game.bundle.payload.memory.words.find(word=>word.name==='SWORD')!.address);
  const before=w.worldHash(),q=new ScopeQuery(game,w);expect(q.lit()).toBe(false);expect(q.lit()).toBe(Boolean(call(w,'LIT?',[q.here]).value));expect(w.worldHash()).toBe(before);
});
it('reads live room GLOBAL/PSEUDO properties and never activates or renames the pseudo proxy',()=>{
  const w=layout();move(w,'ADVENTURER','RIDDLE-ROOM');const before=w.worldHash(),result=queryScope(game,w);
  expect(result.candidates.operands).toContainEqual({pseudo:{room:'RIDDLE-ROOM',word:'RIDDLE'}});
  expect(result.observation.objects.some(o=>o.id==='PSEUDO-OBJECT')).toBe(false);expect(w.worldHash()).toBe(before);
  const room=id('RIDDLE-ROOM'),property=game.bundle.payload.symbols.symbols.find(s=>s.name==='P?PSEUDO')!.number!,address=w.propertyAddress(room,property);
  w.putWord(address,0,game.bundle.payload.memory.words.find(word=>word.name==='WELL')!.address);
  expect(queryScope(game,w).candidates.operands).toContainEqual({pseudo:{room:'RIDDLE-ROOM',word:'WELL'}});
});
it('reads current local-global membership and separates abstract global nouns from physical observation',()=>{
  const w=layout();move(w,'ADVENTURER','NARROW-TUNNEL');w.setGlobal('HERE',id('NARROW-TUNNEL'));
  const q=new ScopeQuery(game,w);expect(q.accessible(id('BRIDGE'))).toBe(true);expect(q.accessible(id('WELL'))).toBe(false);
  expect(q.result().candidates.operands).toContain('BRIDGE');expect(q.result().candidates.operands).not.toContain('WELL');
  const property=game.bundle.payload.symbols.symbols.find(s=>s.name==='P?GLOBAL')!.number!,address=w.propertyAddress(id('NARROW-TUNNEL'),property);
  w.putByte(address,0,id('WELL'));
  expect(q.accessible(id('BRIDGE'))).toBe(false);expect(q.accessible(id('WELL'))).toBe(true);
  expect(q.accessible(id('WELL'))).toBe(Boolean(call(w,'ACCESSIBLE?',[id('WELL')]).value));
  const result=q.result();expect(result.candidates.operands).toContain('WELL');expect(result.candidates.operands).not.toContain('BRIDGE');
  expect(result.candidates.operands).toContain('GLOBAL-PRINCESS');expect(result.observation.objects.some(o=>o.id==='GLOBAL-PRINCESS')).toBe(false);
});
it('alternates session options, candidates and observations without changing state, RNG, save or accepted log',()=>{
  const session=new GameSession(game),hash=session.stateHash(),save=session.exportSave(),observation=session.observe(),candidates=session.candidates();
  for(let i=0;i<4;i++){
    session.options();expect(session.observe()).toEqual(observation);expect(session.candidates()).toEqual(candidates);session.options();
    expect(session.stateHash()).toBe(hash);expect(hashJson(session.exportSave())).toBe(hashJson(save));expect(session.acceptedInputs()).toEqual([]);
  }
  const copied=session.observe();copied.perception.objects.length=0;expect(session.observe()).toEqual(observation);
  expect(JSON.stringify(observation)).not.toContain('PEARL');expect(JSON.stringify(observation)).not.toContain('globals');
  expect(JSON.stringify(observation)).not.toContain('GLOBAL-PRINCESS');
  expect(()=>session.candidates('ROBOT')).toThrow('outside player scope');expect(session.stateHash()).toBe(hash);
});
it('allows actor-relative session candidates only when that actor is visible, and hides them at decisions',()=>{
  const quit=game.bundle.payload.vocabulary.verbs.find(v=>v.name==='QUIT')!.rows[0]!;
  const session=new GameSession(game,{actions:[{label:'quit',action:{kind:'act',actor:'PLAYER',lexicalTable:'QUIT',syntax:quit.id,verb:'QUIT'}}]});
  const save=session.exportSave(),w=initial.world();move(w,'ROBOT','INSIDE-BARROW');move(w,'LAMP','ROBOT');set(w,'ROBOT','INVISIBLE',false);
  save.checkpoint.interpreter.world=w.snapshot();session.importSave(save);
  expect(session.candidates('ROBOT').families.find(f=>f.id==='TAKE:8')!.operands[0]!.map(o=>o.operand)).toContain('LAMP');
  const current=session.observe();session.execute({expected:{epoch:current.epoch,revision:current.revision},optionId:session.options()[0]!.id});
  const before=session.stateHash();
  expect(session.candidates().families).toEqual([]);expect(session.candidates().exits).toEqual([]);
  expect(session.stateHash()).toBe(before);
});
it('rejects incompatible worlds, invalid actors and unknown remembered identities',()=>{
  expect(()=>new ScopeQuery(game,{buildHash:'wrong'} as WorldState)).toThrow('another build');
  expect(()=>queryScope(game,initial.world(),{actor:'LAMP'})).toThrow('actor');
  expect(()=>queryScope(game,initial.world(),{known:['MISSING']})).toThrow('entity');
});
