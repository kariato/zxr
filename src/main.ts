import './style.css';
import { GameSession, loadGame } from './engine/index.ts';
import { mountRoomNarration,unlockNarrationAudio } from './presentation/audio/browser.ts';
import { mountBrowserPlayer } from './player/browser.ts';
import barrowDressingUrl from './prototype/assets/barrow-natural-v2.glb?url';
import princessModelUrl from './prototype/assets/princess-v1.glb?url';
import chestModelUrl from './prototype/assets/chest-v1.glb?url';
import lampModelUrl from './prototype/assets/lamp-v1.glb?url';
import swordModelUrl from './prototype/assets/sword-v1.glb?url';
// Automated browsers keep procedural models: CI's software renderer is too slow for generated ones.
const generatedModels=navigator.webdriver?{}:{barrowDressingUrl,princessModelUrl,propModelUrls:{CHEST:chestModelUrl,LAMP:lampModelUrl,SWORD:swordModelUrl}};
const start=document.querySelector<HTMLButtonElement>('#start')!,status=document.querySelector<HTMLElement>('#loading')!,target=document.querySelector<HTMLElement>('#player')!;
start.addEventListener('click',async()=>{
  const narrationAudio=unlockNarrationAudio();
  start.disabled=true;status.textContent='Loading Zork II…';
  try{
    const response=await fetch(import.meta.env.BASE_URL+'games/zork2.zxb');if(!response.ok)throw new Error('Unable to load story bundle');
    const game=loadGame(new Uint8Array(await response.arrayBuffer()));
    const labelResponse=await fetch(import.meta.env.BASE_URL+'presentation/labels.json');
    let labels;if(labelResponse.ok){const {format,buildHash,actions,decisions}=await labelResponse.json();if(format!=='zxr-labels-v1'||buildHash!==game.buildHash)throw new Error('Label assets do not match this game');labels={actions,decisions};}
    const session=new GameSession(game,{labels});
    const player=mountBrowserPlayer(target,game,session);document.querySelector<HTMLElement>('#welcome')!.hidden=true;
    await player.ready;
    mountRoomNarration(target,session,player,narrationAudio);
    try{const {mountPrototype}=await import('./prototype/view.ts');mountPrototype(target,session,player,generatedModels);}
    catch{status.textContent='3D could not be loaded. The text player is ready.';status.hidden=false;target.prepend(status);}
    target.querySelector<HTMLElement>('h2')?.focus();
  }catch(error){void narrationAudio?.close();status.textContent=error instanceof Error?error.message:String(error);start.disabled=false;}
});
