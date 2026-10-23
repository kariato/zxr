import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { GameSession, WorldState, actionProbe, buildCandidateCatalog, gatePlacement, generateCandidates, learnKnowledge, loadGame, operandIdentity, queryScope, rankKnowledgeCandidates } from '../src/engine/index.ts';
import type { GameAction, SelectionRequest, ZxrSave } from '../src/engine/index.ts';
import { createBundle, packBundle } from '../src/zil/bundle.ts';
import { canonicalJson, hashJson } from '../src/zil/integrity.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { loadFixtures } from '../tools/reference/fixtures.ts';
import { runReference } from '../tools/reference/runner.ts';
import type { ReferenceRun } from '../tools/reference/runner.ts';
const bundle=compileSourcePath('reference/zork2'),game=loadGame(packBundle(bundle)),rules=game.bundle.payload.gateRules;
const id=(name:string)=>bundle.payload.world.entities.find(e=>e.name===name)!.id;
const word=(name:string)=>bundle.payload.vocabulary.words.find(w=>w.name===name)!.dictionaryIndex;
function draft(session:GameSession,family:string,operands:SelectionRequest['operands']=[],actor='PLAYER',words?:string[]):SelectionRequest {
  const {epoch,revision}=session.observe();return {expected:{epoch,revision},actor,family,operands,...(words===undefined?{}:{words:words.map(word)})};
}
const readFamily=bundle.payload.vocabulary.verbs.find(v=>v.name==='READ')!.rows.find(r=>r.action.name==='READ'&&r.slots.length===1)!.id;
function position(session:GameSession,room='MAGNET-ROOM',inventory:string[]=[]){
  const save=session.exportSave(),w=WorldState.restore(game,save.checkpoint.interpreter.world);
  w.move(w.global('PLAYER'),id(room));w.setGlobal('HERE',id(room));w.setGlobal('LIT',1);w.setGlobal('WINNER',w.global('PLAYER'));
  for(const name of inventory)w.move(id(name),w.global('PLAYER'));save.checkpoint.interpreter.world=w.snapshot();session.importSave(save);
}
function readRobot(session:GameSession){return session.commitSelection(draft(session,'READ:'+readFamily,[{object:'ROBOT-LABEL',noun:'PAPER',adjective:'GREEN'}]));}
function unchanged(session:GameSession,operation:()=>void){
  const before={state:session.stateHash(),save:session.exportSave(),log:session.acceptedInputs(),observation:session.observe()};operation();
  expect({state:session.stateHash(),save:session.exportSave(),log:session.acceptedInputs(),observation:session.observe()}).toEqual(before);
}
it('learns only committed printed clues and moves gated actors/families back to primary without losing candidates',()=>{
  const session=new GameSession(game);position(session);const before=session.candidates('ROBOT');
  expect(session.actors().find(a=>a.actor==='ROBOT')).toMatchObject({placement:'more',gates:['robot-instructions']});
  expect(before.families.every(f=>f.placement==='more')).toBe(true);
  expect(before.exits.every(e=>e.placement==='more'&&e.gates?.includes('robot-instructions'))).toBe(true);
  expect(session.select(draft(session,'walk:WEST',[],'ROBOT'))).toMatchObject({ready:true,placement:'more'});
  unchanged(session,()=>{session.observe();session.options();session.candidates('ROBOT');session.words();session.select(draft(session,'TAKE:8',[],'ROBOT'));});
  expect(session.exportSave().knowledge).toEqual([]);
  const read=readRobot(session);expect(read.status).toBe('resolved');expect(read.text.join('')).toContain('To activate me, say the following:');
  expect(session.exportSave().knowledge).toEqual(['robot-instructions']);expect(session.actors().find(a=>a.actor==='ROBOT')!.placement).toBe('primary');
  const after=session.candidates('ROBOT');expect(after.families.every(f=>f.placement==='primary')).toBe(true);
  expect(after.exits.every(e=>e.placement==='primary')).toBe(true);
  expect(after.exits.map(e=>e.direction)).toEqual(before.exits.map(e=>e.direction));
  expect(after.families.map(f=>f.id).sort()).toEqual(before.families.map(f=>f.id).sort());
  for(const f of before.families)expect(after.families.find(a=>a.id===f.id)!.operands.map(list=>list.map(o=>operandIdentity(o.operand)).sort())).toEqual(f.operands.map(list=>list.map(o=>operandIdentity(o.operand)).sort()));
});
it('re-ranks compound puzzle choices at the second stage and still commits an unknown-gate action',()=>{
  const session=new GameSession(game);position(session,'CERBERUS-ROOM',['COLLAR','LAMP']);
  const lit=session.exportSave(),world=WorldState.restore(game,lit.checkpoint.interpreter.world);world.setFlag(id('LAMP'),bundle.payload.symbols.symbols.find(s=>s.name==='ONBIT')!.number!);lit.checkpoint.interpreter.world=world.snapshot();session.importSave(lit);
  const selection=draft(session,'PUT:6',[{object:'COLLAR',noun:'COLLAR'}]);
  const next=session.select(selection).next!,dog=next.choices.find(o=>operandIdentity(o.operand)==='CERBERUS')!;
  expect(dog).toMatchObject({placement:'more',gates:['cerberus-collar']});expect(next.choices.some(o=>o.placement==='primary')).toBe(true);
  const ready=draft(session,'PUT:6',[{object:'COLLAR',noun:'COLLAR'},{object:'CERBERUS',noun:'CERBERUS'}]);
  expect(session.select(ready)).toMatchObject({ready:true,placement:'more'});
  const result=session.commitSelection(ready);expect(result.status).toBe('resolved');expect(result.text.join('')).toContain('whines happily');
  expect(WorldState.restore(game,session.exportSave().checkpoint.interpreter.world).parent(id('COLLAR'))).toBe(id('CERBERUS'));
});
it('never puts an unlearned target on primary at any of the 75 original golden transcript boundaries',()=>{
  const fixtures=loadFixtures().fixtures;expect(fixtures).toHaveLength(75);let boundaries=0,clues=0;
  for(const fixture of fixtures){
    const run=JSON.parse(gunzipSync(readFileSync('reference/transcripts/'+fixture.id+'.json.gz')).toString('utf8')) as ReferenceRun;
    let known:string[]=[];
    for(const text of run.transcript){
      const next=learnKnowledge(rules,known,text);clues+=next.length-known.length;known=next;boundaries++;
      for(const rule of rules)for(const target of rule.targets){
        const probe={actor:target.actors?.[0]??'ADVENTURER',verb:target.verbs?.[0]??'LOOK',direct:target.direct?.[0],indirect:target.indirect?.[0],words:target.words};
        const placement=gatePlacement(rules,known,probe);
        if(!known.includes(rule.id)){expect(placement.placement,fixture.id+' '+rule.id).toBe('more');expect(placement.gates).toContain(rule.id);}
        else expect(placement.gates).not.toContain(rule.id);
      }
    }
  }
  expect(boundaries).toBeGreaterThan(3000);expect(clues).toBeGreaterThan(0);
});
it('keeps the complete vocabulary neutral and makes unknown selected answers available under more',()=>{
  const session=new GameSession(game),picker=session.words({prefix:'WELL'});
  expect(picker.groups.flatMap(g=>g.words).map(w=>w.word)).toEqual(['WELL']);
  const request=draft(session,'ANSWER:2',[],'PLAYER',['WELL']);expect(session.select(request)).toMatchObject({ready:true,placement:'more',gates:['riddle-well']});
  unchanged(session,()=>{session.words();session.select(request);});
  expect(session.commitSelection(request).status).toBe('resolved'); // no clue required to try
});
it('keeps complete integration options executable under more and preserves their IDs',()=>{
  const answer:GameAction={kind:'say',actor:'PLAYER',lexicalTable:'ANSWER',syntax:2,verb:'ANSWER',words:['WELL']};
  const look:GameAction={kind:'act',actor:'PLAYER',lexicalTable:'LOOK',syntax:12,verb:'LOOK'};
  const session=new GameSession(game,{actions:[{action:answer,label:'answer'},{action:look,label:'look'}]});
  const options=session.options();expect(options.map(o=>o.label)).toEqual(['look','answer']);
  const gated=options.find(o=>o.label==='answer')!;expect(gated.anchor.menu).toBe('more');expect(gated.gates).toEqual(['riddle-well']);
  expect(session.execute({expected:draft(session,'LOOK:12').expected,optionId:gated.id}).status).toBe('resolved');
  expect(session.options().find(o=>o.label==='answer')!.id).toBe(gated.id);
  expect(gatePlacement(rules,[],actionProbe(answer,'ADVENTURER')).placement).toBe('more');
});
it('persists knowledge in boundary and primitive saves, round trips replay, and clears it on restart',()=>{
  const session=new GameSession(game);position(session);readRobot(session);const saved=session.exportSave();
  const save=session.commitSelection(draft(session,'SAVE:1'));expect(save.host!.save!.knowledge).toEqual(['robot-instructions']);
  // Host requests contain a SAVE payload; echo only the host-result protocol fields.
  const ack=save.host!;expect(session.completeHost({id:ack.id,epoch:ack.epoch,revision:ack.revision,kind:ack.kind,outcome:'success'}).status).toBe('resolved');
  session.commitSelection(draft(session,'WAIT:1'));session.importSave(saved);expect(session.exportSave().knowledge).toEqual(saved.knowledge);
  const restore=session.commitSelection(draft(session,'RESTORE:1')),h=restore.host!;
  expect(session.completeHost({id:h.id,epoch:h.epoch,revision:h.revision,kind:h.kind,outcome:'success',save:save.host!.save!}).status).toBe('resolved');
  expect(session.exportSave().knowledge).toEqual(['robot-instructions']);
  const replay=GameSession.replay(game,{},session.acceptedInputs());expect(replay.stateHash()).toBe(session.stateHash());
  const restart=session.commitSelection(draft(session,'RESTART:1'));expect(restart.status).toBe('pending');
  const yes=session.options().find(o=>o.label==='YES')!,current=session.observe();
  const host=session.execute({expected:{epoch:current.epoch,revision:current.revision},optionId:yes.id}).host!;
  expect(session.completeHost({id:host.id,epoch:host.epoch,revision:host.revision,kind:host.kind,outcome:'success'}).status).toBe('resolved');
  expect(session.exportSave().knowledge).toEqual([]);
});
it('retains knowledge through actual source death and resurrection without altering the original transcript',()=>{
  const commands=['read green paper','attack me with sword','west','west','west','look'];
  const reference=runReference(commands,2,{context:{room:'MAGNET-ROOM',inventory:['SWORD']}}),options={replay:reference.random.filter(r=>r.category==='game')};
  const session=new GameSession(game,options);position(session,'MAGNET-ROOM',['SWORD']);
  const requests=[()=>draft(session,'READ:'+readFamily,[{object:'ROBOT-LABEL',noun:'PAPER',adjective:'GREEN'}]),()=>draft(session,'ATTACK:1',[{object:'ME',noun:'ME'},{object:'SWORD',noun:'SWORD'}]),
    ...Array.from({length:3},()=>()=>draft(session,'walk:WEST')),()=>draft(session,'LOOK:12')];
  for(const [i,request] of requests.entries()){
    const result=session.commitSelection(request());expect(result.status,commands[i]).toBe('resolved');expect(result.text.join(''),commands[i]).toBe(reference.transcript[i+1]);
    expect(session.exportSave().knowledge).toEqual(['robot-instructions']);
    const w=WorldState.restore(game,session.exportSave().checkpoint.interpreter.world);
    if(i===1){expect(w.global('DEAD')).toBe(1);expect(w.global('DEATHS')).toBe(1);}
  }
  expect(WorldState.restore(game,session.exportSave().checkpoint.interpreter.world).global('DEAD')).toBe(0);session.assertReplayComplete();
  expect(GameSession.replay(game,options,session.acceptedInputs()).stateHash()).toBe(session.stateHash());
});
it('does not learn from output rolled back by a budget failure and rejects invalid saved knowledge atomically',()=>{
  const session=new GameSession(game);position(session);const save=session.exportSave();
  save.checkpoint.interpreter.output=0;save.checkpoint.interpreter.limits.output=1;session.importSave(save);
  unchanged(session,()=>{expect(readRobot(session).status).toBe('error');});expect(session.exportSave().knowledge).toEqual([]);
  for(const knowledge of [['invented'],['robot-instructions','robot-instructions'],['wizard-float','robot-instructions']]){
    const modified=session.exportSave();modified.knowledge=knowledge;unchanged(session,()=>expect(()=>session.importSave(modified)).toThrow('knowledge'));
  }
});
it('keeps rank application idempotent and pure and leaves every family/operand present',()=>{
  const session=new GameSession(game);position(session);const w=WorldState.restore(game,session.exportSave().checkpoint.interpreter.world);
  const raw=generateCandidates(game,buildCandidateCatalog(game),queryScope(game,w,{actor:'ROBOT'}).candidates),before=canonicalJson(raw);
  const first=rankKnowledgeCandidates(raw,rules,[]),second=rankKnowledgeCandidates(first,rules,[]);
  expect(second).toEqual(first);expect(canonicalJson(raw)).toBe(before);expect(first.families).toHaveLength(raw.families.length);
  const unlocked=rankKnowledgeCandidates(first,rules,rules.map(r=>r.id));expect(unlocked.families.map(f=>[f.id,f.score])).toEqual(raw.families.map(f=>[f.id,f.score]));
});
it('includes validated gate rules in build identity and rejects bad references or policy shapes',()=>{
  expect(gatePlacement(rules,[],{verb:'SSPRAY',direct:'ME',indirect:'REPELLENT'})).toMatchObject({placement:'more',gates:['repellent-instructions']});
  const changed=structuredClone(bundle.payload);changed.gateRules[0]!.learn=['A different valid clue fragment'];
  expect(createBundle(changed,bundle.debug,bundle.licenses).buildHash).not.toBe(bundle.buildHash);
  for(const edit of [(p:typeof changed)=>p.gateRules.push(p.gateRules[0]!),
    (p:typeof changed)=>p.gateRules[0]!.targets=[{}],(p:typeof changed)=>p.gateRules[0]!.targets=[{words:['NOT-A-WORD']}],
    (p:typeof changed)=>p.gateRules[0]!.targets=[{direct:['NOT-AN-OBJECT']}],(p:typeof changed)=>p.gateRules[0]!.targets=[{verbs:['NOT-A-VERB']}],
    (p:typeof changed)=>p.gateRules[0]!.learn=['x']]){
    const payload=structuredClone(bundle.payload);edit(payload);expect(()=>createBundle(payload,bundle.debug,bundle.licenses)).toThrow();
  }
});
