import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { GameRandom, numeric, signed, updateCompare, word } from '../src/engine/index.ts';

it('implements signed 16-bit arithmetic, wrapping and truncation at the word boundaries',()=>{
  const run=(op:string,...args:number[])=>signed(numeric(op,args.map(word)));
  expect(run('+',32767,1)).toBe(-32768);expect(run('+',-1,1)).toBe(0);expect(run('*',32767,32767)).toBe(1);
  expect(run('-',-32768)).toBe(-32768);expect(run('-',-32768,1)).toBe(32767);
  expect(run('/',-7,3)).toBe(-2);expect(run('/',7,-3)).toBe(-2);expect(run('MOD',-7,3)).toBe(-1);expect(run('MOD',7,-3)).toBe(1);
  expect(run('/',-32768,-1)).toBe(-32768);expect(()=>run('/',1,0)).toThrow('zero');expect(()=>run('MOD',1,0)).toThrow('zero');
});
it('keeps comparison patterns, signed ordering, bit tests and predicate truth values distinct',()=>{
  expect(numeric('EQUAL?',[4,1,3,4])).toBe(1);expect(numeric('EQUAL?',[4,1,3,5])).toBe(0);expect(numeric('N==?',[4,5])).toBe(1);
  expect(numeric('L?',[65535,0])).toBe(1);expect(numeric('G?',[32767,32768])).toBe(1);expect(numeric('0?',[0])).toBe(1);expect(numeric('1?',[65535])).toBe(0);
  expect(numeric('BAND',[0xf0,0x3f])).toBe(0x30);expect(numeric('BOR',[0xf0,0x0f])).toBe(0xff);expect(numeric('BTST',[0x30,0x10])).toBe(1);expect(numeric('BTST',[0x30,0x50])).toBe(0);expect(numeric('BTST',[0,0])).toBe(1);
});
it('updates variables with wrap before a signed compare and rejects malformed ALU input',()=>{
  expect(updateCompare('IGRTR?',32767,0)).toEqual({value:32768,result:0});expect(updateCompare('DLESS?',32768,0)).toEqual({value:32767,result:0});expect(updateCompare('DLESS?',0,0)).toEqual({value:65535,result:1});
  for(const f of [()=>numeric('AND',[1,2]),()=>numeric('+',[1]),()=>numeric('NOT',[0,1]),()=>numeric('EQUAL?',[1,2,3,4,5]),()=>numeric('+',[-1,1]),()=>word(0.5),()=>signed(65536),()=>updateCompare('bad' as any,1,2)])expect(f).toThrow();
});
it('matches fixed xorshift32 vectors and emits bounded, inclusive draws',()=>{
  const rng=new GameRandom(1),vectors=[270369,67634689,2647435461,307599695,2398689233];
  for(const state of vectors){expect(rng.random(32767)).toBe((state-1)%32767+1);expect(rng.snapshot().state).toBe(state);}
  for(const n of [1,2,3,7,100,32767])for(let i=0;i<100;i++){const x=rng.random(n);expect(x).toBeGreaterThanOrEqual(1);expect(x).toBeLessThanOrEqual(n);}
  expect(new GameRandom(0).random(100)).toBe(new GameRandom(0).random(100));
});
it('handles deterministic RANDOM zero/negative reseeds and complete owned RNG checkpoints',()=>{
  const rng=new GameRandom(2),first=rng.random(100);rng.random(100);expect(rng.random(0)).toBe(0);expect(rng.random(100)).toBe(first);
  expect(rng.random(word(-1))).toBe(0);const one=new GameRandom(1);expect(rng.random(32767)).toBe(one.random(32767));
  const checkpoint=rng.snapshot(),next=Array.from({length:50},()=>rng.random(9));rng.restore(checkpoint);expect(Array.from({length:50},()=>rng.random(9))).toEqual(next);
  const copy=rng.snapshot();copy.state=1;expect(rng.snapshot().state).not.toBe(1);
});
it('replays the real oracle tape, including reseeds, with exact range matching and no fallback',()=>{
  const fixture=JSON.parse(gunzipSync(readFileSync('reference/transcripts/area-barrow.json.gz')).toString('utf8')) as {random:{range:number;result:number}[]};
  expect(fixture.random.length).toBeGreaterThan(0);const tape=fixture.random.map(e=>({range:e.range,result:e.result})),rng=new GameRandom(2,tape);
  for(const e of tape)expect(rng.random(word(e.range))).toBe(e.result);
  expect(rng.snapshot().cursor).toBe(tape.length);expect(()=>rng.random(1)).toThrow('exhausted');
  const wrong=new GameRandom(2,[{range:10,result:3}]),before=wrong.snapshot();expect(()=>wrong.random(11)).toThrow('mismatch');expect(wrong.snapshot()).toEqual(before);expect(wrong.drainEvents()).toEqual([]);
});
it('validates replay/checkpoint identity and rolls the replay cursor back without mutable aliases',()=>{
  const tape=[{range:10,result:3},{range:10,result:7}],rng=new GameRandom(2,tape),snapshot=rng.snapshot();tape[0]!.result=9;expect(rng.random(10)).toBe(3);rng.restore(snapshot);expect(rng.random(10)).toBe(3);expect(rng.random(10)).toBe(7);
  for(const mutation of [{state:0},{cursor:99},{position:-1},{algorithm:'bad'},{replayHash:null}])expect(()=>rng.restore({...snapshot,...mutation} as any)).toThrow('snapshot');
  expect(()=>new GameRandom(3,[{range:10,result:3},{range:10,result:7}]).restore(snapshot)).toThrow('snapshot');
  expect(()=>new GameRandom(2,[{range:1,result:0}])).toThrow('replay');expect(()=>new GameRandom(-1)).toThrow('Seed');
  const events=rng.drainEvents();expect(events).toEqual([{range:10,result:3},{range:10,result:7}]);events[0]!.result=99;expect(rng.drainEvents()).toEqual([]);
});

it('detects unused replay tails explicitly at conformance completion',()=>{
  const rng=new GameRandom(2,[{range:4,result:3}]);expect(()=>rng.assertReplayComplete()).toThrow('Unused');expect(rng.random(4)).toBe(3);expect(()=>rng.assertReplayComplete()).not.toThrow();expect(()=>new GameRandom().assertReplayComplete()).not.toThrow();
});
