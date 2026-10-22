import { expect, it } from 'vitest';
import { Interpreter, loadGame } from '../src/engine/index.ts';
import { analyzeSymbols, atomName, BUNDLE_VERSIONS, compileMemory, compileVocabulary, compileWorldMetadata, createBundle, expandMacros, head, linkMemoryLogic, loadProgram, mapLogicSources, packBundle, print, runtimeLogic, translateLogic } from '../src/zil/index.ts';
import type { Sequence } from '../src/zil/index.ts';
import { runtimeSymbols } from '../tools/zil/compile.ts';
import { sourceFiles } from '../tools/zil/program.ts';

// Extract the active, macro-expanded original routine instead of maintaining a test copy.
// Only its surrounding objects and handlers are synthetic; no parser/oracle claim is made here.
const original=loadProgram(sourceFiles('reference/zork2'),{entry:'zork2.zil'});
const perform=expandMacros(original.forms,original.definitions,original.globals).forms.find(n=>head(n)==='ROUTINE'&&atomName((n as Sequence).items[1])==='PERFORM')!;
const fixture=`
<GLOBAL HERE FIRST>
<GLOBAL WINNER ACTOR>
<GLOBAL PLAYER ACTOR>
<GLOBAL PRSA 37>
<GLOBAL PRSO FIRST>
<GLOBAL PRSI BOX>
<GLOBAL IT PRONOUN>
<GLOBAL P-IT-OBJECT DIRECT>
<GLOBAL NOT-HERE-OBJECT DIRECT>
<GLOBAL STOP -1>
<GLOBAL NEST 0>
<CONSTANT M-BEG 1>
<ROOM FIRST (DESC "First") (ACTION ROOM-HANDLER)>
<OBJECT ACTOR (IN FIRST) (DESC "Actor") (ACTION ACTOR-HANDLER)>
<OBJECT BOX (IN FIRST) (DESC "Box") (CONTFCN CONTAINER-HANDLER)>
<OBJECT DIRECT (IN BOX) (DESC "Direct") (ACTION DIRECT-HANDLER)>
<OBJECT INDIRECT (IN FIRST) (DESC "Indirect") (ACTION INDIRECT-HANDLER)>
<OBJECT PRONOUN (DESC "It")>
<ROUTINE GO () <PERFORM ,V?LOOK DIRECT INDIRECT>>
<ROUTINE MARK (N) <PRINTN .N> <COND (<==? ,STOP .N> <+ .N 10>) (T <>)>>
<ROUTINE ACCESSIBLE? (O) <RTRUE>>
<ROUTINE NOT-HERE-OBJECT-F () <MARK 0>>
<ROUTINE ACTOR-HANDLER () <MARK 1>>
<ROUTINE ROOM-HANDLER (MODE) <COND (<NOT <==? .MODE ,M-BEG>> </ 1 0>)> <MARK 2>>
<ROUTINE PRE-LOOK () <MARK 3>>
<ROUTINE INDIRECT-HANDLER ()
  <COND (,NEST
    <SETG NEST 0> <MARK 4> <PRINTI "[">
    <PERFORM ,V?WALK DIRECT INDIRECT> <PRINTI "]">
    <COND (<NOT <AND <==? ,PRSA ,V?LOOK> <==? ,PRSO DIRECT> <==? ,PRSI INDIRECT>>> </ 1 0>)>
    <RFALSE>)
    (T <MARK 4>)>>
<ROUTINE CONTAINER-HANDLER () <MARK 5>>
<ROUTINE DIRECT-HANDLER () <MARK 6>>
<ROUTINE V-LOOK () <MARK 7>>
<ROUTINE V-WALK () <PRINTI "w"> <RTRUE>>
<SYNTAX LOOK = V-LOOK PRE-LOOK>
<SYNTAX WALK = V-WALK PRE-LOOK>
`+print(perform);
const files=new Map([['dispatch.zil',fixture]]),program=loadProgram(files,{entry:'dispatch.zil'}),forms=expandMacros(program.forms,program.definitions,program.globals).forms;
const names=(kind:string)=>forms.filter(n=>head(n)===kind).map(n=>atomName((n as Sequence).items[1])!);
const analysis=analyzeSymbols(program,forms,{objects:[...names('ROOM'),...names('OBJECT')],globals:[...names('GLOBAL'),'ACTIONS','PREACTIONS'],routines:names('ROUTINE'),words:[{name:'LOOK'},{name:'WALK'}],constants:{'P?ACTION':31,'P?CONTFCN':30,'ACT?LOOK':255,'ACT?WALK':254,'V?LOOK':0,'V?WALK':1}});
const world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis),operations=translateLogic(forms,analysis),memory=compileMemory(forms,analysis,world,vocabulary,operations.strings),logic=linkMemoryLogic(operations,memory),mapped=mapLogicSources(logic,files,{forms});
const game=loadGame(packBundle(createBundle({game:{id:'dispatch-test',title:'Dispatch fixture'},versions:BUNDLE_VERSIONS,initialization:{kind:'call-entry',routine:{name:'GO',id:1},checkpoint:'pre-GO',rng:{algorithm:'xorshift32-v1',seed:2}},gateRules:[],world,vocabulary,memory,strings:operations.strings,symbols:runtimeSymbols(analysis,memory),logic:runtimeLogic(mapped)},{sources:mapped.sources,report:mapped.report,parser:null},[{spdx:'MIT',text:'Original PERFORM: reference/zork2/LICENSE; synthetic fixture for tests.'}])));

function run(stop=-1,nest=false){
  const state=new Interpreter(game).world();state.setGlobal('STOP',stop);state.setGlobal('NEST',Number(nest));
  const vm=new Interpreter(game,{world:state}),result=vm.run();
  expect([vm.world().global('PRSA'),vm.world().global('PRSO'),vm.world().global('PRSI')]).toEqual([37,1,3]);
  return result;
}
it('runs every PERFORM dispatch layer in source order when all handlers decline',()=>{
  expect(run()).toMatchObject({status:'returned',value:0,text:['0','1','2','3','4','5','6','7']});
});
it.each([0,1,2,3,4,5,6,7])('stops PERFORM at the first non-false handler: layer %i',stop=>{
  expect(run(stop)).toMatchObject({status:'returned',value:10+stop,text:Array.from({length:stop+1},(_,i)=>String(i))});
});
it('restores the outer action after nested PERFORM and skips object handlers for WALK',()=>{
  const result=run(-1,true);expect(result.status).toBe('returned');
  expect(result.text.join('')).toBe('01234[01234w]567');
});
