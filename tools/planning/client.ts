import { planningCopy,planningHash } from './identity.ts';
import { API_VERSION,exactKeys,preparePlan } from './inputs.ts';
import type { PlanTask,PlannerSources,PreparedPlan } from './inputs.ts';
import { validatePlanning } from './validate.ts';

export interface PlanRecord {format:'zxr-plan-record-v1';task:PlanTask;provider:'anthropic'|'assistant';requestedModel:string|null;model:string|null;promptVersion:string;inputHash:string;requestHash:string|null;attempts:number;outputHash:string;document:Record<string,any>}
const bounded=new Set(['minimum','maximum','minLength','maxLength','pattern','minItems','maxItems','uniqueItems']);
/** Provider grammar subset. Full constraints are sent as prompt data and always
 * enforced locally; the model cannot supply approval/generation metadata. */
export function providerSchema(prepared:PreparedPlan):Record<string,any>{
  const schema=planningCopy(prepared.schema) as Record<string,any>;
  delete schema.properties.provenance;delete schema.properties.review;schema.required=schema.required.filter((k:string)=>!['provenance','review'].includes(k));
  delete schema.$defs.provenance;delete schema.$defs.review;
  const visit=(v:any):any=>{
    if(Array.isArray(v))return v.map(visit);if(!v||typeof v!=='object')return v;
    const dropped=Object.entries(v).filter(([key])=>bounded.has(key));
    const out=Object.fromEntries(Object.entries(v).filter(([key])=>!bounded.has(key)&&key!=='$schema'&&key!=='title').map(([key,value])=>[key,visit(value)]));
    if(dropped.length)out.description=[out.description,...dropped.map(([k,x])=>k+': '+JSON.stringify(x))].filter(Boolean).join('; ');
    return out;
  };
  return visit(schema);
}
export function requestBody(prepared:PreparedPlan,image:Uint8Array,attempt=1,feedback=''){
  if(prepared.config.provider!=='anthropic')throw new Error('Assistant-authored tasks do not make API requests');
  if(!Number.isInteger(attempt)||attempt<1||attempt>3)throw new Error('Invalid planner attempt');
  return {model:prepared.config.model,max_tokens:Math.min(prepared.config.maxTokens*2**(attempt-1),32768),system:prepared.system,
    messages:[{role:'user',content:[{type:'text',text:prepared.prompt+(feedback?'\n\nRepair the previous invalid draft. Local validation: '+feedback.slice(0,2000):'')},
      {type:'image',source:{type:'base64',media_type:'image/png',data:Buffer.from(image).toString('base64')}}]}],
    output_config:{format:{type:'json_schema',schema:providerSchema(prepared)}}};
}
export function validatePlanDocument(prepared:PreparedPlan,data:Record<string,any>):void {
  validatePlanning(prepared.task.kind,data);
  const context=prepared.context as Record<string,any>;
  if(prepared.task.kind==='scene-plan'){
    if(data.room!==prepared.task.subject)throw new Error('Draft names another room');
    const exits=context.room.exits as any[];
    if(data.exits.length!==exits.length||data.exits.some((e:any)=>!exits.some(s=>s.direction===e.direction&&e.to===(s.view.to??null))))throw new Error('Draft changes source exits');
    const known=new Set(context.objects.map((o:any)=>o.name));
    if(data.objects.some((o:any)=>!known.has(o.object)||o.asset!==context.assetIds[o.object]))throw new Error('Draft places an object without local source evidence or canonical asset ID');
    const globals=new Set(context.globals.map((g:any)=>g.name));
    for(const feature of data.features){const c=feature.visibleWhen;
      if(c.kind==='flag'&&(![prepared.task.subject,...known].includes(c.object)||!context.flags.includes(c.flag)))throw new Error('Unknown feature flag/object');
      if(c.kind==='global'&&!globals.has(c.name))throw new Error('Unknown feature global');
    }
  }else if(prepared.task.kind==='asset-brief'){
    if(data.id!==context.assignedAssetId||data.objects.length!==1||data.objects[0]!==prepared.task.subject||data.kind==='scenery')throw new Error('Draft changes source asset identity');
  }else {
    if(data.id!==context.assignedLabelId)throw new Error('Draft changes label-set identity');
    for(const entry of data.entries){if(entry.kind!=='action')continue;
      const family=context.families.find((f:any)=>f.id===entry.family);if(!family)throw new Error('Unknown label family');
      const needed=[...(family.slots.length>=1?['direct']:[]),...(family.slots.length>=2?['indirect']:[]),...(family.input==='say'?['words']:[])];
      if(needed.some(s=>!entry.slots.includes(s))||entry.slots.some((s:string)=>s!=='actor'&&!needed.includes(s)))throw new Error('Label slots disagree with source family');
    }
  }
}
export function makeDraft(prepared:PreparedPlan,raw:unknown,model:string,requestHash:string,attempts:number):PlanRecord {
  if(prepared.config.provider!=='anthropic')throw new Error('API drafts require the optional Anthropic provider');
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Planner output must be an object');
  const data=planningCopy(raw) as Record<string,any>;
  data.provenance={method:'model',model,promptVersion:prepared.config.promptVersion,inputHash:prepared.inputHash};data.review={status:'draft'};
  validatePlanDocument(prepared,data);
  return {format:'zxr-plan-record-v1',task:planningCopy(prepared.task),provider:'anthropic',requestedModel:prepared.config.model,model,promptVersion:prepared.config.promptVersion,
    inputHash:prepared.inputHash,requestHash,attempts,outputHash:planningHash(data),document:data};
}
/** The coding assistant authors the JSON in the current chat; importing it is
 * deterministic validation, not another model invocation or simulated API call. */
