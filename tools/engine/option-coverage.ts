import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { GameAction, LoadedGame, ZxrSave } from '../../src/engine/index.ts';
import { GameSession, WorldState } from '../../src/engine/index.ts';
import { createDebugSession } from '../../src/engine/testing.ts';
import { TextPlayer } from '../../src/player/controller.ts';
import { resolveHost } from '../../src/player/host.ts';
import { hashJson } from '../../src/zil/integrity.ts';
import { commandFile } from '../reference/fixtures.ts';
import { runReference } from '../reference/runner.ts';
import type { ReferenceRun } from '../reference/runner.ts';
import { memories } from '../reference/state.ts';
import { authorActions, splitCommands } from './replay-actions.ts';
import { replaySources } from './replay.ts';
import type { ReplayCase, ReplayFixtures } from './replay.ts';
import { createProjection, compareProjection } from './projection.ts';
import { commitOfferedAction } from './offered-action.ts';

export const EXTRA_OPTION_CASES=['tiny-before-riddle','robot-before-cakes','restore-mid-keyhole'] as const;
export interface OptionFixtures {format:'zxr-option-replay-v1';buildHash:string;cases:ReplayCase[]}
const same=(a:unknown,b:unknown,label:string)=>{if(!isDeepStrictEqual(a,b))throw new Error(label+' differs');};
const boundary=(run:ReferenceRun,input:number)=>{const n=run.checkpoints.findLastIndex(c=>c.input===input&&(c.kind==='read'||c.kind==='end'));if(n<0)throw new Error('Missing original boundary '+input);return n;};
/** A RESTORE rewinds both native/reference RNGs. Repeated draws share tape slots;
 * incompatible alternative branches fail rather than weakening RNG checks. */
export function oracleTape(run:ReferenceRun){
  const tape:{range:number;result:number}[]=[],cursors:number[]=[];let cursor=0,saved:number|undefined;
  for(let input=0;input<run.commands.length;input++){
    if(run.host.some(h=>h.input===input&&h.operation==='restore'&&h.success)){
      if(saved===undefined)throw new Error('Restore without earlier oracle save');cursor=saved;
    }
    for(const draw of run.random.filter(d=>d.input===input&&d.category==='game')){
      const event={range:draw.range,result:draw.result};if(tape[cursor])same(tape[cursor],event,'Restored oracle tape slot '+cursor);else tape[cursor]=event;cursor++;
    }
    if(run.host.some(h=>h.input===input&&h.operation==='save'&&h.success))saved=cursor;
    cursors.push(cursor);
  }
  if(cursor!==tape.length)throw new Error('Oracle branch leaves an unused tape tail');return {tape,cursors};
}
export function authorOptionFixtures(game:LoadedGame):OptionFixtures {
  return {format:'zxr-option-replay-v1',buildHash:game.buildHash,cases:EXTRA_OPTION_CASES.map(id=>{
    const commands=commandFile('reference/option-scripts/'+id+'.txt'),run=runReference(commands),projection=createProjection(game),states=[...memories(run)];
    return {id,commands,actions:authorActions(game,run),originalHash:hashJson(run),detachedSiblings:commands.map((_,i)=>projection.detachedSiblings(states[boundary(run,i)]!))};
  })};
}
export function validateOptionInputs(game:LoadedGame,base:ReplayFixtures,extra:OptionFixtures){
  if(base.format!=='zxr-structured-replay-v1'||extra.format!=='zxr-option-replay-v1'||base.buildHash!==game.buildHash||extra.buildHash!==game.buildHash)throw new Error('Option coverage build/format mismatch');
  const sources=replaySources();same(base.cases.map(c=>c.id),sources.map(s=>s.id),'Required baseline cases');same(extra.cases.map(c=>c.id),[...EXTRA_OPTION_CASES],'Required option cases');
  for(const [i,f] of base.cases.entries()){
    const source=sources[i]!;same(f.commands,splitCommands(source.commands).commands,f.id+' normalized commands');
    same(f.originalHash,hashJson(source.golden??runReference(source.commands)),f.id+' original identity');
    if(f.actions.length!==f.commands.length)throw new Error('Missing authored action '+f.id);
  }
  for(const f of extra.cases){same(f.commands,commandFile('reference/option-scripts/'+f.id+'.txt'),f.id+' script');if(f.actions.length!==f.commands.length)throw new Error('Missing authored action '+f.id);same(f.originalHash,hashJson(runReference(f.commands)),f.id+' original identity');}
}
interface Witness {random:{range:number;result:number}[];action:GameAction;text:string;state:string;sites:string[];cursor:number;clockTicks:number;family:string;placement:string;pathHash:string;controls:number;more:number;summary:ReferenceRun['final']}
function assertGoals(id:string,run:ReferenceRun){
  const at=(command:string)=>{const i=run.commands.lastIndexOf(command);if(i<0)throw new Error('Missing milestone '+command);return {index:i,summary:run.checkpoints[boundary(run,i)]!.summary};};
  if(id==='tiny-before-riddle'){
    const blue=at('take blue sphere'),riddle=at('answer "well"');if(blue.index>=riddle.index||blue.summary.score!==20||riddle.summary.score!==25||run.final.score!==40)throw new Error('Tiny-before-riddle milestones failed');
  }
  if(id==='robot-before-cakes'){
    const red=at('take red sphere'),candies=at('take candies');if(red.index>=candies.index||red.summary.score!==50||candies.summary.score!==65||run.final.room!=='TEA-ROOM')throw new Error('Robot-before-cakes milestones failed');
  }
  if(id==='restore-mid-keyhole'&&(!run.host.some(h=>h.operation==='save'&&h.success)||!run.host.some(h=>h.operation==='restore'&&h.success)||run.final.score!==105))throw new Error('Mid-puzzle restore milestones failed');
  if(id==='walkthrough'&&(run.final.score!==400||!run.final.won))throw new Error('Full-score victory missing');
  if(id==='random-death-recovery'&&run.final.deaths!==1)throw new Error('Death recovery not exercised');
}
/** Every path is actually selected through TextPlayer. The twelve area cases
 * are exact prefixes of the full solve: reuse its witness only after checking
 * EACH action, transcript, typed state, RNG slots and source call sites. */
