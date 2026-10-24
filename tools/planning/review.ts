import { existsSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeAssistantDraft } from './client.ts';
import type { PlanRecord } from './client.ts';
import { preparePlan,validateTask,exactKeys,inside } from './inputs.ts';
import type { PlanTask,PlannerSources } from './inputs.ts';
import { planningCopy,planningHash } from './identity.ts';
import { readDraftPlans,readApprovedPlans,writeJson } from './store.ts';
import { scenePlanHash,checkSceneConsistency } from './consistency.ts';

interface Lock {path:string;value:unknown}
interface LockEntry {task:PlanTask;fields:Lock[]}
interface Locks {format:'zxr-field-locks-v1';entries:LockEntry[]}
const key=(t:PlanTask)=>t.kind+':'+t.subject;
const lockFile=(root:string)=>resolve(root,'games/zork2/planning/review/locks.json');
const baselineFile=(root:string)=>resolve(root,'games/zork2/planning/review/baselines.json');
function baselines(root:string):Record<string,string>{if(!existsSync(baselineFile(root)))return {};const data=JSON.parse(readFileSync(baselineFile(root),'utf8'));if(!data||typeof data!=='object'||Array.isArray(data)||Object.values(data).some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v)))throw new Error('Invalid review baselines');return data;}
function parts(path:string){
  if(typeof path!=='string'||!path.startsWith('/')||path.length>500||/~(?![01])/u.test(path))throw new Error('Invalid field pointer');
  const result=path.slice(1).split('/').map(p=>p.replaceAll('~1','/').replaceAll('~0','~'));
  if(result.some(p=>!p||['__proto__','prototype','constructor'].includes(p))||['provenance','review','format','room','id'].includes(result[0]!))throw new Error('Identity/review fields cannot be locked or edited through a lock');
  return result;
}
function readAt(doc:Record<string,any>,path:string):unknown {let value:any=doc;for(const p of parts(path)){if(!value||typeof value!=='object'||!Object.hasOwn(value,p))throw new Error('Missing lock field '+path);value=value[p];}return planningCopy(value);}
function putAt(doc:Record<string,any>,path:string,value:unknown){const p=parts(path);let parent:any=doc;for(const name of p.slice(0,-1)){if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,name))throw new Error('Re-plan removed locked field '+path);parent=parent[name];}if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,p.at(-1)!))throw new Error('Re-plan removed locked field '+path);parent[p.at(-1)!]=planningCopy(value);}
function locks(root:string):Locks {
  if(!existsSync(lockFile(root)))return {format:'zxr-field-locks-v1',entries:[]};
  const data=JSON.parse(readFileSync(lockFile(root),'utf8')) as Locks;exactKeys(data,['format','entries'],'field locks');
  if(data.format!=='zxr-field-locks-v1'||!Array.isArray(data.entries))throw new Error('Invalid field locks');
  const seen=new Set<string>();for(const e of data.entries){exactKeys(e,['task','fields'],'lock entry');validateTask(e.task);if(seen.has(key(e.task))||!Array.isArray(e.fields))throw new Error('Duplicate/invalid lock entry');seen.add(key(e.task));
    const paths:string[]=[];for(const f of e.fields){exactKeys(f,['path','value'],'lock field');parts(f.path);planningHash(f.value);if(paths.some(p=>p===f.path||p.startsWith(f.path+'/')||f.path.startsWith(p+'/')))throw new Error('Overlapping field locks');paths.push(f.path);}}
  return data;
}
export function applyFieldLocks(root:string,task:PlanTask,document:Record<string,any>){const result=planningCopy(document);for(const f of locks(root).entries.find(e=>key(e.task)===key(task))?.fields??[])putAt(result,f.path,f.value);return result;}
export function reviewRecords(root:string,sources:PlannerSources){
  const approved=readApprovedPlans(root,sources).records,drafts=readDraftPlans(root,sources),selected=new Map(approved.map(r=>[key(r.task),r]));for(const d of drafts)selected.set(key(d.task),d);
  const fieldLocks=locks(root);
  const previous=baselines(root);
  return [...selected.values()].sort((a,b)=>key(a.task).localeCompare(key(b.task),'en')).map(record=>{
    const approval=approved.find(a=>key(a.task)===key(record.task));let baseline=approval?.document;
    const prior=previous[key(record.task)];if(prior){const saved=JSON.parse(readFileSync(inside(resolve(root,'games/zork2/planning/review/history'),prior+'.json'),'utf8')) as PlanRecord;if(saved.outputHash!==prior||planningHash(saved.document)!==prior||key(saved.task)!==key(record.task))throw new Error('Invalid review history identity');baseline=saved.document;}
    const clean=(d:Record<string,any>)=>{const {review,provenance,...content}=d;return content;};
    const changedFields=baseline?Object.keys(clean(record.document)).filter(p=>planningHash(record.document[p])!==planningHash(baseline[p])):Object.keys(clean(record.document));
    return {record,approvedHash:approval?.outputHash??null,approvedCurrent:!!approval&&planningHash(clean(approval.document))===planningHash(clean(record.document)),changedFields,lockedFields:fieldLocks.entries.find(e=>key(e.task)===key(record.task))?.fields.map(f=>f.path)??[]};
  });
}
/** Optimistic identity prevents overwriting another editor's work. Replanning
 * uses the same lock merge as import; validation happens before any write. */
