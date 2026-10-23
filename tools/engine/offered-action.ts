import { canonicalJson } from '../../src/zil/integrity.ts';
import { isDeepStrictEqual } from 'node:util';
import type { LoadedGame, GameAction, Operand, Selection } from '../../src/engine/index.ts';
import { operandIdentity } from '../../src/engine/index.ts';
import type { TextPlayer, PlayerChoice } from '../../src/player/controller.ts';
/** Only choose controls currently returned by the real shell controller. */
export function commitOfferedAction(game:LoadedGame,player:TextPlayer,action:GameAction) {
  const path:{key:string;label:string;target?:PlayerChoice['target']}[]=[];
  const pick=(match:(choice:PlayerChoice)=>boolean,description:string)=>{
    const choices=player.view().choices.filter(match);
    if(choices.length!==1)throw new Error(`Offered choice ${description}: expected one, found ${choices.length}`);
    const c=choices[0]!;path.push(c);player.choose(c.key);
  };
  const label=(text:string)=>pick(c=>c.label===text,text);
  const expand=()=>{if(player.view().choices.some(c=>c.label.startsWith('More actions')))pick(c=>c.label.startsWith('More actions'),'more');};
  const find=(match:(choice:PlayerChoice)=>boolean,description:string)=>{if(!player.view().choices.some(match))expand();pick(match,description);};
  const session=player.session;
  if(action.kind!=='walk'&&game.bundle.payload.vocabulary.verbs.find(v=>v.name===action.lexicalTable)?.rows.find(r=>r.id===action.syntax)?.action.name!==action.verb)throw new Error('Authored source action does not match its family');
  if(action.actor!=='PLAYER'){
    if(!session.actors().some(a=>a.actor===action.actor))throw new Error('Actor not offered: '+action.actor);
    label('Change actor');find(c=>c.target?.actor===action.actor,'actor '+action.actor);
  }
  const family=action.kind==='walk'?'walk:'+action.direction:action.lexicalTable+':'+action.syntax;
  const inAlways=action.kind==='act'&&action.prso===undefined&&['LOOK','INVENTORY','WAIT','SCORE','SAVE'].includes(action.verb);
  label(action.kind==='walk'?'Exits':inAlways?'Menu: look, inventory, wait, score, save':'Actions');
  find(c=>c.target?.family===family,family);
  const placement=path.at(-1)!.target!.placement;if(!placement)throw new Error('Family has no placement');
  if(action.kind!=='walk'){
    const bindings=[action.prso,...(action.kind==='act'?[action.prsi]:[])].filter((s):s is Selection=>s!==undefined);
    for(const binding of bindings){
      if(binding==='ALL'){pick(c=>c.target?.all===true,'ALL');continue;}
      const select=(operand:Operand,multiple=false)=>{
        find(c=>!!c.target?.operand&&operandIdentity(c.target.operand)===operandIdentity(operand),'operand '+operandIdentity(operand));
        if(!multiple&&player.view().choices.some(c=>c.target?.spelling))pick(c=>isDeepStrictEqual(c.target?.spelling,operand),'source spelling '+JSON.stringify(operand));

      };
      if(Array.isArray(binding)){label('Choose multiple objects');for(const o of binding)select(o,true);label('Use selected objects');}
      else select(binding);
    }
    if(action.kind==='say'){
      if(action.continuation)throw new Error('Authored quoted continuation has no shell control');
      if(!player.view().words)throw new Error('Word picker not offered');
      for(const word of action.words){
        const entry=session.words({prefix:word}).groups.flatMap(g=>g.words).find(w=>w.word===word&&w.selectable);
        if(!entry)throw new Error('Word not offered: '+word);path.push({key:'word:'+entry.dictionaryIndex,label:entry.label});player.addWord(entry.dictionaryIndex);
      }
    }
  }
  const before=session.acceptedInputs().length;pick(c=>c.target?.commit===true,'commit');
  const result=player.lastResult;if(result.status==='error'||result.status==='rejected')throw new Error('Offered commit failed: '+result.error?.cause);
  if(session.acceptedInputs().length!==before+1)throw new Error('Commit did not record exactly one input');
  const entry=session.acceptedInputs().at(-1)!;
  const expected=action.kind==='walk'?[]:[action.prso,...(action.kind==='act'?[action.prsi]:[])].filter(s=>s!==undefined);
  if(entry.kind!=='selection'||!isDeepStrictEqual(entry.request.operands,expected))throw new Error('Shell changed an authored operand spelling');
  const expectedAction={...action,actor:action.actor==='PLAYER'?session.observe().perception.actor:action.actor};
  if(entry.optionId!=='zxr-action-v1:'+canonicalJson(expectedAction))throw new Error('Shell changed the authored action identity');
  return {result,path,family,placement};
}
