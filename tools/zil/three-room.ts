import { readFileSync } from 'node:fs';
import { analyzeSymbols, compileMemory, compileVocabulary, compileWorldMetadata, createBundle, expandMacros, linkMemoryLogic, loadProgram, mapLogicSources, runtimeLogic, translateLogic, BUNDLE_VERSIONS } from '../../src/zil/index.ts';
import type { OperationsLogic } from '../../src/zil/index.ts';
import { runtimeSymbols } from './compile.ts';
export function buildThreeRoom(){
  const files=new Map([['game.zil',readFileSync('tests/fixtures/three-room/game.zil','utf8')]]),program=loadProgram(files,{entry:'game.zil'}),forms=expandMacros(program.forms,program.definitions,program.globals).forms;
  const analysis=analyzeSymbols(program,forms,{objects:['FIRST','SECOND','THIRD'],globals:['HERE'],routines:['GO','V-LOOK'],words:[{name:'LOOK'}],constants:{'ACT?LOOK':255,'V?LOOK':0,'P?NORTH':31,'P?SOUTH':30,'LOW-DIRECTION':18}}),world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis);
  // This deliberately uses checked-in, hand-written logic instead of the routine translator.
  const operations=JSON.parse(readFileSync('tests/fixtures/three-room/logic.json','utf8')) as OperationsLogic;
  const generated=translateLogic(forms,analysis);if(JSON.stringify(operations)!==JSON.stringify(generated))throw new Error('Hand-written three-room logic no longer agrees with its documented source spans/text');
  const memory=compileMemory(forms,analysis,world,vocabulary,operations.strings),logic=linkMemoryLogic(operations,memory),mapped=mapLogicSources(logic,files,{forms});
  return createBundle({game:{id:'three-room',title:'Three-room fixture'},versions:BUNDLE_VERSIONS,initialization:{kind:'call-entry',routine:{name:'GO',id:1},checkpoint:'pre-GO',rng:{algorithm:'xorshift32-v1',seed:2}},gateRules:[],world,vocabulary,memory,strings:operations.strings,symbols:runtimeSymbols(analysis,memory),logic:runtimeLogic(mapped)},{sources:mapped.sources,report:mapped.report,parser:null},[{spdx:'Apache-2.0',text:readFileSync('LICENSE','utf8')}]);
}
