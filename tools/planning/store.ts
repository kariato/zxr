import { existsSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync,rmSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PlanRecord,PlannerCache } from './client.ts';
import { validatePlanRecord } from './client.ts';
import { exactKeys,inside,preparePlan,validateTask } from './inputs.ts';
import type { PlanTask,PlannerSources } from './inputs.ts';
import { planningCopy,planningHash } from './identity.ts';

export function writeJson(path:string,value:unknown):void {
  mkdirSync(dirname(path),{recursive:true});const temporary=path+'.'+randomUUID()+'.tmp';
  try{writeFileSync(temporary,JSON.stringify(planningCopy(value),null,2)+'\n',{flag:'wx'});renameSync(temporary,path);}finally{rmSync(temporary,{force:true});}
}
export class FilePlannerCache implements PlannerCache {
  readonly directory:string;
  constructor(directory:string){this.directory=directory;}
  #path(key:string){if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid planner cache key');return inside(this.directory,key+'.json');}
  async read(key:string):Promise<PlanRecord|null>{const path=this.#path(key);return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;}
  async write(key:string,value:PlanRecord){if(value.inputHash!==key||value.document.review.status!=='draft')throw new Error('Cache only stores matching draft records');writeJson(this.#path(key),value);}
}
interface Manifest {format:'zxr-approved-plans-v1';entries:{file:string;task:PlanTask;inputHash:string;outputHash:string}[]}
const taskKey=(task:PlanTask)=>task.kind+':'+task.subject;
const approvedDirectory=(root:string)=>resolve(root,'games/zork2/planning/approved');
function manifest(root:string):Manifest {
  const data=JSON.parse(readFileSync(resolve(approvedDirectory(root),'manifest.json'),'utf8')) as Manifest;
  exactKeys(data,['format','entries'],'approved manifest');
  if(data.format!=='zxr-approved-plans-v1'||!Array.isArray(data.entries))throw new Error('Invalid approved-plan manifest');
  const keys=new Set<string>();
  for(const e of data.entries){
    exactKeys(e,['file','task','inputHash','outputHash'],'approved manifest entry');validateTask(e.task);
    if(typeof e.file!=='string'||! /^[a-z0-9%_-]+--[a-f0-9]{64}\.json$/.test(e.file)||!/^[a-f0-9]{64}$/.test(e.inputHash)||!/^[a-f0-9]{64}$/.test(e.outputHash))throw new Error('Invalid approved manifest identity');
    const key=taskKey(e.task);if(keys.has(key))throw new Error('Duplicate approved task '+key);keys.add(key);
  }return data;
}
/** Offline build input: only manifest-selected approved records, never cache or
 * drafts. Invalid/stale selected plans fail the build rather than disappearing. */
export function readApprovedPlans(root:string,sources:PlannerSources){
  const selected=manifest(root),records:PlanRecord[]=[];
  for(const entry of selected.entries){
    const record=JSON.parse(readFileSync(inside(approvedDirectory(root),entry.file),'utf8')) as PlanRecord;
    validatePlanRecord(record,preparePlan(entry.task,sources));
    if(record.document.review.status!=='approved'||record.inputHash!==entry.inputHash||record.outputHash!==entry.outputHash)throw new Error('Unapproved or mismatched manifest record '+entry.file);
    records.push(record);
  }
  return {format:'zxr-presentation-plans-v1',records:records.sort((a,b)=>taskKey(a.task).localeCompare(taskKey(b.task),'en'))};
}
export function readDraftPlans(root:string,sources:PlannerSources){
  const directory=resolve(root,'games/zork2/planning/drafts');if(!existsSync(directory))return [];
  const tasks=new Set<string>();
  return readdirSync(directory).filter(file=>file.endsWith('.json')).sort().map(file=>{
    const record=JSON.parse(readFileSync(inside(directory,file),'utf8')) as PlanRecord;
    validatePlanRecord(record,preparePlan(record.task,sources));
    if(record.document.review.status!=='draft')throw new Error('Draft directory cannot grant approval');
    const key=taskKey(record.task);if(tasks.has(key))throw new Error('Duplicate draft task '+key);tasks.add(key);return record;
  });
}
export function planStatus(root:string,sources:PlannerSources){
  const selected=manifest(root);
  return selected.entries.map(entry=>{
    try{const record=JSON.parse(readFileSync(inside(approvedDirectory(root),entry.file),'utf8')) as PlanRecord;validatePlanRecord(record,preparePlan(entry.task,sources));if(record.document.review.status!=='approved'||record.outputHash!==entry.outputHash||record.inputHash!==entry.inputHash)throw new Error('Approval/manifest differs');return {task:entry.task,status:'current' as const};}
    catch(error){return {task:entry.task,status:'stale-or-invalid' as const,reason:error instanceof Error?error.message:String(error)};}
  });
}
/** An explicit human review operation. Generation never calls this function. */
export function approvePlan(root:string,sources:PlannerSources,draft:PlanRecord,reviewer:string,reviewedOn:string,replace=false){
  if(!reviewer.trim()||reviewer.length>100||!/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn))throw new Error('Reviewer and review date are required');
  validatePlanRecord(draft,preparePlan(draft.task,sources));
  if(draft.document.review.status!=='draft')throw new Error('Approval expects a reviewed draft');
  const selected=manifest(root),index=selected.entries.findIndex(e=>taskKey(e.task)===taskKey(draft.task));
  if(index>=0&&!replace)throw new Error('Approved task already exists; replacement requires explicit --replace');
  const record=planningCopy(draft);record.document.review={status:'approved',reviewer:reviewer.trim(),reviewedOn};record.outputHash=planningHash(record.document);
  const file=(record.task.kind+'_'+encodeURIComponent(record.task.subject).toLowerCase())+'--'+record.outputHash+'.json';
  const path=inside(approvedDirectory(root),file);
  if(existsSync(path)){
    const existing=JSON.parse(readFileSync(path,'utf8')) as PlanRecord;validatePlanRecord(existing,preparePlan(draft.task,sources));
    if(existing.outputHash!==record.outputHash||existing.document.review.status!=='approved')throw new Error('Existing approval artifact differs');
  }else writeJson(path,record);
  const entry={file,task:record.task,inputHash:record.inputHash,outputHash:record.outputHash};
  if(index>=0)selected.entries[index]=entry;else selected.entries.push(entry);
  selected.entries.sort((a,b)=>taskKey(a.task).localeCompare(taskKey(b.task),'en'));
  writeJson(resolve(approvedDirectory(root),'manifest.json'),selected);return file;
}
