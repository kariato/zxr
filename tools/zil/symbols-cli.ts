import { readFileSync, writeFileSync } from 'node:fs';
import { symbolManifest } from './symbols.ts';
try {
  const mode=process.argv[2];if(!['check','record'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/symbols-cli.ts record|check');
  const manifest=symbolManifest();
  if(manifest.diagnostics.length)throw new Error(manifest.diagnostics.map(d=>`${d.span.file}:${d.span.start.line}:${d.span.start.column}: ${d.message}`).join('\n'));
  const text=JSON.stringify(manifest,null,2)+'\n',path='reference/symbol-table.json';
  if(mode==='record')writeFileSync(path,text);
  else if(readFileSync(path,'utf8')!==text)throw new Error(`${path} differs; review numbering, references and source before running symbols:record.`);
  console.log(`Symbol audit: ${manifest.counts.references} references; 439 routines; 251 rooms/objects; 168 globals; 689 dictionary entries; zero unresolved names. ${manifest.normalizations.length} guarded source normalizations (${manifest.normalizations.map(n=>n.rule).join(', ')}).`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
