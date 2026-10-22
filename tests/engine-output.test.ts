import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Interpreter, loadGame } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { buildThreeRoom } from '../tools/zil/three-room.ts';
import { recordLookOutput } from '../tools/engine/look-output.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),startup=new Interpreter(game),opened=startup.run();
if(opened.status!=='suspended'||opened.wait.kind!=='parser')throw new Error('Output fixture startup failed');
const initial=startup.world(),look=game.bundle.payload.logic.routines.find(r=>r.name==='V-LOOK')!.id;
const golden=JSON.parse(readFileSync('reference/look-output.json','utf8')) as ReturnType<typeof recordLookOutput>;
function roomWorld(name:string){
  const world=initial.fork(),room=game.bundle.payload.world.entities.find(e=>e.name===name)!;
  world.move(world.global('PLAYER'),room.id);world.setGlobal('HERE',room.id);world.setGlobal('WINNER',world.global('PLAYER'));
  world.setGlobal('LIT',1);world.setGlobal('PRSA',game.bundle.payload.symbols.symbols.find(s=>s.name==='V?LOOK')!.number!);world.setGlobal('PRSO',0);world.setGlobal('PRSI',0);
  return world;
}
it('reproduces the five checked-in original V-LOOK output recordings',()=>{
  expect(recordLookOutput()).toEqual(golden);
});
it.each(golden.cases)('matches original V-LOOK text exactly in $room',fixture=>{
  const world=roomWorld(fixture.room),before=world.worldHash(),vm=new Interpreter(game,{world,routine:look}),result=vm.run();
  expect(result.status).toBe('returned');expect(result.text.join('')).toBe(fixture.text);expect(result.random).toEqual([]);
  expect(world.worldHash()).toBe(before);expect(vm.world().global('MOVES')).toBe(world.global('MOVES'));
  // This isolates V-LOOK output. MAIN-LOOP-1/CLOCKER and input protocol belong to step 3.4.
  expect(vm.world().global('HERE')).toBe(world.global('HERE'));
});
it('owns the prepared execution world and rejects incompatible or invalid input worlds',()=>{
  const world=roomWorld('FOOT-BRIDGE'),vm=new Interpreter(game,{world,routine:look});world.setGlobal('LIT',0);
  expect(vm.run().text.join('')).toBe(golden.cases.find(c=>c.room==='FOOT-BRIDGE')!.text);
  const other=loadGame(packBundle(buildThreeRoom()));expect(()=>new Interpreter(other,{world,routine:1})).toThrow('another build');
  world.setGlobal('HERE',65535);expect(()=>new Interpreter(game,{world,routine:look})).toThrow('Unknown object');
});
it('returns dark-room output and rolls back output-budget errors on prepared worlds',()=>{
  const world=roomWorld('SHALLOW-FORD');world.setGlobal('LIT',0);const dark=new Interpreter(game,{world,routine:look});
  expect(dark.run().text.join('')).toBe('It is pitch black. You are likely to be eaten by a grue.\n');
  const bounded=new Interpreter(game,{world:initial,routine:look,limits:{output:5}}),before=bounded.stateHash();
  expect(bounded.run()).toMatchObject({status:'error',cause:expect.stringContaining('output budget'),text:[]});expect(bounded.stateHash()).toBe(before);
});
