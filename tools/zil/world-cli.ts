import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildWorldMetadata, auditWorldMetadata } from './world.ts';
try {
  const mode=process.argv[2];if(!['check','record'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/world-cli.ts record|check');
  const world=buildWorldMetadata(),audit=auditWorldMetadata(world);
  const artifacts=[['games/zork2/world.zxr.json',world],['reference/world-audit.json',audit]] as const;
  if(mode==='record')mkdirSync('games/zork2',{recursive:true});
  for(const [path,data] of artifacts){const text=JSON.stringify(data,null,2)+'\n';if(mode==='record')writeFileSync(path,text);else if(readFileSync(path,'utf8')!==text)throw new Error(`${path} differs; review the source and world audit before running world:record.`);}
  console.log(`World metadata: ${world.counts.rooms} rooms, ${world.counts.objects} objects; ${audit.checked.metadataProperties} properties and ${audit.checked.shortNames} short names match assembly and binary. ${world.counts.pendingExits} exits await encoding.`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
