import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPlannerSources } from './inputs.ts';
import { readApprovedPlans,readDraftPlans } from './store.ts';
import { checkSceneConsistency } from './consistency.ts';
import { collectLabels } from './labels.ts';
import { planningHash } from './identity.ts';
export function checkPhase6(root=process.cwd(),complete=false){
  const sources=loadPlannerSources(root),approved=readApprovedPlans(root,sources).records,drafts=readDraftPlans(root,sources),records=new Map(approved.map(r=>[r.task.kind+':'+r.task.subject,r]));for(const r of drafts)records.set(r.task.kind+':'+r.task.subject,r);
  const current=[...records.values()],report=checkSceneConsistency(current.map(r=>r.document),JSON.parse(readFileSync(resolve(root,'games/zork2/planning/scene-bindings.json'),'utf8')),sources,true);
  const missingBriefs=sources.contexts.objects.objects.filter(o=>!current.some(r=>r.task.kind==='asset-brief'&&r.task.subject===o.name));if(missingBriefs.length)throw new Error('Missing source-identity briefs: '+missingBriefs.map(o=>o.name).join(', '));
  const labels=collectLabels(current,sources,true),content=(d:Record<string,any>)=>{const {review,...rest}=d;return planningHash(rest);};
  const unreviewed=current.filter(r=>!approved.some(a=>a.task.kind===r.task.kind&&a.task.subject===r.task.subject&&content(a.document)===content(r.document))).map(r=>r.task.kind+':'+r.task.subject);
  if(complete&&unreviewed.length)throw new Error('Phase 6 approval gate open: '+unreviewed.length+' current records need human review. See /authoring.html.');
  return {rooms:report.counts.rooms,briefs:report.counts.briefs,labelSets:current.filter(r=>r.task.kind==='label-set').length,actionLabels:Object.keys(labels.labels.actions).length,approved:approved.length,unreviewed:unreviewed.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{if(process.argv.slice(2).some(a=>a!=='--complete')||process.argv.length>3)throw new Error('Usage: phase6:check -- [--complete]');console.log(JSON.stringify(checkPhase6(process.cwd(),process.argv.includes('--complete')),null,2));}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}}
