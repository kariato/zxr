import { beforeAll,describe,expect,it } from 'vitest';
import { collectLabels } from '../tools/planning/labels.ts';
import { loadPlannerSources } from '../tools/planning/inputs.ts';
import type { PlannerSources } from '../tools/planning/inputs.ts';
import { readApprovedPlans,readDraftPlans } from '../tools/planning/store.ts';
import { actionLabel,validateLabelTemplates } from '../src/engine/labels.ts';
import { GameSession,loadGame } from '../src/engine/index.ts';
import type { LoadedGame } from '../src/engine/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { packBundle } from '../src/zil/bundle.ts';
let sources:PlannerSources;
let game:LoadedGame;
beforeAll(()=>{const bundle=compileSourcePath('reference/zork2');sources=loadPlannerSources(process.cwd(),bundle);game=loadGame(packBundle(bundle));},60000);
describe('reviewed non-movement label assets',()=>{
  it('covers every unshadowed family and every decision without introducing actions',()=>{
    const records=readDraftPlans(process.cwd(),sources),{labels,missing}=collectLabels(records,sources,true);
    expect(missing).toEqual([]);expect(Object.keys(labels.actions).sort()).toEqual(sources.families.filter(f=>!f.shadowedBy).map(f=>f.id).sort());
    expect(Object.keys(labels.decisions)).toHaveLength(5);
    const approved=collectLabels(readApprovedPlans(process.cwd(),sources).records,sources);expect(approved.missing.length).toBeGreaterThan(0);
  });
  it('substitutes scoped operands and selected words, retaining actor identity',()=>{
    const {labels}=collectLabels(readApprovedPlans(process.cwd(),sources).records,sources),family=sources.families.find(f=>f.id==='TAKE:8')!;
    const context={player:'ADVENTURER',names:{SWORD:'Elvish sword',ROBOT:'robot'},templates:labels};
    expect(actionLabel(family,'PLAYER',['SWORD'],undefined,context)).toBe('Pick up Elvish sword');
    expect(actionLabel(family,'ROBOT',['SWORD'],undefined,context)).toBe('robot — Pick up Elvish sword');
    expect(actionLabel(family,'PLAYER',[],undefined,context)).toContain('[object]');
  });
  it('rejects missing operands, invented families, placeholders and decisions',()=>{
    const baseline=collectLabels(readApprovedPlans(process.cwd(),sources).records,sources).labels;
    for(const mutate of [(l:any)=>{l.actions['TAKE:8'].template='Take';},(l:any)=>{l.actions['TAKE:8'].template='Take {secret}';},(l:any)=>{l.actions['IMAGINARY:1']=l.actions['TAKE:8'];},(l:any)=>{l.decisions['finish:win']='Win';}]){const labels=structuredClone(baseline);mutate(labels);expect(()=>validateLabelTemplates(labels,sources.families)).toThrow();}
  });
  it('changes presentation labels without changing candidates, state, option identities or owned save data',()=>{
    const labels=collectLabels(readApprovedPlans(process.cwd(),sources).records,sources).labels;
    const plain=new GameSession(game),styled=new GameSession(game,{labels}),before=styled.exportSave(),hash=styled.stateHash();
    expect(styled.candidates()).toEqual(plain.candidates());expect(styled.stateHash()).toBe(plain.stateHash());
    labels.actions['TAKE:8']!.template='Changed outside the session {direct}';
    const menu=styled.menu(),take=[...menu.actions.primary,...menu.actions.more].find(c=>c.draft.family==='TAKE:8')!;
    expect(take.label).toBe('Pick up [object]');expect(styled.exportSave()).toEqual(before);expect(styled.stateHash()).toBe(hash);
    const original=plain.menu(),plainTake=[...original.actions.primary,...original.actions.more].find(c=>c.draft.family==='TAKE:8')!;
    expect(take.draft).toEqual(plainTake.draft);
  });
});
