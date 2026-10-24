import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validatePlanning } from '../tools/planning/validate.ts';
import { checkPlanningExamples } from '../tools/planning/check.ts';
import { planningSchemas } from '../tools/planning/schemas.ts';
const sample=(name:string)=>JSON.parse(readFileSync(new URL('../games/zork2/planning/examples/'+name+'.json',import.meta.url),'utf8'));
const scene=()=>sample('inside-barrow.scene-plan');
const brief=()=>sample('brass_lamp.asset-brief');
const labels=()=>sample('pilot.label-set');

describe('presentation planning contracts',()=>{
  it('validates three hand-authored source-backed rooms and their briefs/labels',()=>{
    expect(checkPlanningExamples()).toEqual({rooms:3,briefs:4,labelSets:1});
    for(const [name,schema] of Object.entries(planningSchemas))expect(JSON.parse(readFileSync(new URL('../schema/'+name+'.schema.json',import.meta.url),'utf8'))).toEqual(schema);
  });
  it('accepts decimal metres and all three shell types',()=>{
    for(const shell of ['indoor','outdoor','cave']){const value=scene();value.shell=shell;value.anchors[0].pose.position=[-.75,0,1.25];expect(()=>validatePlanning('scene-plan',value)).not.toThrow();}
  });
  it.each([
    ['zero size',(s:any)=>{s.sizeMetres[0]=0;}],
    ['negative size',(s:any)=>{s.sizeMetres[1]=-1;}],
    ['bad pose',(s:any)=>{s.anchors[0].pose.position=[0,1];}],
    ['missing dark rig',(s:any)=>{delete s.lighting.dark;}],
    ['bad colour',(s:any)=>{s.lighting.lit[0].colour='red';}],
    ['missing anchor',(s:any)=>{s.objects[0].anchor='absent';}],
    ['duplicate node',(s:any)=>{s.exits[0].node=s.anchors[0].node;}],
    ['duplicate placement',(s:any)=>{s.objects.push(s.objects[0]);}],
    ['duplicate direction',(s:any)=>{s.exits[1].direction=s.exits[0].direction;}],
    ['invented handler',(s:any)=>{s.exits[0].handler='V-WALK';}],
    ['code condition',(s:any)=>{s.features=[{node:'secret',asset:'wall',anchor:'player_start',visibleWhen:{op:'call',routine:'REVEAL'}}];}],
    ['fake approval',(s:any)=>{s.review={status:'approved'};}],
    ['missing model provenance',(s:any)=>{s.provenance={method:'model',model:'example',promptVersion:'v1'};}],
  ])('rejects %s',(_name,mutate)=>{const value=scene();mutate(value);expect(()=>validatePlanning('scene-plan',value)).toThrow();});
  it('retains explicit provenance and review when supplied completely',()=>{
    const value=scene();value.provenance={method:'model',model:'example-model',promptVersion:'v1',inputHash:'a'.repeat(64)};
    value.review={status:'approved',reviewer:'Example reviewer',reviewedOn:'2026-10-23'};expect(()=>validatePlanning('scene-plan',value)).not.toThrow();
  });
  it('rejects duplicate materials/hotspots, invalid clips and interactive scenery',()=>{
    for(const mutate of [(v:any)=>{v.materials.push(v.materials[0]);},(v:any)=>{v.hotspotNodes.push(v.hotspotNodes[0]);},(v:any)=>{v.requiredClips=['IDLE'];},(v:any)=>{v.kind='scenery';},(v:any)=>{v.objects=[];}]){const value=brief();mutate(value);expect(()=>validatePlanning('asset-brief',value)).toThrow();}
    const scenery=brief();scenery.kind='scenery';scenery.objects=[];scenery.hotspotNodes=[];expect(()=>validatePlanning('asset-brief',scenery)).not.toThrow();
  });
  it('rejects label bindings/slots that would silently label a different action',()=>{
    for(const mutate of [(v:any)=>{v.entries.push(v.entries[0]);},(v:any)=>{v.entries[0].template='Take {invented}';},(v:any)=>{v.entries[0].template='Take {direct';},(v:any)=>{v.entries[0].slots=[];},(v:any)=>{v.entries[0].family='WALK:PLAYER:SOUTH';},(v:any)=>{v.entries[3].choice='quit';},(v:any)=>{v.entries[0].op='perform';}]){const value=labels();mutate(value);expect(()=>validatePlanning('label-set',value)).toThrow();}
  });
});
