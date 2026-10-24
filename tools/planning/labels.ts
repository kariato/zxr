import type { PlanRecord } from './client.ts';
import type { PlannerSources } from './inputs.ts';
import { validateLabelTemplates } from '../../src/engine/labels.ts';
import type { LabelTemplates } from '../../src/engine/labels.ts';
export function collectLabels(records:PlanRecord[],sources:PlannerSources,complete=false){
  const labels:LabelTemplates={actions:{},decisions:{}};
  for(const r of records.filter(r=>r.task.kind==='label-set'))for(const e of r.document.entries){
    const map=e.kind==='action'?labels.actions:labels.decisions,key=e.kind==='action'?e.family:e.context+':'+e.choice;
    if(Object.hasOwn(map,key))throw new Error('Duplicate presentation label '+key);
    if(e.kind==='action')labels.actions[key]={template:e.template,slots:[...e.slots]};else labels.decisions[key]=e.text;
  }
  validateLabelTemplates(labels,sources.families);
  const missing=sources.families.filter(f=>!f.shadowedBy&&!labels.actions[f.id]).map(f=>f.id);
  for(const d of ['yes-no:yes','yes-no:no','finish:restart','finish:restore','finish:quit'])if(!labels.decisions[d])missing.push(d);
  if(complete&&missing.length)throw new Error('Missing presentation labels: '+missing.join(', '));
  return {labels,missing};
}