export function checkOptionCoverage(game:LoadedGame,base:ReplayFixtures,extra:OptionFixtures,onCase?:(id:string,steps:number,reused:boolean)=>void,onStep?:(id:string,steps:number,total:number)=>void){
  validateOptionInputs(game,base,extra);const legacy=JSON.parse(readFileSync('reference/engine-replay.json','utf8'));same(legacy.buildHash,game.buildHash,'Legacy replay build');const projection=createProjection(game),witnesses=new Map<string,Witness[]>();
  const cases=[];
  for(const fixture of [...base.cases,...extra.cases]){
    const run=runReference(fixture.commands),snapshots=[...memories(run)],{tape,cursors}=oracleTape(run);
    const referenceStates=fixture.actions.map((_,i)=>{
      const ram=snapshots[boundary(run,i)]!,names=projection.detachedSiblings(ram);same(names,fixture.detachedSiblings[i],fixture.id+' detached siblings '+i);
      return projection.reference(ram,names);
    });
    const main=witnesses.get('walkthrough'),reuse=fixture.id.startsWith('area-')&&!!main&&fixture.actions.every((a,i)=>isDeepStrictEqual(a,main[i]?.action));
    let own:ReturnType<typeof createDebugSession>|undefined,player:TextPlayer|undefined,saved:ZxrSave|undefined;
    if(!reuse){own=createDebugSession(game,{seed:run.interpreter.seed,replay:tape},{maxEntries:65536,maxAttempts:4,operations:['random']});player=new TextPlayer(own.session);same(player.lastResult.text.join(''),run.transcript[0],fixture.id+' opening text');
      const ram=snapshots[boundary(run,-1)]!;compareProjection(projection.own(WorldState.restore(game,own.session.exportSave().checkpoint.interpreter.world)),projection.reference(ram,projection.detachedSiblings(ram)),fixture.id+' opening');}
    const steps:Witness[]=[];
    for(const [i,action] of fixture.actions.entries()){
      const label=fixture.id+' input '+(i+1)+' ('+fixture.commands[i]+')';let witness:Witness;
      if(reuse)witness=main![i]!;
      else try{
        const {session,debug}=own!;debug.clearTrace();const offered=commitOfferedAction(game,player!,action);let text=offered.result.text.join(''),clockTicks=offered.result.clockTicks;
        if(player!.host){const problem=resolveHost(player!,{write:save=>{saved=structuredClone(save);},read:()=>{if(!saved)throw new Error('No coverage save');return structuredClone(saved);}});if(problem)throw new Error(problem);text+=player!.lastResult.text.join('');clockTicks+=player!.lastResult.clockTicks;}
        const traces=debug.trace();if(traces.droppedAttempts||traces.attempts.some(t=>t.droppedEntries))throw new Error('Coverage source trace truncated');
        const sites=traces.attempts.flatMap(t=>t.entries.filter(e=>e.kind==='expression'&&e.operation==='random').map(e=>e.name));
        const cp=session.observe().state==='input'?session.exportSave().checkpoint:debug.stateDump().checkpoint,world=WorldState.restore(game,cp.interpreter.world),state=projection.own(world);
        compareProjection(state,referenceStates[i]!,label);
        const entity=(id:number)=>game.bundle.payload.world.entities.find(e=>e.id===id)!.name;
        const summary={room:entity(world.global('HERE')),winner:entity(world.global('WINNER')),score:world.global('SCORE'),moves:world.global('MOVES'),won:!!world.global('WON-FLAG'),deaths:world.global('DEATHS')};
        witness={random:run.random.filter(r=>r.input===i&&r.category==='game').map(r=>({range:r.range,result:r.result})),action,text,state:hashJson(state),sites,cursor:cp.interpreter.rng.cursor,clockTicks,family:offered.family,placement:offered.placement,pathHash:hashJson(offered.path),controls:offered.path.length,more:offered.path.filter(c=>c.label.startsWith('More actions')).length,summary};
      }catch(error){throw new Error(label+': '+(error instanceof Error?error.message:String(error)),{cause:error});}
      same(witness.random,run.random.filter(r=>r.input===i&&r.category==='game').map(r=>({range:r.range,result:r.result})),label+' RNG events');same(witness.action,action,label+' authored action');same(witness.text,run.transcript[i+1],label+' original text');same(witness.state,hashJson(referenceStates[i]),label+' typed state');same(witness.cursor,cursors[i],label+' RNG cursor');
      same(witness.sites,run.random.filter(r=>r.input===i&&r.category==='game').map(r=>r.routine),label+' RNG source sites');same(witness.summary,run.checkpoints[boundary(run,i)]!.summary,label+' original summary');steps.push(witness);
      onStep?.(fixture.id,i+1,fixture.actions.length);
    }
    if(steps.at(-1)?.cursor!==tape.length)throw new Error(fixture.id+' unused tape');
    if(own){own.session.assertReplayComplete();if(own.session.options().some(o=>o.action.kind!=='decide'))throw new Error('Coverage must not use a trusted action catalogue');
      same(GameSession.replay(game,{seed:run.interpreter.seed,replay:tape},own.session.acceptedInputs()).stateHash(),own.session.stateHash(),fixture.id+' accepted-input replay');
    }
    assertGoals(fixture.id,run);witnesses.set(fixture.id,steps);
    const row={id:fixture.id,commands:fixture.commands.length,offered:steps.length,unsupported:0,execution:reuse?'verified-walkthrough-prefix':'shell-controller',gameDraws:tape.length,clockTicks:steps.reduce((n,s)=>n+s.clockTicks,0),controls:steps.reduce((n,s)=>n+s.controls,0),moreExpansions:steps.reduce((n,s)=>n+s.more,0),pathHash:hashJson(steps.map(s=>({family:s.family,placement:s.placement,pathHash:s.pathHash}))),checkpointsHash:hashJson(steps.map(s=>s.state)),final:run.final};
    const earlier=legacy.cases.find((c:{id:string})=>c.id===fixture.id);if(earlier){same(row.checkpointsHash,earlier.checkpointsHash,fixture.id+' legacy typed checkpoints');same(row.clockTicks,earlier.clockTicks,fixture.id+' legacy clock ticks');same(row.gameDraws,earlier.gameDraws,fixture.id+' legacy draws');}
    cases.push(row);onCase?.(fixture.id,steps.length,reuse);
  }
  const adaptations=legacy.cases.find((c:{id:string})=>c.id==='walkthrough').adaptations;
  return {format:'zxr-option-coverage-v1',buildHash:game.buildHash,policy:'All required structured actions must be selected from the shared shell controller; missing choices are errors. Exact area prefixes share checked witnesses.',originalInputDispositions:adaptations,cases,total:cases.reduce((n,c)=>n+c.commands,0),offered:cases.reduce((n,c)=>n+c.offered,0),unsupported:0};
}
