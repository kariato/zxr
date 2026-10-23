import { actionLabel, walkLabel } from '../../src/engine/labels.ts';
import { choicePage } from '../../src/engine/menu.ts';
import type { ActionFamily } from '../../src/engine/candidates.ts';
import type { Vocabulary } from '../../src/zil/vocabulary.ts';
import type { WorldMetadata } from '../../src/zil/world.ts';
import { mountChoiceMenu } from '../../src/presentation/choice-menu.ts';
const [vocabulary,world]=await Promise.all([
  fetch(new URL('../../games/zork2/vocabulary.zxr.json',import.meta.url)).then(r=>r.json()) as Promise<Vocabulary>,
  fetch(new URL('../../games/zork2/world.zxr.json',import.meta.url)).then(r=>r.json()) as Promise<WorldMetadata>,
]);
const family=(name:string,syntax:number):ActionFamily=>{
  const row=vocabulary.verbs.find(v=>v.name===name)!.rows.find(r=>r.id===syntax)!;
  return {id:name+':'+syntax,lexicalTable:name,syntax,verb:row.action.name,input:['SAY','ANSWER','INCANT'].includes(row.action.name)?'say':'act',shadowedBy:null,
    handler:'',preaction:null,slots:row.slots.map(slot=>({preposition:slot.preposition?.name??null,find:null,possession:[],scopeHints:[],many:slot.rules.includes('MANY')}))};
};
const context={player:'ADVENTURER',names:Object.fromEntries(world.entities.map(e=>[e.name,e.shortName.text]))};
const labels=[actionLabel(family('TAKE',8),'PLAYER',['LAMP'],undefined,context),
  actionLabel(family('PUT',7),'ROBOT',['KEY','TEAPOT'],undefined,context),walkLabel('PLAYER','WEST',context),
  actionLabel(family('SAY',1),'PLAYER',[],undefined,context),actionLabel(family('SAY',1),'PLAYER',[],['W','WEST'],context),
  actionLabel(family('TAKE',8),'PLAYER',['LAMP'],undefined,{...context,names:{...context.names,LAMP:'<img src=x onerror="alert(1)">'}})];
const output=document.querySelector('output')!;
mountChoiceMenu(document.querySelector<HTMLElement>('#menu')!,choicePage(labels.map(label=>({label,placement:'primary' as const}))),entry=>entry.label,entry=>{output.textContent=entry.label;},'Action labels');
