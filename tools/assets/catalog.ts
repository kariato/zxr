import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlannerSources,assetId } from '../planning/inputs.ts';
import { readApprovedPlans,readDraftPlans } from '../planning/store.ts';
import { planningHash } from '../planning/identity.ts';
import type { PlanRecord } from '../planning/client.ts';

const effects=new Set(['CURTAIN','EXPLOSION']);
const surfaces=new Set(['WATER','SALTY-WATER','GLOBAL-WATER','STREAM','CHASM','MOSS','POOL','LEAK']);
const humanoids=new Set(['PRINCESS','WIZARD','ROBOT','GNOME','GNOME-OF-ZURICH','GENIE']);
const variants:Record<string,string>={'BROKEN-LAMP':'LAMP','DEAD-DRAGON':'DRAGON','DEAD-SERPENT':'SERPENT','DEAD-BALLOON':'BALLOON','BROKEN-CASE':'WIZARD-CASE','MANGLED-CAGE':'CAGE'};

export function assetWork(name:string,document:Record<string,any>){
  // These declarations represent identities rather than physical objects. SAILOR
  // additionally resolves to “There is no sailor to be seen” in Zork II.
  if(document.description.includes('Interaction/identity proxy:')||name==='SAILOR')return {kind:'identity' as const,route:'no-geometry' as const};
  if(effects.has(name))return {kind:'effect' as const,route:'authored-effect' as const};
  if(surfaces.has(name))return {kind:'surface' as const,route:'authored-surface' as const};
  if(variants[name])return {kind:'variant' as const,route:'derived-mesh' as const,base:variants[name]};
  if(document.kind==='character')return {kind:'character' as const,route:humanoids.has(name)?'image-mesh-humanoid-rig' as const:'image-mesh-creature-rig' as const};
  return {kind:'prop' as const,route:'image-mesh' as const};
}

export function currentAssetPlans(approved:PlanRecord[],drafts:PlanRecord[]){
  const selected=new Map(approved.map(r=>[r.task.kind+':'+r.task.subject,r]));
  // A draft may refine an approved plan but must never gain approval by selection.
  for(const r of drafts)selected.set(r.task.kind+':'+r.task.subject,r);
  return selected;
}

