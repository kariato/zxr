import type { GateRule, GateTarget } from '../zil/gates.ts';
import type { GameAction, Operand, Selection } from './action-plan.ts';
import type { ActionFamily, CandidateSet } from './candidates.ts';
import type { SelectionView } from './selection.ts';

export interface GateProbe {actor?:string;verb?:string;direct?:Selection;indirect?:Selection;words?:readonly string[]}
export interface GatePlacement {placement:'primary'|'more';gates:string[]}
export const GATE_RANK_PENALTY=1000000;
const identity=(operand:Operand)=>typeof operand==='string'?operand:'pseudo' in operand?operand.pseudo.room+'/'+operand.pseudo.word:operand.object;
const matchesSelection=(values:readonly string[],selection:Selection|undefined)=>selection==='ALL'||selection!==undefined&&(Array.isArray(selection)?selection:[selection]).some(o=>values.includes(identity(o)));
function matches(target:GateTarget,probe:GateProbe):boolean {
  return (!target.verbs||probe.verb!==undefined&&target.verbs.includes(probe.verb))&&
    (!target.actors||probe.actor!==undefined&&target.actors.includes(probe.actor))&&
    (!target.direct||matchesSelection(target.direct,probe.direct))&&(!target.indirect||matchesSelection(target.indirect,probe.indirect))&&
    (!target.words||!!probe.words?.some(word=>target.words!.includes(word)));
}
export function gatePlacement(rules:readonly GateRule[],known:readonly string[],probe:GateProbe):GatePlacement {
  const learned=new Set(known),gates=rules.filter(r=>!learned.has(r.id)&&r.targets.some(t=>matches(t,probe))).map(r=>r.id);
  return {placement:gates.length?'more':'primary',gates};
}
/** Learn only from output being installed at a successful committed boundary. */
export function learnKnowledge(rules:readonly GateRule[],known:readonly string[],text:string):string[] {
  return [...new Set([...known,...rules.filter(r=>r.learn.some(clue=>text.includes(clue))).map(r=>r.id)])].sort();
}
export function validateKnowledge(rules:readonly GateRule[],known:readonly string[]):void {
  const ids=new Set(rules.map(r=>r.id));
  if(new Set(known).size!==known.length||known.some(id=>!ids.has(id))||known.some((id,i)=>i>0&&known[i-1]!>=id))throw new Error('Invalid saved knowledge');
}
export function actionProbe(action:GameAction,player:string):GateProbe {
  return {actor:action.actor==='PLAYER'?player:action.actor,verb:action.kind==='walk'?'WALK':action.verb,
    ...(action.kind==='walk'?{}:{direct:action.prso,indirect:action.kind==='act'?action.prsi:undefined,words:action.kind==='say'?action.words:undefined})};
}
const compare=(a:{placement?:string;score:number},b:{placement?:string;score:number})=>Number(a.placement==='more')-Number(b.placement==='more')||b.score-a.score;
const compareName=(a:string,b:string)=>a<b?-1:a>b?1:0;
const rank=(score:number,placement:GatePlacement)=>({...placement,score:score-(placement.gates.length?GATE_RANK_PENALTY:0)});
const baseScore=(item:{score:number;gates?:string[]})=>item.score+(item.gates?.length?GATE_RANK_PENALTY:0);
/** Ranking and placement only. Every family and every operand is retained. */
export function rankKnowledgeCandidates(set:CandidateSet,rules:readonly GateRule[],known:readonly string[]):CandidateSet {
  return {...set,exits:set.exits.map(exit=>({...exit,...gatePlacement(rules,known,{actor:set.actor,verb:'WALK'})})),families:set.families.map(f=>{
    const base={actor:set.actor,verb:f.verb};
    return {...f,...rank(baseScore(f),gatePlacement(rules,known,base)),operands:f.operands.map((list,index)=>list.map(o=>({...o,
      ...rank(baseScore(o),gatePlacement(rules,known,{...base,...(index===0?{direct:o.operand}:{indirect:o.operand})})),
    })).sort((a,b)=>compare(a,b)||compareName(identity(a.operand),identity(b.operand))))};
  }).sort((a,b)=>compare(a,b)||compareName(a.id,b.id))};
}
export function rankKnowledgeSelection(view:SelectionView,family:ActionFamily|undefined,actor:string,rules:readonly GateRule[],known:readonly string[]):SelectionView {
  const base:GateProbe={actor,verb:family?.verb??'WALK',direct:view.selected[0],indirect:view.selected[1],words:view.words?.map(w=>w.word)};
  return {...view,...gatePlacement(rules,known,base),next:view.next?{...view.next,choices:view.next.choices.map(o=>({...o,
    ...rank(baseScore(o),gatePlacement(rules,known,{...base,...(view.next!.index===0?{direct:o.operand}:{indirect:o.operand})})),
  })).sort((a,b)=>compare(a,b)||compareName(identity(a.operand),identity(b.operand)))}:null};
}
