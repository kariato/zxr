import type { ChoicePage } from '../engine/menu.ts';
import './choice-menu.css';

/** Browsing is local UI state. Choosing calls the host; it never executes a turn. */
export function mountChoiceMenu<T>(container:HTMLElement,page:ChoicePage<T>,label:(choice:T)=>string,onChoose:(choice:T)=>void,title='Actions') {
  const data=structuredClone(page);let disposed=false,expanded=false;
  const root=document.createElement('section');root.className='choice-menu';root.setAttribute('aria-label',title);
  const heading=document.createElement('h2');heading.textContent=title;root.append(heading);
  const list=(choices:T[])=>{
    const ul=document.createElement('ul');
    for(const choice of choices){
      const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=label(choice);
      button.addEventListener('click',()=>{if(!disposed)onChoose(structuredClone(choice));});li.append(button);ul.append(li);
    }
    return ul;
  };
  root.append(list(data.primary));
  if(data.more.length){
    const control=document.createElement('button'),extra=list(data.more);extra.hidden=true;extra.setAttribute('aria-label','More actions');
    control.type='button';control.textContent=`More actions (${data.more.length})`;control.setAttribute('aria-expanded','false');
    control.addEventListener('click',()=>{
      expanded=!expanded;extra.hidden=!expanded;control.setAttribute('aria-expanded',String(expanded));
      control.textContent=expanded?'Fewer actions':`More actions (${data.more.length})`;
    });root.append(control,extra);
  }
  if(!data.total){const empty=document.createElement('p');empty.textContent='No actions available.';root.append(empty);}
  container.replaceChildren(root);
  return {destroy(){disposed=true;root.remove();}};
}
