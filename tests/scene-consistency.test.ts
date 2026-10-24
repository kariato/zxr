import { beforeAll,describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkSceneConsistency,scenePlanHash } from '../tools/planning/consistency.ts';
import type { SceneBindings } from '../tools/planning/consistency.ts';
import { sceneBindingsSchema } from '../tools/planning/bindings-schema.ts';
import { loadPlannerSources } from '../tools/planning/inputs.ts';
import type { PlannerSources } from '../tools/planning/inputs.ts';
import { readDraftPlans } from '../tools/planning/store.ts';
import { planningHash } from '../tools/planning/identity.ts';
import { sceneDirections } from '../tools/planning/schemas.ts';

let sources:PlannerSources,documents:Record<string,any>[],bindings:SceneBindings;
beforeAll(()=>{
  sources=loadPlannerSources();documents=readDraftPlans(process.cwd(),sources).map(r=>r.document);
  bindings=JSON.parse(readFileSync('games/zork2/planning/scene-bindings.json','utf8'));
},60000);
const fixture=()=>({docs:structuredClone(documents),links:structuredClone(bindings)});
const refresh=(docs:Record<string,any>[],links:SceneBindings)=>{for(const b of links.scenes)b.planHash=scenePlanHash(docs.find(d=>d.room===b.room)!);};
function pair(){
  const {docs,links}=fixture(),barrow=docs.find(d=>d.room==='INSIDE-BARROW')!,b=links.scenes.find(b=>b.room==='INSIDE-BARROW')!;
  docs.splice(docs.findIndex(d=>d.room==='NARROW-TUNNEL'),1);links.scenes.splice(links.scenes.findIndex(s=>s.room==='NARROW-TUNNEL'),1);
  const source=sources.contexts.rooms.find(r=>r.room.name==='NARROW-TUNNEL')!;
  const narrow=structuredClone(barrow);narrow.room='NARROW-TUNNEL';narrow.objects=[];narrow.kitParts=[];
  narrow.anchors=[{node:'spawn',pose:{position:[0,0,0],yawDegrees:0}}];narrow.spawn='spawn';
  narrow.exits=source.exits.map((s,i)=>{
    const node='portal_'+i,position=s.direction==='NORTH'?[0,0,-3.25]:[0,0,3.25];
    narrow.anchors.push({node,pose:{position,yawDegrees:s.direction==='NORTH'?0:180}});
    return {direction:s.direction,to:'to' in s.view?s.view.to:null,node:'exit_'+i,anchor:node,sizeMetres:[1.3,2.2,.3],availability:'engine-option'};
  });docs.push(narrow);
  const peer:SceneBindings['scenes'][number]={room:'NARROW-TUNNEL',planHash:'0'.repeat(64),group:'barrow_tunnel',origin:[0,0,6.5],yawDegrees:0,
    exits:source.exits.map(s=>({direction:s.direction,mode:s.direction==='NORTH'?'continuous':s.view.kind==='NEXIT'?'blocked':s.direction==='CROSS'?'alias':'transition',aliasOf:s.direction==='CROSS'?'SOUTH':null,peer:s.direction==='NORTH'?{room:'INSIDE-BARROW',direction:'SOUTH'}:null})),attachments:[],disclosures:[],animations:[],variants:[]};
  links.scenes.push(peer);b.group=peer.group;const south=b.exits.find(e=>e.direction==='SOUTH')!;south.mode='continuous';south.peer={room:peer.room,direction:'NORTH'};
  refresh(docs,links);return {docs,links,peer,b,narrow,barrow};
}
describe('source-backed scene consistency',()=>{
  it('validates the real pilots while reporting the exact incomplete coverage',()=>{
    const report=checkSceneConsistency(documents,bindings,sources);
    expect(report.counts).toEqual({rooms:86,totalRooms:86,briefs:165,continuousDoorways:1,aliases:33,attachments:25});
    expect(report.missingRooms).toEqual([]);
    expect(report.scenes.find(s=>s.room==='TINY-ROOM')!.exits.find(e=>e.direction==='IN')!.physical).toBe(false);
    expect(report.scenes.find(s=>s.room==='TINY-ROOM')!.exits.find(e=>e.direction==='NORTH')).toMatchObject({physical:true,openObject:'PDOOR'});
    expect(report.pendingStateBindings).toEqual([]);
    expect(()=>checkSceneConsistency(documents,bindings,sources,true)).not.toThrow();
    expect(JSON.parse(readFileSync('schema/scene-bindings.schema.json','utf8'))).toEqual(sceneBindingsSchema);
    expect(sources.contexts.rooms.flatMap(r=>r.exits).every(e=>(sceneDirections as readonly string[]).includes(e.direction))).toBe(true);
  });
  it('checks reciprocal doorway positions, normals and dimensions, including rotated roots',()=>{
    const p=pair();expect(checkSceneConsistency(p.docs,p.links,sources).counts.continuousDoorways).toBe(1);
    p.peer.origin=[3.25,0,3.25];p.peer.yawDegrees=90;p.narrow.anchors.find((a:any)=>a.node===p.narrow.exits[0].anchor)!.pose.yawDegrees=-90;
    refresh(p.docs,p.links);expect(checkSceneConsistency(p.docs,p.links,sources).counts.continuousDoorways).toBe(1);
  });
  it.each(['position','normal','width','height','return','group','reciprocal'] as const)('rejects inconsistent shared doorway %s',kind=>{
    const p=pair();
    if(kind==='position')p.peer.origin[0]=.1;
    if(kind==='normal')p.narrow.anchors[1].pose.yawDegrees=30;
    if(kind==='width')p.narrow.exits[0].sizeMetres[0]+=.1;
    if(kind==='height')p.narrow.exits[0].sizeMetres[1]+=.1;
    if(kind==='return')p.peer.exits[0]!.peer!.direction='OUT';
    if(kind==='group')p.peer.group=null;
    if(kind==='reciprocal'){p.peer.exits[0]!.mode='transition';p.peer.exits[0]!.peer=null;}
    refresh(p.docs,p.links);expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow(/doorway/);
  });
  it('rejects disconnected group membership and guesses about computed/one-way links',()=>{
    const p=pair();p.links.scenes.find(b=>b.room==='TINY-ROOM')!.group='barrow_tunnel';expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('Disconnected');
    const q=pair();q.narrow.exits[0].to='VAULT';refresh(q.docs,q.links);expect(()=>checkSceneConsistency(q.docs,q.links,sources)).toThrow('source exits');
  });
  it('keeps source object identity canonical and requires one shared brief',()=>{
    const p=fixture();p.docs=p.docs.filter(d=>d.id!=='asset_lamp');expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('Missing source asset brief');
    const q=fixture();q.docs.push(structuredClone(q.docs.find(d=>d.id==='asset_lamp')!));expect(()=>checkSceneConsistency(q.docs,q.links,sources)).toThrow('Duplicate asset brief');
    const r=fixture();r.docs.find(d=>d.room==='INSIDE-BARROW')!.objects[0].asset='invented';refresh(r.docs,r.links);expect(()=>checkSceneConsistency(r.docs,r.links,sources)).toThrow('noncanonical');
    const t=fixture();t.docs.find(d=>d.room==='INSIDE-BARROW')!.objects[0].object='DRAGON';refresh(t.docs,t.links);expect(()=>checkSceneConsistency(t.docs,t.links,sources)).toThrow('Invented');
  });
  it('rejects missing/stale/duplicate bindings, unknown fields and false approval',()=>{
    const p=fixture();p.links.scenes[0]!.planHash='0'.repeat(64);expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('Stale');
    const q=fixture();q.links.scenes.pop();expect(()=>checkSceneConsistency(q.docs,q.links,sources)).toThrow('exactly one');
    const r=fixture();r.links.scenes.push(r.links.scenes[0]!);expect(()=>checkSceneConsistency(r.docs,r.links,sources)).toThrow('Duplicate');
    for(const extra of [{status:'approved'},{routine:'REVEAL'}])expect(()=>checkSceneConsistency(documents,{...bindings,...extra},sources)).toThrow('Scene bindings');
  });
  it('validates door aliases and prevents duplicate physical doors',()=>{
    const p=fixture(),tiny=p.links.scenes.find(b=>b.room==='TINY-ROOM')!,alias=tiny.exits.find(e=>e.mode==='alias')!;
    alias.aliasOf='DOWN';expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('Alias');
    alias.aliasOf=null;alias.mode='transition';expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('Duplicate physical doorway');
  });
  it('rejects invalid attachments, cycles and reused sockets without touching source parents',()=>{
    const before=planningHash(sources.contexts.objects),p=fixture(),tiny=p.links.scenes.find(b=>b.room==='TINY-ROOM')!;
    tiny.attachments[0]!.parent='NO-SUCH-OBJECT';expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('placed child and parent');
    tiny.attachments[0]!.parent='PDOOR';tiny.attachments.push({object:'PDOOR',parent:'PWINDOW',socket:'cycle'});expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('cycle');
    tiny.attachments.pop();tiny.attachments[1]!.socket=tiny.attachments[0]!.socket;expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('Duplicate attachment socket');
    expect(planningHash(sources.contexts.objects)).toBe(before);
  });
  it('rejects known interactive assets in the static shell',()=>{
    const p=fixture(),barrow=p.docs.find(d=>d.room==='INSIDE-BARROW')!;barrow.kitParts[0].part='asset_sword';refresh(p.docs,p.links);
    expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('baked into static');
  });
  it('requires a noninteractive separate variant and an observation-supported disclosure',()=>{
    const p=fixture(),barrow=p.docs.find(d=>d.room==='INSIDE-BARROW')!,binding=p.links.scenes.find(b=>b.room===barrow.room)!;
    const scenery=structuredClone(p.docs.find(d=>d.id==='asset_sword')!);scenery.id='concealed_wall';scenery.kind='scenery';scenery.objects=[];scenery.hotspotNodes=[];p.docs.push(scenery);
    barrow.features.push({node:'revealed_detail',asset:scenery.id,anchor:'sword_mark',visibleWhen:{kind:'flag',object:'SWORD',flag:'INVISIBLE',set:false}});
    refresh(p.docs,p.links);expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('disclosure binding');
    binding.disclosures.push({node:'revealed_detail',object:'SWORD'});expect(()=>checkSceneConsistency(p.docs,p.links,sources)).not.toThrow();
    barrow.features[0].visibleWhen={kind:'global',name:'SECRET',equals:1};refresh(p.docs,p.links);expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('observation-safe');
    barrow.features[0].visibleWhen={kind:'flag',object:'SWORD',flag:'OPENBIT',set:true};refresh(p.docs,p.links);expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('observation-safe');
  });
  it('is deterministic and owns its compiled output',()=>{
    const before=planningHash({documents,bindings,contexts:sources.contexts}),a=checkSceneConsistency(documents,bindings,sources),b=checkSceneConsistency(documents,bindings,sources);
    expect(a).toEqual(b);a.scenes[0]!.objects.length=0;expect(checkSceneConsistency(documents,bindings,sources)).toEqual(b);
    expect(planningHash({documents,bindings,contexts:sources.contexts})).toBe(before);
  });
  it('does not pass complete acceptance merely because room coverage is filled',()=>{
    const p=fixture();p.links.scenes.find(b=>b.room==='TINY-ROOM')!.animations=[];
    const limited={...sources,contexts:{...sources.contexts,rooms:sources.contexts.rooms.filter(r=>bindings.scenes.some(b=>b.room===r.room.name))}};
    expect(()=>checkSceneConsistency(p.docs,p.links,limited,true)).toThrow('Unresolved observed state bindings');
  });
  it('keeps conditional exits out of continuous groups until their disclosure is observed',()=>{
    const p=pair(),changed=structuredClone(sources);
    for(const room of changed.contexts.rooms.filter(r=>['INSIDE-BARROW','NARROW-TUNNEL'].includes(r.room.name))){
      const exit=room.exits.find(e=>e.direction===(room.room.name==='INSIDE-BARROW'?'SOUTH':'NORTH'))!;
      const to='to' in exit.view?exit.view.to:'';exit.view={kind:'DEXIT',to,door:'PDOOR',message:null};
    }
    expect(()=>checkSceneConsistency(p.docs,p.links,changed)).toThrow('Conditional doorway');
  });
  it('preserves assembly identity across approval metadata while binding input provenance',()=>{
    const p=fixture(),barrow=p.docs.find(d=>d.room==='INSIDE-BARROW')!;
    barrow.review={status:'approved',reviewer:'Fixture only',reviewedOn:'2026-10-23'};
    expect(()=>checkSceneConsistency(p.docs,p.links,sources)).not.toThrow();
    barrow.provenance.inputHash='0'.repeat(64);expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('Stale scene binding');
  });
  it('rejects invalid animation objects, duplicate channels, unknown clips and unsupported surface properties',()=>{
    for(const change of [(a:any)=>{a.object='SWORD';},(a:any)=>{a.property='open';},(a:any)=>{a.whenTrue='no_such_clip';},(a:any)=>{a.whenFalse=a.whenTrue;}]){
      const p=fixture(),b=p.links.scenes.find(b=>b.room==='INSIDE-BARROW')!;change(b.animations[0]);expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow(/Animation/);
    }
    const p=fixture(),b=p.links.scenes.find(b=>b.room==='TINY-ROOM')!;b.animations.push(b.animations[0]!);expect(()=>checkSceneConsistency(p.docs,p.links,sources)).toThrow('Duplicate animation binding');
  });
});
