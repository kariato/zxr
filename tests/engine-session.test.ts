import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { GameSession, Interpreter, TurnLoop, loadGame } from '../src/engine/index.ts';
import type { ActionResolution, GameAction, HostResult, SessionOptions, ZxrSave } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { runReference } from '../tools/reference/runner.ts';
import { hashJson } from '../src/zil/integrity.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2')));
function act(table:string,verb=table,prso?:string,preposition?:string):GameAction {
  const rows=game.bundle.payload.vocabulary.verbs.find(v=>v.name===table)!.rows;
  const row=rows.find(r=>r.action.name===verb&&r.slots.length===(prso?1:0)&&(preposition===undefined||r.slots[0]?.preposition?.name===preposition))!;
  return {kind:'act',actor:'PLAYER',verb,lexicalTable:table,syntax:row.id,...(prso?{prso}:{})};
}
const walk=(direction:string):GameAction=>({kind:'walk',actor:'PLAYER',direction});
const actions=[act('LOOK'),act('QUIT'),act('RESTART'),act('SAVE'),act('RESTORE'),act('SCORE'),act('WAIT'),act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),walk('SOUTH'),walk('WEST'),act('JUMP','LEAP','BRIDGE','OFF')];
const config:SessionOptions={actions:actions.map((action,i)=>({action,label:String(i)}))};
const create=(options:SessionOptions={})=>new GameSession(game,{...config,...options});
// Match by structure; canonical JSON sorts keys in the session-owned catalogue.
const submit=(session:GameSession,action:GameAction)=>session.execute({expected:expected(session),optionId:session.options().find(o=>hashJson(o.action)===hashJson(action))!.id});
const expected=(session:GameSession)=>({epoch:session.observe().epoch,revision:session.observe().revision});
const decide=(session:GameSession,choice:string)=>session.execute({expected:expected(session),optionId:session.options().find(o=>o.label===choice)!.id});
const complete=(session:GameSession,packet:ActionResolution,outcome:HostResult['outcome']='success',save?:ZxrSave)=>{
  const {id,epoch,revision,kind}=packet.host!;
  return session.completeHost({id,epoch,revision,kind,outcome,...(save?{save}:{})});
};
function unchanged(session:GameSession,operation:()=>unknown){
  const before={hash:session.stateHash(),observation:session.observe(),log:session.acceptedInputs(),options:session.options()};
  operation();expect({hash:session.stateHash(),observation:session.observe(),log:session.acceptedInputs(),options:session.options()}).toEqual(before);
}
function positioned(session:GameSession,room:string,inventory:string[]=[]){
  const save=session.exportSave(),loop=TurnLoop.restore(game,save.checkpoint),world=loop.world();
  const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
  world.move(world.global('PLAYER'),id(room));world.setGlobal('HERE',id(room));world.setGlobal('WINNER',world.global('PLAYER'));world.setGlobal('LIT',1);
  for(const name of inventory)world.move(id(name),world.global('PLAYER'));
  save.checkpoint.interpreter.world=world.snapshot();session.importSave(save);
}
it('publishes exact original opening and pure lifecycle observations without raw world data',()=>{
  const session=create();expect(session.opening()).toMatchObject({status:'resolved',epoch:1,revision:1,actionSequence:0,clockTicks:0});
  expect(session.opening().text.join('')).toBe(runReference([]).transcript[0]);expect(session.observe()).toEqual({epoch:1,revision:1,moves:0,state:'input'});
  const hash=session.stateHash(),save=session.exportSave();for(let i=0;i<3;i++){session.observe();session.options();session.opening();session.exportSave();}
  expect(session.stateHash()).toBe(hash);expect(session.exportSave()).toEqual(save);
  expect(new GameSession(game).options()).toEqual([]);
  expect(()=>create({limits:{output:1}})).toThrow('startup');
});
it('correlates YES? decisions, rejects stale/ordinary choices, and declines quit without a tick',()=>{
  const reference=runReference(['quit','no','look']),session=create(),ordinary=session.options()[0]!;
  const pending=submit(session,act('QUIT'));expect(pending).toMatchObject({status:'pending',clockTicks:0,revision:2,pending:{choices:['YES','NO']}});expect(pending.text.join('')).toBe(reference.transcript[1]);
  expect(session.options().map(o=>o.id)).toEqual(['YES','NO'].map(c=>`DECIDE:${pending.pending!.decisionId}:${c}`));
  for(const optionId of [ordinary.id,'DECIDE:d999:YES',`DECIDE:${pending.pending!.decisionId}:QUIT`])unchanged(session,()=>expect(session.execute({expected:expected(session),optionId})).toMatchObject({status:'rejected',clockTicks:0,text:[]}));
  unchanged(session,()=>{expect(()=>session.exportSave()).toThrow('ordinary');expect(()=>session.importSave({} as ZxrSave)).toThrow('ordinary');});
  const old=session.options()[1]!,answer=decide(session,'NO');expect(answer).toMatchObject({status:'resolved',actionSequence:1,revision:3,clockTicks:0});expect(answer.text.join('')).toBe(reference.transcript[2]);
  expect(submit(session,act('LOOK')).text.join('')).toBe(reference.transcript[3]);
  submit(session,act('QUIT'));unchanged(session,()=>expect(session.execute({expected:expected(session),optionId:old.id})).toMatchObject({status:'rejected'}));
});
it('declines and accepts restart, resets seed/world, starts a fresh epoch and rejects old requests',()=>{
  const reference=runReference(['look','restart','no','restart','yes','score']),session=create({seed:19});
  submit(session,act('LOOK'));expect(submit(session,act('RESTART')).text.join('')).toBe(reference.transcript[2]);expect(decide(session,'NO').text.join('')).toBe(reference.transcript[3]);
  submit(session,act('RESTART'));const host=decide(session,'YES'),stale=expected(session);expect(host).toMatchObject({status:'host',clockTicks:0,host:{kind:'RESTART'}});expect(host.text.join('')).toContain('Restarting.');
  expect(session.options()).toEqual([]);const restarted=complete(session,host);expect(host.text.join('')+restarted.text.join('')).toBe(reference.transcript[5]);expect(session.observe()).toMatchObject({state:'input',epoch:2,moves:0});
  expect(session.exportSave().checkpoint.interpreter.rng.initialSeed).toBe(19);expect(session.stateHash()).toBe(create({seed:19}).stateHash());
  unchanged(session,()=>expect(session.execute({expected:stale,optionId:session.options()[0]!.id})).toMatchObject({status:'rejected'}));
  unchanged(session,()=>expect(complete(session,host)).toMatchObject({status:'rejected'}));
  expect(submit(session,act('SCORE')).text.join('')).toBe(reference.transcript[6]);
});
it.each(['failure','cancel'] as const)('resumes failed/cancelled SAVE, RESTORE and RESTART exactly once (%s)',outcome=>{
  for(const verb of ['SAVE','RESTORE','RESTART']){
    const session=create();let host=submit(session,act(verb));if(verb==='RESTART')host=decide(session,'YES');
    const revision=session.observe().revision;expect(host.status).toBe('host');
    const result=complete(session,host,outcome);expect(result).toMatchObject({status:'resolved',revision:revision+1,epoch:1,clockTicks:0});expect(result.text.join('')).toContain('Failed.');
    expect(session.observe().state).toBe('input');unchanged(session,()=>expect(complete(session,host,outcome)).toMatchObject({status:'rejected'}));expect(submit(session,act('LOOK')).clockTicks).toBe(1);
  }
});
it('validates host identities and shapes without consuming a pending SAVE',()=>{
  const session=create(),host=submit(session,act('SAVE')),h=host.host!,base={id:h.id,epoch:h.epoch,revision:h.revision,kind:h.kind,outcome:'success' as const};
  for(const result of [{...base,id:'h999'},{...base,kind:'RESTORE'},{...base,epoch:0},{...base,revision:0},{...base,extra:true},{...base,outcome:'maybe'},{...base,save:h.save},null])unchanged(session,()=>expect(session.completeHost(result as HostResult)).toMatchObject({status:'rejected'}));
  unchanged(session,()=>expect(session.execute({expected:expected(session),optionId:'x'})).toMatchObject({status:'rejected'}));
  expect(complete(session,host)).toMatchObject({status:'resolved',clockTicks:0});
  unchanged(session,()=>expect(complete(session,host)).toMatchObject({status:'rejected'}));
});
it('round-trips boundary saves with semantic equality, ignoring saved transport identities',()=>{
  const session=create({seed:99});submit(session,act('LOOK'));const saved=session.exportSave(),hash=session.stateHash();submit(session,act('WAIT'));
  saved.metadata={epoch:Number.MAX_SAFE_INTEGER,revision:Number.MAX_SAFE_INTEGER};const before=session.observe(),oldRequest={expected:expected(session),optionId:session.options()[0]!.id};
  expect(session.importSave(saved)).toMatchObject({status:'resolved',text:[],clockTicks:0,epoch:before.epoch+1,revision:before.revision+1});expect(session.stateHash()).toBe(hash);
  unchanged(session,()=>expect(session.execute(oldRequest).status).toBe('rejected'));
  const clone=session.exportSave();clone.checkpoint.interpreter.world.bytes.fill(0);clone.knowledge.push('fake');expect(session.stateHash()).toBe(hash);
  const other=create();other.importSave(saved);expect(other.stateHash()).toBe(hash);expect(other.exportSave().checkpoint.interpreter.rng.initialSeed).toBe(99);
});
it('captures primitive SAVE before its branch and restores the saved success continuation, not V-RESTORE',()=>{
  const reference=runReference(['look','save','wait','restore','score']),session=create();submit(session,act('LOOK'));
  const save=submit(session,act('SAVE')),payload=save.host!.save!;expect(payload.kind).toBe('primitive-save');expect(payload.checkpoint.interpreter.wait?.kind).toBe('SAVE');
  const saved=complete(session,save);expect(save.text.join('')+saved.text.join('')).toBe(reference.transcript[2]);const hash=session.stateHash();submit(session,act('WAIT'));
  const host=submit(session,act('RESTORE')),restored=complete(session,host,'success',payload);
  expect(restored).toMatchObject({status:'resolved',epoch:2,clockTicks:0});expect(restored.text.join('')).toBe(reference.transcript[4]);expect(session.stateHash()).toBe(hash);
  expect(submit(session,act('SCORE')).text.join('')).toBe(reference.transcript[5]);
  const other=create();expect(other.importSave(payload).text.join('')).toBe(saved.text.join(''));expect(other.stateHash()).toBe(hash);
});
it('rejects malformed saves atomically and leaves RESTORE pending for correction or cancellation',()=>{
  const session=create(),saved=session.exportSave();
  const changes=[(s:any)=>s.format='bad',(s:any)=>s.abi='bad',(s:any)=>s.buildHash='0'.repeat(64),(s:any)=>s.extra=true,(s:any)=>s.knowledge=['invented'],(s:any)=>s.checkpoint.started=false,(s:any)=>s.kind='primitive-save',(s:any)=>s.checkpoint.interpreter.frames[0].routine=1,(s:any)=>s.checkpoint.interpreter.world.bytes[0]=999,(s:any)=>s.checkpoint.interpreter.rng.state=0,(s:any)=>s.checkpoint.interpreter.wait=null];
  for(const change of changes){const corrupt=structuredClone(saved);change(corrupt);unchanged(session,()=>expect(()=>session.importSave(corrupt)).toThrow());}
  const host=submit(session,act('RESTORE'));
  for(const change of changes){const corrupt=structuredClone(saved);change(corrupt);unchanged(session,()=>expect(complete(session,host,'success',corrupt)).toMatchObject({status:'rejected',host:{id:host.host!.id}}));}
  unchanged(session,()=>expect(complete(session,host)).toMatchObject({status:'rejected'}));
  expect(complete(session,host,'success',saved)).toMatchObject({status:'resolved',epoch:2});
  unchanged(session,()=>expect(complete(session,host,'success',saved)).toMatchObject({status:'rejected'}));
});
it('requires a positive QUIT acknowledgement and enters a terminal session',()=>{
  const session=create(),save=session.exportSave();submit(session,act('QUIT'));const host=decide(session,'YES');
  for(const outcome of ['failure','cancel'] as const)unchanged(session,()=>expect(complete(session,host,outcome)).toMatchObject({status:'rejected'}));
  expect(complete(session,host)).toMatchObject({status:'resolved',clockTicks:0});expect(session.observe().state).toBe('terminal');expect(session.options()).toEqual([]);
  unchanged(session,()=>{expect(session.execute({expected:expected(session),optionId:'x'}).status).toBe('rejected');expect(()=>session.exportSave()).toThrow();expect(()=>session.importSave(save)).toThrow();expect(complete(session,host).status).toBe('rejected');});
});
it('reaches FINISH through the original victory routine and handles failed and successful restore',()=>{
  const reference=runReference(['save','look','restore','score'],2,{context:{room:'ZORK3',inventory:['WAND']}}),session=create();positioned(session,'ZORK3',['WAND']);
  const save=submit(session,act('SAVE'));complete(session,save);const finished=submit(session,act('LOOK'));
  expect(finished).toMatchObject({status:'pending',pending:{choices:['RESTART','RESTORE','QUIT']}});expect(finished.text.join('')).toBe(reference.transcript[2]);
  const host=decide(session,'RESTORE'),failed=complete(session,host,'failure');expect(failed.text.join('')).toBe(runReference(['look','restore','quit'],2,{context:{room:'ZORK3',inventory:['WAND']}}).transcript[2]);expect(failed).toMatchObject({status:'pending',clockTicks:0});expect(failed.text.join('')).toContain('Failed.');expect(failed.pending!.decisionId).not.toBe(finished.pending!.decisionId);
  const again=decide(session,'RESTORE'),restored=complete(session,again,'success',save.host!.save);expect(restored.text.join('')).toBe(reference.transcript[3]);expect(session.observe().state).toBe('input');
  expect(session.exportSave().checkpoint.interpreter.frames.some(f=>game.routine(f.routine)?.name==='FINISH')).toBe(false);
  expect(submit(session,act('SCORE')).text.join('')).toBe(reference.transcript[4]);
});
it('handles FINISH restart failure, restart success and terminal quit without executing the abandoned clock',()=>{
  for(const choice of ['RESTART','QUIT'] as const){
    const session=create();positioned(session,'ZORK3',['WAND']);submit(session,act('LOOK'));let host=decide(session,choice);
    if(choice==='RESTART'){
      const failed=complete(session,host,'cancel');expect(failed).toMatchObject({status:'pending',clockTicks:0});expect(failed.text.join('')).toContain('Failed.');host=decide(session,choice);
    }
    expect(complete(session,host).clockTicks).toBe(0);expect(session.observe()).toMatchObject(choice==='QUIT'?{state:'terminal'}:{state:'input',epoch:3,moves:0});
  }
});
it('matches original death and resurrection, score and moves through the public session',()=>{
  const commands=['take lamp','turn on lamp','south','south','jump off bridge','west','west','west','score'];
  const reference=runReference(commands),session=create({replay:reference.random.filter(r=>r.category==='game')});
  const path=[actions[7]!,actions[8]!,walk('SOUTH'),walk('SOUTH'),actions[11]!,walk('WEST'),walk('WEST'),walk('WEST'),act('SCORE')];
  for(const [i,action] of path.entries()){const result=submit(session,action);expect(result.status).toBe('resolved');expect(result.text.join(''),commands[i]).toBe(reference.transcript[i+1]);}
  const save=session.exportSave(),world=TurnLoop.restore(game,save.checkpoint,{replay:reference.random.filter(r=>r.category==='game')}).world();
  expect(world.global('DEATHS')).toBe(1);expect(world.global('DEAD')).toBe(0);expect(world.global('MOVES')).toBe(reference.final.moves);expect(world.global('SCORE')).toBe(reference.final.score);
});
it('replays accepted actions/decisions/host completions and embedded restores with an empty save store',()=>{
  const session=create({seed:19});submit(session,act('LOOK'));const save=submit(session,act('SAVE')),payload=save.host!.save!;complete(session,save,'failure');submit(session,act('WAIT'));
  const restore=submit(session,act('RESTORE'));complete(session,restore,'success',payload);submit(session,act('QUIT'));decide(session,'NO');const boundary=session.exportSave();submit(session,act('WAIT'));session.importSave(boundary);
  const entries=session.acceptedInputs(),replayed=GameSession.replay(game,{...config,seed:19},entries);
  expect(replayed.stateHash()).toBe(session.stateHash());expect(replayed.observe()).toEqual(session.observe());expect(replayed.acceptedInputs()).toEqual(entries);
  const record=entries.find(e=>e.kind==='host'&&e.result.kind==='RESTORE')!;expect(record.kind==='host'&&record.saveHash).toBe(hashJson(payload));
  if(record.kind==='host')record.result.save!.checkpoint.interpreter.world.bytes[0]=99;
  expect(session.acceptedInputs()).not.toEqual(entries);expect(()=>GameSession.replay(game,{...config,seed:19},entries)).toThrow();
  const changed=session.acceptedInputs();const imported=changed.find(e=>e.kind==='import')!;if(imported.kind==='import')imported.saveHash='0'.repeat(64);expect(()=>GameSession.replay(game,{...config,seed:19},changed)).toThrow('altered');
});
it('owns option actions, save requests and logs and rejects arbitrary or malformed option IDs',()=>{
  const input=structuredClone(config),session=create(input);input.actions![0]!.action=walk('SOUTH');const options=session.options();options[0]!.action=walk('WEST');
  for(const request of [{expected:expected(session),optionId:'zxr-action-v1:'+JSON.stringify(walk('NORTH'))},{expected:{epoch:1,revision:0},optionId:session.options()[0]!.id},{expected:expected(session),optionId:'x',extra:1},null])unchanged(session,()=>expect(session.execute(request as any).status).toBe('rejected'));
  const save=submit(session,act('SAVE'));save.host!.save!.checkpoint.interpreter.world.bytes.fill(0);
  const log=session.acceptedInputs();(log[0] as any).request.optionId='changed';expect(complete(session,save).status).toBe('resolved');expect(session.acceptedInputs()[0]).not.toEqual(log[0]);
});
it('rolls back a failed resumed segment and preserves its prompt, request, identities, log and budget',()=>{
  // Derive a budget that permits the prompt but fails in the NO continuation.
  const probe=new TurnLoop(game);probe.start();probe.execute(act('QUIT'));probe.answer('NO');const limit=probe.checkpoint().interpreter.steps-1;
  const session=create(),bounded=session.exportSave();bounded.checkpoint.interpreter.steps=0;bounded.checkpoint.interpreter.limits.steps=limit;session.importSave(bounded);submit(session,act('QUIT'));const pending=session.options().find(o=>o.label==='NO')!;
  unchanged(session,()=>expect(session.execute({expected:expected(session),optionId:pending.id})).toMatchObject({status:'error',clockTicks:0,text:[],pending:{choices:['YES','NO']}}));
  const ordinary=create({limits:{output:session.opening().text.join('').length}}),save=ordinary.exportSave();
  // A valid boundary checkpoint may carry a smaller limit than this session's startup.
  save.checkpoint.interpreter.output=0;save.checkpoint.interpreter.limits.output=1;ordinary.importSave(save);
  unchanged(ordinary,()=>expect(submit(ordinary,act('LOOK'))).toMatchObject({status:'error',text:[],clockTicks:0}));
});
it('keeps a published SAVE and external write committed when the success continuation fails',()=>{
  const session=create(),boundary=session.exportSave();boundary.checkpoint.interpreter.output=0;boundary.checkpoint.interpreter.limits.output=1;session.importSave(boundary);
  const host=submit(session,act('SAVE'));expect(host.status).toBe('host');
  const written=structuredClone(host.host!.save!);
  unchanged(session,()=>expect(complete(session,host)).toMatchObject({status:'error',text:[],clockTicks:0,host:{id:host.host!.id}}));
  expect(written.checkpoint.interpreter.wait?.kind).toBe('SAVE');
  const other=create();unchanged(other,()=>expect(()=>other.importSave(written)).toThrow('success continuation'));
});
it('rejects suspended decisions, RESTORE checkpoints, diagnostic fragments and unstarted checkpoints as public saves',()=>{
  const session=create(),save=session.exportSave(),loop=TurnLoop.restore(game,save.checkpoint);
  loop.execute(act('QUIT'));const decision={...save,checkpoint:loop.checkpoint()};
  unchanged(session,()=>expect(()=>session.importSave(decision)).toThrow('kind'));
  const restore=TurnLoop.restore(game,save.checkpoint);restore.execute(act('RESTORE'));
  unchanged(session,()=>expect(()=>session.importSave({...save,kind:'primitive-save',checkpoint:restore.checkpoint()})).toThrow('kind'));
  unchanged(session,()=>expect(()=>session.importSave({...save,checkpoint:new TurnLoop(game).checkpoint()})).toThrow('startup'));
  const fragment=new Interpreter(game,{routine:game.bundle.payload.logic.routines.find(r=>r.name==='FINISH')!.id,inputBoundary:'read'});fragment.run();
  unchanged(session,()=>expect(()=>session.importSave({...save,checkpoint:{...save.checkpoint,interpreter:fragment.checkpoint()}})).toThrow('startup continuation'));
});
it('uses monotonic request identities across restart and repeated FINISH decisions',()=>{
  const session=create();submit(session,act('QUIT'));const first=session.options()[0]!.id;decide(session,'NO');submit(session,act('RESTART'));const before=session.options()[0]!.id,host=decide(session,'YES');complete(session,host);
  submit(session,act('QUIT'));const after=session.options()[0]!.id;expect(new Set([first,before,after]).size).toBe(3);
  const wrong={...expected(session),epoch:session.observe().epoch-1};unchanged(session,()=>expect(session.execute({expected:wrong,optionId:after}).status).toBe('rejected'));
});

it('publishes a save schema checked independently by AJV for both checkpoint kinds',()=>{
  const schema=JSON.parse(readFileSync('schema/save.schema.json','utf8')),validate=new Ajv2020({strict:true}).compile(schema),session=create();
  expect(validate(session.exportSave())).toBe(true);const host=submit(session,act('SAVE'));expect(validate(host.host!.save)).toBe(true);
  const broken=structuredClone(host.host!.save!);broken.checkpoint.interpreter.frames[0]!.tasks[0]!.kind='invalid' as any;expect(validate(broken)).toBe(false);
});
it('reports the existing host boundary when acknowledged restart fails during fresh GO',()=>{
  const session=create();submit(session,act('LOOK'));const save=session.exportSave();
  save.checkpoint.interpreter.output=0;save.checkpoint.interpreter.limits.output=session.opening().text.join('').length-1;session.importSave(save);
  submit(session,act('RESTART'));const host=decide(session,'YES');expect(host.status).toBe('host');
  unchanged(session,()=>expect(complete(session,host)).toMatchObject({status:'error',moves:1,actionSequence:host.actionSequence,epoch:host.epoch,revision:host.revision,clockTicks:0,text:[],host:{id:host.host!.id}}));
});
