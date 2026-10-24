import { ReplayRecorder } from '../engine/replay.ts';
import { mountReplayViewer } from './replay-viewer.ts';
import { mountCapabilities } from './capabilities.ts';
import { buildWordCatalog } from '../engine/index.ts';
import type { GameSession, LoadedGame, ZxrSave } from '../engine/index.ts';
import { mountWordPicker } from '../presentation/word-picker.ts';
import { GameSaves, MAX_SAVE_BYTES } from '../persistence/saves.ts';
import { IndexedDbSaveStore } from '../persistence/indexed-db-save-store.ts';
import { checkpointStamp } from '../persistence/checkpoint-name.ts';
import { TextPlayer } from './controller.ts';
import type { PlayerView } from './controller.ts';
import { resolveHostAsync } from './host.ts';
export function mountBrowserPlayer(container:HTMLElement,game:LoadedGame,session:GameSession,saves=new GameSaves(game,new IndexedDbSaveStore(),()=>localStorage.getItem('zxr-save:'+game.buildHash))){
  const listeners=new Set<(view:PlayerView,busy:boolean)=>void>();
  const player=new TextPlayer(session),catalog=buildWordCatalog(game.bundle.payload.vocabulary);let shown=0,busy=true,initialising=true,disposed=false,fontSize=18;let recorder:ReplayRecorder|undefined;
  const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const button=(label:string,action:()=>void)=>{const b=element('button',label);b.type='button';b.addEventListener('click',action);return b;};
  const toolbar=element('nav');toolbar.setAttribute('aria-label','Player settings');
  const messages=element('p');messages.setAttribute('role','status');messages.setAttribute('aria-label','Player messages');
  const status=element('p');status.setAttribute('aria-label','Game status');
  const transcript=element('section');transcript.className='transcript';transcript.setAttribute('role','log');transcript.setAttribute('aria-label','Game transcript');transcript.setAttribute('aria-live','polite');transcript.tabIndex=0;
  const actions=element('section');actions.className='player-actions';actions.setAttribute('aria-label','Available choices');
  const root=element('div');root.className='text-player';root.style.fontSize=fontSize+'px';root.append(toolbar,messages,status,transcript,actions);container.replaceChildren(root);
  toolbar.append(button('Smaller text',()=>{fontSize=Math.max(14,fontSize-2);root.style.fontSize=fontSize+'px';}),button('Larger text',()=>{fontSize=Math.min(30,fontSize+2);root.style.fontSize=fontSize+'px';}));
  const store={write:(save:ZxrSave)=>saves.writeSource(save),read:()=>saves.readSource()};
  const error=(cause:unknown)=>cause instanceof Error?cause.message:String(cause);
  const identity=()=>{const o=session.observe();return o.epoch+':'+o.revision;};
  const auto=async()=>{try{await saves.autosave(session.exportSave());}catch(cause){messages.textContent=[messages.textContent,'Autosave failed: '+error(cause)].filter(Boolean).join(' ');}};
  const record=()=>{try{recorder?.capture();}catch(cause){recorder=undefined;messages.textContent='Replay recording stopped: '+error(cause);}};
  const run=async(callback:()=>void|Promise<void>)=>{
    if(busy||disposed)return;busy=true;messages.textContent='';const before=identity();render(false);
    try{await callback();if(disposed)return;record();const problem=await resolveHostAsync(player,store);record();if(problem)messages.textContent=problem;
      if(!disposed&&session.observe().state==='input'&&identity()!==before)await auto();
    }catch(cause){messages.textContent=error(cause);}finally{busy=false;render();}
  };
  const download=button('Export save',()=>{try{
    const blob=new Blob([JSON.stringify(session.exportSave())+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=element('a');
    link.href=url;link.download='zork2.save.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);messages.textContent='Save exported.';
  }catch(cause){messages.textContent=error(cause);}});
  const label=element('label','Import save '),upload=element('input');upload.type='file';upload.accept='.json,application/json';upload.setAttribute('aria-label','Import save');label.append(upload);
  upload.addEventListener('change',()=>{const file=upload.files?.[0];if(!file)return;void run(async()=>{
    try{if(file.size>MAX_SAVE_BYTES)throw new Error('Save exceeds 32 MiB');player.importSave(saves.parse(await file.text()));messages.textContent='Save restored.';}
    catch(cause){messages.textContent='Save import failed: '+error(cause);}finally{upload.value='';}
  });});toolbar.append(download,label);
  const checkpointBar=element('nav');checkpointBar.setAttribute('aria-label','Saved games');root.insertBefore(checkpointBar,transcript);
  const nameLabel=element('label','Checkpoint name '),name=element('input');name.type='text';name.maxLength=100;name.setAttribute('aria-label','Checkpoint name');nameLabel.append(name);
  const selectLabel=element('label','Saved checkpoints '),select=element('select');select.setAttribute('aria-label','Saved checkpoints');selectLabel.append(select);
  const refresh=async()=>{const previous=select.value,names=await saves.names();select.replaceChildren(...names.map(n=>{const o=element('option',n);o.value=n;return o;}));if(names.includes(previous))select.value=previous;};
  const saveNamed=button('Save checkpoint',()=>void run(async()=>{const chosen=name.value.trim()||'Checkpoint '+checkpointStamp();await saves.saveNamed(chosen,session.exportSave());await refresh();select.value=chosen;name.value=chosen;messages.textContent='Checkpoint saved.';}));
  const loadNamed=button('Load checkpoint',()=>void run(async()=>{player.importSave(await saves.readNamed(select.value));messages.textContent='Checkpoint loaded.';}));
  const removeNamed=button('Delete checkpoint',()=>void run(async()=>{await saves.removeNamed(select.value);await refresh();messages.textContent='Checkpoint deleted.';}));
  const loadAuto=button('Load autosave',()=>void run(async()=>{const save=await saves.readAutosave();if(!save)throw new Error('No autosave for this build');player.importSave(save);messages.textContent='Autosave restored.';}));
  checkpointBar.append(nameLabel,saveNamed,selectLabel,loadNamed,removeNamed,loadAuto);
  const replayDownload=button('Export replay',()=>{try{if(!recorder)throw new Error('Replay recorder unavailable');const text=JSON.stringify(recorder.bundle())+'\n';if(new TextEncoder().encode(text).byteLength>MAX_SAVE_BYTES)throw new Error('Replay exceeds 32 MiB');const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),link=element('a');link.href=url;link.download='zork2.replay.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);messages.textContent='Replay exported.';}catch(cause){messages.textContent=error(cause);}});toolbar.append(replayDownload);
  const viewer=mountReplayViewer(root,game);
  mountCapabilities(root,game.buildHash);
  let picker:ReturnType<typeof mountWordPicker>|undefined;
  function render(focus=true){
    if(disposed)return;picker?.destroy();picker=undefined;actions.hidden=initialising;root.setAttribute('aria-busy',String(busy));
    for(const entry of player.transcript.slice(shown)){
      const turn=element('div');if(entry.command){const command=element('p','Selected: '+entry.command);command.className='chosen-command';turn.append(command);}
      if(entry.text)turn.append(element('pre',entry.text));transcript.append(turn);
    }if(shown!==player.transcript.length)transcript.scrollTop=transcript.scrollHeight;shown=player.transcript.length;
    const observation=session.observe();status.textContent=(observation.perception.room?.name??'Darkness')+' · Moves: '+observation.moves;
    download.disabled=upload.disabled=name.disabled=saveNamed.disabled=loadAuto.disabled=busy||observation.state!=='input';
    replayDownload.disabled=busy||!recorder;
    select.disabled=busy;loadNamed.disabled=removeNamed.disabled=busy||observation.state!=='input'||!select.options.length;
    const view=player.view(),heading=element('h2',view.title);heading.tabIndex=-1;actions.replaceChildren(heading);
    if(view.state==='input'){
      const controls=element('nav');controls.className='sentence-controls';controls.setAttribute('aria-label','Sentence controls');
      const finish=button('Finish sentence (Enter)',()=>void run(()=>{player.finish();}));finish.disabled=busy||!view.canFinish;if(view.finishLabel)finish.title=view.finishLabel;
      const cancel=button('Cancel sentence (Esc)',()=>void run(()=>{player.cancel();}));cancel.disabled=busy||!view.canCancel;
      controls.append(finish,cancel);actions.append(controls);
    }
    for(const [index,c] of view.choices.entries()){
      const control=button((index<9?`${index+1}. `:'')+c.label,()=>void run(()=>player.choose(c.key)));control.disabled=busy;
      if(c.label.startsWith('More actions'))control.setAttribute('aria-expanded','false');if(c.label==='Fewer actions')control.setAttribute('aria-expanded','true');actions.append(control);
    }
    if(view.words){const words=element('div');actions.append(words);picker=mountWordPicker(words,catalog,word=>{if(!busy)void run(()=>player.addWord(word.dictionaryIndex));});for(const b of words.querySelectorAll('button'))b.disabled ||=busy;}
    if(focus)heading.focus({preventScroll:true});
    for(const listener of listeners)listener(view,busy);
  }
  const shortcut=(event:KeyboardEvent)=>{
    if(busy||event.repeat||event.altKey||event.ctrlKey||event.metaKey||(event.target instanceof Element&&event.target.closest('input,textarea,select,[data-replay-viewer],[data-capabilities]')))return;
    if(event.key==='Escape'&&player.view().canCancel){event.preventDefault();void run(()=>{player.cancel();});return;}
    if(event.key==='Enter'&&!(event.target instanceof Element&&event.target.closest('button,a,summary'))){
      event.preventDefault();if(player.view().canFinish)void run(()=>{player.finish();});else messages.textContent='Choose the remaining parts of the sentence before finishing.';return;
    }
    if(!/^[1-9]$/.test(event.key))return;
    const control=actions.querySelectorAll<HTMLButtonElement>(':scope > button')[Number(event.key)-1];if(control&&!control.disabled){event.preventDefault();control.click();}
  };root.addEventListener('keydown',shortcut);render(false);
  const ready=(async()=>{
    try{const saved=await saves.readAutosave();if(disposed)return;if(saved){player.importSave(saved);player.transcript.splice(0,1);transcript.replaceChildren();shown=0;messages.textContent='Autosave restored.';}await auto();}
    catch(cause){messages.textContent='Autosave could not be loaded: '+error(cause);}
    try{await refresh();}catch(cause){messages.textContent=[messages.textContent,'Saved games unavailable: '+error(cause)].filter(Boolean).join(' ');}
    try{recorder=new ReplayRecorder(game,session);}catch(cause){messages.textContent=[messages.textContent,'Replay recording unavailable: '+error(cause)].filter(Boolean).join(' ');}
    busy=false;initialising=false;render();
  })();
  return {player,ready,
    subscribe(listener:(view:PlayerView,busy:boolean)=>void){listeners.add(listener);listener(player.view(),busy);return ()=>{listeners.delete(listener);};},
    choose(key:string){return run(()=>player.choose(key));},
    finish(){return run(()=>{player.finish();});},cancel(){return run(()=>{player.cancel();});},
    openObject(id:string){return run(()=>player.openObject(id));},walk(direction:string){return run(()=>player.walk(direction));},
    destroy(){disposed=true;listeners.clear();viewer.destroy();picker?.destroy();root.removeEventListener('keydown',shortcut);root.remove();}};
}
export type BrowserPlayer=ReturnType<typeof mountBrowserPlayer>;
