import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlannerSources } from './inputs.ts';
import { readApprovedPlans,readDraftPlans,writeJson } from './store.ts';
import { checkSceneConsistency } from './consistency.ts';

export function consistencyMain(args:string[],root=process.cwd()){
  if(args.length>1||args[0]!==undefined&&args[0]!=='--complete')throw new Error('Usage: npm run scenes:check -- [--complete]');
  const sources=loadPlannerSources(root),approved=readApprovedPlans(root,sources).records,drafts=readDraftPlans(root,sources);
  // Review candidates may replace an existing approval for the same task. This
  // never changes the manifest, production overlay or approval status.
  const selected=new Map(approved.map(r=>[r.task.kind+':'+r.task.subject,r]));
  for(const record of drafts)selected.set(record.task.kind+':'+record.task.subject,record);
  const records=[...selected.values()].sort((a,b)=>(a.task.kind+':'+a.task.subject).localeCompare(b.task.kind+':'+b.task.subject,'en'));
  const bindings=JSON.parse(readFileSync(resolve(root,'games/zork2/planning/scene-bindings.json'),'utf8'));
  const report=checkSceneConsistency(records.map(r=>r.document),bindings,sources,args[0]==='--complete');
  writeJson(resolve(root,'out/planner/consistency.json'),report);
  console.log(`Scene review: ${report.counts.rooms}/${report.counts.totalRooms} rooms, ${report.counts.briefs} shared briefs, ${report.counts.aliases} exit aliases, ${report.counts.attachments} attachments; ${report.missingRooms.length} rooms missing, ${report.pendingStateBindings.length} state bindings unresolved. No approval or production change.`);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{consistencyMain(process.argv.slice(2));}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
