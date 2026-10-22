import { expect, it } from 'vitest';
import * as playerApi from '../src/engine/index.ts';
import { GameSession, Interpreter, TurnLoop, loadGame } from '../src/engine/index.ts';
import type { GameAction, HostResult } from '../src/engine/index.ts';
import { createDebugSession, createDebugInterpreter, createDebugTurnLoop } from '../src/engine/testing.ts';
import { SESSION_DEBUG } from '../src/engine/diagnostics.ts';
import { analyzeSymbols, BUNDLE_VERSIONS, compileMemory, compileVocabulary, compileWorldMetadata, createBundle, expandMacros, linkMemoryLogic, loadProgram, lookupSourceNode, mapLogicSources, packBundle, runtimeLogic, translateLogic } from '../src/zil/index.ts';
import { runtimeSymbols, compileSourcePath } from '../tools/zil/compile.ts';
import { hashJson } from '../src/zil/integrity.ts';
import { runReference } from '../tools/reference/runner.ts';
const full=loadGame(packBundle(compileSourcePath('reference/zork2')));
function fixture(routines:string){
  const source='<GLOBAL HERE FIRST>\n<GLOBAL X 0>\n<ROOM FIRST (DESC "First")>\n<ROOM SECOND (DESC "Second")>\n'+routines+'\n<ROUTINE V-LOOK () <RTRUE>>\n<SYNTAX LOOK = V-LOOK>\n';
  const files=new Map([['debug.zil',source]]),program=loadProgram(files,{entry:'debug.zil'}),forms=expandMacros(program.forms,program.definitions,program.globals).forms;
  const analysis=analyzeSymbols(program,forms,{objects:['FIRST','SECOND'],globals:['HERE','X'],routines:[...source.matchAll(/<ROUTINE ([^\s(]+)/g)].map(m=>m[1]!),words:[{name:'LOOK'}],constants:{'ACT?LOOK':255,'V?LOOK':0}});
  const world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis),operations=translateLogic(forms,analysis),memory=compileMemory(forms,analysis,world,vocabulary,operations.strings),mapped=mapLogicSources(linkMemoryLogic(operations,memory),files,{forms});
  return loadGame(packBundle(createBundle({game:{id:'debug-test',title:'Debug test'},versions:BUNDLE_VERSIONS,initialization:{kind:'call-entry',routine:{name:'GO',id:1},checkpoint:'pre-GO',rng:{algorithm:'xorshift32-v1',seed:2}},gateRules:[],world,vocabulary,memory,strings:operations.strings,symbols:runtimeSymbols(analysis,memory),logic:runtimeLogic(mapped)},{sources:mapped.sources,report:mapped.report,parser:null},[{spdx:'Apache-2.0',text:'Test fixture'}])));
}
function act(table:string):GameAction {
  const row=full.bundle.payload.vocabulary.verbs.find(v=>v.name===table)!.rows.find(r=>r.action.name===table&&!r.slots.length)!;
  return {kind:'act',actor:'PLAYER',verb:table,lexicalTable:table,syntax:row.id};
}
const actions=['LOOK','SCORE','WAIT','QUIT','SAVE','RESTORE','RESTART'].map(verb=>({action:act(verb),label:verb})),config={seed:19,actions};
function submit(session:GameSession,label:string){const {epoch,revision}=session.observe();return session.execute({expected:{epoch,revision},optionId:session.options().find(o=>o.label===label)!.id});}
function host(session:GameSession,result:ReturnType<typeof submit>,outcome:HostResult['outcome']='success',save?:HostResult['save']){const {id,epoch,revision,kind}=result.host!;return session.completeHost({id,epoch,revision,kind,outcome,...(save?{save}:{})});}

