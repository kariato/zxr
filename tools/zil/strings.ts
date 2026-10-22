import { readFileSync } from 'node:fs';
import { ASSEMBLY_FILES, sha256 } from '../reference/symbols.ts';
import { compileStringPool, runtimeStrings, validateStringPool } from '../../src/zil/index.ts';
import type { Node, StringPool } from '../../src/zil/index.ts';

/** Compare source-normalized runtime text to the supplied assembly's string constants/inline text. */
export function auditStringPool(pool:StringPool,forms:readonly Node[]) {
  validateStringPool(pool);
  if(JSON.stringify(pool)!==JSON.stringify(compileStringPool(forms)))throw new Error('String audit: pool differs from deterministic source traversal');
  const texts=new Set<string>();
  for(const name of [...ASSEMBLY_FILES,'zork2str']){
    const assembly=readFileSync('reference/zork2/'+name+'.zap','utf8');
    for(const m of assembly.matchAll(/(?:\.GSTR\s+[^,\n]+,|\b(?:PRINTI|PRINTR)\s+)"((?:[^"]|"")*)"/g))texts.add(m[1]!.replaceAll('""','"'));
  }
  const missing=pool.entries.filter(e=>e.text!==''&&!texts.has(e.text));
  if(missing.length)throw new Error('String audit: text absent from assembly '+JSON.stringify(missing));
  const uses=[...runtimeStrings(forms)],kinds=['routine','global','property','exit'] as const;
  return {format:'zxr-string-audit-v1',poolSha256:sha256(JSON.stringify(pool)),
    checked:{entries:pool.entries.length,literalSites:uses.length,assemblyMatched:pool.entries.length-pool.entries.filter(e=>e.text==='').length,byKind:Object.fromEntries(kinds.map(k=>[k,uses.filter(s=>s.kind===k).length]))},
    limits:['Text membership in assembly checks normalization; duplicate string identities and source order are ZXR choices, not original packed addresses.','Original binary metadata text is audited by world:check; execution/output and PRINTC/PRINTB/PRINTD behavior remain phase 3.']};
}
