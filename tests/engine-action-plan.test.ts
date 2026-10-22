import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadSymbols, STORY } from '../tools/reference/symbols.ts';
import { Interpreter, encodeReadText, loadGame, prepareAction, writeReadText } from '../src/engine/index.ts';
import type { GameAction } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { runReference } from '../tools/reference/runner.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),vm=new Interpreter(game);vm.run();const world=vm.world();
const act=(lexicalTable:string,syntax:number,verb:string,extra:object={}):GameAction=>({kind:'act',actor:'PLAYER',verb,lexicalTable,syntax,...extra});
it('prepares exact syntax references and lexical noun spans without changing execution state',()=>{
  const before=vm.stateHash(),plan=prepareAction(game,world,act('TAKE',8,'TAKE',{prso:'LAMP'}));
  expect(plan.input.text).toBe('take lamp');expect(plan.direct).toMatchObject({kind:'objects',objects:[{name:'LAMP'}]});
  const base=game.bundle.payload.memory.segments.find(s=>s.name==='syntax:TAKE')!.base;
  expect(plan.dispatch).toMatchObject({kind:'syntax',lexical:236,action:96,address:base+1+7*8,row:8});expect(plan.clauses).toEqual([{slot:0,preposition:0,word:null,start:1,end:2}]);
  expect(vm.stateHash()).toBe(before);expect(world.worldHash()).toBe(vm.world().worldHash());
});
it('agrees with original parser syntax and match IDs for simple canonical actions',()=>{
  for(const action of [act('TAKE',8,'TAKE',{prso:'LAMP'}),act('LOOK',12,'LOOK'),{kind:'walk',actor:'PLAYER',direction:'SOUTH'} as const]){
    const plan=prepareAction(game,world,action),reference=runReference([plan.input.text]),checkpoint=reference.checkpoints.find(c=>c.kind==='parser-return')!;
    expect(checkpoint).toBeDefined();expect(checkpoint.parser!.globals.PRSA).toBe(plan.dispatch.action);
    if(plan.direct?.kind==='objects')expect(checkpoint.parser!.direct).toEqual(plan.direct.objects.map(o=>o.id));
    if(plan.dispatch.kind==='walk')expect(checkpoint.parser!.globals['P-WALK-DIR']).toBe(plan.dispatch.direction);
    else {
      const story=readFileSync(STORY),base=story.readUInt16BE(12),verbs=story.readUInt16BE(base+2*loadSymbols().globals.indexOf('VERBS'));
      const table=story.readUInt16BE(verbs+2*(255-plan.dispatch.lexical));expect(checkpoint.parser!.syntax).toBe(table+1+8*(plan.dispatch.row-1));
    }
  }
});
it('preserves exact lexical table identity and rejects action/row and operand-shape mismatches',()=>{
  for(const action of [act('TAKE',8,'DROP',{prso:'LAMP'}),act('TAKE',8,'TAKE'),act('LOOK',12,'LOOK',{prso:'LAMP'}),act('GIVE',2,'GIVE',{prsi:'LAMP'}),act('MISSING',1,'LOOK')])expect(()=>prepareAction(game,world,action)).toThrow();
  expect(prepareAction(game,world,act('GIVE',2,'GIVE',{prso:'LAMP',prsi:'SWORD'})).input.text).toBe('give lamp to sword');
});
it('represents ALL and explicit multiplicity without executing search or bypassing MANY-CHECK',()=>{
  expect(prepareAction(game,world,act('TAKE',8,'TAKE',{prso:'ALL'})).direct).toEqual({kind:'all'});
  const multiple=prepareAction(game,world,act('TAKE',8,'TAKE',{prso:['LAMP','SWORD']}));expect(multiple.input.text).toBe('take lamp and sword');
  expect(()=>prepareAction(game,world,act('TAKE',8,'TAKE',{prso:['LAMP','LAMP']}))).toThrow('Duplicate');
  expect(()=>prepareAction(game,world,act('GIVE',2,'GIVE',{prso:['LAMP','SWORD'],prsi:['LAMP','SWORD']}))).toThrow('simultaneous');
});
it('plans actor prefixes and pseudo bindings without activating a pseudo object',()=>{
  const before=world.worldHash(),actor=prepareAction(game,world,{kind:'walk',actor:'ROBOT',direction:'EAST'});
  expect(actor.actorPass).toBe(true);expect(actor.input.text).toBe('robot, east');expect(actor.input.tokens.map(t=>t.text)).toEqual(['robot',',','east']);
  const pseudo=prepareAction(game,world,act('LOOK',8,'EXAMINE',{prso:{pseudo:{room:'TEA-ROOM',word:'HOLE'}}}));
  expect(pseudo.direct).toMatchObject({kind:'objects',objects:[{name:'PSEUDO-OBJECT',pseudo:{word:'HOLE'}}]});expect(world.worldHash()).toBe(before);
  expect(()=>prepareAction(game,world,{kind:'walk',actor:'LAMP',direction:'EAST'})).toThrow('actor');
  expect(()=>prepareAction(game,world,act('LOOK',8,'EXAMINE',{prso:{pseudo:{room:'TEA-ROOM',word:'MISSING'}}}))).toThrow('pseudo');
  expect(()=>prepareAction(game,world,act('GIVE',2,'GIVE',{prso:{pseudo:{room:'TEA-ROOM',word:'HOLE'}},prsi:{pseudo:{room:'GREAT-CAVERN',word:'STALAGMITE'}}}))).toThrow('share one');
});
it('plans quoted speech including unknown dictionary words and exact continuation indices',()=>{
  const plan=prepareAction(game,world,{kind:'say',actor:'PLAYER',verb:'ANSWER',lexicalTable:'ANSWER',syntax:2,words:['A','WELL']});
  expect(plan.input.text).toBe('answer "a well"');expect(plan.input.tokens.map(t=>t.text)).toEqual(['answer','"','a','well','"']);expect(plan.speech).toEqual({continuation:5,remaining:3});
  const parsed=runReference([plan.input.text]).checkpoints.find(c=>c.kind==='parser-return')!;expect(parsed.parser!.globals['P-CONT']).toBe(plan.speech!.continuation);expect(parsed.parser!.globals['QUOTE-FLAG']).toBe(1);
  const unknown=prepareAction(game,world,{kind:'say',actor:'ROBOT',verb:'SAY',lexicalTable:'SAY',syntax:1,words:['XYZZYUNKNOWN']});
  expect(unknown.input.tokens[4]!.address).toBe(0);expect(unknown.speech?.continuation).toBe(9);
  expect(()=>prepareAction(game,world,{kind:'say',actor:'PLAYER',verb:'LOOK',lexicalTable:'LOOK',syntax:12,words:['HI']})).toThrow('speech');
});
it('owns action data and encodes every identity field deterministically',()=>{
  const action=act('TAKE',8,'TAKE',{prso:['LAMP','SWORD']}),plan=prepareAction(game,world,action);
  const reordered=Object.fromEntries(Object.entries(action).reverse());expect(prepareAction(game,world,reordered).optionId).toBe(plan.optionId);
  (action as any).prso.push('ROBOT');expect(plan.action).not.toEqual(action);
  expect(prepareAction(game,world,act('TAKE',8,'TAKE',{prso:['SWORD','LAMP']})).optionId).not.toBe(plan.optionId);
});
it('rejects unknown keys, sparse operands, invalid actors/directions and oversized inputs',()=>{
  for(const action of [{...act('LOOK',12,'LOOK'),extra:true},act('TAKE',8,'TAKE',{prso:[]}),act('TAKE',8,'TAKE',{prso:new Array(2)}),{kind:'walk',actor:'PLAYER',direction:'MISSING'},{kind:'say',actor:'PLAYER',verb:'SAY',lexicalTable:'SAY',syntax:1,words:['A'.repeat(120)]}])expect(()=>prepareAction(game,world,action)).toThrow();
});
it('matches independent V3 tokenization for punctuation, spacing, unknowns and six-character dictionary truncation',()=>{
  const require=createRequire(import.meta.url),{ZVM}=require('ifvms'),{MemoryView}=require('ifvms/src/common/utils.js');
  for(const text of ['take lamp and sword','robot, go east','answer "a well"','  LOOK.  ','xyzzynothing','restarting','look@foo','']){
    const next=writeReadText(game,world,world.global('P-INBUF'),world.global('P-LEXV'),text),bytes=Buffer.from(world.snapshot().bytes),original=new ZVM();
    original.prepare(bytes,{Glk:{glk_exit(){}}});original.version=3;original.version3=true;original.m=MemoryView(bytes);original.ram=original.m;original.init_text();
    const input=world.global('P-INBUF'),parse=world.global('P-LEXV');original.m.setUint8Array(input+1,[...Buffer.from(text.toLowerCase()),0]);original.tokenise(input,parse);
    const count=next.getByte(parse,1);expect(count,text).toBe(original.m.getUint8(parse+1));
    expect(Array.from({length:2+4*count},(_,i)=>next.getByte(parse,i)),text).toEqual([...original.m.getUint8Array(parse,2+4*count)]);
    expect(encodeReadText(game,text).tokens).toHaveLength(count);
  }
});
it('retains unused records and atomically rejects token/text capacity errors',()=>{
  const input=world.global('P-INBUF'),parse=world.global('P-LEXV'),filled=writeReadText(game,world,input,parse,'take lamp and sword'),short=writeReadText(game,filled,input,parse,'south');
  expect(short.getByte(parse,1)).toBe(1);expect(short.getWord(parse,3)).toBe(filled.getWord(parse,3));
  const limited=world.fork();limited.putByte(parse,0,1);const before=limited.worldHash();expect(()=>writeReadText(game,limited,input,parse,'take lamp')).toThrow('capacity');expect(limited.worldHash()).toBe(before);
  expect(()=>encodeReadText(game,'hello\n')).toThrow('ASCII');
});