it('keeps debug and reveal-all capabilities out of the normal player API',()=>{
  expect(Object.keys(playerApi)).not.toContain('createDebugSession');expect(Object.keys(playerApi)).not.toContain('SESSION_DEBUG');expect(Object.keys(playerApi)).not.toContain('ExecutionDiagnostics');
  const normal=new GameSession(full,config);expect(()=>normal[SESSION_DEBUG]()).toThrow('not enabled');
  const {session,debug}=createDebugSession(full,config);expect(session.observe()).toEqual(normal.observe());expect(session.options()).toEqual(normal.options());
  expect(Object.keys(session.observe())).toEqual(['epoch','revision','state','moves']);expect(session.opening()).not.toHaveProperty('trace');expect(session.opening()).not.toHaveProperty('random');
  expect(debug.revealAll().objects).toHaveLength(251);expect(debug.revealAll().objects.some(o=>o.name==='WAND')).toBe(true);
});
it('traces a source turn with exact 2actions.zil command locations and build-local source-map identities',()=>{
  const {session,debug}=createDebugSession(full,config,{maxEntries:20000});debug.clearTrace();
  const result=submit(session,'SCORE');expect(result.text.join('')).toBe(runReference(['score']).transcript[1]);
  const trace=debug.trace();expect(trace.attempts).toHaveLength(1);const attempt=trace.attempts[0]!;expect(attempt).toMatchObject({input:'action',status:'suspended',droppedEntries:0});
  const commands=attempt.entries.filter(e=>e.kind==='command');expect(commands.length).toBeGreaterThan(10);
  expect(attempt.entries.some(e=>e.origin?.some(o=>o.macro==='TELL'))).toBe(true);
  const source=full.bundle.debug.sources.files.find(f=>f.file==='2actions.zil')!.text,offset=source.indexOf('<TELL "Your score ">'),line=source.slice(0,offset).split('\n').length;
  expect(commands.some(e=>e.name==='V-SCORE'&&e.source.file==='2actions.zil'&&e.source.start.line===line&&e.source.start.offset===offset)).toBe(true);
  for(const entry of attempt.entries){
    expect(entry.nodeId).toBeTruthy();expect(entry.sourceMapId).toBeTruthy();
    const original=lookupSourceNode(full.bundle.debug.sources,{routine:entry.name,nodeId:entry.nodeId!});
    expect(original.entry.id).toBe(entry.sourceMapId);expect(original.source).toEqual(entry.source);
    expect(original.entry.kind).toBe(entry.kind==='resume'?'expression':entry.kind);
    expect(original.point.policy).not.toBe('replaced-middle');
  }
});
it('records entered commands and expressions once, preserves repeats and omits unchosen branches',()=>{
  const game=fixture('<ROUTINE GO ()\n <REPEAT ((N 0))\n  <SET N <+ .N 1>>\n  <COND (<L? .N 3> <SETG X .N>) (T <RETURN .N>)>>\n <AND 0 </ 10 0>>\n <OR 1 <PRINTI "hidden">>\n>');
  const {interpreter,debug}=createDebugInterpreter(game,{}, {maxEntries:1000});expect(interpreter.run().status).toBe('returned');
  const entries=debug.trace().attempts[0]!.entries,commands=entries.filter(e=>e.kind==='command');
  const source=game.bundle.debug.sources.files[0]!.text,offset=source.indexOf('<SET N');
  expect(commands.filter(e=>e.source.start.offset===offset)).toHaveLength(3);
  expect(entries.some(e=>source.slice(e.source.start.offset,e.source.end.offset)==='</ 10 0>')).toBe(false);
  expect(entries.some(e=>source.slice(e.source.start.offset,e.source.end.offset)==='<PRINTI "hidden">')).toBe(false);
  expect(new Set(entries.filter(e=>e.source.start.offset===offset&&e.kind==='command').map(e=>e.nodeId)).size).toBe(1);
});
it('retains the failing source and call stack before rolling back memory/RNG/frames/output',()=>{
  const game=fixture('<ROUTINE GO () <SETG X 7> <F>>\n<ROUTINE F () <PRINTI "discarded"> <RANDOM 100> <G>>\n<ROUTINE G () </ 3 0>>');
  const {interpreter,debug}=createDebugInterpreter(game),before=interpreter.checkpoint(),hash=interpreter.stateHash();
  const result=interpreter.run();expect(result).toMatchObject({status:'error',cause:'Division by zero',text:[],random:[]});expect(interpreter.checkpoint()).toEqual(before);expect(interpreter.stateHash()).toBe(hash);
  const attempt=debug.trace().attempts[0]!;expect(attempt).toMatchObject({input:'run',status:'error',error:{cause:'Division by zero',source:result.status==='error'?result.source:null}});
  expect(attempt.error!.stack.map(f=>f.name)).toEqual(['GO','F','G']);expect(attempt.entries.some(e=>e.operation==='RANDOM'||e.operation==='random')).toBe(true);
  expect(attempt.error!.source!.start.line).toBe(7);expect(debug.revealAll().globals.find(g=>g.name==='X')!.value).toBe(0);
  expect(interpreter.run()).toEqual(result);expect(debug.trace().attempts[1]!.id).toBeGreaterThan(attempt.id);
});
it.each([
  ['<ROUTINE GO () <AGAIN>>',{steps:30},'step budget'],
  ['<ROUTINE GO () <GO>>',{depth:3},'call depth'],
  ['<ROUTINE GO () <PRINTI "too much">>',{output:1},'output budget'],
  ['<ROUTINE GO () <GET 65535 1>>',{},'allocation'],
] as const)('captures a bounded failed trace for runtime limits and bad addresses (%s)',(source,limits,cause)=>{
  const {interpreter,debug}=createDebugInterpreter(fixture(source),{limits},{maxEntries:4}),hash=interpreter.stateHash();
  expect(interpreter.run()).toMatchObject({status:'error',cause:expect.stringContaining(cause)});expect(interpreter.stateHash()).toBe(hash);
  const attempt=debug.trace().attempts[0]!;expect(attempt.status).toBe('error');expect(attempt.entries.length).toBeLessThanOrEqual(4);expect(attempt.error!.source!.file).toBe('debug.zil');expect(attempt.error!.stack.length).toBeGreaterThan(0);
});
it('gives even a first-step budget failure a routine source location',()=>{
  const {interpreter,debug}=createDebugInterpreter(fixture('<ROUTINE GO () <AGAIN>>'),{limits:{steps:1}});
  const result=interpreter.run();expect(result).toMatchObject({status:'error',source:{file:'debug.zil'}});expect(debug.trace().attempts[0]!.error!.source).toEqual(result.status==='error'?result.source:null);
});
it('bounds retained entries and attempts, reports omissions and preserves diagnostic identity across clear',()=>{
  const {interpreter,debug}=createDebugInterpreter(fixture('<ROUTINE GO () <AGAIN>>'),{limits:{steps:100}},{maxEntries:3,maxAttempts:2});
  for(let i=0;i<5;i++)interpreter.run();
  const trace=debug.trace();expect(trace).toMatchObject({droppedAttempts:3});expect(trace.attempts.map(a=>a.id)).toEqual([4,5]);
  for(const attempt of trace.attempts){expect(attempt.entries).toHaveLength(3);expect(attempt.droppedEntries).toBeGreaterThan(0);expect(attempt.entries.map(e=>e.step)).toEqual([...attempt.entries.map(e=>e.step)].sort((a,b)=>a-b));}
  const hash=interpreter.stateHash();debug.clearTrace();expect(debug.trace()).toEqual({format:'zxr-execution-trace-v1',attempts:[],droppedAttempts:0});expect(interpreter.stateHash()).toBe(hash);
  interpreter.run();expect(debug.trace().attempts[0]!.id).toBe(6);
});
it('returns owned JSON-safe state dumps, revealing current properties/flags/tree/globals without executing rules',()=>{
  const {session,debug}=createDebugSession(full,config),save=session.exportSave(),world=TurnLoop.restore(full,save.checkpoint).world(),lamp=full.bundle.payload.memory.objects.find(o=>o.name==='LAMP')!;
  world.move(lamp.id,world.global('PLAYER'));world.setFlag(lamp.id,31,true);world.setGlobal('SCORE',65535);save.checkpoint.interpreter.world=world.snapshot();session.importSave(save);
  const hash=session.stateHash(),log=session.acceptedInputs(),observation=session.observe(),dump=debug.stateDump(),trace=debug.trace();
  expect(dump.world.globals.find(g=>g.name==='SCORE')).toMatchObject({value:65535,signed:-1});expect(dump.world.objects.find(o=>o.name==='LAMP')).toMatchObject({parent:world.global('PLAYER'),flags:expect.arrayContaining([31])});
  expect(dump.checkpoint.interpreter.world).toEqual(world.snapshot());expect(dump.knowledge).toEqual([]);expect(dump.protocol.state).toBe('input');expect(dump.stateHash).toBe(hash);expect(()=>session.importSave(dump as any)).toThrow();
  dump.checkpoint.interpreter.world.bytes.fill(0);dump.world.objects[0]!.properties[0]!.bytes.fill(0);dump.protocol.nextId=999;dump.knowledge.push('forged');
  for(let i=0;i<3;i++){debug.revealAll();debug.stateDump();debug.trace();}
  expect(session.stateHash()).toBe(hash);expect(session.observe()).toEqual(observation);expect(session.acceptedInputs()).toEqual(log);expect(debug.trace()).toEqual(trace);expect(JSON.parse(JSON.stringify(debug.stateDump()))).toEqual(debug.stateDump());
});
it('keeps tracing through session forks, decisions, primitive success and restore/restart replacements',()=>{
  const {session,debug}=createDebugSession(full,config,{maxAttempts:16});debug.clearTrace();submit(session,'QUIT');submit(session,'NO');const save=submit(session,'SAVE');host(session,save);submit(session,'WAIT');const restore=submit(session,'RESTORE');host(session,restore,'success',save.host!.save);submit(session,'RESTART');const restart=submit(session,'YES');host(session,restart);
  const attempts=debug.trace().attempts;expect(attempts.map(a=>a.input)).toEqual(['action','decision','action','host','action','action','host','action','decision','run']);expect(attempts.every(a=>a.status==='suspended')).toBe(true);
  expect(attempts[1]!.entries.some(e=>e.kind==='resume'&&e.name==='YES?')).toBe(true);expect(attempts[6]!.entries.some(e=>e.kind==='resume'&&e.name==='V-SAVE')).toBe(true);expect(attempts.at(-1)!.entries.some(e=>e.name==='GO')).toBe(true);
  expect(debug.stateDump().protocol.epoch).toBe(3);expect(debug.stateDump().protocol.state).toBe('input');
});
it('leaves source trace unchanged on protocol rejection and reads dumps during pending/host/terminal states',()=>{
  const {session,debug}=createDebugSession(full,config);submit(session,'QUIT');expect(debug.stateDump().protocol.pending?.choices).toEqual(['YES','NO']);
  const before=debug.trace(),hash=session.stateHash();const {epoch,revision}=session.observe();expect(session.execute({expected:{epoch,revision},optionId:'DECIDE:old:YES'}).status).toBe('rejected');expect(debug.trace()).toEqual(before);expect(session.stateHash()).toBe(hash);
  const quit=submit(session,'YES');expect(debug.stateDump().protocol.host?.kind).toBe('QUIT');expect(debug.stateDump().checkpoint.interpreter.wait?.kind).toBe('QUIT');host(session,quit);expect(debug.stateDump().protocol.state).toBe('terminal');expect(debug.revealAll().objects).toHaveLength(251);
});
it('does not change gameplay packets, saves, state hashes or accepted-input replay when enabled or cleared',()=>{
  const normal=new GameSession(full,config),{session,debug}=createDebugSession(full,config,{maxEntries:2,maxAttempts:1});expect(session.opening()).toEqual(normal.opening());
  for(const verb of ['LOOK','WAIT','SCORE','QUIT','NO','SAVE']){
    const a=submit(normal,verb),b=submit(session,verb);expect(b).toEqual(a);
    if(a.host){expect(host(session,b)).toEqual(host(normal,a));}
    expect(session.stateHash()).toBe(normal.stateHash());expect(session.acceptedInputs()).toEqual(normal.acceptedInputs());if(session.observe().state==='input')expect(session.exportSave()).toEqual(normal.exportSave());debug.clearTrace();
  }
  expect(GameSession.replay(full,config,session.acceptedInputs()).stateHash()).toBe(session.stateHash());
  expect(session.exportSave()).not.toHaveProperty('diagnostics');expect(JSON.stringify(session.exportSave())).not.toContain('zxr-execution-trace');
});
it('supports low-level turn-loop tracing and pure read-only debug snapshots',()=>{
  const {loop,debug}=createDebugTurnLoop(full,{seed:19}),normal=new TurnLoop(full,{seed:19});expect(loop.start()).toEqual(normal.start());debug.clearTrace();expect(loop.execute(act('LOOK'))).toEqual(normal.execute(act('LOOK')));
  expect(debug.trace().attempts).toHaveLength(1);expect(debug.stateDump()).toEqual(loop.checkpoint());expect(debug.revealAll().objects).toHaveLength(251);
  const cp=debug.stateDump();cp.interpreter.world.bytes.fill(0);expect(loop.stateHash()).toBe(normal.stateHash());
});
it.each([{maxEntries:0},{maxEntries:65537},{maxEntries:1.5},{maxAttempts:0},{maxAttempts:17}])('rejects invalid trace limits before running a game (%j)',options=>{
  expect(()=>createDebugSession(full,config,options)).toThrow('Invalid trace limit');
});
it('preserves an exposed decision after a failed continuation while retaining its failed trace',()=>{
  const probe=new TurnLoop(full);probe.start();probe.execute(act('QUIT'));probe.answer('NO');
  const {session,debug}=createDebugSession(full,config),save=session.exportSave();save.checkpoint.interpreter.steps=0;save.checkpoint.interpreter.limits.steps=probe.checkpoint().interpreter.steps-1;session.importSave(save);
  const prompt=submit(session,'QUIT'),before=debug.stateDump();debug.clearTrace();
  expect(submit(session,'NO')).toMatchObject({status:'error',text:[],clockTicks:0,epoch:prompt.epoch,revision:prompt.revision});
  expect(debug.stateDump()).toEqual(before);const attempt=debug.trace().attempts[0]!;expect(attempt).toMatchObject({input:'decision',status:'error',error:{cause:expect.stringContaining('step budget')}});
  expect(attempt.entries[0]).toMatchObject({kind:'resume',name:'YES?'});expect(attempt.error!.stack.some(f=>f.name==='MAIN-LOOP-1')).toBe(true);
});
it('returns owned trace entries, origins and fault frames that cannot change future diagnostics',()=>{
  const {interpreter,debug}=createDebugInterpreter(fixture('<ROUTINE GO () <F>> <ROUTINE F () </ 1 0>>'));interpreter.run();
  const before=debug.trace(),copy=debug.trace();copy.attempts[0]!.entries[0]!.source.file='forged.zil';copy.attempts[0]!.entries.length=0;copy.attempts[0]!.error!.stack[0]!.name='forged';
  expect(debug.trace()).toEqual(before);interpreter.run();expect(debug.trace().attempts[1]!.error).toEqual(before.attempts[0]!.error);
});
