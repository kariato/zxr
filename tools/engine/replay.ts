import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import type { LoadedGame, GameAction } from '../../src/engine/index.ts';
import { createDebugTurnLoop } from '../../src/engine/testing.ts';
import { hashJson } from '../../src/zil/integrity.ts';
import { commandFile, fixtureCommands, loadFixtures } from '../reference/fixtures.ts';
import { runReference } from '../reference/runner.ts';
import type { ReferenceRun } from '../reference/runner.ts';
import { memories } from '../reference/state.ts';
import { authorActions, splitCommands } from './replay-actions.ts';
import { createProjection, compareProjection } from './projection.ts';
import type { SemanticProjection } from './projection.ts';

export interface ReplayCase {id:string;originalHash:string;commands:string[];actions:GameAction[];detachedSiblings:string[][]}
export interface ReplayFixtures {format:'zxr-structured-replay-v1';buildHash:string;cases:ReplayCase[]}
export function replaySources():{id:string;commands:string[];golden?:ReferenceRun}[] {
  const selected=loadFixtures().fixtures.filter(f=>f.kind==='area'||f.kind==='walkthrough');
  const sources=selected.map(f=>({id:f.id,commands:fixtureCommands(f),golden:JSON.parse(gunzipSync(readFileSync(`reference/transcripts/${f.id}.json.gz`)).toString('utf8')) as ReferenceRun}));
  return [...sources,{id:'random-death-recovery',commands:[...commandFile('reference/scripts/walkthrough.txt').slice(0,53),...Array(15).fill('wait'),'attack me with sword','west','west','west','score','take lamp','turn on lamp','look','wait','inventory']}];
}
function boundaryIndex(run:ReferenceRun,input:number):number {
  const n=run.checkpoints.findLastIndex(c=>c.input===input&&(c.kind==='read'||c.kind==='end'));if(n<0)throw new Error('Missing exposed reference boundary '+input);return n;
}
/** Validate the reviewed structured-input normalization against the frozen golden.
 * No gameplay fields are silently excluded: the two unsupported typed inputs are
 * accounted for separately, and every ensuing structured action is compared in full. */
