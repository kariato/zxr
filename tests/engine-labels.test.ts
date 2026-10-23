import { expect, it } from 'vitest';
import { GameSession, WorldState, actionLabel, buildCandidateCatalog, createLabelContext, loadGame, operandLabel, selectionLabel, walkLabel } from '../src/engine/index.ts';
import type { ChoicePage, LabelContext, SelectionRequest } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),catalog=buildCandidateCatalog(game);
const family=(id:string)=>catalog.families.find(f=>f.id===id)!;
const all=<T>(page:ChoicePage<T>)=>[...page.primary,...page.more];
const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
const draft=(s:GameSession,family:string,operands:SelectionRequest['operands']=[],actor='PLAYER',words?:string[]):SelectionRequest=>{
  const {epoch,revision}=s.observe();return {expected:{epoch,revision},actor,family,operands,...(words?{words:words.map(name=>game.bundle.payload.vocabulary.words.find(w=>w.name===name)!.dictionaryIndex)}:{})};
};
function position(s:GameSession,room:string,inventory:string[]=[]){
  const save=s.exportSave(),w=WorldState.restore(game,save.checkpoint.interpreter.world);w.move(w.global('PLAYER'),id(room));w.setGlobal('HERE',id(room));w.setGlobal('WINNER',w.global('PLAYER'));
  for(const item of inventory)w.move(id(item),w.global('PLAYER'));
  save.checkpoint.interpreter.world=w.snapshot();s.importSave(save);
}
it('labels all 269 syntax rows with all 165 object names and every direction without executing source routines',()=>{
  const s=new GameSession(game),world=WorldState.restore(game,s.exportSave().checkpoint.interpreter.world);
  const objects=game.bundle.payload.world.entities.filter(e=>e.kind==='object').map(e=>e.name);expect(objects).toHaveLength(165);
  const context=createLabelContext(game,world,'ADVENTURER',objects),before=world.snapshot();
  for(const f of catalog.families){
    const empty=actionLabel(f,'PLAYER',[],undefined,context);expect(empty.trim()).not.toBe('');expect(empty).not.toMatch(/undefined|null|V\?/);
    for(const object of objects){
      const selected=f.slots.map(()=>object),label=actionLabel(f,'PLAYER',selected,undefined,context);
      expect(label.trim()).not.toBe('');if(f.slots.length)expect(label).toContain(operandLabel(object,context));
    }
  }
  for(const direction of catalog.directions)expect(walkLabel('PLAYER',direction,context)).toBe('Go: '+direction.toLowerCase());
  expect(world.snapshot()).toEqual(before);
});
it('uses lexical verbs, both source prepositions, actor names and explicit missing-slot placeholders',()=>{
  const context:LabelContext={player:'ADVENTURER',names:{LAMP:'brass lantern',SWORD:'sword',ROBOT:'robot',TEAPOT:'china teapot',KEY:'small key'}};
  expect(actionLabel(family('LOOK:12'),'PLAYER',[],undefined,context)).toBe('Look');
  expect(actionLabel(family('TAKE:8'),'PLAYER',['LAMP'],undefined,context)).toBe('Take: brass lantern');
  expect(actionLabel(family('PUT:7'),'PLAYER',['KEY'],undefined,context)).toBe('Put: small key in [object]');
  expect(actionLabel(family('PUT:7'),'ROBOT',['KEY','TEAPOT'],undefined,context)).toBe('robot — Put: small key in china teapot');
  const withFirstPrep=catalog.families.find(f=>f.lexicalTable==='LOOK'&&f.slots[0]?.preposition==='AT'&&f.slots.length===1)!;
  expect(actionLabel(withFirstPrep,'ADVENTURER',['LAMP'],undefined,context)).toBe('Look at: brass lantern');
  expect(walkLabel('ROBOT','WEST',context)).toBe('robot — Go: west');
  expect(selectionLabel(['LAMP','SWORD'],context)).toBe('brass lantern, sword');expect(selectionLabel('ALL',context)).toBe('all objects');
  expect(operandLabel({pseudo:{room:'RIDDLE-ROOM',word:'WALL'}},context)).toBe('wall');
  expect(operandLabel({object:'LAMP',noun:'LANTERN',adjective:'BRASS'},context)).toBe('brass lantern');
});
it('labels live menus, unbound and completed stages, all operands, actors and vocabulary while keeping unknown words neutral',()=>{
  const s=new GameSession(game),menu=s.menu();
  for(const choice of [...all(menu.actions),...all(menu.always),...all(menu.exits)])expect(choice.label.trim()).not.toBe('');
  for(const group of menu.objects){expect(group.label.trim()).not.toBe('');for(const choice of all(group.choices))expect(choice.label).toContain(group.label);}
  const lamp=menu.objects.find(g=>g.operand==='LAMP')!,take=all(lamp.choices).find(c=>c.key==='TAKE:8')!;
  expect(lamp.label).toBe('lamp');expect(take.label).toBe('Take: lamp');expect(s.select(take.draft).label).toBe(take.label);
  const stage=s.select(draft(s,'PUT:7',['LAMP']));expect(stage.label).toBe('Put: lamp in [object]');
  for(const choice of stage.next!.choices)expect(choice.label.trim()).not.toBe('');
  const paged=s.selectionMenu(draft(s,'PUT:7',['LAMP']));expect(all(paged.next!.choices).map(c=>c.label).sort()).toEqual(stage.next!.choices.map(c=>c.label).sort());
  for(const f of catalog.families.filter(f=>f.input==='say'&&!f.shadowedBy)){
    const label=actionLabel(f,'PLAYER');expect(label).toContain('[words]');expect(label).not.toMatch(/well|float/i);
  }
  expect(s.select(draft(s,'ANSWER:2')).label).toBe('Answer: [words]');
  expect(s.select(draft(s,'ANSWER:2',[],'PLAYER',['WELL'])).label).toBe('Answer: “well”');
  expect(s.select(draft(s,'SAY:1',[],'PLAYER',['W','WEST','W'])).label).toBe('Say: “w west w”');
  expect(s.actors().every(a=>a.label.length)).toBe(true);expect(s.words().groups.every(g=>g.words.every(w=>w.label.length))).toBe(true);
});
it('reads current short names and stays pure across menus, stages, saves and replay logs',()=>{
  const s=new GameSession(game),save=s.exportSave(),world=WorldState.restore(game,save.checkpoint.interpreter.world);
  const address=game.bundle.payload.memory.objects.find(o=>o.id===id('LAMP'))!.propertyTable;
  world.putWord(address+1,0,65535); // one end-marked z-text word, "zzz"; property offsets stay fixed
  save.checkpoint.interpreter.world=world.snapshot();s.importSave(save);
  const before={state:s.stateHash(),save:s.exportSave(),log:s.acceptedInputs(),observation:s.observe()};
  const menu=s.menu(),lamp=menu.objects.find(g=>g.operand==='LAMP')!;expect(lamp.label).toBe('zzz');
  expect(all(lamp.choices).find(c=>c.key==='TAKE:8')!.label).toBe('Take: zzz');
  expect(s.select(draft(s,'TAKE:8',['LAMP'])).label).toBe('Take: zzz');s.selectionMenu(draft(s,'PUT:7',['LAMP']));
  expect({state:s.stateHash(),save:s.exportSave(),log:s.acceptedInputs(),observation:s.observe()}).toEqual(before);
  lamp.label='changed by caller';all(lamp.choices)[0]!.label='changed';expect(s.menu().objects.find(g=>g.operand==='LAMP')!.label).toBe('zzz');
});
it('uses actor-relative names and pseudo vocabulary without revealing remote contents or description text',()=>{
  const s=new GameSession(game);position(s,'MAGNET-ROOM',['TEAPOT']);
  const menu=s.menu('ROBOT');expect(all(menu.exits).find(c=>c.key==='walk:WEST')!.label).toBe('robot — Go: west');
  for(const c of [...all(menu.actions),...all(menu.always)])expect(c.label.startsWith('robot — ')).toBe(true);
  expect(menu.objects.some(g=>g.operand==='BALLOON-LABEL')).toBe(false);
  expect(JSON.stringify(menu)).not.toContain('To activate me, say the following:');
  const pseudoRoom=game.bundle.payload.world.entities.find(e=>e.kind==='room'&&e.properties.some(p=>p.kind==='pseudos'&&p.entries.length))!;
  position(s,pseudoRoom.name);const groups=s.menu().objects.filter(g=>typeof g.operand!=='string'&&'pseudo' in g.operand);
  expect(groups.length).toBeGreaterThan(0);for(const g of groups){expect(g.label).not.toContain(pseudoRoom.name);expect(g.label).not.toMatch(/[A-Z]/);}
});
it('keeps labels outside IDs, accepted actions and saves, and accepts unchanged drafts after display text is edited',()=>{
  const first=new GameSession(game),second=new GameSession(game),menu=first.menu();
  const take=all(menu.objects.find(g=>g.operand==='LAMP')!.choices).find(c=>c.key==='TAKE:8')!;
  take.label='Any display text';const a=first.commitSelection(take.draft),b=second.commitSelection(draft(second,'TAKE:8',['LAMP'],'ADVENTURER'));
  expect(a.status).toBe('resolved');expect(a.optionId).toBe(b.optionId);expect(first.stateHash()).toBe(second.stateHash());
  expect(first.acceptedInputs()).toEqual(second.acceptedInputs());expect(first.exportSave()).toEqual(second.exportSave());
  expect(GameSession.replay(game,{},first.acceptedInputs()).stateHash()).toBe(first.stateHash());
  expect(JSON.stringify(first.exportSave())).not.toContain('Any display text');
});
