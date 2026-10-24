import { beforeAll,describe,expect,it } from 'vitest';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlannerSources } from '../tools/planning/inputs.ts';
import type { PlannerSources } from '../tools/planning/inputs.ts';
import { reviewRecords,saveReview,applyFieldLocks } from '../tools/planning/review.ts';
import { writeJson } from '../tools/planning/store.ts';
import { makeAssistantDraft } from '../tools/planning/client.ts';
import { preparePlan } from '../tools/planning/inputs.ts';
let sources:PlannerSources;
beforeAll(()=>{sources=loadPlannerSources();},60000);
function setup(){const root=mkdtempSync(join(tmpdir(),'zxr-review-'));writeJson(join(root,'games/zork2/planning/approved/manifest.json'),{format:'zxr-approved-plans-v1',entries:[]});const record=JSON.parse(readFileSync('games/zork2/planning/drafts/scene-plan_INSIDE-BARROW.json','utf8'));writeJson(join(root,'games/zork2/planning/drafts/scene-plan_INSIDE-BARROW.json'),record);return {root,record};}
describe('source-validated review and persistent locks',()=>{
  it('preserves edited locked fields through a complete re-plan/import validation and reload',()=>{
    const {root,record}=setup();try{
      const edited=structuredClone(record.document);edited.description='Reviewed barrow description';edited.sizeMetres=[6,3.5,7];
      const saved=saveReview(root,sources,record.task,record.outputHash,edited,['/description','/sizeMetres']);
      const proposed=structuredClone(record.document);proposed.description='Would overwrite the review';proposed.sizeMetres=[9,9,9];
      const rerun=saveReview(root,sources,record.task,saved.outputHash,proposed,['/description','/sizeMetres'],true);
      expect(rerun.document.description).toBe(edited.description);expect(rerun.document.sizeMetres).toEqual(edited.sizeMetres);
      expect(makeAssistantDraft(preparePlan(record.task,sources),applyFieldLocks(root,record.task,proposed)).document).toEqual(rerun.document);
      expect(reviewRecords(root,sources)[0]!.lockedFields).toEqual(['/description','/sizeMetres']);expect(rerun.document.review.status).toBe('draft');
    }finally{rmSync(root,{recursive:true,force:true});}
  });
  it('rejects conflicting editors, invalid source edits, overlapping and identity locks before changing the draft',()=>{
    const {root,record}=setup();try{
      expect(()=>saveReview(root,sources,record.task,'0'.repeat(64),record.document,[])).toThrow('conflict');
      const bad=structuredClone(record.document);bad.exits[0].to='VAULT';expect(()=>saveReview(root,sources,record.task,record.outputHash,bad,[])).toThrow('source exits');
      for(const paths of [['/provenance'],['/review'],['/__proto__/x'],['/anchors','/anchors/0'],['/absent']])expect(()=>saveReview(root,sources,record.task,record.outputHash,record.document,paths)).toThrow();
      expect(reviewRecords(root,sources)[0]!.record.outputHash).toBe(record.outputHash);
    }finally{rmSync(root,{recursive:true,force:true});}
  });
  it('fails a re-plan that removes a locked field or tries to silently unlock it',()=>{
    const {root,record}=setup();try{
      const saved=saveReview(root,sources,record.task,record.outputHash,record.document,['/description']);
      expect(()=>saveReview(root,sources,record.task,saved.outputHash,record.document,[],true)).toThrow('cannot remove');
      const proposal=structuredClone(record.document);delete proposal.description;expect(()=>applyFieldLocks(root,record.task,proposal)).toThrow('removed locked field');
    }finally{rmSync(root,{recursive:true,force:true});}
  });
  it('edits a source label name containing # without creating a duplicate task file',()=>{
    const {root}=setup();try{
      const record=JSON.parse(readFileSync('games/zork2/planning/drafts/label-set_#COMMAND.json','utf8'));
      writeJson(join(root,'games/zork2/planning/drafts/label-set_#COMMAND.json'),record);
      const proposed=structuredClone(record.document);proposed.entries[0].template+=' (reviewed)';
      const saved=saveReview(root,sources,record.task,record.outputHash,proposed,[]),current=reviewRecords(root,sources);
      expect(current).toHaveLength(2);expect(current.find(r=>r.record.task.subject==='#COMMAND')!.record.outputHash).toBe(saved.outputHash);
    }finally{rmSync(root,{recursive:true,force:true});}
  });
});
