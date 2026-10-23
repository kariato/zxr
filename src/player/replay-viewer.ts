import { ReplayPlayback } from '../engine/replay.ts';
import type { LoadedGame } from '../engine/bundle-loader.ts';
import { MAX_SAVE_BYTES } from '../persistence/saves.ts';
/** Playback owns a separate engine and has no storage or live-player callbacks. */
export function mountReplayViewer(container:HTMLElement,game:LoadedGame){
  let playback:ReplayPlayback|undefined,timer:ReturnType<typeof setTimeout>|undefined,playing=false,disposed=false,generation=0;
  const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=element('details'),summary=element('summary','Replay');root.dataset.replayViewer='';root.append(summary);container.append(root);
  const controls=element('nav');controls.setAttribute('aria-label','Replay controls');
  const status=element('p','Import a replay to begin.');status.setAttribute('role','status');status.setAttribute('aria-label','Replay status');
  const stateHash=element('p');stateHash.setAttribute('aria-label','Replay state hash');stateHash.setAttribute('aria-live','off');
  const transcript=element('section');transcript.className='transcript';transcript.setAttribute('role','log');transcript.setAttribute('aria-label','Replay transcript');transcript.setAttribute('aria-live','polite');transcript.tabIndex=0;
  const button=(name:string,callback:()=>void)=>{const b=element('button',name);b.type='button';b.addEventListener('click',callback);return b;};
  const stop=()=>{playing=false;if(timer!==undefined)clearTimeout(timer);timer=undefined;};
  const update=(message?:string)=>{
    step.disabled=play.disabled=!playback||playing||playback.done||!!playback.failure;pause.disabled=!playing;reset.disabled=!playback;
    stateHash.textContent=playback?'Hash '+playback.session.stateHash():'';
    if(message)status.textContent=message;
    else if(playback)status.textContent=playback.failure?.message??`${playback.done?'Complete':playing?'Playing':'Paused'} · Input ${playback.position}/${playback.length}`;
  };
  const append=(text:string,label?:string)=>{const entry=element('div');if(label)entry.append(element('p','Selected: '+label));if(text)entry.append(element('pre',text));transcript.append(entry);transcript.scrollTop=transcript.scrollHeight;};
  const advance=()=>{try{const result=playback?.step();if(result)append(result.packet.text.join(''),result.label);if(playback?.done)stop();update();}catch(cause){stop();update(cause instanceof Error?cause.message:String(cause));}};
  const schedule=()=>{if(playing)timer=setTimeout(()=>{timer=undefined;if(disposed)return;advance();schedule();},1000/Number(speed.value));};
  const step=button('Step replay',advance),play=button('Play replay',()=>{if(!playback||playback.done||playback.failure)return;playing=true;update();schedule();});
  const pause=button('Pause replay',()=>{stop();update();}),reset=button('Restart replay',()=>{if(playback)load(playback.bundle());});
  const label=element('label','Replay speed '),speed=element('select');speed.setAttribute('aria-label','Replay speed');
  for(const value of [0.5,1,2,4]){const option=element('option',value+'×');option.value=String(value);speed.append(option);}speed.value='1';label.append(speed);
  speed.addEventListener('change',()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;schedule();});
  const fileLabel=element('label','Import replay '),upload=element('input');upload.type='file';upload.accept='.json,application/json';upload.setAttribute('aria-label','Import replay');fileLabel.append(upload);
  upload.addEventListener('change',()=>void (async()=>{
    const file=upload.files?.[0],id=++generation;if(!file)return;
    try{if(file.size>MAX_SAVE_BYTES)throw new Error('Replay exceeds 32 MiB');const text=await file.text();if(disposed||id!==generation)return;load(JSON.parse(text));}
    catch(cause){if(!disposed&&id===generation){stop();update('Replay import failed: '+(cause instanceof Error?cause.message:String(cause)));}}
    finally{if(id===generation)upload.value='';}
  })());
  controls.append(fileLabel,step,play,pause,reset,label);root.append(controls,status,stateHash,transcript);update();
  function load(value:unknown){
    if(disposed)return;const candidate=new ReplayPlayback(game,value);stop();playback=candidate;transcript.replaceChildren();
    append(candidate.opening.text.join(''),candidate.bundle().start.kind==='save'?'Replay starts from a checkpoint':undefined);root.open=true;update();
  }
  return {load,destroy(){disposed=true;generation++;stop();root.remove();}};
}
