import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { WorldState } from '../../src/engine/index.ts';
import type { GameAction, LoadedGame } from '../../src/engine/index.ts';
import type { TurnCheckpoint, TurnResolution } from '../../src/engine/turn-loop.ts';
import { createDebugTurnLoop, restoreDebugTurnLoop } from '../../src/engine/testing.ts';
import type { TraceEntry } from '../../src/engine/testing.ts';
import type { Span } from '../../src/zil/ast.ts';
import { hashJson } from '../../src/zil/integrity.ts';
import { fixtureCommands, loadFixtures } from '../reference/fixtures.ts';
import { runReference } from '../reference/runner.ts';
import type { ReferenceRun } from '../reference/runner.ts';
import { memories } from '../reference/state.ts';
import { authorActions, splitCommands } from './replay-actions.ts';
import { boundaryIndex, goldenBridge } from './replay.ts';
import { createProjection } from './projection.ts';
import { loadDifferences } from './conformance-review.ts';

export type ConformanceInput={kind:'action';action:GameAction}|{kind:'decision';choice:'YES'|'NO'|'RESTART'|'RESTORE'|'QUIT'}|{kind:'numeric';value:number}|{kind:'invalid-finish';text:'nonsense'};
export interface ConformanceCase {id:string;goldenHash:string;normalizedHash:string;commands:string[];inputs:ConformanceInput[];detachedSiblings:string[][]}
export interface ConformanceFixtures {format:'zxr-conformance-inputs-v1';buildHash:string;cases:ConformanceCase[]}
export function conformanceSources(){
  const manifest=loadFixtures();return manifest.fixtures.map(f=>{
    const golden=JSON.parse(gunzipSync(readFileSync('reference/transcripts/'+f.id+'.json.gz')).toString('utf8')) as ReferenceRun;
    if(!isDeepStrictEqual(golden.commands,fixtureCommands(f)))throw new Error('Golden commands changed '+f.id);
    if(golden.interpreter.seed!==manifest.seed)throw new Error('Golden seed changed '+f.id);
    return {id:f.id,golden};
  });
}
export type ConformanceSource=ReturnType<typeof conformanceSources>[number];
const normalizedCache=new WeakMap<ConformanceSource,{normalized:ReturnType<typeof splitCommands>;run:ReferenceRun}>();
function normalizedRun(source:ConformanceSource){
  const cached=normalizedCache.get(source);if(cached)return cached;
  const normalized=splitCommands(source.golden.commands);
  // Actor IDs carry no noun alias. The engine's GENIE prefix uses its first source synonym, DEVIL.
  normalized.commands=normalized.commands.map(command=>command.replace(/^demon,/, 'devil,'));
  const run=isDeepStrictEqual(normalized.commands,source.golden.commands)?source.golden:runReference(normalized.commands,source.golden.interpreter.seed);
  const prepared={normalized,run};normalizedCache.set(source,prepared);return prepared;
}
function authorInput(game:LoadedGame,run:ReferenceRun,input:number):ConformanceInput {
  const command=run.commands[input]!,previous=run.checkpoints[boundaryIndex(run,input-1)]!;
  if(previous.routine==='YES?'||previous.routine==='FINISH'){
    const choice=command.toUpperCase();
    if(['YES','NO','RESTART','RESTORE','QUIT'].includes(choice))return {kind:'decision',choice:choice as Extract<ConformanceInput,{kind:'decision'}>['choice']};
    if(previous.routine==='FINISH'&&command==='nonsense')return {kind:'invalid-finish',text:'nonsense'};
    throw new Error('Unreviewed decision input '+command);
  }
  const numeric=command.match(/^#random ([0-9]+)$/);if(numeric)return {kind:'numeric',value:Number(numeric[1])};
  let action=authorActions(game,run,[input])[0]!;
  // A handler can cancel TELL before the original parser sees the actor's command.
  // Keep the authored actor continuation so that cancellation itself is checked.
  const cancelled=command.match(/^[a-z-]+, ([a-z-]+)$/);
  if(cancelled&&action.kind==='act'&&action.verb==='TELL'&&action.actor==='PLAYER'){
    const noun=action.prso,actor=typeof noun==='string'?noun:noun&&!Array.isArray(noun)&&'object' in noun?noun.object:undefined;
    const word=game.bundle.payload.vocabulary.words.find(w=>w.name===cancelled[1]!.toUpperCase()),lexical=game.bundle.payload.vocabulary.verbs.find(v=>v.number===word?.roles.verb?.number),row=lexical?.rows.find(r=>r.slots.length===0);
    if(!actor||!lexical||!row)throw new Error('Unreviewed cancelled actor command '+command);
    action={kind:'act',actor,verb:row.action.name,lexicalTable:lexical.name,syntax:row.id};
  }
  return {kind:'action',action};
}
export function authorConformanceCase(game:LoadedGame,source:ConformanceSource):ConformanceCase {
  const {normalized,run}=normalizedRun(source);if(run!==source.golden)goldenBridge(game,source.golden,run,normalized.groups);
  const projection=createProjection(game),states=[...memories(run)];
  return {id:source.id,goldenHash:hashJson(source.golden),normalizedHash:hashJson(run),commands:run.commands,
    inputs:run.commands.map((_,i)=>authorInput(game,run,i)),detachedSiblings:run.commands.map((_,i)=>projection.detachedSiblings(states[boundaryIndex(run,i)]!))};
}
export class ConformanceError extends Error {
  readonly detail:{caseId:string;turn:number;originalInput:number;command:string;kind:string;source:Span|null};
  constructor(detail:ConformanceError['detail'],message:string){
    const site=detail.source?`${detail.source.file}:${detail.source.start.line}:${detail.source.start.column}`:'unknown ZIL site';
    super(`${detail.caseId} turn ${detail.turn} (original input ${detail.originalInput}, ${JSON.stringify(detail.command)}): ${detail.kind}: ${message}\nZIL: ${site}`);this.name='ConformanceError';this.detail=detail;
  }
}
/** A new restart begins a new tape; successful restore rewinds to the SAVE cursor.
 * Parser RANDOM requests stay in the oracle record but never enter engine tapes. */
export function conformanceSchedule(run:ReferenceRun,inputs:readonly ConformanceInput[]){
  const tapes:{range:number;result:number}[][]=[[]],cursors:number[]=[],epochs:number[]=[];let epoch=0,cursor=0,saved:{epoch:number;cursor:number}|undefined;
  for(const [i,input] of inputs.entries()){
    const before=run.checkpoints[boundaryIndex(run,i-1)]!,restart=input.kind==='decision'&&(input.choice==='RESTART'||input.choice==='YES'&&before.routine==='YES?'&&before.stack.includes('V-RESTART'));
    if(restart){epoch++;tapes.push([]);cursor=0;}
    if(run.host.some(h=>h.input===i&&h.operation==='restore'&&h.success)){
      if(!saved||saved.epoch!==epoch)throw new Error('Unsupported cross-restart oracle restore');cursor=saved.cursor;
    }
    for(const draw of run.random.filter(r=>r.input===i&&r.category==='game')){
      const event={range:draw.range,result:draw.result},existing=tapes[epoch]![cursor];
      if(existing&&!isDeepStrictEqual(existing,event))throw new Error('Incompatible restored RNG branch '+i+' cursor '+cursor);
      tapes[epoch]![cursor++]=event;
    }
    if(run.host.some(h=>h.input===i&&h.operation==='save'&&h.success))saved={epoch,cursor};
    cursors.push(cursor);epochs.push(epoch);
  }
  return {tapes,cursors,epochs};
}
export function checkConformanceCase(game:LoadedGame,source:ConformanceSource,fixture:ConformanceCase,options:{mutate?:(world:WorldState,turn:number,phase:'exposed'|'parser-return'|'action-complete')=>void;randomTape?:(tape:{range:number;result:number}[],epoch:number)=>void}={}){
  const {normalized,run}=normalizedRun(source),adaptations=run===source.golden?[]:goldenBridge(game,source.golden,run,normalized.groups);
  const actorSpellings=normalized.groups.flatMap((group,input)=>group.filter(i=>source.golden.commands[input]!.startsWith('demon,')&&normalized.commands[i]!.startsWith('devil,')).map(i=>({input,kind:'canonical-actor-spelling',command:source.golden.commands[input]!,normalizedCommand:normalized.commands[i]!,fields:[]})));
  if(fixture.id!==source.id||fixture.goldenHash!==hashJson(source.golden)||fixture.normalizedHash!==hashJson(run)||!isDeepStrictEqual(fixture.commands,run.commands)||fixture.inputs.length!==run.commands.length||fixture.detachedSiblings.length!==run.commands.length)throw new Error('Conformance fixture identity/coverage differs '+source.id);
  const projection=createProjection(game),states=[...memories(run)],schedule=conformanceSchedule(run,fixture.inputs);
  for(const [epoch,tape] of schedule.tapes.entries())options.randomTape?.(tape,epoch);
  let active=createDebugTurnLoop(game,{seed:run.interpreter.seed,replay:schedule.tapes[0]},{maxEntries:65536,maxAttempts:8,captureBoundaries:true}),loop=active.loop,epoch=0,saved:TurnCheckpoint|undefined;
  const hashes:string[]=[],internalHashes:string[]=[],textDifferences:{input:number;ledger:string;referenceHash:string;engineHash:string}[]=[];let draws=0,parserDraws=0;
  const differences=loadDifferences();
  const expectedDifferences=differences.text.filter(d=>d.caseId===source.id);
  const originalIndex=(i:number)=>i<0?0:normalized.groups.findIndex(g=>g.includes(i))+1;
  function fail(i:number,kind:string,message:string,source?:Span|null):never {
    const trace=active.debug.trace().attempts.flatMap(a=>a.entries);
    throw new ConformanceError({caseId:sourceId,turn:i+1,originalInput:originalIndex(i),command:i<0?'opening':run.commands[i]!,kind,source:source??trace.at(-1)?.source??game.routine(game.bundle.payload.initialization.routine.id)!.source},message);
  }
  const sourceId=source.id;
  function verifyRandom(i:number,random:{range:number;result:number}[],sites:TraceEntry[]){
    const expected=run.random.filter(r=>r.input===i&&r.category==='game'),randomSites=sites.filter(e=>e.kind==='expression'&&e.operation==='random');
    if(!isDeepStrictEqual(random,expected.map(r=>({range:r.range,result:r.result})))){
      const request=expected.findIndex((draw,n)=>!isDeepStrictEqual(random[n],{range:draw.range,result:draw.result}));
      fail(i,'random',`events differ at request ${request>=0?request:expected.length}: `+JSON.stringify(random)+' vs '+JSON.stringify(expected.map(r=>({range:r.range,result:r.result}))),randomSites[request>=0?request:expected.length]?.source);
    }
    const misaligned=expected.findIndex((draw,n)=>randomSites[n]?.name!==draw.routine);
    if(misaligned>=0||randomSites.length!==expected.length)fail(i,'random',`source call sites differ at request ${misaligned>=0?misaligned:expected.length}`,randomSites[misaligned>=0?misaligned:expected.length]?.source);
    const cursor=i<0?0:schedule.cursors[i];if(loop.checkpoint().interpreter.rng.cursor!==cursor)fail(i,'random','tape cursor differs');
  }
  function verify(i:number,text:string){
    const expectedText=run.transcript[i+1]!;
    const disposition=expectedDifferences.find(d=>d.input===i&&d.command===run.commands[i]);
    if(disposition){
      if(disposition.referenceText!==expectedText||disposition.engineText!==text)fail(i,'text','ledger '+disposition.ledger+' exact text disposition no longer matches');
      textDifferences.push({input:i,ledger:disposition.ledger,referenceHash:hashJson(expectedText),engineHash:hashJson(text)});
    }else if(text!==expectedText){let offset=0;while(offset<text.length&&text[offset]===expectedText[offset])offset++;fail(i,'text',`first difference at character ${offset}; actual ${JSON.stringify(text.slice(offset,offset+160))}; expected ${JSON.stringify(expectedText.slice(offset,offset+160))}`);}
    const reference=states[boundaryIndex(run,i)]!,detached=projection.detachedSiblings(reference);
    if(i>=0&&!isDeepStrictEqual(detached,fixture.detachedSiblings[i]))fail(i,'state','detached sibling disposition changed');
    const world=loop.world();options.mutate?.(world,i+1,'exposed');
    let own,expectedState;
    try{own=projection.own(world);expectedState=projection.reference(reference,detached);}catch(error){fail(i,'state',error instanceof Error?error.message:String(error));}
    for(const key of new Set([...Object.keys(own),...Object.keys(expectedState)]))if(!isDeepStrictEqual(own[key],expectedState[key]))fail(i,'state',`${key}: actual ${JSON.stringify(own[key])}; expected ${JSON.stringify(expectedState[key])}`);
    hashes.push(hashJson(own));draws+=run.random.filter(r=>r.input===i&&r.category==='game').length;parserDraws+=run.random.filter(r=>r.input===i&&r.category==='parser').length;
  }
  function captureTrace(){const trace=active.debug.trace();if(trace.droppedAttempts||trace.attempts.some(a=>a.droppedEntries||a.droppedBoundaries))throw new Error('Conformance diagnostic trace truncated '+source.id);return {sites:trace.attempts.flatMap(a=>a.entries),boundaries:trace.attempts.flatMap(a=>a.boundaries??[])};}
  const opening=loop.start();if(opening.status==='error')fail(-1,'execution',opening.error!.cause,opening.error!.source);
  verifyRandom(-1,opening.random,captureTrace().sites);verify(-1,opening.text.join(''));
  for(const [i,input] of fixture.inputs.entries()){
    active.debug.clearTrace();let result:TurnResolution;
    if(input.kind==='action')result=loop.execute(input.action);
    else if(input.kind==='decision')result=loop.answer(input.choice);
    else result=active.debug.input(input);
    const texts=[...result.text],random=[...result.random],{sites,boundaries}=captureTrace();
    function accept(packet:TurnResolution){if(packet.status==='error'||packet.status==='rejected')fail(i,packet.error?.cause.includes('Random replay')?'random':'execution',packet.error?.cause??packet.status,packet.error?.source);}
    accept(result);
    if(result.boundary?.kind==='host'){
      const op=result.boundary.operation,host=run.host.find(h=>h.input===i);
      active.debug.clearTrace();
      if(op==='SAVE'){if(host?.operation!=='save')fail(i,'host','unexpected SAVE');saved=loop.checkpoint();result=loop.resumePrimitive(host.success?1:0);}
      else if(op==='RESTORE'){
        if(host?.operation!=='restore')fail(i,'host','unexpected RESTORE');
        if(host.success){if(!saved)fail(i,'host','RESTORE without saved continuation');active=restoreDebugTurnLoop(game,saved,{replay:schedule.tapes[epoch]},{maxEntries:65536,maxAttempts:8,captureBoundaries:true});loop=active.loop;result=loop.resumePrimitive(1);}
        else result=loop.resumePrimitive(0);
      }else if(op==='RESTART'){
        if(schedule.epochs[i]!==epoch+1)fail(i,'host','unexpected RESTART');loop.assertReplayComplete();epoch++;
        active=createDebugTurnLoop(game,{seed:run.interpreter.seed,replay:schedule.tapes[epoch]},{maxEntries:65536,maxAttempts:8,captureBoundaries:true});loop=active.loop;result=loop.start();
      }else {result={...result,text:[],random:[]};}
      accept(result);texts.push(...result.text);random.push(...result.random);const continuation=captureTrace();sites.push(...continuation.sites);boundaries.push(...continuation.boundaries);
    }
    verifyRandom(i,random,sites);
    const originals=run.checkpoints.flatMap((checkpoint,index)=>checkpoint.input===i&&(checkpoint.kind==='parser-return'||checkpoint.kind==='action-complete')?[{checkpoint,index}]:[]);
    if(originals.length!==boundaries.length)fail(i,'checkpoint',`internal checkpoint count ${boundaries.length} vs ${originals.length}`);
    for(const [n,entry] of boundaries.entries()){
      const {checkpoint,index}=originals[n]!;if(entry.kind!==checkpoint.kind)fail(i,'checkpoint','internal checkpoint kind differs',entry.source);
      const drawsInInput=run.random.filter(r=>r.input===i&&r.category==='game').length;
      const expectedCursor=schedule.cursors[i]!-drawsInInput+run.random.slice(0,checkpoint.randomPosition).filter(r=>r.input===i&&r.category==='game').length;
      if(entry.rngCursor!==expectedCursor)fail(i,'random',`${entry.kind} RNG cursor ${entry.rngCursor} vs ${expectedCursor}`,entry.source);
      const ram=states[index]!,world=WorldState.restore(game,entry.world);options.mutate?.(world,i+1,entry.kind);
      const expected=projection.reference(ram,projection.detachedSiblings(ram)),actual=projection.own(world);
      for(const key of Object.keys(expected))if(!isDeepStrictEqual(actual[key],expected[key]))fail(i,'state',`${entry.kind} ${key}: actual ${JSON.stringify(actual[key])}; expected ${JSON.stringify(expected[key])}`,entry.source);
      if(entry.kind==='parser-return'){
        const actualParser=projection.parserOwn(world),expectedParser=projection.parserReference(ram);
        if(!isDeepStrictEqual(actualParser,expectedParser))fail(i,'parser',`${entry.kind}: actual ${JSON.stringify(actualParser)}; expected ${JSON.stringify(expectedParser)}`,entry.source);
      }
      internalHashes.push(hashJson(actual));
    }
    verify(i,texts.join(''));
  }
  loop.assertReplayComplete();
  if(textDifferences.length!==expectedDifferences.length)throw new Error('Unused ledger text dispositions '+source.id);
  return {id:source.id,originalInputs:source.golden.commands.length,inputs:fixture.inputs.length,checkpoints:hashes.length,internalCheckpoints:internalHashes.length,internalCheckpointsHash:hashJson(internalHashes),gameDraws:draws,parserDraws,epochs:schedule.tapes.length,adaptations:[...adaptations,...actorSpellings],textDifferences,checkpointsHash:hashJson(hashes),final:run.final};
}
