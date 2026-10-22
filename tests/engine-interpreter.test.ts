import { expect, it } from 'vitest';
import { Interpreter, loadGame } from '../src/engine/index.ts';
import { analyzeSymbols, BUNDLE_VERSIONS, compileMemory, compileVocabulary, compileWorldMetadata, createBundle, expandMacros, linkMemoryLogic, loadProgram, mapLogicSources, packBundle, runtimeLogic, translateLogic } from '../src/zil/index.ts';
import { runtimeSymbols, compileSourcePath } from '../tools/zil/compile.ts';
import { buildThreeRoom } from '../tools/zil/three-room.ts';
import { runReference } from '../tools/reference/runner.ts';
import { decodeState, memories } from '../tools/reference/state.ts';
import { auditStartup } from '../tools/engine/startup.ts';

function game(routines:string){
  const source='<GLOBAL HERE FIRST>\n<GLOBAL X 0>\n<ROOM FIRST (DESC "First")>\n<ROOM SECOND (DESC "Second")>\n<ROOM THIRD (DESC "Third")>\n'+routines+'\n<ROUTINE V-LOOK () <RTRUE>>\n<SYNTAX LOOK = V-LOOK>\n';
  const files=new Map([['game.zil',source]]),program=loadProgram(files,{entry:'game.zil'}),forms=expandMacros(program.forms,program.definitions,program.globals).forms;
  const names=[...source.matchAll(/<ROUTINE ([^\s(]+)/g)].map(m=>m[1]!);
  const analysis=analyzeSymbols(program,forms,{objects:['FIRST','SECOND','THIRD'],globals:[...source.matchAll(/<GLOBAL ([^\s(]+)/g)].map(m=>m[1]!),routines:names,words:[{name:'LOOK'}],constants:{'ACT?LOOK':255,'V?LOOK':0}});
  const world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis),operations=translateLogic(forms,analysis),memory=compileMemory(forms,analysis,world,vocabulary,operations.strings),logic=linkMemoryLogic(operations,memory),mapped=mapLogicSources(logic,files,{forms});
  return loadGame(packBundle(createBundle({game:{id:'test-game',title:'Test'},versions:BUNDLE_VERSIONS,initialization:{kind:'call-entry',routine:{name:'GO',id:1},checkpoint:'pre-GO',rng:{algorithm:'xorshift32-v1',seed:2}},gateRules:[],world,vocabulary,memory,strings:operations.strings,symbols:runtimeSymbols(analysis,memory),logic:runtimeLogic(mapped)},{sources:mapped.sources,report:mapped.report,parser:null},[{spdx:'Apache-2.0',text:'Test fixture'}])));
}
const run=(source:string)=>new Interpreter(game(source)).run();
const returned=(source:string,value:number)=>expect(run(source)).toMatchObject({status:'returned',value});

it('executes the hand-written three-room IR without changing its immutable definition',()=>{
  const loaded=loadGame(packBundle(buildThreeRoom())),vm=new Interpreter(loaded);
  expect(vm.run()).toEqual({status:'returned',value:1,text:['Three rooms.'],random:[]});
  expect(vm.world().global('HERE')).toBe(1);expect(new Interpreter(loaded).inspect().frames[0]!.locals).toEqual([0]);
});
it('evaluates arguments once in order and keeps supplied zero distinct from missing optional defaults',()=>{
  const source='<ROUTINE GO () <+ <F> <F 0> <F 4>>>\n<ROUTINE F ("OPTIONAL" (A <PROG () <SETG X <+ ,X 1>> 7>) "AUX" (B <+ .A ,X>)) .B>';
  const vm=new Interpreter(game(source));expect(vm.run()).toMatchObject({status:'returned',value:14});expect(vm.world().global('X')).toBe(1);
  returned('<ROUTINE GO () <+ <F <SETG X 1> <SETG X <+ ,X 1>>> ,X>> <ROUTINE F (A B) <+ .A .B>>',5);
});
it('short-circuits AND/OR/COND and returns the deciding value',()=>{
  returned('<ROUTINE GO () <AND 4 <OR 0 7 </ 1 0>>>>',7);
  returned('<ROUTINE GO () <AND 0 </ 1 0>>>',0);
  returned('<ROUTINE GO () <COND (0 </ 1 0>) (9) (T 3)>>',9);
  returned('<ROUTINE GO () <COND (0 1)>>',0);
  returned('<ROUTINE GO () <PROG ()>>',1);
});
it('restarts block and routine bodies with retained locals and unwinds the selected RETURN target',()=>{
  returned('<ROUTINE GO ("AUX" (N 0)) <SET N <+ .N 1>> <COND (<L? .N 3> <AGAIN>)> .N>',3);
  returned('<ROUTINE GO () <PROG ((N 0)) <SET N <+ .N 1>> <COND (<L? .N 4> <AGAIN>)> <RETURN .N> 99>>',4);
  returned('<ROUTINE GO () <+ <REPEAT ((N 0)) <COND (<IGRTR? N 4> <RETURN .N>)>> 1>>',6);
  returned('<ROUTINE GO () <PROG () <PROG () <RTRUE>> 99> 77>',1);
});
it('keeps recursive frames and operand stacks separate and handles APPLY zero',()=>{
  returned('<ROUTINE GO () <F 5>> <ROUTINE F (N) <COND (<0? .N> 0) (T <+ .N <F <- .N 1>>>)>>',15);
  returned('<ROUTINE GO () <PUSH 7> <F> <RSTACK>> <ROUTINE F () <PUSH 2> <PROG () <RSTACK>>>',7);
  returned('<ROUTINE GO () <APPLY 0 <SETG X 9>>>',0);
  expect(run('<ROUTINE GO () <RSTACK>>')).toMatchObject({status:'error',cause:'Operand stack underflow'});
});
it('executes shared-memory object primitives, defaults and output using the same world bytes',()=>{
  const vm=new Interpreter(game('<ROUTINE GO () <MOVE SECOND FIRST> <FSET SECOND 31> <PRINTD <FIRST? FIRST>> <PRINTN -7> <CRLF> <AND <IN? SECOND FIRST> <FSET? SECOND 31>>>'));
  expect(vm.run()).toEqual({status:'returned',value:1,text:['Second','-7','\n'],random:[]});expect(vm.world().parent(2)).toBe(1);
  const view=vm.world();view.remove(2);expect(vm.world().parent(2)).toBe(1);
});
it('suspends SAVE within an operand and resumes its exact continuation without replaying earlier output',()=>{
  const vm=new Interpreter(game('<ROUTINE GO () <PRINTI "before"> <+ <SAVE> 7>>'));
  expect(vm.run()).toMatchObject({status:'suspended',wait:{kind:'SAVE'},text:['before']});
  expect(vm.run()).toMatchObject({status:'suspended',text:[]});
  expect(vm.resume(1)).toEqual({status:'returned',value:8,text:[],random:[]});expect(()=>vm.resume(1)).toThrow('not suspended');
});
it('rolls back memory, RNG, frames, operands and unreturned output after an execution error',()=>{
  const vm=new Interpreter(game('<ROUTINE GO () <SETG X 4> <PRINTI "lost"> <RANDOM 10> <PUSH 2> </ 1 0>>')),before=vm.inspect(),world=vm.world().worldHash();
  const result=vm.run();expect(result).toMatchObject({status:'error',cause:'Division by zero',text:[],random:[]});expect(result.status==='error'&&result.source?.file).toBe('game.zil');
  expect(vm.inspect()).toEqual(before);expect(vm.world().worldHash()).toBe(world);expect(vm.run()).toEqual(result);
});
it('retains the exposed host boundary if a resumed segment errors',()=>{
  const vm=new Interpreter(game('<ROUTINE GO () <SETG X 1> <PRINTI "committed"> <SAVE> <SETG X 2> </ 1 0>>'));
  expect(vm.run()).toMatchObject({status:'suspended',text:['committed']});const boundary=vm.inspect();
  expect(vm.resume(1)).toMatchObject({status:'error',text:[]});expect(vm.world().global('X')).toBe(1);expect(vm.inspect()).toEqual(boundary);
});
it('enforces step/depth/output/operand limits and preserves budgets across suspensions',()=>{
  for(const [source,limits,cause] of [
    ['<ROUTINE GO () <AGAIN>>',{steps:20},'step budget'],
    ['<ROUTINE GO () <GO>>',{depth:5},'call depth'],
    ['<ROUTINE GO () <PRINTI "long">>',{output:3},'output budget'],
    ['<ROUTINE GO () <PUSH 1> <PUSH 2>>',{operands:1},'Operand stack'],
    ['<ROUTINE GO () <SETG HERE 65535>>',{},'Unknown object'],
  ] as const){const vm=new Interpreter(game(source),{limits});const before=vm.inspect(),hash=vm.stateHash();expect(vm.run()).toMatchObject({status:'error',cause:expect.stringContaining(cause)});expect(vm.inspect()).toEqual(before);expect(vm.stateHash()).toBe(hash);}
  const vm=new Interpreter(game('<ROUTINE GO () <PRINTI "abc"> <SAVE> <PRINTI "def">>'),{limits:{output:5}});expect(vm.run()).toMatchObject({status:'suspended'});expect(vm.resume(1)).toMatchObject({status:'error',cause:expect.stringContaining('output budget')});
});
it('fails closed at unimplemented input adapters and unsafe host replacement results',()=>{
  const vm=new Interpreter(game('<ROUTINE GO () <READ 0 0>>'));expect(vm.run()).toMatchObject({status:'suspended',wait:{kind:'READ',args:[0,0]}});expect(()=>vm.resume(1)).toThrow('future input adapter');
  for(const op of ['QUIT','RESTART','RESTORE']){const vm=new Interpreter(game('<ROUTINE GO () <'+op+'>>'));expect(vm.run()).toMatchObject({status:'suspended'});expect(()=>vm.resume(1)).toThrow('session replacement');}
});
it('runs translated Zork II startup to the parser boundary without invoking replaced parser bodies',()=>{
  const loaded=loadGame(packBundle(compileSourcePath('reference/zork2'))),vm=new Interpreter(loaded),result=vm.run();
  expect(result).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  if(result.status==='suspended'){
    const reference=runReference([]),opening=reference.transcript[0]!,state=decodeState([...memories(reference)].at(-1)!),world=vm.world();
    expect(Interpreter.restore(loaded,JSON.parse(JSON.stringify(vm.checkpoint()))).stateHash()).toBe(vm.stateHash());
    // The original has reached its parser READ and has printed its input prompt; our adapter has not run.
    expect(opening.endsWith('\n>')).toBe(true);expect(result.text.join('')).toBe(opening.slice(0,-2));
    expect(auditStartup(loaded,world,reference)).toMatchObject({globals:168,objects:251,properties:1015,tables:45,tableCells:1523,clockSlots:30});
    const corruptClock=world.fork();corruptClock.putWord(corruptClock.global('C-TABLE'),0,65535);expect(()=>auditStartup(loaded,corruptClock,reference)).toThrow('C-TABLE');
    expect(world.global('HERE')).toBe(loaded.bundle.payload.world.entities.find(e=>e.name==='INSIDE-BARROW')!.id);world.validate();
    for(const object of state.objects){
      expect([world.parent(object.id),world.nextSibling(object.id),world.firstChild(object.id)],object.name).toEqual([object.parent,object.sibling,object.child]);
      const attributes=Array.from({length:32},(_,flag)=>world.hasFlag(object.id,flag)?2**(31-flag):0).reduce((a,b)=>a+b,0);
      expect(attributes,object.name).toBe(parseInt(object.attributes,16));
    }
    // Address/string/routine initializers are independently covered by the typed relocation audit.
    const relocations=new Set(loaded.bundle.payload.memory.relocations.map(r=>r.address));
    for(const global of loaded.bundle.payload.memory.globals)if(!relocations.has(global.address))expect(world.global(global.name),global.name).toBe(state.globals[global.name]);
  }
},30000);

it('owns diagnostic continuations and evaluates APPLY arguments before dynamic calls',()=>{
  const vm=new Interpreter(game('<ROUTINE GO () <+ <APPLY F <SETG X 3>> ,X>> <ROUTINE F (N) .N>'));
  const diagnostic=vm.inspect();diagnostic.frames[0]!.locals.push(65535);diagnostic.frames[0]!.tasks.length=0;expect(vm.inspect().frames[0]!.tasks).toHaveLength(1);
  expect(vm.run()).toMatchObject({status:'returned',value:6});
  expect(JSON.parse(JSON.stringify(vm.inspect()))).toEqual(vm.inspect());
});

it('aliases translated byte/word writes and handles signed offsets and byte pointer arithmetic',()=>{
  returned('<GLOBAL BUF <ITABLE NONE 4>> <ROUTINE GO () <PUT ,BUF 0 4660> <PUTB ,BUF 1 255> <GET ,BUF 0>>',4863);
  returned('<GLOBAL BUF <ITABLE NONE 4>> <ROUTINE GO () <PUT ,BUF 0 7> <GET <REST ,BUF 2> -1>>',7);
  returned('<GLOBAL BUF <ITABLE NONE 4>> <ROUTINE GO () <==? <BACK <REST ,BUF> 1> ,BUF>>',1);
  expect(run('<GLOBAL BUF <ITABLE NONE 4>> <ROUTINE GO () <GET ,BUF 4>>')).toMatchObject({status:'error',cause:expect.stringContaining('allocation bounds')});
});
it('preserves pooled string, dictionary, character and signed-number output domains',()=>{
  const result=run('<ROUTINE GO () <PRINT "pooled"> <PRINTC 32> <PRINTB ,W?LOOK> <PRINTC 13> <PRINTN -32768>>');
  expect(result).toEqual({status:'returned',value:1,text:['pooled',' ','look','\n','-32768'],random:[]});
  expect(run('<ROUTINE GO () <PRINTB 1>>')).toMatchObject({status:'error',cause:expect.stringContaining('dictionary word')});
  expect(run('<ROUTINE GO () <PRINTC 1>>')).toMatchObject({status:'error',cause:expect.stringContaining('output character')});
});

it('round-trips complete execution checkpoints before entry and at nested SAVE continuations',()=>{
  const loaded=game('<ROUTINE GO () <PUSH 8> <+ <F 0> <PROG () <RSTACK>>>> <ROUTINE F (N "AUX" (A <+ .N 7>)) <PROG ((B 5)) <+ .A .B <SAVE>>>>');
  const vm=new Interpreter(loaded),initial=vm.checkpoint(),fresh=Interpreter.restore(loaded,JSON.parse(JSON.stringify(initial)));
  expect(fresh.stateHash()).toBe(vm.stateHash());expect(fresh.run()).toMatchObject({status:'suspended',wait:{kind:'SAVE'}});
  const boundary=fresh.checkpoint(),restored=Interpreter.restore(loaded,JSON.parse(JSON.stringify(boundary)));
  expect(restored.stateHash()).toBe(fresh.stateHash());expect(restored.resume(1)).toEqual(fresh.resume(1));expect(restored.run()).toMatchObject({status:'returned',value:8});
  expect(restored.stateHash()).toBe(fresh.stateHash());
  // Snapshot bytes/frames are detached, including nested expression operands.
  boundary.world.bytes.fill(0);boundary.frames.length=0;expect(restored.run()).toMatchObject({status:'returned',value:8});
});
it('restores random cursor/state and COW memory at a suspended checkpoint',()=>{
  const loaded=game('<ROUTINE GO () <SETG X <RANDOM 9>> <SAVE> <+ ,X <RANDOM 9>>>'),replay=[{range:9,result:4},{range:9,result:7}],vm=new Interpreter(loaded,{replay});
  expect(vm.run()).toMatchObject({status:'suspended',random:[{range:9,result:4}]});const checkpoint=vm.checkpoint();
  const restored=Interpreter.restore(loaded,checkpoint,{replay});expect(restored.world().global('X')).toBe(4);
  expect(restored.resume(0)).toEqual(vm.resume(0));expect(restored.run()).toMatchObject({status:'returned',value:11});expect(restored.stateHash()).toBe(vm.stateHash());
  expect(()=>Interpreter.restore(loaded,checkpoint)).toThrow('RNG snapshot');
});
it('rejects malformed execution checkpoint shapes, references, limits and memory before exposing state',()=>{
  const loaded=game('<ROUTINE GO () <+ 3 <F>>> <ROUTINE F () <SAVE>>'),vm=new Interpreter(loaded);vm.run();const original=vm.checkpoint(),hash=vm.stateHash();
  const corruptions=[
    (c:any)=>{c.buildHash='0'.repeat(64);},(c:any)=>{c.frames[0].routine=65535;},
    (c:any)=>{c.frames[0].locals=[];},(c:any)=>{c.frames[0].locals[0]=1;},
    (c:any)=>{c.frames[0].tasks[0].index=99999;},(c:any)=>{c.frames[0].tasks[0].waiting=false;},
    (c:any)=>{c.frames[0].tasks.at(-1).stage=0;},(c:any)=>{c.frames[1].tasks[0].args=[8];},
    (c:any)=>{c.wait.expression=99999;},(c:any)=>{c.wait.kind='QUIT';},(c:any)=>{c.wait.args=[1];},
    (c:any)=>{c.frames[1].tasks.at(-1).values=[1];},(c:any)=>{c.result=1;},
    (c:any)=>{c.steps=c.limits.steps+1;},(c:any)=>{c.limits.depth=1;},(c:any)=>{c.output=-1;},
    (c:any)=>{c.world.bytes[0]=255;},(c:any)=>{c.world.buildHash='0'.repeat(64);},(c:any)=>{c.rng.state=0;},
    (c:any)=>{c.extra=true;},
  ];
  for(const change of corruptions){const c=structuredClone(original);change(c);expect(()=>Interpreter.restore(loaded,c)).toThrow();expect(vm.stateHash()).toBe(hash);}
  const c=structuredClone(original);Object.defineProperty(c,'__proto__',{value:{bad:1},enumerable:true});expect(()=>Interpreter.restore(loaded,c)).toThrow();
});
it('retains checkpoint budgets and the last exposed state across a failed resumed segment',()=>{
  const loaded=game('<ROUTINE GO () <SETG X 1> <SAVE> <PRINTI "long">>'),vm=new Interpreter(loaded,{limits:{output:3}});vm.run();
  const restored=Interpreter.restore(loaded,vm.checkpoint()),hash=restored.stateHash();expect(restored.resume(1)).toMatchObject({status:'error',cause:expect.stringContaining('output budget')});expect(restored.stateHash()).toBe(hash);expect(restored.world().global('X')).toBe(1);
});

it('resumes failed restart/restore as false and rejects non-boolean host results without changes',()=>{
  for(const op of ['RESTORE','RESTART']){const loaded=game('<ROUTINE GO () <'+op+'>>'),vm=new Interpreter(loaded);vm.run();expect(vm.resume(0)).toMatchObject({status:'returned',value:0});}
  const vm=new Interpreter(game('<ROUTINE GO () <SAVE>>'));vm.run();const hash=vm.stateHash();expect(()=>vm.resume(2)).toThrow('zero or one');expect(vm.stateHash()).toBe(hash);
});
