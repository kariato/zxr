import { choicePage } from '../../src/engine/menu.ts';
import { mountChoiceMenu } from '../../src/presentation/choice-menu.ts';
const entries=Array.from({length:20},(_,n)=>({key:n,label:'Action '+(n+1),placement:n===1?'more' as const:'primary' as const}));
const output=document.querySelector('output')!;
mountChoiceMenu(document.querySelector<HTMLElement>('#menu')!,choicePage(entries),entry=>entry.label,entry=>{output.textContent=entry.label;},'Lamp actions');
