import type { GameSession } from '../../engine/index.ts';
import type { BrowserPlayer } from '../../player/browser.ts';
import { FirstRoomNarration } from './first-room.ts';
import narrationUrl from './assets/inside-barrow-opening.mp3?url';

/** Call synchronously from Start so iOS/Safari can unlock audio on the gesture. */
export function unlockNarrationAudio():AudioContext|undefined {
  try{const context=new AudioContext();void context.resume().catch(()=>{});return context;}catch{return undefined;}
}
export function mountRoomNarration(host:HTMLElement,session:GameSession,player:BrowserPlayer,context?:AudioContext){
  const root=document.createElement('section');root.setAttribute('aria-label','Room narration');
  const controls=document.createElement('nav'),replay=document.createElement('button'),mute=document.createElement('button'),status=document.createElement('p');
  replay.type=mute.type='button';replay.textContent='Replay room narration';mute.textContent='Mute narration';mute.setAttribute('aria-pressed','false');status.setAttribute('role','status');
  controls.append(replay,mute);root.append(controls,status);host.prepend(root);
  let audio=context,source:AudioBufferSourceNode|undefined,buffer:Promise<AudioBuffer>|undefined;
  const stop=()=>{if(source){source.onended=null;source.stop();source.disconnect();source=undefined;}};
  const narration=new FirstRoomNarration({stop,async play(current){
    audio??=new AudioContext();await audio.resume();
    if(!current())return false;
    const ctx=audio;
    buffer??=fetch(narrationUrl).then(async response=>{if(!response.ok)throw new Error('Narration unavailable');return ctx.decodeAudioData(await response.arrayBuffer());}).catch(error=>{buffer=undefined;throw error;});
    const decoded=await buffer;
    if(!current())return false;
    if(ctx.state!=='running')throw new Error('Audio playback needs a user gesture');
    const node=ctx.createBufferSource();node.buffer=decoded;node.connect(ctx.destination);source=node;
    node.onended=()=>{if(source===node){source=undefined;node.disconnect();status.textContent='Room narration finished.';}};
    node.start();return true;
  }},text=>{status.textContent=text;});
  const refresh=()=>{const view=session.observe();narration.update(view);root.hidden=view.perception.room?.id!=='INSIDE-BARROW';replay.disabled=!narration.eligible||narration.muted;};
  replay.addEventListener('click',()=>void narration.play());
  mute.addEventListener('click',()=>{narration.toggleMute();mute.textContent=narration.muted?'Unmute narration':'Mute narration';mute.setAttribute('aria-pressed',String(narration.muted));refresh();});
  const unsubscribe=player.subscribe(refresh);
  return {destroy(){unsubscribe();narration.dispose();void audio?.close();root.remove();}};
}
