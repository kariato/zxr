import { expect, it } from 'vitest';
import { Interpreter, loadGame } from '../src/engine/index.ts';
import { analyzeSymbols, atomName, BUNDLE_VERSIONS, compileMemory, compileVocabulary, compileWorldMetadata, createBundle, expandMacros, head, linkMemoryLogic, loadProgram, mapLogicSources, packBundle, print, runtimeLogic, translateLogic } from '../src/zil/index.ts';
import type { Sequence } from '../src/zil/index.ts';
import { runtimeSymbols } from '../tools/zil/compile.ts';
import { sourceFiles } from '../tools/zil/program.ts';

// Execute the actual active V-WALK source with synthetic exits. GOTO and peripheral
// handlers record calls; full-turn oracle tests separately cover real movement.
const original=loadProgram(sourceFiles('reference/zork2'),{entry:'zork2.zil'});
const walk=expandMacros(original.forms,original.definitions,original.globals).forms.find(n=>head(n)==='ROUTINE'&&atomName((n as Sequence).items[1])==='V-WALK')!;
const fixture=`
<GLOBAL HERE FIRST>
<GLOBAL WINNER HERO>
<GLOBAL ADVENTURER HERO>
<GLOBAL PLAYER HERO>
<GLOBAL PRSO 31>
<GLOBAL P-WALK-DIR 31>
<GLOBAL LIT 1>
<GLOBAL SPRAYED? 0>
<GLOBAL GATE 0>
<GLOBAL EXIT-RESULT SECOND>
<GLOBAL VISITS 0>
<GLOBAL LAST-OBJECT 0>
<GLOBAL DELEGATED 0>
<CONSTANT UEXIT 1> <CONSTANT NEXIT 2> <CONSTANT FEXIT 3>
<CONSTANT CEXIT 4> <CONSTANT DEXIT 5> <CONSTANT REXIT 0>
<CONSTANT NEXITSTR 0> <CONSTANT FEXITFCN 0>
<CONSTANT CEXITFLAG 1> <CONSTANT CEXITSTR 1>
<CONSTANT DEXITOBJ 1> <CONSTANT DEXITSTR 1>
<ROOM FIRST (DESC "First")
  (NORTH TO SECOND)
  (EAST "A solid wall.")
  (WEST PER ROUTED-EXIT)
  (SOUTH TO SECOND IF GATE ELSE "The gate blocks your way.")
  (NE TO SECOND IF GATE)
  (NW TO SECOND IF DOOR IS OPEN ELSE "The shutter blocks your way.")
  (SE TO SECOND IF DOOR IS OPEN)>
<ROOM SECOND (DESC "Second")>
<OBJECT HERO (IN FIRST) (DESC "Hero")>
<OBJECT DOOR (IN FIRST) (DESC "wooden door")>
<ROUTINE GO () <V-WALK>>
<ROUTINE ROUTED-EXIT () <SETG VISITS <+ ,VISITS 1>> ,EXIT-RESULT>
<ROUTINE GOTO (ROOM) <SETG VISITS <+ ,VISITS 10>> <SETG HERE .ROOM> <MOVE HERO .ROOM> <RTRUE>>
<ROUTINE THIS-IS-IT (OBJ) <SETG LAST-OBJECT .OBJ>>
<ROUTINE PERFORM (VERB OBJ) <COND (<NOT <==? .VERB ,V?WALK-TO>> </ 1 0>)> <SETG DELEGATED .OBJ>>
<ROUTINE NULL-F () <RFALSE>>
<ROUTINE JIGS-UP (MESSAGE) <PRINT .MESSAGE> 2>
<SYNTAX WALK = V-WALK>
`+print(walk);
const files=new Map([['exits.zil',fixture]]),program=loadProgram(files,{entry:'exits.zil'}),forms=expandMacros(program.forms,program.definitions,program.globals).forms;
const names=(kind:string)=>forms.filter(n=>head(n)===kind).map(n=>atomName((n as Sequence).items[1])!);
const directions={NORTH:31,EAST:30,WEST:29,SOUTH:28,NE:27,NW:26,SE:25,UP:24};
const analysis=analyzeSymbols(program,forms,{objects:[...names('ROOM'),...names('OBJECT')],globals:names('GLOBAL'),routines:names('ROUTINE'),words:[{name:'WALK'}],constants:{'ACT?WALK':255,'V?WALK':0,'V?WALK-TO':1,'OPENBIT':0,'FX?OPENBIT':0,'NONLANDBIT':1,'FX?NONLANDBIT':1,'LOW-DIRECTION':24,...Object.fromEntries(Object.entries(directions).map(([name,value])=>['P?'+name,value]))}});
const world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis),operations=translateLogic(forms,analysis),memory=compileMemory(forms,analysis,world,vocabulary,operations.strings),logic=linkMemoryLogic(operations,memory),mapped=mapLogicSources(logic,files,{forms});
const game=loadGame(packBundle(createBundle({game:{id:'exit-test',title:'Exit fixture'},versions:BUNDLE_VERSIONS,initialization:{kind:'call-entry',routine:{name:'GO',id:1},checkpoint:'pre-GO',rng:{algorithm:'xorshift32-v1',seed:2}},gateRules:[],world,vocabulary,memory,strings:operations.strings,symbols:runtimeSymbols(analysis,memory),logic:runtimeLogic(mapped)},{sources:mapped.sources,report:mapped.report,parser:null},[{spdx:'MIT',text:'Original V-WALK: reference/zork2/LICENSE; synthetic fixture for tests.'}])));

