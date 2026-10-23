import { expect, it } from 'vitest';
import { GameSession, WorldState, buildActionMenu, choicePage, loadGame, operandIdentity, pageSelection } from '../src/engine/index.ts';
import type { ChoicePage } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
const bundle=compileSourcePath('reference/zork2'),game=loadGame(packBundle(bundle));
const all=<T>(page:ChoicePage<T>)=>[...page.primary,...page.more];
const snapshot=(s:GameSession)=>({hash:s.stateHash(),save:s.exportSave(),log:s.acceptedInputs(),observation:s.observe()});
const id=(name:string)=>bundle.payload.world.entities.find(e=>e.name===name)!.id;
function position(s:GameSession,room:string,inventory:string[]=[],lamp=false){
  const save=s.exportSave(),w=WorldState.restore(game,save.checkpoint.interpreter.world);
  w.move(w.global('PLAYER'),id(room));w.setGlobal('HERE',id(room));w.setGlobal('WINNER',w.global('PLAYER'));
  for(const item of inventory)w.move(id(item),w.global('PLAYER'));
  if(lamp)w.setFlag(id('LAMP'),bundle.payload.symbols.symbols.find(s=>s.name==='ONBIT')!.number!);
  save.checkpoint.interpreter.world=w.snapshot();s.importSave(save);
}
it('offers 6–8 first choices and every remainder in one expansion, without promoting a gate into spare space',()=>{
  const entries=Array.from({length:20},(_,n)=>({n,placement:n===1?'more' as const:'primary' as const}));
  for(const size of [6,7,8]){
    const page=choicePage(entries,{firstPageSize:size});expect(page.primary).toHaveLength(size);expect(page.total).toBe(20);expect(page.hasMore).toBe(true);
    expect(page.primary.every(e=>e.placement==='primary')).toBe(true);
    expect(all(page).map(e=>e.n).sort((a,b)=>a-b)).toEqual(entries.map(e=>e.n));
  }
  expect(choicePage(entries.slice(0,2)).primary.map(e=>e.n)).toEqual([0]);
  expect(choicePage([])).toEqual({primary:[],more:[],total:0,hasMore:false});
  for(const size of [0,5,9,6.5,NaN,Infinity,null as never])expect(()=>choicePage(entries,{firstPageSize:size})).toThrow('page size');
  expect(()=>choicePage(entries,{extra:true} as never)).toThrow('policy');
  const page=choicePage(entries);page.primary[0]!.n=99;expect(entries[0]!.n).toBe(0);
});
it('keeps all supported families and blocked exits, with a separate always menu and no executable IDs',()=>{
  const s=new GameSession(game),set=s.candidates(),menu=s.menu();
  expect(all(menu.always).map(c=>c.draft.family.split(':')[0]).sort()).toEqual(['INVENTORY','LOOK','SAVE','SCORE','WAIT']);
  expect([...all(menu.actions),...all(menu.always)].map(c=>c.key).sort()).toEqual(set.families.filter(f=>!f.shadowedBy).map(f=>f.id).sort());
  expect(all(menu.exits).map(c=>c.draft.family).sort()).toEqual(set.exits.map(e=>'walk:'+e.direction).sort());
  expect(all(menu.exits).some(c=>c.key==='walk:NORTH')).toBe(true);
  expect(menu.objects.find(g=>g.operand==='LAMP')!.choices.more.length).toBeGreaterThan(8);
  for(const c of [...all(menu.actions),...all(menu.always),...all(menu.exits)]){expect(c).not.toHaveProperty('id');expect(c.draft.expected).toEqual(menu.expected);}
});
it('fits every object first page and exposes every object/family binding across ten scope samples without state changes',()=>{
  const layouts:[string,string[],boolean][]=[['INSIDE-BARROW',[],false],['CAROUSEL-ROOM',[],false],['CAROUSEL-ROOM',['SWORD'],false],
    ['CAROUSEL-ROOM',['LAMP'],true],['MAGNET-ROOM',[],false],['MAGNET-ROOM',['TEAPOT'],false],['CERBERUS-ROOM',['COLLAR','LAMP'],true],
    ['RIDDLE-ROOM',['LAMP'],true],['AQUARIUM-ROOM',['SWORD','LAMP'],true],['MACHINE-ROOM',['LAMP'],true]];
  for(const [room,inventory,lamp] of layouts){
    const s=new GameSession(game);position(s,room,inventory,lamp);const before=snapshot(s),set=s.candidates(),menu=s.menu();
    for(const group of menu.objects){
      expect(group.choices.primary.length,room).toBeLessThanOrEqual(8);expect(group.choices.primary.every(c=>c.placement==='primary')).toBe(true);
      const expected=set.families.filter(f=>!f.shadowedBy&&f.operands[0]?.some(o=>operandIdentity(o.operand)===operandIdentity(group.operand))).map(f=>f.id).sort();
      expect(all(group.choices).map(c=>c.key).sort(),room).toEqual(expected);
      for(const c of all(group.choices))expect(c.draft.operands).toEqual([group.operand]);
    }
    expect(menu.actions.primary.length).toBeLessThanOrEqual(8);expect(menu.exits.primary.length).toBeLessThanOrEqual(8);
    s.menu('PLAYER',{firstPageSize:6});s.menu();expect(snapshot(s)).toEqual(before);
  }
});
it('ranks an object with its own evidence, not another object’s best score, and breaks ties by family key',()=>{
  const s=new GameSession(game),set=s.candidates(),f=set.families.find(f=>f.id==='TAKE:8')!;
  const first={...f,id:'Z:1',score:101,operands:[[{operand:'LAMP' as const,score:0,evidence:[],hints:[]},{operand:'SWORD' as const,score:100,evidence:[],hints:[]}]]};
  const second={...first,id:'A:1',score:11,operands:[[{operand:'LAMP' as const,score:10,evidence:[],hints:[]},{operand:'SWORD' as const,score:0,evidence:[],hints:[]}]]};
  const menu=buildActionMenu({...set,families:[first,second]},s.observe(),[],[]);
  expect(all(menu.objects.find(o=>o.operand==='LAMP')!.choices).map(c=>[c.key,c.score])).toEqual([['A:1',11],['Z:1',1]]);
  const tied=buildActionMenu({...set,families:[first,{...first,id:'A:1'}]},s.observe(),[],[]);
  expect(all(tied.actions).map(c=>c.key)).toEqual(['A:1','Z:1']);
});
it('keeps gated actor actions, exits and always actions in more, then promotes them after the printed clue',()=>{
  const s=new GameSession(game);position(s,'MAGNET-ROOM');const before=s.menu('ROBOT');
  expect(before.objects.length).toBeGreaterThan(0);
  for(const page of [before.actions,before.always,before.exits,...before.objects.map(g=>g.choices)]){
    expect(page.primary).toEqual([]);expect(page.more.length).toBeGreaterThan(0);expect(page.more.every(c=>c.gates.includes('robot-instructions'))).toBe(true);
  }
  const family=bundle.payload.vocabulary.verbs.find(v=>v.name==='READ')!.rows.find(r=>r.action.name==='READ'&&r.slots.length===1)!;
  expect(s.commitSelection({expected:{epoch:s.observe().epoch,revision:s.observe().revision},actor:'PLAYER',family:'READ:'+family.id,operands:[{object:'ROBOT-LABEL',noun:'PAPER',adjective:'GREEN'}]}).status).toBe('resolved');
  const after=s.menu('ROBOT');expect(after.actions.primary).toHaveLength(8);expect(after.always.primary).toHaveLength(5);
  expect(all(after.actions).map(c=>c.key).sort()).toEqual(all(before.actions).map(c=>c.key).sort());
});
it('pages compound second-operand choices without losing gated choices, source spellings or multiplicity',()=>{
  const s=new GameSession(game);position(s,'CERBERUS-ROOM',['COLLAR','LAMP'],true);
  const draft=all(s.menu().objects.find(g=>g.operand==='COLLAR')!.choices).find(c=>c.key==='PUT:6')!.draft;
  const view=s.select(draft),page=s.selectionMenu(draft);expect(page.next!.choices.primary.length).toBeLessThanOrEqual(8);
  expect(all(page.next!.choices).map(c=>operandIdentity(c.operand)).sort()).toEqual(view.next!.choices.map(c=>operandIdentity(c.operand)).sort());
  expect(page.next!.choices.more.find(c=>operandIdentity(c.operand)==='CERBERUS')!.placement).toBe('more');
  const dog=page.next!.choices.more.find(c=>operandIdentity(c.operand)==='CERBERUS')!;
  expect(dog.spellings).toEqual(view.next!.choices.find(c=>operandIdentity(c.operand)==='CERBERUS')!.spellings);
  expect(s.commitSelection({...draft,operands:[...draft.operands,dog.operand]}).status).toBe('resolved');
  const take=all(s.menu().actions).find(c=>c.key==='TAKE:8')!;expect(s.selectionMenu(take.draft).next!.allowAll).toBe(true);
});
it('menu browsing and output mutation are free, and drafts commit through the existing replay/staleness contract',()=>{
  const s=new GameSession(game),before=snapshot(s),menu=s.menu();
  const lamp=menu.objects.find(g=>g.operand==='LAMP')!,take=all(lamp.choices).find(c=>c.key==='TAKE:8')!;
  const expected=s.selectionMenu(take.draft);expect(expected.ready).toBe(true);expect(snapshot(s)).toEqual(before);
  const copy=s.menu();all(copy.actions)[0]!.draft.expected.revision=999;copy.objects[0]!.choices.primary.length=0;
  expect(s.menu()).toEqual(menu);expect(snapshot(s)).toEqual(before);
  const result=s.commitSelection(take.draft);expect(result.status).toBe('resolved');expect(result.optionId).toBeTruthy();
  expect(s.commitSelection(take.draft).status).toBe('rejected');
  expect(GameSession.replay(game,{},s.acceptedInputs()).stateHash()).toBe(s.stateHash());
  expect(()=>pageSelection(expected as never,{firstPageSize:9})).toThrow();
});
it('has no ordinary menu choices during pending decisions or host operations',()=>{
  const s=new GameSession(game),save=all(s.menu().always).find(c=>c.key==='SAVE:1')!;
  expect(s.commitSelection(save.draft).host!.kind).toBe('SAVE');
  let menu=s.menu();expect(menu.objects).toEqual([]);expect(all(menu.actions)).toEqual([]);expect(all(menu.always)).toEqual([]);expect(all(menu.exits)).toEqual([]);
  const pending=new GameSession(game),restart=all(pending.menu().actions).find(c=>c.key==='RESTART:1')!;
  expect(pending.commitSelection(restart.draft).status).toBe('pending');menu=pending.menu();expect(all(menu.actions)).toEqual([]);expect(pending.options().length).toBeGreaterThan(0);
});
