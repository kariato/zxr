import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capabilityManifest } from '../src/engine/capabilities.ts';

export function capabilitiesMarkdown():string {
  const manifest=capabilityManifest();
  return ['<!-- capabilities:start -->',`Implementation inventory for **${manifest.target}**. Also available in the player under **Debug: capabilities**. Status describes implementation scope, not a guarantee of every possible playthrough. No gameplay operation is silently stubbed: unsupported stream operations fail explicitly.`,
    '', '| Capability | Status | Scope and limits |','|---|---|---|',
    ...manifest.entries.map(e=>`| ${e.name} | ${e.status} | ${e.detail} [Evidence](${e.evidence}). |`),
    '<!-- capabilities:end -->'].join('\n');
}
export function updateCapabilitiesReadme(text:string):string {
  const start='<!-- capabilities:start -->',end='<!-- capabilities:end -->';
  if(text.split(start).length!==2||text.split(end).length!==2||text.indexOf(end)<text.indexOf(start))throw new Error('README must contain exactly one capability inventory block');
  return text.slice(0,text.indexOf(start))+capabilitiesMarkdown()+text.slice(text.indexOf(end)+end.length);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const mode=process.argv[2];if(mode!=='check'&&mode!=='record')throw new Error('Usage: node tools/capabilities.ts check|record');
  const path=new URL('../README.md',import.meta.url),before=readFileSync(path,'utf8'),after=updateCapabilitiesReadme(before);
  if(mode==='record')writeFileSync(path,after);
  else if(before!==after)throw new Error('README capability inventory differs; review src/engine/capabilities.ts and run npm run capabilities:record');
  console.log('Capability inventory: '+mode+' passed');
}
