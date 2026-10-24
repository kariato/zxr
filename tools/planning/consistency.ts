import Ajv2020 from 'ajv/dist/2020.js';
import { sceneBindingsSchema } from './bindings-schema.ts';
import { assetId } from './inputs.ts';
import type { PlannerSources } from './inputs.ts';
import { planningHash } from './identity.ts';
import { validatePlanning } from './validate.ts';
import type { SceneVisibility } from '../../src/presentation/scene-visibility.ts';
import type { AnimationBinding } from '../../src/presentation/scene-visibility.ts';

interface ExitBinding {direction:string;mode:'transition'|'continuous'|'blocked'|'alias'|'menu-only';aliasOf:string|null;peer:{room:string;direction:string}|null}
export interface SceneBinding {
  room:string;planHash:string;group:string|null;origin:number[];yawDegrees:number;exits:ExitBinding[];
  attachments:{object:string;parent:string;socket:string}[];disclosures:{node:string;object:string}[];
  animations:AnimationBinding[];
  variants:{object:string;variant:string;description:string}[];
}
export interface SceneBindings {format:'zxr-scene-bindings-v1';status:'draft';scenes:SceneBinding[]}
type Document=Record<string,any>;
const ajv=new Ajv2020({strict:true,allErrors:true}),validate=ajv.compile(sceneBindingsSchema);
const unique=(values:string[],label:string)=>{if(new Set(values).size!==values.length)throw new Error('Duplicate '+label);};
const near=(a:number,b:number)=>Math.abs(a-b)<=.02+1e-9;
/** Approval metadata does not move geometry. Source/style provenance remains
 * bound, so only the review envelope is excluded from the assembly identity. */
export function scenePlanHash(plan:Document){const {review,...content}=plan;return planningHash(content);}
function portal(plan:Document,binding:SceneBinding,direction:string){
  const exit=plan.exits.find((e:any)=>e.direction===direction),anchor=plan.anchors.find((a:any)=>a.node===exit.anchor);
  const [x,y,z]=anchor.pose.position,r=binding.yawDegrees*Math.PI/180;
  return {position:[binding.origin[0]!+Math.cos(r)*x+Math.sin(r)*z,binding.origin[1]!+y,binding.origin[2]!-Math.sin(r)*x+Math.cos(r)*z],
    yaw:binding.yawDegrees+anchor.pose.yawDegrees,size:exit.sizeMetres};
}
/** Deterministic offline pass. Callers validate record provenance first. Missing
 * room coverage is explicit; --complete is required for the phase acceptance. */
