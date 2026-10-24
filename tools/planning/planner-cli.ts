import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generatePlan,makeAssistantDraft,requestBody } from './client.ts';
import { loadPlannerSources,preparePlan,validateTask } from './inputs.ts';
import type { PlanTask } from './inputs.ts';
import { FilePlannerCache,approvePlan,planStatus,readApprovedPlans,readDraftPlans,writeJson } from './store.ts';
import { applyFieldLocks } from './review.ts';
import { planningHash } from './identity.ts';
import { validatePlanRecord } from './client.ts';

export async function plannerMain(args:string[],root=process.cwd()){
  const mode=args[0];if(!['check','status','prepare','import','generate','approve'].includes(mode??''))throw new Error('Usage: planner check|status|prepare|import|generate|approve (see docs/phase-6.md)');
  if(['check','status'].includes(mode!)&&args.length!==1)throw new Error('Unexpected planner arguments');
  const sources=loadPlannerSources(root);
  if(mode==='check'){const output=readApprovedPlans(root,sources),drafts=readDraftPlans(root,sources);console.log(`Planning assets: ${output.records.length} approved, ${drafts.length} valid review drafts; ${86-output.records.filter(r=>r.task.kind==='scene-plan').length} rooms still need approved plans. No API/cache used.`);return;}
  if(mode==='status'){console.log(JSON.stringify({selected:planStatus(root,sources),totalRooms:86},null,2));return;}
  if(mode==='approve'){
    if(args.length<4||args[2]!=='--reviewer'||args.length>5||(args[4]!==undefined&&args[4]!=='--replace'))throw new Error('Usage: planner approve DRAFT --reviewer NAME [--replace]');
    const draft=JSON.parse(readFileSync(resolve(root,args[1]!),'utf8'));
    const file=approvePlan(root,sources,draft,args[3]!,new Date().toISOString().slice(0,10),args[4]==='--replace');console.log('Approved record selected: '+file);return;
  }
  if(mode==='import'){
    if(args.length!==4)throw new Error('Usage: planner import KIND SUBJECT JSON');
    const task={kind:args[1],subject:args[2]} as PlanTask;validateTask(task);
    const record=makeAssistantDraft(preparePlan(task,sources),applyFieldLocks(root,task,JSON.parse(readFileSync(resolve(root,args[3]!),'utf8'))));
    const path=resolve(root,'out/planner/drafts',task.kind+'_'+encodeURIComponent(task.subject)+'.json');writeJson(path,record);
    console.log('Validated assistant-authored draft (no API call): '+path);return;
  }
  if(args.length!==3)throw new Error('Usage: planner prepare|generate KIND SUBJECT');
  const task={kind:args[1],subject:args[2]} as PlanTask;validateTask(task);const prepared=preparePlan(task,sources);
  if(mode==='prepare'){
    const path=resolve(root,'out/planner/requests',prepared.inputHash+'.json');
    writeJson(path,sources.config.provider==='assistant'?{format:'zxr-assistant-task-v1',inputHash:prepared.inputHash,task,system:prepared.system,prompt:prepared.prompt,imageHash:sources.imageHash,visualGuideFile:sources.config.visualGuideFile}:{inputHash:prepared.inputHash,task,apiVersion:'2026-10-21',body:requestBody(prepared,sources.image)});
    console.log('Prepared request (no API call): '+path);return;
  }
  const result=await generatePlan(task,sources,{apiKey:process.env.ANTHROPIC_API_KEY,cache:new FilePlannerCache(resolve(root,'out/planner/cache'))});
  result.record.document=applyFieldLocks(root,task,result.record.document);result.record.outputHash=planningHash(result.record.document);validatePlanRecord(result.record,prepared);
  const path=resolve(root,'out/planner/drafts',task.kind+'_'+encodeURIComponent(task.subject)+'.json');writeJson(path,result.record);
  console.log((result.cached?'Cached':'Generated')+' draft; human approval required: '+path);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  plannerMain(process.argv.slice(2)).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
