import { beforeAll,describe,expect,it,vi } from 'vitest';
import { mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatePlan,makeAssistantDraft,requestBody,validatePlanRecord } from '../tools/planning/client.ts';
import { loadPlannerSources,preparePlan } from '../tools/planning/inputs.ts';
import type { PlannerSources,PlanTask } from '../tools/planning/inputs.ts';
import { planningHash } from '../tools/planning/identity.ts';
import { readApprovedPlans,readDraftPlans,writeJson } from '../tools/planning/store.ts';

let sources:PlannerSources;
const task:PlanTask={kind:'scene-plan',subject:'INSIDE-BARROW'};
beforeAll(()=>{sources=loadPlannerSources();},60000);
const pilot=()=>JSON.parse(readFileSync('games/zork2/planning/drafts/scene-plan_INSIDE-BARROW.json','utf8'));
describe('in-chat assistant scene authoring',()=>{
  it('defaults to assistant authorship, without inventing a provider model ID',()=>{
    expect(sources.config.provider).toBe('assistant');expect(sources.config.model).toBeNull();
    const record=makeAssistantDraft(preparePlan(task,sources),pilot().document);
    expect(record.provider).toBe('assistant');expect(record.requestHash).toBeNull();expect(record.attempts).toBe(0);
    expect(record.document.provenance).toMatchObject({method:'assistant',agent:'Codex',model:null});
    expect(()=>validatePlanRecord(record,preparePlan(task,sources))).not.toThrow();
  });
  it('retains draft originals and selects only the exact versions approved by Mark',()=>{
    const records=readDraftPlans(process.cwd(),sources);expect(records).toHaveLength(386);
    expect(records.filter(r=>r.task.kind==='scene-plan').map(r=>r.task.subject).sort()).toEqual(sources.contexts.rooms.map(r=>r.room.name).sort());
    expect(records.filter(r=>r.task.kind==='asset-brief')).toHaveLength(165);expect(records.filter(r=>r.task.kind==='label-set')).toHaveLength(135);
    expect(records.every(r=>r.provider==='assistant'&&r.document.review.status==='draft')).toBe(true);
    const approved=readApprovedPlans(process.cwd(),sources).records;expect(approved).toHaveLength(22);
    for(const record of approved){
      expect(record.document.review).toEqual({status:'approved',reviewer:'Mark',reviewedOn:'2026-10-23'});
      const draft=records.find(r=>r.task.kind===record.task.kind&&r.task.subject===record.task.subject)!;
      expect({...record.document,review:{status:'draft'}}).toEqual(draft.document);
    }
  });
  it('preserves the approved scene facts and source-specific door details',()=>{
    const records=readDraftPlans(process.cwd(),sources),get=(kind:string,name:string)=>records.find(r=>r.task.kind===kind&&r.task.subject===name)!.document;
    const garden=get('scene-plan','FORMAL-GARDEN');expect(garden.shell).toBe('cave');expect(garden.objects.some((o:any)=>o.object==='GLOBAL-UNICORN')).toBe(false);
    expect(get('asset-brief','PDOOR').description).toContain('Massive oak');
    expect(get('asset-brief','PWINDOW').description).toContain('adjoining room');
    const sword=get('asset-brief','SWORD');expect(sword.sizeMetres[1]).toBeLessThan(.1);
    const tiny=get('scene-plan','TINY-ROOM');expect(tiny.exits.filter((e:any)=>e.to==='DREARY-ROOM')).toHaveLength(2);
    expect(tiny.kitParts.some((p:any)=>p.part.includes('door'))).toBe(false);
  });
  it('forces imported JSON back to draft and rejects source inventions',()=>{
    const value=pilot().document;value.review={status:'approved',reviewer:'invented',reviewedOn:'2026-10-23'};
    expect(makeAssistantDraft(preparePlan(task,sources),value).document.review).toEqual({status:'draft'});
    value.exits[0].to='VAULT';expect(()=>makeAssistantDraft(preparePlan(task,sources),value)).toThrow('source exits');
  });
  it('never calls a paid provider or reads a cache in assistant mode',async()=>{
    const transport=vi.fn(),cache={read:vi.fn(),write:vi.fn()};
    await expect(generatePlan(task,sources,{apiKey:'unused',fetch:transport,cache})).rejects.toThrow('no API key is needed');
    expect(transport).not.toHaveBeenCalled();expect(cache.read).not.toHaveBeenCalled();expect(()=>requestBody(preparePlan(task,sources),sources.image)).toThrow('do not make API requests');
  });
  it('retains source/style/image staleness checks without a remote API',()=>{
    const record=pilot(),changed=structuredClone(sources);changed.style+=' art change';
    expect(()=>validatePlanRecord(record,preparePlan(task,changed))).toThrow('Stale');
    const forged=pilot();forged.provider='anthropic';expect(()=>validatePlanRecord(forged,preparePlan(task,sources))).toThrow('mismatched');
  });
  it('keeps draft edits and false approval from bypassing the review boundary',()=>{
    const root=mkdtempSync(join(tmpdir(),'zxr-assistant-'));try{
      const directory=join(root,'games/zork2/planning/drafts');mkdirSync(directory,{recursive:true});
      const value=pilot();value.document.description+=' edited';writeJson(join(directory,'pilot.json'),value);expect(()=>readDraftPlans(root,sources)).toThrow('identity');
      value.document.review={status:'approved',reviewer:'Fixture reviewer',reviewedOn:'2026-10-23'};value.outputHash=planningHash(value.document);writeJson(join(directory,'pilot.json'),value);expect(()=>readDraftPlans(root,sources)).toThrow('cannot grant approval');
    }finally{rmSync(root,{recursive:true,force:true});}
  });
});