function run(direction:keyof typeof directions,options:{open?:boolean;gate?:number;exitResult?:number;noDirection?:boolean}={}){
  const state=new Interpreter(game).world();state.setGlobal('PRSO',directions[direction]);state.setGlobal('P-WALK-DIR',options.noDirection?0:directions[direction]);
  state.setGlobal('GATE',options.gate ?? 0);state.setGlobal('EXIT-RESULT',options.exitResult ?? 2);state.setFlag(4,0,options.open ?? false);
  const vm=new Interpreter(game,{world:state}),result=vm.run();return {vm,result};
}
it.each([
  {direction:'NORTH',options:{},value:1,room:2,visits:10,text:''},
  {direction:'EAST',options:{},value:2,room:1,visits:0,text:'A solid wall.\n'},
  {direction:'WEST',options:{},value:1,room:2,visits:11,text:''},
  {direction:'WEST',options:{exitResult:0},value:2,room:1,visits:1,text:''},
  {direction:'SOUTH',options:{},value:2,room:1,visits:0,text:'The gate blocks your way.\n'},
  {direction:'SOUTH',options:{gate:1},value:1,room:2,visits:10,text:''},
  {direction:'NE',options:{},value:2,room:1,visits:0,text:"You can't go that way.\n"},
  {direction:'NE',options:{gate:65535},value:1,room:2,visits:10,text:''},
  {direction:'NW',options:{},value:2,room:1,visits:0,text:'The shutter blocks your way.\n'},
  {direction:'NW',options:{open:true},value:1,room:2,visits:10,text:''},
  {direction:'SE',options:{},value:2,room:1,visits:0,text:'The wooden door is closed.\n'},
  {direction:'SE',options:{open:true},value:1,room:2,visits:10,text:''},
  {direction:'UP',options:{},value:2,room:1,visits:0,text:"You can't go that way.\n"},
] as const)('executes $direction exit with $options',({direction,options,value,room,visits,text})=>{
  const {vm,result}=run(direction,options);expect(result).toMatchObject({status:'returned',value});expect(result.text.join('')).toBe(text);
  expect(vm.world().global('HERE')).toBe(room);expect(vm.world().global('VISITS')).toBe(visits);
  expect(vm.world().global('LAST-OBJECT')).toBe(direction==='SE'&&!options.open?4:0);
});
it('delegates WALK without a direction to PERFORM(WALK-TO) before consulting exits',()=>{
  const {vm,result}=run('NORTH',{noDirection:true});expect(result).toMatchObject({status:'returned',value:1,text:[]});
  expect(vm.world().global('DELEGATED')).toBe(31);expect(vm.world().global('VISITS')).toBe(0);
});
