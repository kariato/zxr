import { readFileSync, writeFileSync } from 'node:fs';
import { buildMemory, auditMemory } from './memory.ts';
try {
  const mode=process.argv[2];
  if(!['check','record'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/memory-cli.ts record|check');
  const {memory,logic}=buildMemory(),audit=auditMemory(memory,logic);
  for(const [file,data] of [['games/zork2/memory.zxr.json',memory],['reference/memory-audit.json',audit]] as const){
    const text=JSON.stringify(data,null,2)+'\n';
    if(mode==='record')writeFileSync(file,text);
    else if(readFileSync(file,'utf8')!==text)throw new Error(`${file} differs; review before intentionally running memory:record.`);
  }
  console.log(`Memory: ${memory.bytes.length} bytes, ${memory.tables.length} source tables, ${memory.relocations.length} relocations; ${logic.routines.length} fully linked routines, ${logic.untranslated.length} deferred sites. Runtime execution remains phase 3.`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
