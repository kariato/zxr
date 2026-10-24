import { beforeAll,describe,expect,it,vi } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatePlan,makeDraft,providerSchema,requestBody,validatePlanRecord } from '../tools/planning/client.ts';
import type { PlanRecord,PlannerCache } from '../tools/planning/client.ts';
import { digest,planningHash,planningJson } from '../tools/planning/identity.ts';
import { API_VERSION,assetId,loadPlannerSources,preparePlan } from '../tools/planning/inputs.ts';
import type { PlanTask,PlannerSources } from '../tools/planning/inputs.ts';
import { approvePlan,FilePlannerCache,planStatus,readApprovedPlans,writeJson } from '../tools/planning/store.ts';

let sources:PlannerSources;
const task:PlanTask={kind:'scene-plan',subject:'INSIDE-BARROW'},model='claude-sonnet-5-5',hash='a'.repeat(64);
beforeAll(()=>{sources=loadPlannerSources();sources.config.provider='anthropic';sources.config.model=model;},60000);
const sample=(name:string)=>JSON.parse(readFileSync(new URL('../games/zork2/planning/examples/'+name+'.json',import.meta.url),'utf8'));
function raw(t:PlanTask=task){
  let value:any;
  if(t.kind==='scene-plan'){
    value=sample('inside-barrow.scene-plan');value.room=t.subject;
    value.objects.forEach((o:any)=>{o.asset=assetId(o.object);});
    if(t.subject==='VAULT'){value.exits=[];value.objects=[];}
  }else if(t.kind==='asset-brief'){value=sample('robot.asset-brief');value.id=assetId(t.subject);value.objects=[t.subject];}
  else {value=sample('pilot.label-set');value.id='labels_'+t.subject.toLowerCase();value.entries=value.entries.filter((e:any)=>e.kind==='decision'||e.family.startsWith(t.subject+':'));}
  delete value.provenance;delete value.review;return value;
}
function memoryCache(){const entries=new Map<string,PlanRecord>();return {entries,read:vi.fn(async(key:string)=>entries.get(key)??null),write:vi.fn(async(key:string,value:PlanRecord)=>{entries.set(key,value);})} satisfies PlannerCache&{entries:Map<string,PlanRecord>};}
const response=(value:unknown,extra:Record<string,unknown>={})=>new Response(JSON.stringify({model,stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}],...extra}),{status:200});
const noDelay=async()=>{};
const draft=(t:PlanTask=task)=>makeDraft(preparePlan(t,sources),raw(t),model,hash,1);
function temporary(){const root=mkdtempSync(join(tmpdir(),'zxr-planner-'));mkdirSync(join(root,'games/zork2/planning/approved'),{recursive:true});writeJson(join(root,'games/zork2/planning/approved/manifest.json'),{format:'zxr-approved-plans-v1',entries:[]});return root;}

