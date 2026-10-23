import './style.css';
import { GameSession, loadGame } from './engine/index.ts';
import { mountBrowserPlayer } from './player/browser.ts';
const start=document.querySelector<HTMLButtonElement>('#start')!,status=document.querySelector<HTMLElement>('#loading')!,target=document.querySelector<HTMLElement>('#player')!;
start.addEventListener('click',async()=>{
  start.disabled=true;status.textContent='Loading Zork II…';
  try{
    const response=await fetch(import.meta.env.BASE_URL+'games/zork2.zxb');if(!response.ok)throw new Error('Unable to load story bundle');
    const game=loadGame(new Uint8Array(await response.arrayBuffer())),session=new GameSession(game);
    mountBrowserPlayer(target,game,session);document.querySelector<HTMLElement>('#welcome')!.hidden=true;
    target.querySelector<HTMLElement>('h2')?.focus();
  }catch(error){status.textContent=error instanceof Error?error.message:String(error);start.disabled=false;}
});
