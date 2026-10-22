import { expect, it } from 'vitest';
import { Interpreter, loadGame, WorldState, writeReadWord } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { runReference } from '../tools/reference/runner.ts';
import { decodeState, memories } from '../tools/reference/state.ts';
import { referenceSymbolLayout } from '../tools/zil/symbols.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),routine=(name:string)=>game.bundle.payload.logic.routines.find(r=>r.name===name)!.id;

it('overwrites one V3 text/parse record while retaining capacity and unused tails',()=>{
  const world=WorldState.create(game),text=world.global('P-INBUF'),parse=world.global('P-LEXV');
  for(let i=1;i<=15;i++)world.putByte(text,i,88);
  for(let i=2;i<=15;i++)world.putByte(parse,i,77);
  world.putByte(parse,1,9);const before=world.worldHash(),next=writeReadWord(game,world,text,parse,'YES');
  expect(world.worldHash()).toBe(before);expect(next.getByte(text)).toBe(120);expect(next.getByte(parse)).toBe(59);expect(next.getByte(parse,1)).toBe(1);
  expect([1,2,3,4,5].map(i=>next.getByte(text,i))).toEqual([121,101,115,0,88]);
  expect(next.getWord(parse,1)).toBe(game.bundle.payload.memory.words.find(w=>w.name==='YES')!.address);
  expect([4,5,6,7,8].map(i=>next.getByte(parse,i))).toEqual([3,1,77,77,77]);
});
it('retains unknown-word text and length with dictionary zero, as READ does',()=>{
  const world=WorldState.create(game),text=world.global('P-INBUF'),parse=world.global('P-LEXV'),next=writeReadWord(game,world,text,parse,'XYZZYUNKNOWN');
  expect(next.getWord(parse,1)).toBe(0);expect(next.getByte(parse,4)).toBe(12);expect(next.getByte(parse,5)).toBe(1);
});
it('rejects malformed, overflowing, overlapping and protected buffers without changing the world',()=>{
  const world=WorldState.create(game),text=world.global('P-INBUF'),parse=world.global('P-LEXV'),before=world.worldHash();
  for(const [t,p,word] of [[text,parse,'yes'],[text,parse,'YES NO'],[text,parse,'λ'],[text,parse,'A'.repeat(120)],[text,text,'YES'],[0,parse,'YES'],[text,65535,'YES']] as const)expect(()=>writeReadWord(game,world,t,p,word)).toThrow();
  expect(world.worldHash()).toBe(before);
  const small=world.fork();small.putByte(parse,0,255);expect(()=>writeReadWord(game,small,text,parse,'YES')).toThrow('allocation bounds');
});
it('resumes the translated YES? routine for both decision choices through serialized continuations',()=>{
  for(const [choice,value] of [['YES',1],['NO',0]] as const){
    const vm=new Interpreter(game,{routine:routine('YES?')});expect(vm.run()).toMatchObject({status:'suspended',wait:{kind:'READ'},text:['>']});
    const restored=Interpreter.restore(game,JSON.parse(JSON.stringify(vm.checkpoint()))),before=restored.stateHash();
    expect(()=>restored.answer('QUIT')).toThrow('choice');expect(restored.stateHash()).toBe(before);
    expect(restored.answer(choice)).toEqual({status:'returned',value,text:[],random:[]});expect(restored.world().global('MOVES')).toBe(0);
  }
});
it('runs translated V-QUIT prompts and NO continuation with the original text and no move',()=>{
  const vm=new Interpreter(game,{routine:routine('V-QUIT')}),first=vm.run(),reference=runReference(['quit','no']);
  expect(first).toMatchObject({status:'suspended',wait:{kind:'READ'}});
  if(first.status==='suspended')expect(first.text.join('')).toBe(reference.transcript[1]);
  const result=vm.answer('NO');expect(result).toMatchObject({status:'returned',text:['Ok.','\n']});expect(vm.world().global('MOVES')).toBe(reference.final.moves);expect(vm.world().global('MOVES')).toBe(0);
  const quit=new Interpreter(game,{routine:routine('V-QUIT')});quit.run();expect(quit.answer('YES')).toMatchObject({status:'suspended',wait:{kind:'QUIT'}});
  const affirmative=runReference(['quit','yes']),ram=[...memories(affirmative)].at(-1)!,state=decodeState(ram),world=quit.world(),text=world.global('P-INBUF'),parse=world.global('P-LEXV');
  expect(Array.from({length:5},(_,i)=>world.getByte(text,i))).toEqual([...ram.subarray(state.globals['P-INBUF']!,state.globals['P-INBUF']!+5)]);
  expect([0,1,4,5].map(i=>world.getByte(parse,i))).toEqual([0,1,4,5].map(i=>ram[state.globals['P-LEXV']!+i]));
  expect(ram.readUInt16BE(state.globals['P-LEXV']!+2)).toBe(referenceSymbolLayout().words.find(w=>w.name==='YES')!.referenceAddress);
  expect(world.getWord(parse,1)).toBe(game.bundle.payload.memory.words.find(w=>w.name==='YES')!.address);
});
it('lets translated FINISH choose each host operation and repeat after a failed restore/restart',()=>{
  for(const choice of ['QUIT','RESTORE','RESTART'] as const){
    const vm=new Interpreter(game,{routine:routine('FINISH')});expect(vm.run()).toMatchObject({status:'suspended',wait:{kind:'READ'}});
    const checkpoint=vm.checkpoint();expect(vm.answer(choice)).toMatchObject({status:'suspended',wait:{kind:choice}});
    if(choice!=='QUIT')expect(vm.resume(0)).toMatchObject({status:'suspended',wait:{kind:'READ'},text:expect.arrayContaining(['Failed.'])});
    const restored=Interpreter.restore(game,checkpoint);expect(restored.answer(choice)).toMatchObject({status:'suspended',wait:{kind:choice}});
  }
});
it('rolls back failed READ buffer writes to the exposed decision boundary',()=>{
  const vm=new Interpreter(game,{routine:routine('YES?')});vm.run();const checkpoint=vm.checkpoint(),parse=vm.world().global('P-LEXV');checkpoint.world.bytes[parse]=0;
  const restored=Interpreter.restore(game,checkpoint),before=restored.stateHash();const result=restored.answer('YES');expect(result).toMatchObject({status:'error',cause:expect.stringContaining('capacity')});expect(result.status==='error'&&result.source?.file).toBe('gverbs.zil');expect(restored.stateHash()).toBe(before);
});