describe('planner identity, source binding and local validation',()=>{
  it('supports fractional presentation metres without weakening integer engine hashes',()=>{
    expect(planningJson({b:.35,a:-0})).toBe('{"a":0,"b":0.35}');
    for(const value of [NaN,Infinity,undefined,new Date()])expect(()=>planningJson(value)).toThrow();
    const prepared=preparePlan(task,sources);expect(draft().outputHash).toHaveLength(64);
    expect(requestBody(prepared,sources.image).messages[0]!.content[1]).toMatchObject({type:'image',source:{media_type:'image/png'}});
  });
  it('uses the complete approved style and real image, without credentials in prepared requests',()=>{
    const prepared=preparePlan(task,sources),body=requestBody(prepared,sources.image);
    expect(prepared.prompt).toContain(sources.style);expect(body).toHaveProperty('output_config.format.type','json_schema');
    expect(body.messages[0]!.content[1]!.source!.data).toBe(Buffer.from(sources.image).toString('base64'));
    expect(JSON.stringify(body)).not.toContain('apiKey');expect(body).not.toHaveProperty('temperature');
    expect(prepared.context).toHaveProperty('writerEvidence');
  });
  it('keeps provider schema constraints separate from full local validation',()=>{
    const prepared=preparePlan(task,sources),schema=providerSchema(prepared);
    expect(()=>new Ajv2020({strict:true}).compile(schema)).not.toThrow();expect(schema.properties).not.toHaveProperty('review');
    expect(JSON.stringify(schema)).not.toContain('"minimum":');
    const bad=raw();bad.sizeMetres[0]=0;expect(()=>makeDraft(prepared,bad,model,hash,1)).toThrow();
  });
  it('stamps generation metadata and forces model-supplied approval back to draft',()=>{
    const value=raw();value.review={status:'approved',reviewer:'invented',reviewedOn:'2026-10-23'};value.provenance={method:'manual',author:'invented'};
    const record=makeDraft(preparePlan(task,sources),value,'reported-model-id',hash,1);
    expect(record.document.review).toEqual({status:'draft'});expect(record.document.provenance).toMatchObject({method:'model',model:'reported-model-id',inputHash:record.inputHash});
    expect(()=>validatePlanRecord(record,preparePlan(task,sources))).not.toThrow();
  });
  it('validates source room/exits and canonical local object identities',()=>{
    const prepared=preparePlan(task,sources);
    for(const mutate of [(v:any)=>{v.room='VAULT';},(v:any)=>{v.exits[0].to='VAULT';},(v:any)=>{v.objects[0].object='ROBOT';},(v:any)=>{v.objects[0].asset='invented';}]){const value=raw();mutate(value);expect(()=>makeDraft(prepared,value,model,hash,1)).toThrow();}
  });
  it('validates asset and label tasks without permitting invented source bindings',()=>{
    for(const t of [{kind:'asset-brief',subject:'ROBOT'},{kind:'label-set',subject:'TAKE'}] as PlanTask[]){const record=draft(t);expect(()=>validatePlanRecord(record,preparePlan(t,sources))).not.toThrow();}
    const labelTask:PlanTask={kind:'label-set',subject:'TAKE'},value=raw(labelTask);value.entries[0].family='SAY:1';expect(()=>makeDraft(preparePlan(labelTask,sources),value,model,hash,1)).toThrow('Unknown label family');
  });
  it('hashes only the selected context slices, plus all shared prompt/style/schema/model/image inputs',()=>{
    const base=preparePlan(task,sources).inputHash,vault:PlanTask={kind:'scene-plan',subject:'VAULT'},vaultHash=preparePlan(vault,sources).inputHash;
    const changed=structuredClone(sources);changed.contexts.objects.objects.find(o=>o.name==='SWORD')!.desc.text+=' source edit';
    expect(preparePlan(task,changed).inputHash).not.toBe(base);expect(preparePlan(vault,changed).inputHash).toBe(vaultHash);
    const writer=structuredClone(sources),writerTask:PlanTask={kind:'scene-plan',subject:'MENHIR-ROOM'},writerHash=preparePlan(writerTask,sources).inputHash,r=writer.contexts.routines.routines.find(r=>r.effects.some(e=>e.target==='MENHIR-POSITION'))!;r.sourceText+=' writer edit';expect(preparePlan(writerTask,writer).inputHash).not.toBe(writerHash);
    for(const mutate of [(s:PlannerSources)=>{s.style+=' palette edit';},(s:PlannerSources)=>{s.prompt+=' prompt edit';},(s:PlannerSources)=>{s.config.model='claude-example';},(s:PlannerSources)=>{s.config.maxTokens=16384;},(s:PlannerSources)=>{s.image[10]=s.image[10]!^1;s.imageHash=digest(s.image);}]){const next=structuredClone(sources);mutate(next);expect(preparePlan(task,next).inputHash).not.toBe(base);}
    const bad=structuredClone(sources);bad.image[10]=bad.image[10]!^1;expect(()=>preparePlan(task,bad)).toThrow('bytes/hash');
  });
});