function goldenBridge(game:LoadedGame,golden:ReferenceRun,run:ReferenceRun,groups:number[][]) {
  const projection=createProjection(game),original=[...memories(golden)],normalized=[...memories(run)];
  const adaptations:{input:number;kind:string;command:string;fields:string[];originalText?:string}[]=[];
  let last=-1;
  for(const [input,group] of groups.entries()){
    const originalIndex=boundaryIndex(golden,input),current=group.at(-1)??last,normalIndex=boundaryIndex(run,current);
    const expected=projection.reference(original[originalIndex]!,projection.detachedSiblings(original[originalIndex]!));
    const actual=projection.reference(normalized[normalIndex]!,projection.detachedSiblings(normalized[normalIndex]!));
    const differences=Object.keys(expected).filter(k=>!isDeepStrictEqual(actual[k],expected[k]));
    if(differences.length){
      // The omitted orphan prompt may retain scanning/pronoun protocol until the
      // next complete noun binding. This is a bridge-only, input-specific rule;
      // these globals remain included in EVERY engine/oracle comparison.
      const allowed=input===142?['global.P-WALK-DIR','global.PRSA','global.P-ONEOBJ','global.P-WON']:input===143?['global.P-ONEOBJ']:input===224?['global.P-WALK-DIR','global.P-WON']:[];
      if(differences.some(k=>!allowed.includes(k)))throw new Error('Golden normalization state at '+input+' '+golden.commands[input]+': '+differences.join(','));
      adaptations.push({input,kind:'orphan-protocol',command:golden.commands[input]!,fields:differences});
    }
    if(!group.length){
      const text=golden.transcript[input+1]!;
      if(input===142&&golden.commands[input]==='take key'?!text.startsWith('Which key do you mean'):input===224&&golden.commands[input]==='take off crown'?!text.startsWith("That sentence isn't one I recognize"):true)throw new Error('Unreviewed omitted parser input '+input);
      const previous=golden.checkpoints[boundaryIndex(golden,input-1)]!;
      if(previous.summary.moves!==golden.checkpoints[originalIndex]!.summary.moves||golden.random.some(r=>r.input===input))throw new Error('Omitted parser input performed game work');
      adaptations.push({input,kind:'excluded-typed-input',command:golden.commands[input]!,fields:[],originalText:text});
    }else{
      let text='';for(const n of group){const chunk=run.transcript[n+1]!;text+=n===group.at(-1)?chunk:chunk.endsWith('\n>')?chunk.slice(0,-1):(()=>{throw new Error('Unexpected split-clause boundary');})();}
      if(text!==golden.transcript[input+1])throw new Error('Golden normalization text at '+input+' '+golden.commands[input]+': '+JSON.stringify(text)+' vs '+JSON.stringify(golden.transcript[input+1]));
      if(group.length>1)adaptations.push({input,kind:'separate-structured-choices',command:golden.commands[input]!,fields:[]});
      last=current;
    }
  }
  return adaptations;
}
export function checkReplayCase(game:LoadedGame,source:ReturnType<typeof replaySources>[number],fixture?:ReplayCase) {
  const normalized=splitCommands(source.commands),original=source.golden??runReference(source.commands),run=runReference(normalized.commands);
  const originalHash=hashJson(original);
  if(!isDeepStrictEqual(original.commands,source.commands))throw new Error('Golden source commands changed '+source.id);
  const adaptations=goldenBridge(game,original,run,normalized.groups),projection=createProjection(game),snapshots=[...memories(run)];
  const detachedSiblings=normalized.commands.map((_,input)=>projection.detachedSiblings(snapshots[boundaryIndex(run,input)]!));
  const authored:ReplayCase={id:source.id,originalHash,commands:normalized.commands,actions:fixture?.actions??authorActions(game,run),detachedSiblings};
  if(fixture&&(fixture.id!==source.id||fixture.originalHash!==originalHash||!isDeepStrictEqual(fixture.commands,normalized.commands)||!isDeepStrictEqual(fixture.detachedSiblings,detachedSiblings)))throw new Error('Structured fixture identity/normalization changed '+source.id);
  if(authored.actions.length!==run.commands.length)throw new Error('Structured action count differs '+source.id);
  const tape=run.random.filter(r=>r.category==='game'),{loop,debug}=createDebugTurnLoop(game,{seed:run.interpreter.seed,replay:tape},{maxEntries:65536,maxAttempts:1});
  const opening=loop.start();if(opening.text.join('')!==run.transcript[0])throw new Error('Opening text differs '+source.id);
  const initial=snapshots[boundaryIndex(run,-1)]!;compareProjection(projection.own(loop.world()),projection.reference(initial,projection.detachedSiblings(initial)),source.id+' opening');
  let gameDraws=0,clockTicks=0,activeSpellBoundaries=0;const checkpoints:string[]=[],randomRoutines=new Set<string>();
  for(const [input,action] of authored.actions.entries()){
    const label=source.id+' turn '+(input+1)+' ('+run.commands[input]+')',result=loop.execute(action);
    if(result.status==='error'||result.status==='rejected')throw new Error(label+' '+result.error?.cause+' '+JSON.stringify(result.error?.source));
    if(result.text.join('')!==run.transcript[input+1])throw new Error(label+' text differs: '+JSON.stringify(result.text.join(''))+' vs '+JSON.stringify(run.transcript[input+1]));
    const index=boundaryIndex(run,input),checkpoint=run.checkpoints[index]!,expectedRandom=tape.filter(r=>r.input===input);
    if(!isDeepStrictEqual(result.random,expectedRandom.map(r=>({range:r.range,result:r.result}))))throw new Error(label+' random events differ');
    const trace=debug.trace().attempts.at(-1)!;
    if(trace.droppedEntries)throw new Error(label+' source trace truncated');
    const sites=trace.entries.filter(e=>e.kind==='expression'&&e.operation==='random');
    if(!isDeepStrictEqual(sites.map(e=>e.name),expectedRandom.map(e=>e.routine)))throw new Error(label+' random call sites differ');
    for(const site of sites)randomRoutines.add(site.name);
    gameDraws+=expectedRandom.length;clockTicks+=result.clockTicks;if(loop.world().global('SPELL?'))activeSpellBoundaries++;
    const cursor=loop.checkpoint().interpreter.rng.cursor;
    if(cursor!==gameDraws||cursor!==run.random.slice(0,checkpoint.randomPosition).filter(r=>r.category==='game').length)throw new Error(label+' random cursor differs');
    const own=projection.own(loop.world()),reference=projection.reference(snapshots[index]!,authored.detachedSiblings[input]!);
    compareProjection(own,reference,label);checkpoints.push(hashJson(own));
  }
  loop.assertReplayComplete();
  const world=loop.world(),entity=(id:number)=>game.bundle.payload.world.entities.find(e=>e.id===id)!.name;
  const final={room:entity(world.global('HERE')),winner:entity(world.global('WINNER')),score:world.global('SCORE'),moves:world.global('MOVES'),won:!!world.global('WON-FLAG'),deaths:world.global('DEATHS')};
  if(!isDeepStrictEqual(final,run.final)||!isDeepStrictEqual(final,original.final))throw new Error(source.id+' final summary differs');
  if(source.id==='random-death-recovery'&&(!final.deaths||world.global('DEAD')||!randomRoutines.has('I-WIZARD')||!randomRoutines.has('ROBOT-FCN')||activeSpellBoundaries===0))throw new Error('Required wizard/actor/death/recovery scenario not exercised');
  return {fixture:authored,evidence:{id:source.id,commands:run.commands.length,originalInputs:source.commands.length,adaptations,projection:projection.counts,gameDraws,activeSpellBoundaries,parserDraws:run.random.length-tape.length,randomRoutines:[...randomRoutines].sort(),clockTicks,detachedSiblingNames:[...new Set(detachedSiblings.flat())].sort(),checkpointsHash:hashJson(checkpoints),final,finalStateHash:loop.stateHash()}};
}
