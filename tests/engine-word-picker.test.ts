import { expect, it } from 'vitest';
import { GameSession, WorldState, buildWordCatalog, loadGame, pickedWords, wordPage } from '../src/engine/index.ts';
import type { SelectionRequest } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { canonicalJson, hashJson } from '../src/zil/integrity.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { runReference } from '../tools/reference/runner.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),catalog=buildWordCatalog(game.bundle.payload.vocabulary);
const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
const index=(word:string)=>game.bundle.payload.vocabulary.words.find(w=>w.name===word)!.dictionaryIndex;
function draft(session:GameSession,family:string,operands:SelectionRequest['operands']=[],actor='PLAYER',words?:string[]):SelectionRequest {
  const {epoch,revision}=session.observe();return {expected:{epoch,revision},actor,family,operands,...(words===undefined?{}:{words:words.map(index)})};
}
function position(session:GameSession,room:string,inventory:string[]=[]){
  const save=session.exportSave(),w=WorldState.restore(game,save.checkpoint.interpreter.world);w.move(w.global('PLAYER'),id(room));
  w.setGlobal('HERE',id(room));w.setGlobal('WINNER',w.global('PLAYER'));w.setGlobal('LIT',1);
  for(const object of inventory)w.move(id(object),w.global('PLAYER'));save.checkpoint.interpreter.world=w.snapshot();session.importSave(save);
}
function unchanged(session:GameSession,operation:()=>void){
  const before={state:session.stateHash(),save:hashJson(session.exportSave()),log:session.acceptedInputs(),observation:session.observe()};operation();
  expect({state:session.stateHash(),save:hashJson(session.exportSave()),log:session.acceptedInputs(),observation:session.observe()}).toEqual(before);
}
it('includes all 689 dictionary identities once and groups only source-declared synonyms',()=>{
  const all=catalog.groups.flatMap(g=>g.words);expect(all).toHaveLength(689);expect(new Set(all.map(w=>w.dictionaryIndex)).size).toBe(689);
  expect(catalog.selectableCount).toBe(681);expect(all.filter(w=>!w.selectable).map(w=>w.word).sort()).toEqual(['#COMMAND','#RANDOM','#RECORD','#UNRECORD','$VERIFY','COMMA','PERIOD','QUOTE']);
  const west=catalog.groups.find(g=>g.words.some(w=>w.word==='WEST'))!;expect(west.words.map(w=>w.word)).toContain('W');
  expect(pickedWords(catalog,[index('W'),index('WEST')]).map(w=>w.word)).toEqual(['W','WEST']);
  const well=catalog.groups.find(g=>g.words.some(w=>w.word==='WELL'))!;expect(well.words.every(w=>!['ANSWER','SAY','INCANT'].includes(w.word))).toBe(true);
});
it('supports neutral alphabetical pagination and case-insensitive prefix search without choosing an answer',()=>{
  const first=wordPage(catalog),all=[];
  for(let offset=0;offset<first.totalGroups;offset+=24)all.push(...wordPage(catalog,{offset}).groups);
  expect(all).toEqual(catalog.groups);expect(first.groups.some(g=>g.words.some(w=>w.word==='WELL'))).toBe(false);
  const filtered=wordPage(catalog,{prefix:'we'});expect(filtered.groups.flatMap(g=>g.words).every(w=>w.word.startsWith('WE'))).toBe(true);
  expect(filtered.groups.flatMap(g=>g.words).map(w=>w.word)).toContain('WELL');
  expect(wordPage(catalog,{prefix:'WELL'}).groups.flatMap(g=>g.words).map(w=>w.word)).toEqual(['WELL']);
  expect(wordPage(catalog,{prefix:'XYZZYUNKNOWN'}).groups).toEqual([]);
});
it('owns picker results and rejects invalid queries, nonexistent words and interpreter controls',()=>{
  const first=wordPage(catalog),unchanged=canonicalJson(catalog);first.groups[0]!.words.length=0;expect(canonicalJson(catalog)).toBe(unchanged);
  for(const query of [{prefix:'a b'},{offset:-1},{limit:0},{limit:101},{other:1},null])expect(()=>wordPage(catalog,query as never)).toThrow('query');
  for(const word of ['COMMA','QUOTE','PERIOD','$VERIFY','#RANDOM'])expect(()=>pickedWords(catalog,[index(word)])).toThrow('Unavailable');
  expect(()=>pickedWords(catalog,[999999])).toThrow('Unavailable');
});
it('stages phrases without creating IDs, ticking, consuming RNG, learning clues or changing saves',()=>{
  const session=new GameSession(game);
  unchanged(session,()=>{
    const empty=session.select(draft(session,'ANSWER:2'));expect(empty).toMatchObject({ready:false,words:[],next:null,wordPicker:{wordCount:689}});
    expect(empty).not.toHaveProperty('optionId');expect(session.words({prefix:'we'}).groups.flatMap(g=>g.words).map(w=>w.word)).toContain('WELL');
    const selected=session.select(draft(session,'ANSWER:2',[],'PLAYER',['A','WELL']));expect(selected.ready).toBe(true);expect(selected.words!.map(w=>w.word)).toEqual(['A','WELL']);
    expect(session.words()).toEqual(wordPage(catalog));
  });
});
it('matches incorrect/correct riddle answers, a following player action, and exact replay IDs',()=>{
  const directions=['SOUTH','SOUTH','SOUTH','SW','SOUTH','SW','SW','SE','SE','SE','NE','SE','NORTH','SE','WEST','SE'];
  const prefix=['take lamp','turn on lamp',...directions.map(d=>d.toLowerCase())],commands=[...prefix,'answer "grue"','look','answer "well"','look','east','look'];
  const reference=runReference(commands),options={replay:reference.random.filter(r=>r.category==='game')},session=new GameSession(game,options);
  const turn=session.candidates().families.find(f=>f.lexicalTable==='TURN'&&f.verb==='LAMP-ON'&&f.slots.length===1)!;
  const requests=[()=>draft(session,'TAKE:8',[{object:'LAMP',noun:'LAMP'}]),()=>draft(session,turn.id,[{object:'LAMP',noun:'LAMP'}]),...directions.map(direction=>()=>draft(session,'walk:'+direction)),
    ()=>draft(session,'ANSWER:2',[],'PLAYER',['GRUE']),()=>draft(session,'LOOK:12'),()=>draft(session,'ANSWER:2',[],'PLAYER',['WELL']),()=>draft(session,'LOOK:12'),()=>draft(session,'walk:EAST'),()=>draft(session,'LOOK:12')];
  for(const [i,request] of requests.entries()){
    const result=session.commitSelection(request());expect(result.status,commands[i]).toBe('resolved');expect(result.text.join(''),commands[i]).toBe(reference.transcript[i+1]);
    if(i===prefix.length)expect(result.text.join('')).toContain('hollow laugh');
    if(i===prefix.length+2){expect(result.text.join('')).toContain('stone door quietly swings open');expect(result.optionId).toContain('WELL');}
  }
  session.assertReplayComplete();const replay=GameSession.replay(game,options,session.acceptedInputs());expect(replay.stateHash()).toBe(session.stateHash());expect(replay.observe()).toEqual(session.observe());
});
it('executes wand spell words and restores ordinary player input with no special text path',()=>{
  const commands=['wave wand at sword','say "frobozz"','look','incant "float"','look'];
  const reference=runReference(commands,2,{context:{room:'INSIDE-BARROW',inventory:['WAND']}}),options={replay:reference.random.filter(r=>r.category==='game')};
  const session=new GameSession(game,options);position(session,'INSIDE-BARROW',['WAND']);
  const requests=[()=>draft(session,'WAVE:2',[{object:'WAND',noun:'WAND'},{object:'SWORD',noun:'SWORD'}]),()=>draft(session,'SAY:1',[],'PLAYER',['FROBOZZ']),()=>draft(session,'LOOK:12'),()=>draft(session,'INCANT:1',[],'PLAYER',['FLOAT']),()=>draft(session,'LOOK:12')];
  for(const [i,request] of requests.entries()){
    const result=session.commitSelection(request());expect(result.status,commands[i]).toBe('resolved');expect(result.text.join(''),commands[i]).toBe(reference.transcript[i+1]);
    if(i===1)expect(result.text.join('')).toContain('wand glows very brightly');
  }
  session.assertReplayComplete();expect(GameSession.replay(game,options,session.acceptedInputs()).stateHash()).toBe(session.stateHash());
});
it('round trips robot movement and cage rescue as ordinary actor actions, each followed by player input',()=>{
  const commands=['robot, east','look','east','robot, south','look','south','take sphere','robot, raise cage','look'];
  const reference=runReference(commands,2,{context:{room:'MAGNET-ROOM',inventory:['LAMP']}}),options={replay:reference.random.filter(r=>r.category==='game')};
  const session=new GameSession(game,options);position(session,'MAGNET-ROOM',['LAMP']);
  const requests=[()=>draft(session,'walk:EAST',[],'ROBOT'),()=>draft(session,'LOOK:12'),()=>draft(session,'walk:EAST'),()=>draft(session,'walk:SOUTH',[],'ROBOT'),()=>draft(session,'LOOK:12'),()=>draft(session,'walk:SOUTH'),()=>draft(session,'TAKE:8',[{object:'PALANTIR-1',noun:'SPHERE'}]),()=>draft(session,'RAISE:1',[{object:'CAGE',noun:'CAGE'}],'ROBOT'),()=>draft(session,'LOOK:12')];
  for(const [i,request] of requests.entries()){
    const result=session.commitSelection(request());expect(result.status,commands[i]).toBe('resolved');expect(result.text.join(''),commands[i]).toBe(reference.transcript[i+1]);
    if(i===7)expect(result.text.join('')).toContain('cage shakes');
  }
  session.assertReplayComplete();const replay=GameSession.replay(game,options,session.acceptedInputs());expect(replay.stateHash()).toBe(session.stateHash());expect(replay.observe().perception.actor).toBe('ADVENTURER');
});
it('keeps alias dictionary identity and phrase order in committed action IDs and replay logs',()=>{
  const session=new GameSession(game),request=draft(session,'SAY:1',[],'PLAYER',['A','W','A']),result=session.commitSelection(request);
  expect(result.status).toBe('resolved');expect(result.optionId).toContain('"words":["A","W","A"]');
  const entries=session.acceptedInputs();expect(entries[0]).toMatchObject({kind:'selection',request:{words:[index('A'),index('W'),index('A')]}});
  expect(GameSession.replay(game,{},entries).stateHash()).toBe(session.stateHash());
});
it('rejects malformed, stale, empty or forged word selections atomically',()=>{
  const session=new GameSession(game),base=draft(session,'ANSWER:2',[],'PLAYER',['WELL']);
  for(const request of [{...base,words:[]},{...base,words:[99999]},{...base,words:[index('QUOTE')]},{...base,words:['WELL']},{...base,words:Array(58).fill(index('A'))},{...base,words:[0]},{...base,words:[1.5]},{...base,family:'LOOK:12'},{...base,expected:{epoch:0,revision:0}}])
    unchanged(session,()=>expect(session.commitSelection(request as SelectionRequest).status).toBe('rejected'));
});