export function checkSceneConsistency(documents:Document[],raw:unknown,sources:PlannerSources,complete=false){
  if(!validate(raw))throw new Error('Scene bindings: '+ajv.errorsText(validate.errors,{separator:'; '}));
  const bindings=raw as unknown as SceneBindings,scenes=new Map<string,Document>(),briefs=new Map<string,Document>(),owners=new Map<string,string>();
  const rooms=new Map(sources.contexts.rooms.map(r=>[r.room.name,r]));
  for(const doc of documents){
    if(doc.format==='zxr-scene-plan-v1'){
      validatePlanning('scene-plan',doc);if(!rooms.has(doc.room))throw new Error('Unknown source room '+doc.room);
      if(scenes.has(doc.room))throw new Error('Duplicate room plan '+doc.room);scenes.set(doc.room,doc);
      const source=rooms.get(doc.room)!,known=new Set([...source.initialObjects,...source.globalObjects,...source.features.map(f=>f.name)]);
      if(doc.exits.length!==source.exits.length||doc.exits.some((e:any)=>!source.exits.some(s=>s.direction===e.direction&&e.to===(('to' in s.view)?s.view.to:null))))throw new Error('Scene changes source exits '+doc.room);
      for(const o of doc.objects)if(!known.has(o.object)||o.asset!==assetId(o.object))throw new Error('Invented or noncanonical object '+o.object);
    }else if(doc.format==='zxr-asset-brief-v1'){
      validatePlanning('asset-brief',doc);if(briefs.has(doc.id))throw new Error('Duplicate asset brief '+doc.id);briefs.set(doc.id,doc);
      for(const object of doc.objects){
        if(!sources.contexts.objects.objects.some(o=>o.name===object)||doc.id!==assetId(object))throw new Error('Invented or noncanonical asset '+object);
        if(owners.has(object))throw new Error('Multiple asset briefs for '+object);owners.set(object,doc.id);
      }
    }else if(doc.format==='zxr-label-set-v1')validatePlanning('label-set',doc);
    else throw new Error('Unknown planning document format');
  }
  unique(bindings.scenes.map(s=>s.room),'scene binding');
  if(bindings.scenes.length!==scenes.size||bindings.scenes.some(b=>!scenes.has(b.room)))throw new Error('Every planned room requires exactly one binding');
  const byRoom=new Map(bindings.scenes.map(b=>[b.room,b])),compiled:SceneVisibility[]=[];
  let continuous=0,aliases=0,attachments=0;
  const pendingStateBindings:string[]=[];
  for(const b of bindings.scenes){
    const plan=scenes.get(b.room)!,source=rooms.get(b.room)!;
    if(scenePlanHash(plan)!==b.planHash)throw new Error('Stale scene binding '+b.room);
    unique(b.exits.map(e=>e.direction),'exit binding');unique(b.attachments.map(a=>a.object),'attachment');unique(b.disclosures.map(d=>d.node),'disclosure');
    if(b.exits.length!==plan.exits.length||b.exits.some(e=>!plan.exits.some((p:any)=>p.direction===e.direction)))throw new Error('Exit binding coverage differs '+b.room);
    const placed=new Set<string>(plan.objects.map((o:any)=>o.object));
    unique(b.variants.map(v=>v.object),'room asset variant');for(const v of b.variants)if(!placed.has(v.object))throw new Error('Variant requires a placed source object '+v.object);
    for(const o of plan.objects){const brief=briefs.get(o.asset);if(!brief||!brief.objects.includes(o.object))throw new Error('Missing source asset brief '+o.asset);}
    unique(b.animations.map(a=>a.object),'animation binding');
    for(const a of b.animations){
      const placement=plan.objects.find((o:any)=>o.object===a.object),brief=placement&&briefs.get(placement.asset);
      const flags=sources.contexts.objects.objects.find(o=>o.name===a.object)?.flags??[];
      if(!placement||!brief||![a.whenTrue,a.whenFalse].every(c=>brief.requiredClips.includes(c))||a.whenTrue===a.whenFalse)throw new Error('Animation clips do not match placed asset '+a.object);
      if(a.property==='on'?!flags.includes('LIGHTBIT'):flags.includes('ACTORBIT')||flags.includes('SURFACEBIT')||!flags.some(f=>['DOORBIT','CONTBIT'].includes(f)))throw new Error('Animation property is not observable for '+a.object);
    }
    for(const o of plan.objects){const a=b.animations.find(a=>a.object===o.object);
      if(briefs.get(o.asset)!.requiredClips.some((c:string)=>c!=='idle'&&(!a||![a.whenTrue,a.whenFalse].includes(c))))pendingStateBindings.push(b.room+':'+o.object+':animation-state-or-event');}
    for(const part of plan.kitParts)if(briefs.has(part.part)||placed.has(part.part.toUpperCase())||placed.has(part.node.toUpperCase()))throw new Error('Source object baked into static kit '+part.node);
    const parents=new Map(b.attachments.map(a=>[a.object,a.parent]));
    const sockets=new Set<string>();
    for(const a of b.attachments){
      if(!placed.has(a.object)||!placed.has(a.parent))throw new Error('Attachment requires placed child and parent '+a.object);
      const socket=a.parent+':'+a.socket;if(sockets.has(socket))throw new Error('Duplicate attachment socket '+socket);sockets.add(socket);
      const visited=new Set<string>();let current:string|undefined=a.object;
      while(current!==undefined){if(visited.has(current))throw new Error('Attachment cycle '+a.object);visited.add(current);current=parents.get(current);}
      attachments++;
    }
    if(b.disclosures.length!==plan.features.length||b.disclosures.some(d=>!plan.features.some((f:any)=>f.node===d.node)))throw new Error('Every variant requires a disclosure binding '+b.room);
    for(const d of b.disclosures){
      const feature=plan.features.find((f:any)=>f.node===d.node),c=feature.visibleWhen,brief=briefs.get(feature.asset);
      if(!brief||brief.kind!=='scenery')throw new Error('Variant requires a noninteractive scenery brief '+feature.asset);
      // This is the only existing observation-supported flag predicate. Never
      // evaluate arbitrary globals, OPENBIT, negation or hidden world state here.
      if(c.kind!=='flag'||c.flag!=='INVISIBLE'||c.set!==false||c.object!==d.object||!placed.has(d.object))throw new Error('Variant has no observation-safe disclosure '+d.node);
    }
    for(const e of b.exits){
      const exit=plan.exits.find((p:any)=>p.direction===e.direction),declared=source.exits.find(s=>s.direction===e.direction)!;
      if(e.mode!=='alias'&&e.aliasOf!==null||e.mode!=='continuous'&&e.peer!==null)throw new Error('Unexpected alias/peer '+b.room+':'+e.direction);
      if(e.mode==='alias'){
        const target=b.exits.find(t=>t.direction===e.aliasOf),targetSource=source.exits.find(t=>t.direction===e.aliasOf);
        if(!target||target.mode==='alias'||target.mode==='blocked'||!targetSource||planningHash(declared.view)!==planningHash(targetSource.view))throw new Error('Alias does not share source exit '+e.direction);
        aliases++;continue;
      }
      if(declared.view.kind==='NEXIT'?e.mode!=='blocked':e.mode==='blocked')throw new Error('Blocked binding disagrees with source '+e.direction);
      const doorName=declared.view.kind==='DEXIT'?declared.view.door:null;
      const observableDoor=doorName!==null&&placed.has(doorName)&&sources.contexts.objects.objects.some(o=>o.name===doorName&&!o.flags.includes('ACTORBIT')&&!o.flags.includes('SURFACEBIT')&&o.flags.some(f=>['DOORBIT','CONTBIT'].includes(f)));
      if(!['UEXIT','NEXIT'].includes(declared.view.kind)&&!observableDoor&&e.mode!=='menu-only')pendingStateBindings.push(b.room+':'+e.direction+':passage-disclosure');
      if(e.mode!=='continuous')continue;
      const peer=e.peer&&byRoom.get(e.peer.room),peerPlan=peer&&scenes.get(peer.room),back=peer?.exits.find(p=>p.direction===e.peer!.direction);
      if(!peer||!peerPlan||!b.group||b.group!==peer.group||b.room===peer.room||exit.to!==peer.room||!back||back.mode!=='continuous'||back.peer?.room!==b.room||back.peer.direction!==e.direction)throw new Error('Continuous doorway requires reciprocal grouped rooms '+b.room+':'+e.direction);
      const peerExit=peerPlan.exits.find((p:any)=>p.direction===back.direction);
      if(peerExit.to!==b.room)throw new Error('Continuous doorway disagrees with return destination');
      const peerSource=rooms.get(peer.room)!.exits.find(s=>s.direction===back.direction)!;
      if(declared.view.kind!=='UEXIT'||peerSource.view.kind!=='UEXIT')throw new Error('Conditional doorway requires an observed state binding; use a transition');
      const a=portal(plan,b,e.direction),p=portal(peerPlan,peer,back.direction),angle=((a.yaw-p.yaw)%360+360)%360;
      if(!a.position.every((v,i)=>near(v,p.position[i]!))||!near(a.size[0],p.size[0])||!near(a.size[1],p.size[1])||Math.abs(angle-180)>1)throw new Error('Continuous doorway geometry mismatch '+b.room+':'+e.direction);
      continuous++;
    }
    // Two source directions through the same door must not create overlapping
    // physical crossings. Each additional direction is an explicit alias.
    const doors=new Set<string>();
    for(const e of b.exits.filter(e=>e.mode!=='alias')){
      const view=source.exits.find(s=>s.direction===e.direction)!.view;
      if(view.kind==='DEXIT'){if(doors.has(view.door))throw new Error('Duplicate physical doorway '+view.door);doors.add(view.door);}
    }
    compiled.push({room:b.room,objects:plan.objects.map((o:any)=>({object:o.object,asset:o.asset,anchor:o.anchor,...(b.variants.find(v=>v.object===o.object)?{variant:b.variants.find(v=>v.object===o.object)!.variant}:{})})),attachments:structuredClone(b.attachments),animations:structuredClone(b.animations),
      features:b.disclosures.map(d=>({...d})),exits:plan.exits.map((e:any)=>{const view=source.exits.find(s=>s.direction===e.direction)!.view;
        const door=view.kind==='DEXIT'&&placed.has(view.door)?view.door:null;
        return {node:e.node,direction:e.direction,
        // Every source direction can be offered as an attempt, including a
        // refusal. Its presence in a menu does not disclose a hidden passage.
        physical:(view.kind==='UEXIT'||door!==null)&&!['alias','blocked','menu-only'].includes(b.exits.find(x=>x.direction===e.direction)!.mode),...(door?{openObject:door}:{})};})});
  }
  for(const group of new Set(bindings.scenes.map(b=>b.group).filter(g=>g!==null))){
    const members=bindings.scenes.filter(b=>b.group===group),visited=new Set<string>();
    const visit=(room:string)=>{if(visited.has(room))return;visited.add(room);for(const e of byRoom.get(room)!.exits)if(e.mode==='continuous')visit(e.peer!.room);};
    visit(members[0]!.room);if(visited.size!==members.length)throw new Error('Disconnected shared room group '+group);
  }
  const missingRooms=[...rooms.keys()].filter(r=>!scenes.has(r)).sort();
  if(complete&&missingRooms.length)throw new Error('Incomplete room coverage: '+missingRooms.length+' missing ('+missingRooms.join(', ')+')');
  if(complete&&pendingStateBindings.length)throw new Error('Unresolved observed state bindings: '+pendingStateBindings.join(', '));
  return {format:'zxr-scene-consistency-v1',counts:{rooms:scenes.size,totalRooms:rooms.size,briefs:briefs.size,continuousDoorways:continuous/2,aliases,attachments},missingRooms,
    pendingStateBindings:pendingStateBindings.sort(),
    inputHash:planningHash({documents,bindings}),scenes:compiled.sort((a,b)=>a.room.localeCompare(b.room,'en'))};
}
