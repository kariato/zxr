import '../../src/style.css';
import { GameSession,loadGame,WorldState } from '../../src/engine/index.ts';
import { mountBrowserPlayer } from '../../src/player/browser.ts';
import { mountPrototype } from '../../src/prototype/view.ts';
import { GameSaves } from '../../src/persistence/saves.ts';
const start=document.querySelector<HTMLButtonElement>('#start')!,status=document.querySelector<HTMLElement>('#status')!;
const original=document.querySelector<HTMLButtonElement>('#original')!,natural=document.querySelector<HTMLButtonElement>('#natural')!;
const bridge=new URLSearchParams(location.search).get('room')==='foot-bridge';
if(bridge)document.querySelector('#title')!.textContent='Existing wooden foot bridge: reference inspection';
start.addEventListener('click',async()=>{
  start.disabled=true;status.textContent='Loading a temporary source session…';
  try{
    const response=await fetch('/games/zork2.zxb');if(!response.ok)throw new Error('Unable to load game');
    const game=loadGame(new Uint8Array(await response.arrayBuffer())),session=new GameSession(game);session.opening();
    if(bridge){
      const save=session.exportSave(),world=WorldState.restore(game,save.checkpoint.interpreter.world);
      const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
      const flag=(name:string)=>game.bundle.payload.symbols.symbols.find(s=>s.kind==='attribute'&&s.name===name)!.number!;
      world.move(world.global('PLAYER'),id('FOOT-BRIDGE'));world.setGlobal('HERE',id('FOOT-BRIDGE'));
      world.move(id('LAMP'),world.global('PLAYER'));world.setFlag(id('LAMP'),flag('ONBIT'),true);save.checkpoint.interpreter.world=world.snapshot();session.importSave(save);
    }
    const data=new Map<string,string>(),saves=new GameSaves(game,{async read(k){return data.get(k)??null;},async write(k,v){data.set(k,v);},async remove(k){data.delete(k);},async keys(){return [...data.keys()];}});
    const host=document.querySelector<HTMLElement>('#player')!,player=mountBrowserPlayer(host,game,session,saves);await player.ready;
    if(bridge){
      const menu=player.player.view().choices.find(c=>c.label.startsWith('Menu:'))!;await player.choose(menu.key);
      const look=session.candidates().families.find(f=>f.verb==='LOOK'&&f.slots.length===0&&!f.shadowedBy)!;
      await player.choose(player.player.view().choices.find(c=>c.target?.family===look.id)!.key);await player.finish();
    }
    let view:ReturnType<typeof mountPrototype>|undefined;
    const show=(generated:boolean)=>{
      view?.destroy();
      status.textContent=generated?'Loading generated rock assembly…':'Original scene geometry.';
      view=mountPrototype(host,session,player,generated?{barrowDressingUrl:'/out/asset-production/barrow-natural-v2/barrow-natural-v2.glb',onBarrowStatus(state){status.textContent=state==='ready'?'Blended arch, cave floor and rocks ready. Original skybox and source actions preserved.':state==='failed'?'Assembly unavailable; showing original geometry.':'Loading generated rock assembly…';}}:{});
    };
    original.addEventListener('click',()=>show(false));natural.addEventListener('click',()=>show(true));original.hidden=natural.hidden=bridge;
    show(!bridge);start.hidden=true;
  }catch(error){status.textContent=error instanceof Error?error.message:String(error);start.disabled=false;}
});
