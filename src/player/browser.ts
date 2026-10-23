import { buildWordCatalog } from '../engine/index.ts';
import type { GameSession, LoadedGame, ZxrSave } from '../engine/index.ts';
import { mountWordPicker } from '../presentation/word-picker.ts';
import { TextPlayer } from './controller.ts';
import { resolveHost } from './host.ts';
export function mountBrowserPlayer(container:HTMLElement,game:LoadedGame,session:GameSession){
  const player=new TextPlayer(session),catalog=buildWordCatalog(game.bundle.payload.vocabulary);let shown=0,busy=false,fontSize=18;
  const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const button=(label:string,action:()=>void)=>{const b=element('button',label);b.type='button';b.addEventListener('click',action);return b;};
  const toolbar=element('nav');toolbar.setAttribute('aria-label','Player settings');
  const messages=element('p');messages.setAttribute('role','status');messages.setAttribute('aria-label','Player messages');
  const status=element('p');status.setAttribute('aria-label','Game status');
  const transcript=element('section');transcript.className='transcript';transcript.setAttribute('role','log');transcript.setAttribute('aria-label','Game transcript');transcript.setAttribute('aria-live','polite');transcript.tabIndex=0;
  const actions=element('section');actions.className='player-actions';actions.setAttribute('aria-label','Available choices');
  const root=element('div');root.className='text-player';root.style.fontSize=fontSize+'px';root.append(toolbar,messages,status,transcript,actions);container.replaceChildren(root);
  toolbar.append(button('Smaller text',()=>{fontSize=Math.max(14,fontSize-2);root.style.fontSize=fontSize+'px';}),button('Larger text',()=>{fontSize=Math.min(30,fontSize+2);root.style.fontSize=fontSize+'px';}));
  const saveKey='zxr-save:'+game.buildHash;
  const store={write:(save:ZxrSave)=>localStorage.setItem(saveKey,JSON.stringify(save)),read:()=>{const text=localStorage.getItem(saveKey);if(!text)throw new Error('No saved game for this build');return JSON.parse(text) as ZxrSave;}};
  const error=(cause:unknown)=>{messages.textContent=cause instanceof Error?cause.message:String(cause);};
  const run=(callback:()=>void)=>{if(busy)return;messages.textContent='';try{callback();const problem=resolveHost(player,store);if(problem)messages.textContent=problem;}catch(cause){error(cause);}render();};
  const download=button('Export save',()=>{try{
    const blob=new Blob([JSON.stringify(session.exportSave())+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=element('a');
    link.href=url;link.download='zork2.save.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);messages.textContent='Save exported.';
  }catch(cause){error(cause);}});
  const label=element('label','Import save '),upload=element('input');upload.type='file';upload.accept='.json,application/json';upload.setAttribute('aria-label','Import save');label.append(upload);
  upload.addEventListener('change',async()=>{
    const file=upload.files?.[0];if(!file||busy)return;busy=true;messages.textContent='Importing save…';render(false);
    try{if(file.size>32*1024*1024)throw new Error('Save exceeds 32 MiB');player.importSave(JSON.parse(await file.text()) as ZxrSave);const problem=resolveHost(player,store);messages.textContent=problem??'Save restored.';}catch(cause){messages.textContent='Save import failed: '+(cause instanceof Error?cause.message:String(cause));}
    finally{busy=false;upload.value='';render();}
  });toolbar.append(download,label);
  let picker:ReturnType<typeof mountWordPicker>|undefined;
  function render(focus=true){
    picker?.destroy();picker=undefined;
    for(const entry of player.transcript.slice(shown)){
      const turn=element('div');if(entry.command){const command=element('p','Selected: '+entry.command);command.className='chosen-command';turn.append(command);}
      if(entry.text)turn.append(element('pre',entry.text));transcript.append(turn);
    }if(shown!==player.transcript.length)transcript.scrollTop=transcript.scrollHeight;shown=player.transcript.length;
    const observation=session.observe();status.textContent=(observation.perception.room?.name??'Darkness')+' · Moves: '+observation.moves;
    download.disabled=upload.disabled=busy||observation.state!=='input';
    const view=player.view(),heading=element('h2',view.title);heading.tabIndex=-1;actions.replaceChildren(heading);
    for(const [index,c] of view.choices.entries()){
      const control=button((index<9?`${index+1}. `:'')+c.label,()=>run(()=>player.choose(c.key)));control.disabled=busy;
      if(c.label.startsWith('More actions'))control.setAttribute('aria-expanded','false');if(c.label==='Fewer actions')control.setAttribute('aria-expanded','true');actions.append(control);
    }
    if(view.words){const words=element('div');actions.append(words);picker=mountWordPicker(words,catalog,word=>run(()=>player.addWord(word.dictionaryIndex)));}
    if(focus)heading.focus({preventScroll:true});
  }
  const shortcut=(event:KeyboardEvent)=>{
    if(busy||event.repeat||event.altKey||event.ctrlKey||event.metaKey||!/^[1-9]$/.test(event.key)||(event.target instanceof Element&&event.target.closest('input,textarea,select')))return;
    const control=actions.querySelectorAll<HTMLButtonElement>(':scope > button')[Number(event.key)-1];if(control&&!control.disabled){event.preventDefault();control.click();}
  };root.addEventListener('keydown',shortcut);render(false);
  return {player,destroy(){picker?.destroy();root.removeEventListener('keydown',shortcut);root.remove();}};
}