describe('Claude request/retry and cache workflow (injected transport, no live API)',()=>{
  it('calls the Messages API with a bounded structured request and caches only validated drafts',async()=>{
    const cache=memoryCache(),transport=vi.fn(async()=>response(raw()));
    const result=await generatePlan(task,sources,{apiKey:'test-only-key',cache,fetch:transport as typeof fetch,delay:noDelay});
    expect(result.cached).toBe(false);expect(cache.entries.size).toBe(1);
    const [url,options]=transport.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');expect(options.headers).toMatchObject({'anthropic-version':API_VERSION,authorization:'Bearer test-only-key'});
    expect(JSON.stringify(result.record)).not.toContain('test-only-key');expect(options.redirect).toBe('error');
    const second=await generatePlan(task,sources,{cache,fetch:transport as typeof fetch,delay:noDelay});expect(second.cached).toBe(true);expect(transport).toHaveBeenCalledTimes(1);
  });
  it('repairs malformed outputs with bounded feedback and preserves the reported model',async()=>{
    const bad=raw();bad.sizeMetres[0]=0;const cache=memoryCache(),transport=vi.fn().mockResolvedValueOnce(response(bad)).mockResolvedValueOnce(response(raw(),{model:'resolved-model'}));
    const result=await generatePlan(task,sources,{apiKey:'test',cache,fetch:transport,delay:noDelay});expect(result.record.attempts).toBe(2);expect(result.record.model).toBe('resolved-model');
    const body=JSON.parse(transport.mock.calls[1]![1].body);expect(body.max_tokens).toBe(16384);expect(body.messages[0].content[0].text).toContain('Repair the previous invalid draft');expect(cache.write).toHaveBeenCalledTimes(1);
  });
  it.each([429,500,529])('retries transient HTTP %s',async(status)=>{
    const transport=vi.fn().mockResolvedValueOnce(new Response('',{status})).mockResolvedValueOnce(response(raw()));
    const result=await generatePlan(task,sources,{apiKey:'test',cache:memoryCache(),fetch:transport,delay:noDelay});expect(result.record.attempts).toBe(2);
  });
  it('bounds invalid/truncated JSON, transport failures and refusals',async()=>{
    for(const transport of [vi.fn(async()=>new Response('{')),vi.fn(async()=>response(raw(),{stop_reason:'max_tokens'})),vi.fn(async()=>{throw new Error('network');})]){
      const cache=memoryCache();await expect(generatePlan(task,sources,{apiKey:'test',cache,fetch:transport as typeof fetch,delay:noDelay})).rejects.toThrow('3 attempts');expect(transport).toHaveBeenCalledTimes(3);expect(cache.entries.size).toBe(0);
    }
    const refusal=vi.fn(async()=>response({}, {stop_reason:'refusal'}));await expect(generatePlan(task,sources,{apiKey:'test',cache:memoryCache(),fetch:refusal as typeof fetch,delay:noDelay})).rejects.toThrow('refused');expect(refusal).toHaveBeenCalledTimes(1);
  });
  it('does not retry authentication or cache-write errors',async()=>{
    const transport=vi.fn(async()=>new Response('',{status:401}));await expect(generatePlan(task,sources,{apiKey:'test',cache:memoryCache(),fetch:transport as typeof fetch,delay:noDelay})).rejects.toThrow('401');expect(transport).toHaveBeenCalledTimes(1);
    const success=vi.fn(async()=>response(raw())),cache=memoryCache();cache.write.mockRejectedValue(new Error('disk full'));
    await expect(generatePlan(task,sources,{apiKey:'test',cache,fetch:success as typeof fetch,delay:noDelay})).rejects.toThrow('disk full');expect(success).toHaveBeenCalledTimes(1);
  });
  it('requires a key only on cache miss and rejects a damaged cache without a paid retry',async()=>{
    const cache=memoryCache(),transport=vi.fn();await expect(generatePlan(task,sources,{cache,fetch:transport})).rejects.toThrow('ANTHROPIC_API_KEY');expect(transport).not.toHaveBeenCalled();
    const record=draft();record.document.description='tampered';cache.entries.set(record.inputHash,record);
    await expect(generatePlan(task,sources,{apiKey:'test',cache,fetch:transport})).rejects.toThrow('identity');expect(transport).not.toHaveBeenCalled();
  });
  it('cannot acquire an approved plan from the disposable cache',async()=>{
    const cache=memoryCache(),record=draft(),transport=vi.fn();record.document.review={status:'approved',reviewer:'Fixture reviewer',reviewedOn:'2026-10-23'};record.outputHash=planningHash(record.document);cache.entries.set(record.inputHash,record);
    await expect(generatePlan(task,sources,{cache,fetch:transport})).rejects.toThrow('Cache cannot supply approved');expect(transport).not.toHaveBeenCalled();
  });
});

describe('committed approvals and offline builds',()=>{
  it('reads only the manifest-selected approval, independently of disposable cache files',async()=>{
    const root=temporary();try{
      expect(readApprovedPlans(root,sources).records).toEqual([]);
      const file=approvePlan(root,sources,draft(),'Fixture reviewer','2026-10-23');
      const before=readFileSync(join(root,'games/zork2/planning/approved',file),'utf8');
      const cache=new FilePlannerCache(join(root,'out/cache'));await cache.write(draft().inputHash,draft());
      writeFileSync(join(root,'out/cache',draft().inputHash+'.json'),'broken cache');
      expect(readApprovedPlans(root,sources).records).toHaveLength(1);expect(readFileSync(join(root,'games/zork2/planning/approved',file),'utf8')).toBe(before);
      expect(()=>approvePlan(root,sources,draft(),'Other reviewer','2026-10-23')).toThrow('--replace');
    }finally{rmSync(root,{recursive:true,force:true});}
  });
  it('reports only affected selected plans stale and fails a build with stale inputs',()=>{
    const root=temporary();try{
      approvePlan(root,sources,draft(),'Fixture reviewer','2026-10-23');approvePlan(root,sources,draft({kind:'scene-plan',subject:'VAULT'}),'Fixture reviewer','2026-10-23');
      const changed=structuredClone(sources);changed.contexts.objects.objects.find(o=>o.name==='SWORD')!.desc.text+=' edit';
      const status=planStatus(root,changed);expect(status.find(s=>s.task.subject==='INSIDE-BARROW')!.status).toBe('stale-or-invalid');expect(status.find(s=>s.task.subject==='VAULT')!.status).toBe('current');
      expect(()=>readApprovedPlans(root,changed)).toThrow('Stale');
    }finally{rmSync(root,{recursive:true,force:true});}
  });
  it('rejects manifest traversal and edited approved documents',()=>{
    const root=temporary();try{
      const file=approvePlan(root,sources,draft(),'Fixture reviewer','2026-10-23'),path=join(root,'games/zork2/planning/approved',file),record=JSON.parse(readFileSync(path,'utf8'));record.document.sizeMetres[0]=9;writeJson(path,record);
      expect(()=>readApprovedPlans(root,sources)).toThrow('identity');
      writeJson(join(root,'games/zork2/planning/approved/manifest.json'),{format:'zxr-approved-plans-v1',entries:[{file:'../outside.json',task,inputHash:hash,outputHash:hash}]});expect(()=>readApprovedPlans(root,sources)).toThrow('manifest identity');
    }finally{rmSync(root,{recursive:true,force:true});}
  });
});
