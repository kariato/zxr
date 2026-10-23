import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GameSession, WorldState, loadGame, operandIdentity } from '../src/engine/index.ts';
import type { Operand, SelectionRequest, Selection, SessionOptions } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { canonicalJson, hashJson } from '../src/zil/integrity.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { runReference } from '../tools/reference/runner.ts';
import type { ReplayFixtures } from '../tools/engine/replay.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2')));
const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
const operand=(object:string,noun=object):Operand=>({object,noun});
function request(session:GameSession,family:string,operands:Selection[]=[],actor='PLAYER'):SelectionRequest {
  const {epoch,revision}=session.observe();return {expected:{epoch,revision},family,actor,operands};
}
function position(session:GameSession,room:string,inventory:string[]=[]){
  const save=session.exportSave(),world=WorldState.restore(game,save.checkpoint.interpreter.world);
  world.move(world.global('PLAYER'),id(room));world.setGlobal('HERE',id(room));world.setGlobal('WINNER',world.global('PLAYER'));world.setGlobal('LIT',1);
  for(const name of inventory)world.move(id(name),world.global('PLAYER'));
  save.checkpoint.interpreter.world=world.snapshot();session.importSave(save);
}
function unchanged(session:GameSession,operation:()=>void){
  const before={hash:session.stateHash(),save:hashJson(session.exportSave()),log:session.acceptedInputs(),view:session.observe()};operation();
  expect({hash:session.stateHash(),save:hashJson(session.exportSave()),log:session.acceptedInputs(),view:session.observe()}).toEqual(before);
}
it('browses, backs up, cancels and finishes a two-slot draft without minting IDs or changing execution',()=>{
  const session=new GameSession(game);position(session,'MAGNET-ROOM',['LAMP']);
  unchanged(session,()=>{
    const first=session.select(request(session,'GIVE:2'));expect(first).toMatchObject({ready:false,next:{index:0}});expect(first).not.toHaveProperty('optionId');
    expect(first.next!.choices.map(o=>operandIdentity(o.operand))).toContain('LAMP');
    const second=session.select(request(session,'GIVE:2',[operand('LAMP')]));expect(second).toMatchObject({ready:false,next:{index:1}});
    expect(second.next!.choices.map(o=>operandIdentity(o.operand))).toContain('ROBOT');
    const ready=session.select(request(session,'GIVE:2',[operand('LAMP'),operand('ROBOT')]));expect(ready).toMatchObject({ready:true,next:null});
    expect(ready).not.toHaveProperty('id');expect(ready).not.toHaveProperty('action');
    expect(session.select(request(session,'GIVE:2')).selected).toEqual([]);
  });
  const draft=request(session,'GIVE:2',[operand('LAMP'),operand('ROBOT')]),result=session.commitSelection(draft);
  expect(result).toMatchObject({status:'resolved',clockTicks:1});expect(result.optionId).toContain('zxr-action-v1:');
  expect(session.acceptedInputs().at(-1)).toMatchObject({kind:'selection',request:draft,optionId:result.optionId});
  expect(WorldState.restore(game,session.exportSave().checkpoint.interpreter.world).parent(id('LAMP'))).toBe(id('ROBOT'));
});
it('retains unheld operands and lets the original adapter perform an implicit take in one turn',()=>{
  const reference=runReference(['wave lamp']),session=new GameSession(game,{replay:reference.random.filter(r=>r.category==='game')});
  const family=session.candidates().families.find(f=>f.verb==='WAVE'&&f.slots.length===1&&!f.slots[0]!.preposition)!;
  expect(family.slots[0]!.possession).toEqual(['TAKE','HAVE']);
  expect(session.select(request(session,family.id)).next!.choices.map(o=>operandIdentity(o.operand))).toContain('LAMP');
  const result=session.commitSelection(request(session,family.id,[operand('LAMP')]));
  expect(result.text.join('')).toBe(reference.transcript[1]);expect(result.text.join('')).toContain('(Taken)');expect(result.clockTicks).toBe(1);
  expect(WorldState.restore(game,session.exportSave().checkpoint.interpreter.world).parent(id('LAMP'))).toBe(id('ADVENTURER'));
  expect(session.acceptedInputs()).toHaveLength(1);session.assertReplayComplete();
});
it('leaves possession refusals to TAKE-CHECK without hiding an unheld object',()=>{
  const reference=runReference(['drop lamp','give lamp to robot'],2,{context:{room:'MAGNET-ROOM',inventory:['LAMP']}});
  const session=new GameSession(game,{replay:reference.random.filter(r=>r.category==='game')});position(session,'MAGNET-ROOM',['LAMP']);
  const drop=session.candidates().families.find(f=>f.lexicalTable==='DROP'&&f.verb==='DROP'&&f.slots.length===1)!;
  expect(session.commitSelection(request(session,drop.id,[operand('LAMP')])).text.join('')).toBe(reference.transcript[1]);
  expect(session.select(request(session,'GIVE:2')).next!.choices.map(o=>operandIdentity(o.operand))).toContain('LAMP');
  const refused=session.commitSelection(request(session,'GIVE:2',[operand('LAMP'),operand('ROBOT')]));
  expect(refused.status).toBe('resolved');expect(refused.text.join('')).toBe(reference.transcript[2]);
  expect(WorldState.restore(game,session.exportSave().checkpoint.interpreter.world).parent(id('LAMP'))).toBe(id('MAGNET-ROOM'));session.assertReplayComplete();
});
it('offers aquarium attacks despite FIND ACTORBIT and an unheld weapon',()=>{
  const session=new GameSession(game);position(session,'AQUARIUM-ROOM');
  const save=session.exportSave(),w=WorldState.restore(game,save.checkpoint.interpreter.world);w.move(id('SWORD'),id('AQUARIUM-ROOM'));save.checkpoint.interpreter.world=w.snapshot();session.importSave(save);
  unchanged(session,()=>{
    const first=session.select(request(session,'ATTACK:1'));expect(first.next!.slot.find).toBe('ACTORBIT');
    expect(first.next!.choices.map(o=>operandIdentity(o.operand))).toContain('AQUARIUM');
    const second=session.select(request(session,'ATTACK:1',['AQUARIUM']));expect(second.next!.choices.map(o=>operandIdentity(o.operand))).toContain('SWORD');
    expect(session.select(request(session,'ATTACK:1',['AQUARIUM','SWORD'])).ready).toBe(true);
  });
});
it('uses the robot own inventory in a real two-object command and matches the original text and turn costs',()=>{
  const commands=['give key to robot','give teapot to robot','robot, put key in teapot','look'];
  const reference=runReference(commands,2,{context:{room:'MAGNET-ROOM',inventory:['KEY','TEAPOT']}});
  const session=new GameSession(game,{replay:reference.random.filter(r=>r.category==='game')});position(session,'MAGNET-ROOM',['KEY','TEAPOT']);
  for(const [index,object] of ['KEY','TEAPOT'].entries())expect(session.commitSelection(request(session,'GIVE:2',[operand(object),operand('ROBOT')])).text.join('')).toBe(reference.transcript[index+1]);
  expect(session.actors().map(a=>a.actor)).toContain('ROBOT');
  unchanged(session,()=>{
    const first=session.select(request(session,'PUT:7',[],'ROBOT'));expect(first.next!.choices.map(o=>operandIdentity(o.operand))).toContain('KEY');
    const second=session.select(request(session,'PUT:7',[operand('KEY')],'ROBOT'));expect(second.next!.choices.map(o=>operandIdentity(o.operand))).toContain('TEAPOT');
  });
  const result=session.commitSelection(request(session,'PUT:7',[operand('KEY'),operand('TEAPOT')],'ROBOT'));
  expect(result).toMatchObject({status:'resolved',clockTicks:1});expect(result.text.join('')).toBe(reference.transcript[3]);
  const world=WorldState.restore(game,session.exportSave().checkpoint.interpreter.world);expect(world.parent(id('KEY'))).toBe(id('TEAPOT'));
  expect(world.parent(id('TEAPOT'))).toBe(id('ROBOT'));expect(world.global('WINNER')).toBe(world.global('PLAYER'));
  expect(session.commitSelection(request(session,'LOOK:12')).text.join('')).toBe(reference.transcript[4]);session.assertReplayComplete();
});
it('offers every two-object step at its actual walkthrough boundary and executes it through staged commit',()=>{
  const fixture=(JSON.parse(readFileSync('reference/structured-replay.json','utf8')) as ReplayFixtures).cases.find(c=>c.id==='walkthrough')!;
  const reference=runReference(fixture.commands),actions=[...new Map(fixture.actions.map(a=>[canonicalJson(a),a])).values()];
  const config:SessionOptions={replay:reference.random.filter(r=>r.category==='game'),actions:actions.map(action=>({action,label:'integration action'}))};
  const session=new GameSession(game,config),ids=new Map(session.options().map(o=>[canonicalJson(o.action),o.id]));let staged=0;
  for(const [index,action] of fixture.actions.entries()){
    let result;
    if(action.kind==='act'&&action.prso!==undefined&&action.prsi!==undefined){
      const label=`walkthrough input ${index+1}: ${fixture.commands[index]}`,family=action.lexicalTable+':'+action.syntax;
      const first=session.select(request(session,family,[],action.actor)),direct=first.next!.choices.find(o=>operandIdentity(o.operand)===operandIdentity(action.prso as Operand));
      expect(direct,label).toBeDefined();expect(direct!.spellings,label).toContainEqual(action.prso);
      const second=session.select(request(session,family,[action.prso],action.actor)),indirect=second.next!.choices.find(o=>operandIdentity(o.operand)===operandIdentity(action.prsi as Operand));
      expect(indirect,label).toBeDefined();expect(indirect!.spellings,label).toContainEqual(action.prsi);
      const final=request(session,family,[action.prso,action.prsi],action.actor);expect(session.select(final).ready,label).toBe(true);
      result=session.commitSelection(final);expect(result.status,label).toBe('resolved');staged++;
    }else {
      const {epoch,revision}=session.observe();result=session.execute({expected:{epoch,revision},optionId:ids.get(canonicalJson(action))!});
    }
    expect(result.text.join(''),`input ${index+1}`).toBe(reference.transcript[index+1]);
    expect(['rejected','error']).not.toContain(result.status);
  }
  expect(staged).toBe(36);expect(reference.final).toMatchObject({score:400,won:true});session.assertReplayComplete();
},120000);
it('rejects stale, incomplete, malformed, out-of-scope and spoofed selections atomically',()=>{
  const session=new GameSession(game),base=request(session,'GIVE:2',[operand('LAMP')]);
  const bad=[base,{...base,expected:{epoch:0,revision:0}},{...base,operands:[operand('LAMP'),operand('ROBOT')]},
    {...base,family:'CLIMB:6'}, {...base,family:'ANSWER:2',operands:[]}, {...base,actor:'ROBOT'},
    {...base,operands:[{object:'LAMP',noun:'SWORD'}]}, {...base,extra:true},null];
  for(const input of bad)unchanged(session,()=>expect(session.commitSelection(input as SelectionRequest)).toMatchObject({status:'rejected',clockTicks:0,text:[]}));
  const complete=request(session,'TAKE:8',[operand('LAMP')]);expect(session.commitSelection(complete).status).toBe('resolved');
  unchanged(session,()=>expect(session.commitSelection(complete).status).toBe('rejected'));
});
it('owns draft results, preserves spelling alternatives and guards multiplicity',()=>{
  const session=new GameSession(game),draft=request(session,'TAKE:8'),view=session.select(draft);
  const lamp=view.next!.choices.find(o=>operandIdentity(o.operand)==='LAMP')!;
  expect(lamp.spellings).toContainEqual({object:'LAMP',noun:'LAMP',adjective:'BRASS'});lamp.spellings.length=0;view.next!.choices.length=0;
  expect(session.select(draft).next!.choices.length).toBeGreaterThan(0);expect(draft.operands).toEqual([]);
  expect(session.select(request(session,'TAKE:8',['ALL'])).ready).toBe(true);
  expect(()=>session.select(request(session,'TAKE:8',[['LAMP','LAMP']]))).toThrow('Duplicate');
  expect(()=>session.select(request(session,'ATTACK:1',[['LAMP','SWORD']]))).toThrow('multiple');
});
it('replays committed drafts without prior browsing and rejects altered log identities or arbitrary execute IDs',()=>{
  const session=new GameSession(game);session.select(request(session,'TAKE:8'));
  const result=session.commitSelection(request(session,'TAKE:8',[operand('LAMP')]));expect(result.status).toBe('resolved');
  session.commitSelection(request(session,'LOOK:12'));const entries=session.acceptedInputs();
  const replay=GameSession.replay(game,{},entries);expect(replay.stateHash()).toBe(session.stateHash());expect(replay.observe()).toEqual(session.observe());
  const changed=structuredClone(entries);if(changed[0]!.kind==='selection')changed[0]!.optionId='forged';expect(()=>GameSession.replay(game,{},changed)).toThrow('altered');
  unchanged(session,()=>expect(session.execute({expected:request(session,'LOOK:12').expected,optionId:result.optionId!}).status).toBe('rejected'));
});
it('stages directional movement without exposing command IDs until commit',()=>{
  const session=new GameSession(game),draft=request(session,'walk:SOUTH');
  unchanged(session,()=>expect(session.select(draft)).toMatchObject({ready:true,next:null}));
  expect(session.commitSelection(draft)).toMatchObject({status:'resolved',clockTicks:1});
});
it('invalidates drafts across restore and rolls back execution failures without accepting the draft',()=>{
  const session=new GameSession(game),draft=request(session,'TAKE:8',[operand('LAMP')]),save=session.exportSave();session.importSave(save);
  unchanged(session,()=>expect(session.commitSelection(draft).status).toBe('rejected'));
  const limited=session.exportSave();limited.checkpoint.interpreter.output=0;limited.checkpoint.interpreter.limits.output=1;session.importSave(limited);
  unchanged(session,()=>{
    const failed=session.commitSelection(request(session,'TAKE:8',[operand('LAMP')]));expect(failed).toMatchObject({status:'error',clockTicks:0,text:[]});
    expect(failed).not.toHaveProperty('optionId');
  });
});
