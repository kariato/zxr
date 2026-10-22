import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalJson, jsonSchema, logicExpressions, packBundle, semanticBundleData } from '../../src/zil/index.ts';
import { loadGame } from '../../src/engine/index.ts';
import { compileSourcePath } from './compile.ts';
import { buildThreeRoom } from './three-room.ts';
try {
  const mode=process.argv[2];if(!['record','check'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/bundle-cli.ts record|check');
  const validator=new Ajv2020({strict:true,validateFormats:false}).compile(jsonSchema('bundle')),hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
  const games=[buildThreeRoom(),compileSourcePath('reference/zork2')].map(bundle=>{
    if(!validator(bundle))throw new Error(JSON.stringify(validator.errors));
    const bytes=packBundle(bundle),loaded=loadGame(bytes),{contentHash:ignored,...rest}=bundle;
    if(hash(canonicalJson(semanticBundleData(bundle.payload)))!==bundle.buildHash||hash(canonicalJson(rest))!==bundle.contentHash)throw new Error('Independent SHA-256 mismatch');
    return {game:bundle.payload.game.id,buildHash:bundle.buildHash,presentationHash:bundle.presentationHash,contentHash:bundle.contentHash,packedSha256:hash(bytes),bytes:bytes.length,routines:bundle.payload.logic.routines.length,rooms:bundle.payload.world.counts.rooms,objects:bundle.payload.world.counts.objects,memoryBytes:loaded.createInitialMemory().length,entry:bundle.payload.initialization.routine,adapter:bundle.payload.logic.adapter?{id:bundle.payload.logic.adapter.id,version:bundle.payload.versions.adapter,entryCommands:bundle.payload.logic.adapter.entry.body.length,checkCalls:[...logicExpressions(bundle.payload.logic.adapter.checks)].filter(e=>e.op==='call').map(e=>e.routine.name)}:null,rng:bundle.payload.initialization.rng};
  });
  const data={format:'zxr-bundle-audit-v1',games,limits:['Both bundles validate with independent AJV 2020 and load through the headless loader.','Initial memory is pre-GO. Interpreter execution and post-startup conformance remain phase 3.2.']},text=JSON.stringify(data,null,2)+'\n',file='reference/bundle-audit.json';
  if(mode==='record')writeFileSync(file,text);else if(readFileSync(file,'utf8')!==text)throw new Error(file+' differs; review before running bundle:record');
  console.log(`Bundles: ${games.length} schema/reference/hash-verified games packed and loaded (${games[1]!.bytes} bytes for Zork II). No interpreter execution is claimed.`);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