export function makeAssistantDraft(prepared:PreparedPlan,raw:unknown):PlanRecord {
  if(prepared.config.provider!=='assistant')throw new Error('Select assistant authoring before importing a chat-authored draft');
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Assistant draft must be an object');
  const document=planningCopy(raw) as Record<string,any>;
  document.provenance={method:'assistant',agent:'Codex',model:null,promptVersion:prepared.config.promptVersion,inputHash:prepared.inputHash};document.review={status:'draft'};
  validatePlanDocument(prepared,document);
  return {format:'zxr-plan-record-v1',task:planningCopy(prepared.task),provider:'assistant',requestedModel:null,model:null,promptVersion:prepared.config.promptVersion,inputHash:prepared.inputHash,requestHash:null,attempts:0,outputHash:planningHash(document),document};
}
export function validatePlanRecord(record:PlanRecord,prepared:PreparedPlan):void {
  exactKeys(record,['format','task','provider','requestedModel','model','promptVersion','inputHash','requestHash','attempts','outputHash','document'],'plan record');
  if(record.format!=='zxr-plan-record-v1'||record.provider!==prepared.config.provider||record.requestedModel!==prepared.config.model||record.promptVersion!==prepared.config.promptVersion||record.inputHash!==prepared.inputHash||planningHash(record.task)!==planningHash(prepared.task))throw new Error('Stale or mismatched planner inputs');
  const generationValid=record.provider==='assistant'?record.model===null&&record.requestHash===null&&record.attempts===0:typeof record.model==='string'&&!!record.model&&typeof record.requestHash==='string'&&/^[a-f0-9]{64}$/.test(record.requestHash)&&Number.isInteger(record.attempts)&&record.attempts>=1&&record.attempts<=3;
  if(!generationValid||record.outputHash!==planningHash(record.document))throw new Error('Invalid planner output identity');
  validatePlanDocument(prepared,record.document);
  const p=record.document.provenance;
  if(p.method!==(record.provider==='assistant'?'assistant':'model')||(record.provider==='assistant'&&p.agent!=='Codex')||p.model!==record.model||p.inputHash!==record.inputHash||p.promptVersion!==record.promptVersion)throw new Error('Planner provenance mismatch');
}
export interface PlannerCache {read(key:string):Promise<PlanRecord|null>;write(key:string,value:PlanRecord):Promise<void>}
async function responseText(response:Response){
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty planner response');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();throw new Error('Planner response exceeds 8 MiB');}chunks.push(value);}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
export async function generatePlan(task:PlanTask,sources:PlannerSources,options:{apiKey?:string;fetch?:typeof fetch;cache:PlannerCache;delay?:(ms:number)=>Promise<void>}){
  if(sources.config.provider==='assistant')throw new Error('Author the prepared task in this chat, then use planner import KIND SUBJECT JSON; no API key is needed');
  const prepared=preparePlan(task,sources),cached=await options.cache.read(prepared.inputHash);
  if(cached){validatePlanRecord(cached,prepared);if(cached.document.review.status!=='draft')throw new Error('Cache cannot supply approved plans');return {record:planningCopy(cached),cached:true};}
  if(!options.apiKey?.trim())throw new Error('ANTHROPIC_API_KEY is required only for live planner generation');
  const transport=options.fetch??fetch,delay=options.delay??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  let feedback='';
  for(let attempt=1;attempt<=3;attempt++){
    const body=requestBody(prepared,sources.image,attempt,feedback);let response:Response;
    try{response=await transport('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':API_VERSION,authorization:'Bearer '+options.apiKey},body:JSON.stringify(body),signal:AbortSignal.timeout(60000),redirect:'error'});}
    catch{if(attempt===3)throw new Error('Planner transport failed after 3 attempts');await delay(250*2**(attempt-1));continue;}
    if(!response.ok){
      if((response.status===429||response.status>=500)&&attempt<3){await delay(Math.min(5000,250*2**(attempt-1)));continue;}
      throw new Error('Claude planner HTTP '+response.status);
    }
    let record:PlanRecord;
    try{
      const text=await responseText(response);
      const value=JSON.parse(text);
      if(value.stop_reason==='refusal')throw new Refusal();
      if(value.stop_reason!=='end_turn')throw new Error('Planner response incomplete: '+String(value.stop_reason));
      if(typeof value.model!=='string'||!value.model||!Array.isArray(value.content)||value.content.filter((c:any)=>c.type==='text').length!==1)throw new Error('Malformed Claude response');
      record=makeDraft(prepared,JSON.parse(value.content.find((c:any)=>c.type==='text').text),value.model,planningHash(body),attempt);
    }catch(error){
      if(error instanceof Refusal)throw new Error('Claude refused the planner request');
      feedback=(error instanceof Error?error.message:'Invalid planner output').slice(0,2000);
      if(attempt===3)throw new Error('Planner validation failed after 3 attempts: '+feedback);
      await delay(250*2**(attempt-1));
      continue;
    }
    // Disk failures must not trigger another paid request for an already valid result.
    await options.cache.write(prepared.inputHash,record);return {record,cached:false};
  }
  throw new Error('Planner attempts exhausted');
}
class Refusal extends Error {}
