import { mkdirSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileSourcePath } from '../zil/compile.ts';
import { buildRoomContexts } from './context.ts';

export function contextArtifacts(result:ReturnType<typeof buildRoomContexts>,license:string):Map<string,string>{
  const artifacts=new Map<string,string>();
  const json=(file:string,data:unknown)=>artifacts.set(file,JSON.stringify(data,null,2)+'\n');
  json('index.json',result.index);json('objects.json',result.objects);json('routines.json',result.routines);
  for(const room of result.rooms)json(room.room.name.toLowerCase()+'.json',room);
  artifacts.set('LICENSE-MIT.txt',license);
  artifacts.set('README.md',[
    '# Generated Zork II planning context','',
    'Offline authoring data derived from the pinned source. This contains spoilers; do not load it into player observations or the runtime UI.',
    '', '`npm run contexts:check` verifies these files against a fresh compile. `npm run contexts:record` deliberately regenerates them. Neither command calls an LLM or runs gameplay routines.',
    '', 'Room files link to `objects.json` and `routines.json` by stable source names. Text fragments and effects are possible branches, not a reconstructed description. Routine source retains the guards. Dynamic calls and targets remain explicit. Portable/actor/script-moved objects are conservative potential arrivals, not proven reachability or initial scenery.',
    '', 'Room light flags describe declarations before GO; RLANDBIT does not imply outdoors. Conditional/computed exits, concealed objects and mutable features require source review before geometry is approved. See [phase 6](../../../../docs/phase-6.md).',
    '', 'Generated source text retains the Zork II MIT licence in `LICENSE-MIT.txt`. No planner approval is recorded by generation.',
    '', '| Room | Initial nested objects | Source routines/helpers |','|---|---:|---:|',
    ...result.rooms.map(r=>`| [${r.room.desc.text.replaceAll('|','\\|').replaceAll('\n',' ')}](${r.room.name.toLowerCase()}.json) | ${r.initialObjects.length} | ${r.routines.reachableHelpers.length} |`),'',
  ].join('\n'));
  return artifacts;
}
export function writeOrCheckContexts(directory:string,artifacts:Map<string,string>,mode:'record'|'check'){
  if(mode==='record')mkdirSync(directory,{recursive:true});
  // Never silently leave obsolete rooms in a committed context set.
  const extra=readdirSync(directory).filter(file=>!artifacts.has(file));
  if(extra.length)throw new Error('Unexpected context artifacts; review/remove explicitly: '+extra.join(', '));
  for(const [file,text] of artifacts){const path=resolve(directory,file);if(mode==='record')writeFileSync(path,text);else if(readFileSync(path,'utf8')!==text)throw new Error('Planning context differs: '+file+'; review before contexts:record');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const mode=process.argv[2];if((mode!=='check'&&mode!=='record')||process.argv.length!==3)throw new Error('Usage: node tools/planning/context-cli.ts check|record');
    const bundle=compileSourcePath('reference/zork2'),result=buildRoomContexts(bundle);
    if(result.rooms.length!==86)throw new Error('Expected all 86 Zork II rooms');
    writeOrCheckContexts('games/zork2/planning/context',contextArtifacts(result,bundle.licenses.find(l=>l.spdx==='MIT')!.text),mode);
    console.log(`Planning context: ${mode} passed; ${result.index.counts.rooms} rooms, ${result.index.counts.objects} objects, ${result.index.counts.routines} routines; no game execution or model calls.`);
  }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
