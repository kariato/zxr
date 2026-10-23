import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { definitions, jsonSchema, schemaRoots } from '../../src/zil/index.ts';
import { replayBundleSchema } from '../../src/engine/replay.ts';
import { zxrSaveSchema } from '../../src/engine/session.ts';
try {
  const mode=process.argv[2];if(!['record','check'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/schema-cli.ts record|check');
  mkdirSync('schema',{recursive:true});const ajv=new Ajv2020({strict:true,validateFormats:false});
  for(const root of Object.keys(schemaRoots) as (keyof typeof schemaRoots)[]){const data=jsonSchema(root);ajv.compile(data);const file='schema/'+root+'.schema.json',text=JSON.stringify(data,null,2)+'\n';if(mode==='record')writeFileSync(file,text);else if(readFileSync(file,'utf8')!==text)throw new Error(file+' differs; review before running schemas:record');}
  for(const [name,title,schema] of [['save','ZXR save v2',zxrSaveSchema],['replay','ZXR replay v1',replayBundleSchema]] as const){
    const data={$schema:'https://json-schema.org/draft/2020-12/schema',title,...schema};
    ajv.compile(data);const file='schema/'+name+'.schema.json',text=JSON.stringify(data,null,2)+'\n';
    if(mode==='record')writeFileSync(file,text);else if(readFileSync(file,'utf8')!==text)throw new Error(file+' differs; review before running schemas:record');
  }
  console.log(`Schemas: ${Object.keys(schemaRoots).length+2} roots, ${Object.keys(definitions).length} bundle definitions, save continuation and replay envelope verified independently by AJV 2020.`);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
