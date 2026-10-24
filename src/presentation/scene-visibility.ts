import type { ScopeObservation } from '../engine/scope.ts';
import type { AppearanceObservation,ObjectAppearance } from '../engine/appearance.ts';

export interface AnimationBinding {object:string;property:'open'|'on';whenTrue:string;whenFalse:string}

/** Compiled presentation bindings contain no world flags, globals or routines. */
export interface SceneVisibility {
  room:string;
  objects:{object:string;asset:string;anchor:string;variant?:string}[];
  attachments:{object:string;parent:string;socket:string}[];
  features:{node:string;object:string}[];
  exits:{node:string;direction:string;physical:boolean;openObject?:string}[];
  animations?:AnimationBinding[];
}
/** A complete replacement set for one observation, never accumulated knowledge.
 * Offered exits come from the current engine options, not static source exits.
 * They are attempts, not evidence that a concealed passage exists. Only exits
 * explicitly compiled as physical may supply crossing targets here.
 * No crossing or game action is executed by this function. */
export function selectSceneNodes(scene:SceneVisibility,observation:ScopeObservation,offeredExits:readonly string[],appearance:readonly ObjectAppearance[]=[]){
  if(!observation.lit||observation.room?.id!==scene.room)return {objects:[],features:[],exits:[]} as {objects:string[];features:string[];exits:string[]};
  const visible=new Set(observation.objects.filter(o=>o.visible).map(o=>o.id));
  const parents=new Map(scene.attachments.map(a=>[a.object,a.parent]));
  const shown=(object:string,seen=new Set<string>()):boolean=>{
    if(!visible.has(object)||seen.has(object))return false;
    seen.add(object);const parent=parents.get(object);return parent===undefined||shown(parent,seen);
  };
  const offered=new Set(offeredExits);
  const states=new Map(appearance.map(a=>[a.id,a]));
  return {objects:scene.objects.filter(o=>shown(o.object)).map(o=>o.object),
    features:scene.features.filter(f=>shown(f.object)).map(f=>f.node),
    exits:scene.exits.filter(e=>e.physical&&offered.has(e.direction)&&(!e.openObject||shown(e.openObject)&&states.get(e.openObject)?.open===true)).map(e=>e.node)};
}

/** State poses are selected from one current observation, never inferred from
 * an attempted action or its prose. Missing state clears the previous clip. */
export function selectSceneAppearance(scene:SceneVisibility,current:AppearanceObservation,offeredExits:readonly string[]){
  const nodes=selectSceneNodes(scene,current.perception,offeredExits,current.appearance),shown=new Set(nodes.objects),states=new Map(current.appearance.map(a=>[a.id,a]));
  const clips=(scene.animations??[]).flatMap(b=>{
    const value=states.get(b.object)?.[b.property];
    return shown.has(b.object)&&typeof value==='boolean'?[{object:b.object,clip:value?b.whenTrue:b.whenFalse}]:[];
  });
  return {...nodes,clips};
}
