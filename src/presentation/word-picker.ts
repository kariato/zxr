import { wordPage } from '../engine/word-picker.ts';
import type { WordCatalog, WordChoice, WordQuery } from '../engine/word-picker.ts';
import './word-picker.css';

/** Touch-first presenter. Prefix/page state is local UI data, never a game action. */
export function mountWordPicker(container:HTMLElement,catalog:WordCatalog,onChoose:(word:WordChoice)=>void) {
  let query:WordQuery={prefix:'',offset:0,limit:24},disposed=false;
  const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
  const button=(text:string,action:()=>void)=>{const element=node('button',text);element.type='button';element.addEventListener('click',action);return element;};
  function render(){
    if(disposed)return;const active=container.contains(document.activeElement)?document.activeElement:null,focus=active?.getAttribute('aria-label')??active?.textContent;
    const page=wordPage(catalog,query),root=node('section');root.className='word-picker';root.setAttribute('aria-label','Vocabulary word picker');
    root.append(node('h2','Choose words'),node('p','Browse the vocabulary or tap the first letters to narrow the list.'));
    const status=node('p',`${page.prefix?`Starts with ${page.prefix.toLowerCase()}. `:''}${page.matchingWords} words in ${page.totalGroups} groups.`);
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
    const alphabet=node('nav');alphabet.className='word-picker-letters';alphabet.setAttribute('aria-label','Filter by first letters');
    for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$'){
      const control=button(letter,()=>{query={...query,prefix:page.prefix+letter,offset:0};render();});
      control.setAttribute('aria-label','Add '+letter+' to filter');control.disabled=page.prefix.length>=32;alphabet.append(control);
    }root.append(alphabet);
    const filters=node('div');filters.className='word-picker-controls';
    const back=button('Delete last letter',()=>{query={...query,prefix:page.prefix.slice(0,-1),offset:0};render();});back.disabled=!page.prefix;
    const clear=button('Clear filter',()=>{query={...query,prefix:'',offset:0};render();});clear.disabled=!page.prefix;filters.append(back,clear);root.append(filters);
    const groups=node('div');groups.className='word-picker-groups';
    for(const group of page.groups){
      const fieldset=node('fieldset');fieldset.append(node('legend',group.label));
      for(const word of group.words){
        const control=button(word.label,()=>onChoose({...word}));control.disabled=!word.selectable;
        if(!word.selectable)control.title='Separator or interpreter control; unavailable as a quoted word';fieldset.append(control);
      }groups.append(fieldset);
    }
    if(!page.groups.length)groups.append(node('p','No words match these first letters. Delete a letter or clear the filter.'));root.append(groups);
    const paging=node('nav');paging.className='word-picker-controls';paging.setAttribute('aria-label','Vocabulary pages');
    const previous=button('Previous words',()=>{query={...query,offset:Math.max(0,page.offset-page.limit)};render();});previous.disabled=page.offset===0;
    const next=button('Next words',()=>{query={...query,offset:page.offset+page.limit};render();});next.disabled=page.offset+page.limit>=page.totalGroups;
    paging.append(previous,next);root.append(paging);container.replaceChildren(root);
    if(focus){const target=[...root.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')??b.textContent)===focus&&!b.disabled);target?.focus({preventScroll:true});}
  }
  render();return {
    setQuery(next:WordQuery){wordPage(catalog,next);query={...next};render();},
    destroy(){disposed=true;container.replaceChildren();},
  };
}
