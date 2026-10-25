import '../../src/style.css';
import { GameSession,loadGame,WorldState } from '../../src/engine/index.ts';
import { mountBrowserPlayer } from '../../src/player/browser.ts';
import { mountPrototype } from '../../src/prototype/view.ts';
import { GameSaves } from '../../src/persistence/saves.ts';
const start=document.querySelector<HTMLButtonElement>('#start')!,status=document.querySelector<HTMLElement>('#loading')!;
start.addEventListener('click',async()=>{
  start.disabled=true;status.textContent='Loading the lair…';
  try{
    const response=await fetch('/games/zork2.zxb');if(!response.ok)throw new Error('Unable to load game');
    const game=loadGame(new Uint8Array(await response.arrayBuffer())),session=new GameSession(game);session.opening();
    // Test fixture only: no teleport/debug hooks are added to the production game.
    const save=session.exportSave(),world=WorldState.restore(game,save.checkpoint.interpreter.world);
    const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
    const flag=(name:string)=>game.bundle.payload.symbols.symbols.find(s=>s.kind==='attribute'&&s.name===name)!.number!;
    world.move(world.global('PLAYER'),id('DRAGON-LAIR'));world.setGlobal('HERE',id('DRAGON-LAIR'));
    world.move(id('LAMP'),world.global('PLAYER'));world.setFlag(id('LAMP'),flag('ONBIT'),true);
    save.checkpoint.interpreter.world=world.snapshot();session.importSave(save);
    const data=new Map<string,string>(),saves=new GameSaves(game,{async read(k){return data.get(k)??null;},async write(k,v){data.set(k,v);},async remove(k){data.delete(k);},async keys(){return [...data.keys()];}});
    const host=document.querySelector<HTMLElement>('#player')!,player=mountBrowserPlayer(host,game,session,saves);await player.ready;
    const menu=player.player.view().choices.find(c=>c.label.startsWith('Menu:'))!;await player.choose(menu.key);
    const look=session.candidates().families.find(f=>f.verb==='LOOK'&&f.slots.length===0&&!f.shadowedBy)!;
    const choice=player.player.view().choices.find(c=>c.target?.family===look.id)!;await player.choose(choice.key);await player.finish();
    const animated=new URLSearchParams(location.search).get('princess')==='animated';
    status.textContent=animated?'Loading the animated princess…':'Temporary preview ready. Left-click the princess or chest for source actions.';
    mountPrototype(host,session,player,animated?{
      princessModelUrl:'/out/asset-tools/princess/princess-v1.glb',
      onPrincessStatus(state){status.textContent=state==='ready'?'Animated princess ready: idle plays automatically. Use “Preview princess gesture” or “Princess close-up”. Local standing-pose audition; no seated/walking clip yet.':state==='failed'?'Local model unavailable; showing the procedural princess instead.':'Loading the animated princess…';},
    }:{});start.hidden=true;
  }catch(error){status.textContent=error instanceof Error?error.message:String(error);start.disabled=false;}
});