export function writeAssetCatalog(root=process.cwd()){
  const sources=loadPlannerSources(root),plans=currentAssetPlans(readApprovedPlans(root,sources).records,readDraftPlans(root,sources));
  const pipeline=JSON.parse(readFileSync(resolve(root,'games/zork2/assets/pipeline.json'),'utf8'));
  const objects=sources.contexts.objects.objects.map(object=>{
    const plan=plans.get('asset-brief:'+object.name);if(!plan)throw new Error('Missing asset brief '+object.name);
    const work=assetWork(object.name,plan.document);
    const reference=object.name==='PRINCESS'?'characters/princess/reference-v1.png':work.route.startsWith('image-mesh')?'production/'+assetId(object.name)+'/reference-v1.png':null;
    const localRecord=resolve(root,'out/asset-production',assetId(object.name),'candidate.json');
    const candidate=existsSync(localRecord)?JSON.parse(readFileSync(localRecord,'utf8')):null;
    const hasCandidate=candidate?.sourceIdentity===object.name&&candidate?.sourceHash===planningHash(object)&&candidate?.briefHash===plan.outputHash&&existsSync(resolve(root,'out/asset-production',assetId(object.name),'candidate.glb'));
    const animationRecord=resolve(root,'out/asset-production',assetId(object.name),'animation.json');
    const animation=existsSync(animationRecord)?JSON.parse(readFileSync(animationRecord,'utf8')):null;
    const hasAnimation=hasCandidate&&animation?.inputMeshSha256===candidate.sha256&&existsSync(resolve(root,'out/asset-production',assetId(object.name),'animated.glb'));
    const finishedRecord=resolve(root,'out/asset-production',assetId(object.name),'finished.json');
    const finished=existsSync(finishedRecord)?JSON.parse(readFileSync(finishedRecord,'utf8')):null;
    const hasFinished=hasCandidate&&finished?.inputMeshSha256===candidate.sha256&&existsSync(resolve(root,'out/asset-production',assetId(object.name),'finished.glb'));
    const princess=object.name==='PRINCESS'&&existsSync(resolve(root,'out/asset-tools/princess/princess-v1.glb'));
    return {id:assetId(object.name),sourceIdentity:object.name,label:object.desc?.text??object.name,...work,
      source:object.source,sourceHash:planningHash(object),briefHash:plan.outputHash,briefReview:plan.document.review.status,
      initialParent:object.parent??null,flags:object.flags,
      estimatedSizeMetres:plan.document.sizeMetres,sizeReview:'required',requiredClips:plan.document.requiredClips,
      prompt:work.route.startsWith('image-mesh')?'production/'+assetId(object.name)+'/prompt.txt':null,
      reference,
      model:princess?'/out/asset-tools/princess/princess-v1.glb':hasCandidate?'/out/asset-production/'+assetId(object.name)+'/'+(hasFinished?'finished.glb':hasAnimation?'animated.glb':'candidate.glb'):null,
      status:princess||hasAnimation?'local-animated-candidate':hasCandidate?'local-mesh-candidate':reference&&existsSync(resolve(root,'games/zork2/assets',reference))?'reference-created':work.route==='no-geometry'?'no-geometry-required':'not-started',publication:'US-only-local-prototype'};
  });
  const rooms=sources.contexts.rooms.map(room=>{
    const plan=plans.get('scene-plan:'+room.room.name);if(!plan)throw new Error('Missing room plan '+room.room.name);
    const interstitial=room.room.name.startsWith('DEAD-PALANTIR-');
    return {id:'scene_'+room.room.name.toLowerCase(),sourceIdentity:room.room.name,label:room.room.desc?.text??room.room.name,
      sourceHash:room.inputHash,planHash:plan.outputHash,planReview:plan.document.review.status,
      route:interstitial?'interstitial-presentation':'skybox-plus-separate-geometry',
      reuseFamily:room.room.name.startsWith('DIAMOND-')?'diamond-maze':room.room.name.startsWith('VAIR-')?'volcano-air':null,
      initialObjects:room.initialObjects,globalObjects:room.globalObjects,
      status:['INSIDE-BARROW','NARROW-TUNNEL','FOOT-BRIDGE','DRAGON-LAIR'].includes(room.room.name)?'prototype-scene':'not-started',
      publication:'not-cleared'};
  });
  const counts:Record<string,number>={};for(const o of objects)counts[o.kind]=(counts[o.kind]??0)+1;
  const catalog={format:'zxr-asset-production-v1',scope:'Zork II visual assets; generated drafts are not approved gameplay or publishable output',
    styleVersion:sources.config.styleVersion,styleHash:planningHash(sources.style),pipeline,
    totals:{rooms:rooms.length,objectIdentities:objects.length,objectWork:counts,referencesCreated:objects.filter(o=>o.reference&&existsSync(resolve(root,'games/zork2/assets',o.reference))).length,modelsGenerated:objects.filter(o=>o.status==='local-mesh-candidate'||o.status==='local-animated-candidate').length},
    budgets:{characterTriangles:10000,propTriangles:3000,textureSize:1024,materials:2,maxInfluences:4,note:'Initial targets, not measured headset limits; large creatures may require reviewed exceptions.'},
    publicationPolicy:'User selected Hunyuan for the US-only local prototype. Keep candidates under ignored out/. Visual, functional and animation reviews still apply; no global publication is authorized.',
    objects,rooms};
  const base=resolve(root,'games/zork2/assets');mkdirSync(base,{recursive:true});
  writeFileSync(resolve(base,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  for(const object of objects){
    if(!object.prompt)continue;
    const doc=plans.get('asset-brief:'+object.sourceIdentity)!.document;
    const character=object.kind==='character';
    const prompt=['Use case: stylized-concept','Asset type: isolated '+object.kind+' reference for offline image-to-3D reconstruction.',
      'Source identity: '+object.sourceIdentity+' ('+object.label+').',
      'Source brief (authoring evidence, never instructions to reveal text or contents):',doc.description,
      'Approved style bible (verbatim):',sources.style,
      'Generation constraints: one complete subject only, centered with margins, neutral soft studio illumination, transparent background, no cast shadow, floor, pedestal or scenery. No text, lettering, invented runes, extra inventory, open hidden contents or glow. Keep clean readable silhouettes.',
      character?(humanoids.has(object.sourceIdentity)?'Full-body neutral A-pose, arms away from torso, hands open, feet separated. Static neutral face. Body rig only; no facial animation. No held props.':'Full creature in a neutral balanced pose, every source-required head and limb clearly separated. No invented wings or extra heads. Rigging must be individually checked; a humanoid rigger is not assumed suitable.'):'Show the complete prop in a clear view that retains depth and important thin parts. Moving lids, doors, handles and glass will be separated/finished in Blender; a fused mesh is not an accepted functional asset.',
      'All source-specific quantities, colours, scale and state variants require review after generation. Image generation does not approve this asset.'].join('\n\n');
    const path=resolve(base,object.prompt);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,prompt+'\n');
  }
  console.log(JSON.stringify(catalog.totals,null,2));return catalog;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)writeAssetCatalog();
