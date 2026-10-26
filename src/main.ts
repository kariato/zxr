import './style.css';
import { GameSession, loadGame } from './engine/index.ts';
import { mountRoomNarration,unlockNarrationAudio } from './presentation/audio/browser.ts';
import { mountBrowserPlayer } from './player/browser.ts';
import barrowDressingUrl from './prototype/assets/barrow-natural-v2.glb?url';
import ravineModelUrl from '../games/zork2/planning/scenes/lower-ravine/mesh-v2/lower-ravine-v2.glb?url';
import gardenModelUrl from '../games/zork2/planning/scenes/underground-garden/mesh-v2/underground-garden-v2.glb?url';
import cavernModelUrl from './prototype/assets/narrow-tunnel-room-v1.glb?url';
import princessModelUrl from './prototype/assets/princess-v1.glb?url';
import { movablePropUrls } from './prototype/movable-props.ts';
// The large animated actor and environment keep software-renderer fallbacks.
// Movable models use the same registry in normal and automated browsers.
const generatedModels={...(navigator.webdriver?{}:{barrowDressingUrl,princessModelUrl}),cavernModelUrl,gardenModelUrl,ravineModelUrl,propModelUrls:movablePropUrls};
const start=document.querySelector<HTMLButtonElement>('#start')!,status=document.querySelector<HTMLElement>('#loading')!,target=document.querySelector<HTMLElement>('#player')!;
const newGame=document.querySelector<HTMLButtonElement>('#new-game')!;
async function openGame(restoreAutosave:boolean){
  const narrationAudio=unlockNarrationAudio();
  start.disabled=newGame.disabled=true;status.textContent='Loading Zork II…';
  try{
    const response=await fetch(import.meta.env.BASE_URL+'games/zork2.zxb');if(!response.ok)throw new Error('Unable to load story bundle');
    const game=loadGame(new Uint8Array(await response.arrayBuffer()));
    const labelResponse=await fetch(import.meta.env.BASE_URL+'presentation/labels.json');
    let labels;if(labelResponse.ok){const {format,buildHash,actions,decisions}=await labelResponse.json();if(format!=='zxr-labels-v1'||buildHash!==game.buildHash)throw new Error('Label assets do not match this game');labels={actions,decisions};}
    const session=new GameSession(game,{labels});
    const player=mountBrowserPlayer(target,game,session,undefined,{restoreAutosave});document.querySelector<HTMLElement>('#welcome')!.hidden=true;
    await player.ready;
    mountRoomNarration(target,session,player,narrationAudio);
    try{const {mountPrototype}=await import('./prototype/view.ts');mountPrototype(target,session,player,generatedModels);}
    catch{status.textContent='3D could not be loaded. The text player is ready.';status.hidden=false;target.prepend(status);}
    target.querySelector<HTMLElement>('h2')?.focus();
  }catch(error){void narrationAudio?.close();status.textContent=error instanceof Error?error.message:String(error);start.disabled=newGame.disabled=false;}
}
start.addEventListener('click',()=>void openGame(true));
newGame.addEventListener('click',()=>void openGame(false));
// Imported asset URLs must be ready before a click can start the player.
status.textContent='Ready to play.';
start.disabled=newGame.disabled=false;
