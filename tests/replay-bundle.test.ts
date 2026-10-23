import { expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { GameSession, ReplayPlayback, ReplayRecorder, ReplayDivergence, loadGame } from '../src/engine/index.ts';
import type { ReplayBundle, ZxrSave } from '../src/engine/index.ts';
import { TextPlayer } from '../src/player/controller.ts';
import { resolveHost } from '../src/player/host.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { commitOfferedAction } from '../tools/engine/offered-action.ts';
import { runReference } from '../tools/reference/runner.ts';
import { oracleTape } from '../tools/engine/option-coverage.ts';
import type { ReplayFixtures } from '../tools/engine/replay.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2')));
const choose=(p:TextPlayer,label:string)=>{let view=p.view();if(!view.choices.some(c=>c.label===label)){const more=view.choices.find(c=>c.label.startsWith('More actions'));if(more){p.choose(more.key);view=p.view();}}const c=view.choices.find(c=>c.label===label);expect(c,'Missing '+label).toBeDefined();p.choose(c!.key);};
const action=(p:TextPlayer,label:string)=>{choose(p,['Save','Wait','Look'].includes(label)?'Menu: look, inventory, wait, score, save':'Actions');choose(p,label);p.choose(p.view().choices.find(c=>c.label.startsWith('Do: '))!.key);};
const finish=(replay:ReplayPlayback)=>{while(!replay.done)replay.step();return replay.session.stateHash();};
it('records native selections, decision IDs and source host results and replays every hash without storage',()=>{
  const session=new GameSession(game,{seed:8743}),player=new TextPlayer(session),recorder=new ReplayRecorder(game,session);let saved:ZxrSave|undefined;
  const host=()=>{expect(resolveHost(player,{write:s=>{saved=s;},read:()=>saved!})).toBeUndefined();recorder.capture();};
  action(player,'Wait');recorder.capture();action(player,'Save');recorder.capture();host();action(player,'Wait');recorder.capture();
  action(player,'Restore');recorder.capture();host();action(player,'Restart');recorder.capture();choose(player,'NO');recorder.capture();
  action(player,'Quit');recorder.capture();choose(player,'YES');recorder.capture();host();
  const bundle=recorder.bundle(),replay=new ReplayPlayback(game,bundle);expect(bundle.start.kind).toBe('seed');expect(bundle.random).toBeUndefined();
  expect(finish(replay)).toBe(session.stateHash());expect(replay.position).toBe(bundle.frames.length);expect(replay.step()).toBeUndefined();expect(replay.session.observe().state).toBe('terminal');
  bundle.frames[0]!.stateHash='0'.repeat(64);expect(recorder.bundle().frames[0]!.stateHash).not.toBe(bundle.frames[0]!.stateHash);
});
it('rebinds protocol identities for replay from a mid-game save including restart, host requests and a later import',()=>{
  const s=new GameSession(game,{seed:19}),p=new TextPlayer(s);for(let i=0;i<4;i++)action(p,'Wait');
  // Move the receiving epoch away from a newly constructed playback session.
  for(let i=0;i<3;i++)p.importSave(s.exportSave());const middle=s.exportSave(),recorder=new ReplayRecorder(game,s);
  action(p,'Restart');recorder.capture();choose(p,'YES');recorder.capture();resolveHost(p,{write:()=>{},read:()=>middle});recorder.capture();
  p.importSave(middle);recorder.capture();action(p,'Save');recorder.capture();resolveHost(p,{write:()=>{},read:()=>middle});recorder.capture();
  const replay=new ReplayPlayback(game,recorder.bundle());expect(recorder.bundle().start.kind).toBe('save');expect(replay.session.observe().epoch).not.toBe(middle.metadata.epoch);
  expect(finish(replay)).toBe(s.stateHash());
});
it('stops at the first divergent input with expected/actual hashes and rejects changed selection IDs',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),recorder=new ReplayRecorder(game,s);action(p,'Wait');recorder.capture();action(p,'Look');recorder.capture();
  const bundle=recorder.bundle();bundle.frames[1]!.stateHash='0'.repeat(64);const replay=new ReplayPlayback(game,bundle);replay.step();
  expect(()=>replay.step()).toThrow(ReplayDivergence);expect(replay.failure).toMatchObject({input:2,expectedHash:'0'.repeat(64),actualHash:s.stateHash()});expect(replay.position).toBe(1);
  const hash=replay.session.stateHash();expect(()=>replay.step()).toThrow('Replay input 2');expect(replay.session.stateHash()).toBe(hash);
  const changed=recorder.bundle();(changed.frames[0]!.input as {optionId:string}).optionId='forged';expect(()=>new ReplayPlayback(game,changed).step()).toThrow('option ID');
});
it('validates build, ABI, schema, starting state, embedded save identities and exact host input hashes',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),recorder=new ReplayRecorder(game,s);action(p,'Save');recorder.capture();let saved!:ZxrSave;resolveHost(p,{write:save=>{saved=save;},read:()=>saved});recorder.capture();
  action(p,'Restore');recorder.capture();resolveHost(p,{write:()=>{},read:()=>saved});recorder.capture();const bundle=recorder.bundle();
  for(const value of [{...bundle,buildHash:'0'.repeat(64)},{...bundle,abi:'bad'},{...bundle,extra:true},{...bundle,start:{kind:'unknown'}},{...bundle,initialHash:'0'.repeat(64)}])expect(()=>new ReplayPlayback(game,value)).toThrow();
  const changed=structuredClone(bundle);const host=changed.frames.at(-1)!.input;expect(host.kind).toBe('host');if(host.kind==='host')host.saveHash='0'.repeat(64);expect(()=>finish(new ReplayPlayback(game,changed))).toThrow('accepted input');
  const wrongStart:ReplayBundle={...bundle,start:{kind:'save',save:{...saved,buildHash:'0'.repeat(64)}}};expect(()=>new ReplayPlayback(game,wrongStart)).toThrow('Save build');
});
it('refuses to invent intermediate hashes when recording missed accepted inputs',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),recorder=new ReplayRecorder(game,s);action(p,'Wait');action(p,'Look');expect(()=>recorder.capture()).toThrow('missed');
});
it('reproduces the complete 400-point walkthrough and its second half from a saved checkpoint',()=>{
  const fixtures=JSON.parse(readFileSync('reference/structured-replay.json','utf8')) as ReplayFixtures,fixture=fixtures.cases.find(c=>c.id==='walkthrough')!;
  const original=runReference(fixture.commands),random=oracleTape(original).tape,s=new GameSession(game,{seed:original.interpreter.seed,replay:random}),p=new TextPlayer(s),recorder=new ReplayRecorder(game,s,{random});let mid:ReplayRecorder|undefined,saved:ZxrSave|undefined;
  for(const [i,action] of fixture.actions.entries()){
    commitOfferedAction(game,p,action);recorder.capture();mid?.capture();
    if(p.host){expect(resolveHost(p,{write:save=>{saved=save;},read:()=>saved!})).toBeUndefined();recorder.capture();mid?.capture();}
    if(i===Math.floor(fixture.actions.length/2)){expect(s.observe().state).toBe('input');mid=new ReplayRecorder(game,s,{random});}
  }
  const final=s.stateHash();expect(finish(new ReplayPlayback(game,recorder.bundle()))).toBe(final);expect(finish(new ReplayPlayback(game,mid!.bundle()))).toBe(final);
  expect(original.final).toMatchObject({score:400,won:true});expect(p.lastResult.text.join('')).toContain('400');expect(p.lastResult.text.join('')).toContain('conquered the Wizard of Frobozz');expect(s.observe().state).toBe('pending');
},900000);

it('publishes a strict replay schema accepted independently by AJV',()=>{
  const validate=new Ajv2020({strict:true}).compile(JSON.parse(readFileSync('schema/replay.schema.json','utf8')));
  const s=new GameSession(game),p=new TextPlayer(s),recorder=new ReplayRecorder(game,s);action(p,'Look');recorder.capture();const bundle=recorder.bundle();
  expect(validate(bundle),JSON.stringify(validate.errors)).toBe(true);expect(validate({...bundle,unexpected:true})).toBe(false);
  expect(validate({...bundle,frames:[{...bundle.frames[0],stateHash:'invalid'}]})).toBe(false);
});
