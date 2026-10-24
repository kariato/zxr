import './style.css';
import { GameSession, loadGame } from './engine/index.ts';
import { mountBrowserPlayer } from './player/browser.ts';
const start=document.querySelector<HTMLButtonElement>('#start')!,status=document.querySelector<HTMLElement>('#loading')!,target=document.querySelector<HTMLElement>('#player')!;
start.addEventListener('click',async()=>{
  start.disabled=true;status.textContent='Loading Zork II…';
  try{
    const response=await fetch(import.meta.env.BASE_URL+'games/zork2.zxb');if(!response.ok)throw new Error('Unable to load story bundle');
    const game=loadGame(new Uint8Array(await response.arrayBuffer()));
    const labelResponse=await fetch(import.meta.env.BASE_URL+'presentation/labels.json');
    let labels;if(labelResponse.ok){const {format,buildHash,actions,decisions}=await labelResponse.json();if(format!=='zxr-labels-v1'||buildHash!==game.buildHash)throw new Error('Label assets do not match this game');labels={actions,decisions};}
    const session=new GameSession(game,{labels});
    const player=mountBrowserPlayer(target,game,session);document.querySelector<HTMLElement>('#welcome')!.hidden=true;
    await player.ready;
    try{const {mountPrototype}=await import('./prototype/view.ts');mountPrototype(target,session,player);}
    catch{status.textContent='3D could not be loaded. The text player is ready.';status.hidden=false;target.prepend(status);}
    target.querySelector<HTMLElement>('h2')?.focus();
  }catch(error){status.textContent=error instanceof Error?error.message:String(error);start.disabled=false;}
});
