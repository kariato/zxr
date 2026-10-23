import { actionLabel, operandLabel, walkLabel } from './labels.ts';
import type { LabelContext } from './labels.ts';
import { canonicalJson } from '../zil/integrity.ts';
import type { Operand } from './action-plan.ts';
import type { CandidateFamily, CandidateSet } from './candidates.ts';
import { gatePlacement, GATE_RANK_PENALTY } from './knowledge.ts';
import type { GateRule } from '../zil/gates.ts';
import { operandIdentity } from './selection.ts';
import type { OperandChoice, SelectionRequest, SelectionView } from './selection.ts';

export interface MenuPolicy {firstPageSize?:number}
/** Expanding more exposes the entire remainder in one step; no hidden page cursor. */
export interface ChoicePage<T> {primary:T[];more:T[];total:number;hasMore:boolean}
export interface MenuChoice {
  /** A browsing key, never an executable option ID. */
  key:string;label:string;draft:SelectionRequest;score:number;placement:'primary'|'more';gates:string[];
}
export interface ActionMenu {
  expected:SelectionRequest['expected'];buildHash:string;actor:string;firstPageSize:number;
  objects:{operand:Operand;label:string;choices:ChoicePage<MenuChoice>}[];
  /** Action-first path also preserves MANY/ALL and lexical alternatives. */
  actions:ChoicePage<MenuChoice>;always:ChoicePage<MenuChoice>;exits:ChoicePage<MenuChoice>;
}
export type PagedSelection=Omit<SelectionView,'next'>&{next:(Omit<NonNullable<SelectionView['next']>,'choices'>&{choices:ChoicePage<OperandChoice>})|null};
const own=<T>(value:T):T=>JSON.parse(canonicalJson(value)) as T;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const raw=(item:{score:number;gates?:string[]})=>item.score+(item.gates?.length?GATE_RANK_PENALTY:0);
export function firstPageSize(policy:MenuPolicy={}):number {
  if(policy===null||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).some(k=>k!=='firstPageSize'))throw new Error('Invalid menu policy');
  const size=policy.firstPageSize===undefined?8:policy.firstPageSize;
  if(!Number.isInteger(size)||size<6||size>8)throw new Error('First page size must be 6, 7 or 8');
  return size;
}
/** Preserve input order and every entry; gates never fill spare primary slots. */
export function choicePage<T extends {placement?:'primary'|'more'}>(items:readonly T[],policy:MenuPolicy={}):ChoicePage<T> {
  const size=firstPageSize(policy),primary:T[]=[],more:T[]=[];
  for(const item of items)(item.placement!=='more'&&primary.length<size?primary:more).push(own(item));
  return {primary,more,total:items.length,hasMore:more.length>0};
}
const alwaysVerbs=new Set(['LOOK','INVENTORY','WAIT','SCORE','SAVE']);
/** Independent per-object lists, never a product of two operand lists. */
export function buildActionMenu(set:CandidateSet,expected:SelectionRequest['expected'],rules:readonly GateRule[],known:readonly string[],policy:MenuPolicy={},labels?:LabelContext):ActionMenu {
  const size=firstPageSize(policy),actor=set.actor;
  // Shadowed syntax rows remain in the audit; the planner accepts only the
  // source's first equivalent row, and select() already rejects the others.
  const families=set.families.filter(f=>!f.shadowedBy),always=(f:CandidateFamily)=>f.slots.length===0&&alwaysVerbs.has(f.verb);
  const direct=new Map(families.map(f=>[f.id,{best:f.operands[0]?.length?Math.max(...f.operands[0].map(raw)):0,
    scores:new Map((f.operands[0]??[]).map(o=>[operandIdentity(o.operand),raw(o)]))}]));
  const choice=(family:CandidateFamily,operand?:Operand):MenuChoice=>{
    const placement=gatePlacement(rules,known,{actor,verb:family.verb,...(operand===undefined?{}:{direct:operand})});
    // Replace the first slot's best score with this object's score. Other slots
    // stay independent until the player selects them; no success prediction.
    const index=direct.get(family.id)!,selected=operand===undefined?undefined:index.scores.get(operandIdentity(operand));
    const score=raw(family)-(selected===undefined?0:index.best-selected)-(placement.gates.length?GATE_RANK_PENALTY:0);
    return {key:family.id,label:actionLabel(family,actor,operand===undefined?[]:[operand],undefined,labels),draft:{expected:own(expected),actor,family:family.id,operands:operand===undefined?[]:[own(operand)]},score,...placement};
  };
  const sort=(items:MenuChoice[])=>items.sort((a,b)=>Number(a.placement==='more')-Number(b.placement==='more')||b.score-a.score||compare(a.key,b.key));
  const objects=new Map<string,{operand:Operand;choices:MenuChoice[]}>();
  for(const f of families)for(const o of f.operands[0]??[]){
    const id=operandIdentity(o.operand),group=objects.get(id)??{operand:o.operand,choices:[]};
    group.choices.push(choice(f,o.operand));objects.set(id,group);
  }
  return {expected:own(expected),buildHash:set.buildHash,actor,firstPageSize:size,
    objects:[...objects].sort(([a],[b])=>compare(a,b)).map(([,group])=>({operand:own(group.operand),label:operandLabel(group.operand,labels),choices:choicePage(sort(group.choices),policy)})),
    actions:choicePage(sort(families.filter(f=>!always(f)).map(f=>choice(f))),policy),
    always:choicePage(sort(families.filter(always).map(f=>choice(f))),policy),
    exits:choicePage(set.exits.map(exit=>({key:'walk:'+exit.direction,label:walkLabel(actor,exit.direction,labels),draft:{expected:own(expected),actor,family:'walk:'+exit.direction,operands:[]},
      score:0,placement:exit.placement??'primary',gates:[...(exit.gates??[])]})).sort((a,b)=>compare(a.key,b.key)),policy)};
}
export function pageSelection(view:SelectionView,policy:MenuPolicy={}):PagedSelection {
  firstPageSize(policy);
  const result=own(view);
  return {...result,next:result.next?{...result.next,choices:choicePage(result.next.choices,policy)}:null};
}
