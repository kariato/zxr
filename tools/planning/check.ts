import { readdirSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePlanning } from './validate.ts';
import type { planningSchemas } from './schemas.ts';

export function checkPlanningExamples(){
  const directory=new URL('../../games/zork2/planning/examples/',import.meta.url);
  const examples=readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>{
    const kind=name.split('.').at(-2) as keyof typeof planningSchemas;
    if(!['scene-plan','asset-brief','label-set'].includes(kind))throw new Error('Unknown example '+name);
    const data=JSON.parse(readFileSync(new URL(name,directory),'utf8'));validatePlanning(kind,data);return {kind,data};
  });
  const scenes=examples.filter(e=>e.kind==='scene-plan'),briefs=examples.filter(e=>e.kind==='asset-brief'),labels=examples.filter(e=>e.kind==='label-set');
  if(scenes.length!==3||new Set(scenes.map(e=>e.data.room)).size!==3||!briefs.length||!labels.length)throw new Error('Expected three distinct pilot rooms, asset briefs and labels');
  const world=JSON.parse(readFileSync(new URL('../../games/zork2/world.zxr.json',import.meta.url),'utf8'));
  const entities=new Map<string,any>(world.entities.map((e:any)=>[e.name,e]));
  const flags=new Set(world.entities.flatMap((e:any)=>e.flags.map((f:any)=>f.name)));
  const families=new Set(JSON.parse(readFileSync(new URL('../../reference/candidate-audit.json',import.meta.url),'utf8')).families.map((f:any)=>f.id));
  const assets=new Map(briefs.map(e=>[e.data.id,e.data]));
  if(assets.size!==briefs.length)throw new Error('Duplicate example asset');
  for(const {data} of briefs)for(const name of data.objects)if(entities.get(name)?.kind!=='object')throw new Error('Unknown source object '+name);
  for(const {data} of scenes){
    const room=entities.get(data.room);if(room?.kind!=='room')throw new Error('Unknown source room '+data.room);
    for(const exit of data.exits){
      const source=room.exits.find((e:any)=>e.property.name===exit.direction);
      if(!source||exit.to!==(source.view.to??null))throw new Error('Example exit differs from source: '+data.room+'/'+exit.direction);
    }
    for(const item of [...data.objects,...data.features])if(!assets.has(item.asset))throw new Error('Missing example asset '+item.asset);
    for(const item of data.objects)if(!assets.get(item.asset).objects.includes(item.object))throw new Error('Example asset does not represent '+item.object);
    for(const feature of data.features)if(feature.visibleWhen.kind==='flag'&&(!entities.get(feature.visibleWhen.object)||!flags.has(feature.visibleWhen.flag)))throw new Error('Unknown example flag object or flag');
  }
  for(const {data} of labels)for(const entry of data.entries)if(entry.kind==='action'&&!families.has(entry.family))throw new Error('Unknown example action family '+entry.family);
  return {rooms:scenes.length,briefs:briefs.length,labelSets:labels.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const result=checkPlanningExamples();console.log(`Planning examples: ${result.rooms} rooms, ${result.briefs} briefs, ${result.labelSets} label set; schemas, local references and pilot source identities passed. No approval or rendering is implied.`);}
  catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
