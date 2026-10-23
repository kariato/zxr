import { expect, it } from 'vitest';
import { GameSession, WorldState, loadGame, operandIdentity } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
const draft=(s:GameSession,family:string,operands:string[]=[])=>{const {epoch,revision}=s.observe();return {expected:{epoch,revision},actor:'PLAYER',family,operands};};
function remoteLamp(s:GameSession,rename=false){
  const save=s.exportSave(),world=WorldState.restore(game,save.checkpoint.interpreter.world);world.move(id('LAMP'),id('DEEP-FORD'));
  if(rename)world.putWord(game.bundle.payload.memory.objects.find(o=>o.id===id('LAMP'))!.propertyTable+1,0,65535);
  save.checkpoint.interpreter.world=world.snapshot();s.importSave(save);
}
it('keeps remembered nouns selectable for original refusals without exposing remote identity, location or current name changes',()=>{
  const s=new GameSession(game);expect(s.remembered().some(o=>o.id==='LAMP')).toBe(true);remoteLamp(s,true);
  expect(s.observe().perception.objects.some(o=>o.id==='LAMP')).toBe(false);
  expect(s.remembered().find(o=>o.id==='LAMP')!.name).toBe('lamp');
  const choice=s.select(draft(s,'TAKE:8')).next!.choices.find(o=>operandIdentity(o.operand)==='LAMP')!;
  expect(choice).toMatchObject({label:'lamp (remembered)',remembered:true});expect(choice.score).toBeLessThan(0);
  expect(JSON.stringify(s.menu())).not.toContain('zzz');expect(s.menu().objects.find(g=>g.operand==='LAMP')!.label).toBe('lamp (remembered)');
  const result=s.commitSelection(draft(s,'TAKE:8',['LAMP']));expect(result.status).toBe('resolved');expect(result.text.join('')).toContain("can't see");
});
it('never introduces an unseen object through memory or learns by browsing, and owns its returned records',()=>{
  const s=new GameSession(game);expect(s.remembered().some(o=>o.id==='COLLAR')).toBe(false);
  expect(s.select(draft(s,'TAKE:8')).next!.choices.some(o=>operandIdentity(o.operand)==='COLLAR')).toBe(false);
  const before={state:s.stateHash(),save:s.exportSave(),log:s.acceptedInputs()};s.menu();s.candidates();s.select(draft(s,'PUT:7'));s.observe();
  s.remembered()[0]!.name='changed';expect({state:s.stateHash(),save:s.exportSave(),log:s.acceptedInputs()}).toEqual(before);
});
it('saves canonical memory, restores the saved snapshot, clears it on restart and reconstructs it through accepted-input replay',()=>{
  const s=new GameSession(game),initial=s.exportSave(),save=s.exportSave(),w=WorldState.restore(game,save.checkpoint.interpreter.world);w.move(id('COLLAR'),w.global('PLAYER'));save.checkpoint.interpreter.world=w.snapshot();s.importSave(save);
  expect(s.remembered().some(o=>o.id==='COLLAR')).toBe(true);const remembered=s.exportSave();expect(remembered.format).toBe('zxr-save-v2');
  s.importSave(initial);expect(s.remembered().some(o=>o.id==='COLLAR')).toBe(false);s.importSave(remembered);expect(s.remembered().some(o=>o.id==='COLLAR')).toBe(true);
  const restart=s.commitSelection(draft(s,'RESTART:1'));expect(restart.status).toBe('pending');const yes=s.options().find(o=>o.label==='YES')!,current=s.observe();
  const host=s.execute({expected:{epoch:current.epoch,revision:current.revision},optionId:yes.id}).host!;
  s.completeHost({id:host.id,epoch:host.epoch,revision:host.revision,kind:host.kind,outcome:'success'});expect(s.remembered().some(o=>o.id==='COLLAR')).toBe(false);
  expect(GameSession.replay(game,{},s.acceptedInputs()).stateHash()).toBe(s.stateHash());
});
it('rejects unknown, duplicate, unsorted or malformed remembered records atomically, including old save formats',()=>{
  const s=new GameSession(game),before=s.stateHash();
  const values=[[{id:'UNKNOWN',name:'x'}],[{id:'LAMP',name:'lamp'},{id:'LAMP',name:'lamp'}],[{id:'SWORD',name:'sword'},{id:'LAMP',name:'lamp'}],[{id:'LAMP',name:'x'.repeat(2049)}],[{id:'LAMP',name:'   '}]];
  for(const remembered of values){const save=s.exportSave();save.remembered=remembered;expect(()=>s.importSave(save)).toThrow();expect(s.stateHash()).toBe(before);}
  const old={...s.exportSave(),format:'zxr-save-v1'};expect(()=>s.importSave(old as never)).toThrow();expect(s.stateHash()).toBe(before);
});