export function saveReview(root:string,sources:PlannerSources,task:PlanTask,expectedHash:string,document:Record<string,any>,lockedFields:string[],replan=false):PlanRecord {
  validateTask(task);const current=reviewRecords(root,sources).find(e=>key(e.record.task)===key(task))?.record;
  if(!current||current.outputHash!==expectedHash)throw new Error('Review conflict: reload the current record');
  if(!Array.isArray(lockedFields)||lockedFields.some(p=>typeof p!=='string'))throw new Error('Invalid locked fields');
  const proposed=replan?applyFieldLocks(root,task,document):planningCopy(document);
  const next=makeAssistantDraft(preparePlan(task,sources),proposed),state=locks(root),fields=lockedFields.map(path=>({path,value:readAt(next.document,path)}));
  const bindingFile=resolve(root,'games/zork2/planning/scene-bindings.json');let bindings:any;
  if(task.kind==='scene-plan'&&existsSync(bindingFile)){
    bindings=JSON.parse(readFileSync(bindingFile,'utf8'));const b=bindings.scenes.find((b:any)=>b.room===task.subject);if(!b)throw new Error('Missing scene assembly binding');b.planHash=scenePlanHash(next.document);
    checkSceneConsistency(reviewRecords(root,sources).map(e=>key(e.record.task)===key(task)?next.document:e.record.document),bindings,sources);
  }
  const paths=fields.map(f=>f.path);for(let i=0;i<paths.length;i++)if(paths.some((p,j)=>i!==j&&(p===paths[i]||p.startsWith(paths[i]!+'/'))))throw new Error('Overlapping field locks');
  // Manual edits may deliberately unlock a field, but a re-plan cannot remove locks.
  const prior=state.entries.find(e=>key(e.task)===key(task));if(replan&&prior?.fields.some(f=>!paths.includes(f.path)))throw new Error('Re-plan cannot remove field locks');
  const index=state.entries.findIndex(e=>key(e.task)===key(task)),entry={task:planningCopy(task),fields};if(index<0)state.entries.push(entry);else state.entries[index]=entry;
  const history=inside(resolve(root,'games/zork2/planning/review/history'),current.outputHash+'.json');if(!existsSync(history))writeJson(history,current);
  const previous=baselines(root);previous[key(task)]=current.outputHash;writeJson(baselineFile(root),previous);
  writeJson(lockFile(root),state);
  const directory=resolve(root,'games/zork2/planning/drafts'),rawPath=inside(directory,task.kind+'_'+task.subject+'.json'),encodedPath=inside(directory,task.kind+'_'+encodeURIComponent(task.subject)+'.json');
  writeJson(existsSync(rawPath)?rawPath:encodedPath,next);if(bindings)writeJson(bindingFile,bindings);return next;
}
