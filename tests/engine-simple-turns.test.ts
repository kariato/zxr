import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Selection } from '../src/engine/index.ts';
import { Interpreter, loadGame, prepareAction, encodeReadText } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { runReference } from '../tools/reference/runner.ts';
import type { ReferenceContext } from '../tools/reference/runner.ts';
import { loadSymbols, STORY } from '../tools/reference/symbols.ts';
import { decodeState, memories } from '../tools/reference/state.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),referenceSymbols=loadSymbols(),referenceStory=readFileSync(STORY);
const commands=['take lamp','drop lamp','look','south','north'];
const actions=[{kind:'act',actor:'PLAYER',verb:'TAKE',lexicalTable:'TAKE',syntax:8,prso:'LAMP'},{kind:'act',actor:'PLAYER',verb:'DROP',lexicalTable:'DROP',syntax:4,prso:'LAMP'},{kind:'act',actor:'PLAYER',verb:'LOOK',lexicalTable:'LOOK',syntax:12},{kind:'walk',actor:'PLAYER',direction:'SOUTH'},{kind:'walk',actor:'PLAYER',direction:'NORTH'}];
it('runs TAKE/DROP/LOOK/walk through retained parser code and translated MAIN-LOOP-1/PERFORM/CLOCKER',()=>{
  const reference=runReference(commands),vm=new Interpreter(game,{replay:reference.random.filter(r=>r.category==='game')});
  expect(vm.run()).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  const snapshots=[...memories(reference)];
  for(const [i,action] of actions.entries()){
    const result=vm.executeSimpleAction(action);expect(result,commands[i]).toMatchObject({status:'suspended',wait:{kind:'parser'}});
    const text=result.text.join('');expect(text.startsWith('\n>')).toBe(true);expect(text.slice(2),commands[i]).toBe(reference.transcript[i+1]!.slice(0,-2));
    const checkpoint=reference.checkpoints.filter(c=>c.input===i&&c.kind==='action-complete').at(-1)!;
    const parsedIndex=reference.checkpoints.findIndex(c=>c.input===i&&c.kind==='parser-return'),ram=snapshots[parsedIndex]!,globals=decodeState(ram).globals,world=vm.world();
    for(let word=0;word<10;word++){
      const own=world.getWord(world.global('P-ITBL'),word),original=ram.readUInt16BE(globals['P-ITBL']!+2*word);
      if(word===1&&own){expect(own).toBe(world.global('P-VTBL'));expect(original).toBe(globals['P-VTBL']);}
      else if(word>=6&&own)expect(own-world.global('P-LEXV')).toBe(original-globals['P-LEXV']!);
      else expect(own,commands[i]+' P-ITBL '+word).toBe(original);
    }
    for(const name of ['P-NCN','P-GETFLAGS','P-NAM','P-ADJ','P-WALK-DIR','AGAIN-DIR'])expect(world.global(name),commands[i]+' '+name).toBe(globals[name]);
    expect(vm.world().global('MOVES'),commands[i]).toBe(checkpoint.summary.moves);expect(game.bundle.payload.world.entities.find(e=>e.id===vm.world().global('HERE'))!.name).toBe(checkpoint.summary.room);
    expect(Interpreter.restore(game,JSON.parse(JSON.stringify(vm.checkpoint())),{replay:reference.random.filter(r=>r.category==='game')}).stateHash()).toBe(vm.stateHash());
  }
});
it('rejects unsupported adapter modes without changing state and rolls back scope failures',()=>{
  const vm=new Interpreter(game);vm.run();const hash=vm.stateHash();
  expect(()=>vm.executeSimpleAction({...say('SAY',['HELLO']),actor:'ROBOT'})).toThrow('full parser');
  expect(vm.stateHash()).toBe(hash);
  expect(vm.executeSimpleAction({...actions[0],prso:'ROBOT'})).toMatchObject({status:'error',text:[]});expect(vm.stateHash()).toBe(hash);
  const checkpoint=vm.checkpoint(),hidden=vm.world(),lamp=game.bundle.payload.world.entities.find(e=>e.name==='LAMP')!.id,invisible=game.bundle.payload.symbols.symbols.find(s=>s.name==='INVISIBLE')!.number!;
  hidden.setFlag(lamp,invisible);checkpoint.world=hidden.snapshot();const obscured=Interpreter.restore(game,checkpoint),hiddenHash=obscured.stateHash();expect(obscured.executeSimpleAction(actions[0])).toMatchObject({status:'error',text:[]});expect(obscured.stateHash()).toBe(hiddenHash);

});

function act(table:string,verb:string,prso?:Selection,prsi?:Selection,preposition?:string){
  const rows=game.bundle.payload.vocabulary.verbs.find(v=>v.name===table)!.rows.filter(r=>r.action.name===verb&&r.slots.length===(prsi?2:prso?1:0)&&(preposition===undefined||r.slots[1]?.preposition?.name===preposition)),row=rows.find(r=>!r.slots[0]?.preposition) ?? rows[0]!;
  return {kind:'act',actor:'PLAYER',verb,lexicalTable:table,syntax:row.id,...(prso?{prso}:{}),...(prsi?{prsi}:{})};
}
it('lets translated TAKE-CHECK acquire held-only operands during a complete turn',()=>{
  const {reference,vm}=compareTurns([act('TURN','LAMP-ON','LAMP'),act('TURN','LAMP-OFF','LAMP'),act('DROP','DROP','LAMP'),act('WAVE','WAVE','LAMP')],['turn on lamp','turn off lamp','drop lamp','wave lamp']);
  expect(reference.transcript[2]).toContain('(Taken)');expect(reference.transcript[4]).toContain('(Taken)');
  expect(reference.final.moves).toBe(4);
  expect(vm.world().parent(game.bundle.payload.world.entities.find(e=>e.name==='LAMP')!.id)).toBe(vm.world().global('PLAYER'));
});
it('preserves vehicle context and container dispatch while riding the bucket up the well',()=>{
  const directions=['SOUTH','SOUTH','SOUTH','SW','SOUTH','SE','IN'];
  const afterTeapot=['OUT','NORTH','NE'];
  const toRiddle=['SOUTH','SW','SW','SE'];
  const walk=(directions:string[])=>directions.map(direction=>({kind:'walk',actor:'PLAYER',direction}));
  const turns=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),...walk(directions),act('TAKE','TAKE','TEAPOT'),...walk(afterTeapot),act('FILL','FILL','TEAPOT'),...walk(toRiddle),say('ANSWER',['WELL']),...walk(['EAST','EAST']),act('PUT','PUT','LAMP','BUCKET'),act('TAKE','TAKE','LAMP'),act('ENTER','THROUGH','BUCKET'),act('TAKE','TAKE','LAMP'),act('LOOK','LOOK'),act('POUR','DROP','WATER','BUCKET','IN'),act('STAND','STAND')];
  const spelling=['take lamp','turn on lamp',...directions.map(d=>d.toLowerCase()),'take teapot',...afterTeapot.map(d=>d.toLowerCase()),'fill teapot',...toRiddle.map(d=>d.toLowerCase()),'answer "well"','east','east','put lamp in bucket','take lamp','enter bucket','take lamp','look','pour water in bucket','stand'];
  const {reference,vm}=compareTurns(turns,spelling);
  expect(reference.transcript[23]).toContain("You'll need to get in the bucket to reach it.");
  expect(reference.transcript[26]).toContain('Circular Room, in the wooden bucket');
  expect(reference.transcript[27]).toContain('The bucket rises and comes to a stop.');
  expect(reference.final).toMatchObject({room:'WELL-TOP',moves:28,deaths:0});
  expect(vm.world().parent(vm.world().global('PLAYER'))).toBe(vm.world().global('HERE'));
});
it('matches ordinary verbs, nested table contents and two-object PUT against the original',()=>{
  const turns=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),...['SOUTH','SOUTH','SOUTH','SW','SOUTH','SE','IN'].map(direction=>({kind:'walk',actor:'PLAYER',direction})),act('TAKE','TAKE','NEWSPAPER'),act('PUT','PUT-ON','NEWSPAPER','GAZEBO-TABLE'),act('EXAMINE','EXAMINE','TEAPOT'),act('INVENTORY','INVENTORY'),act('WAIT','WAIT')];
  const spelling=['take lamp','turn on lamp','south','south','south','sw','south','se','in','take paper','put paper on table','examine teapot','inventory','wait'];
  compareTurns(turns,spelling);
});
function compareTurns(turns:unknown[],spelling:string[],expectedDetachedSiblings:string[]=[],context?:ReferenceContext){
  const detachedSiblings=new Set<string>();
  const reference=runReference(spelling,2,{context}),snapshots=[...memories(reference)],tape=reference.random.filter(r=>r.category==='game');let vm=new Interpreter(game,{replay:tape});vm.run();
  if(context)vm=prepareContext(vm,context,{replay:tape});
  for(const [i,action] of turns.entries()){
    const result=vm.executeAction(action);expect(result,spelling[i]).toMatchObject({status:'suspended',wait:{kind:'parser'}});
    expect(result.text.join('').slice(2),spelling[i]).toBe(reference.transcript[i+1]!.slice(0,-2));
    const cp=reference.checkpoints.filter(c=>c.input===i&&c.kind==='action-complete').at(-1)!;
    expect(vm.world().global('MOVES'),spelling[i]).toBe(cp.summary.moves);
    expect(game.bundle.payload.world.entities.find(e=>e.id===vm.world().global('HERE'))!.name).toBe(cp.summary.room);
    const index=reference.checkpoints.indexOf(cp),original=decodeState(snapshots[index]!),world=vm.world();
    for(const name of ['P-NCN','P-GETFLAGS','P-NAM','P-ADJ','P-SLOCBITS','P-AND','P-MULT','P-WON','P-NOT-HERE','P-CONT','QUOTE-FLAG','P-LEN','P-DIR','SCORE','WAND-ON','SPELL-VICTIM','WINNER','PRSA','PRSO','PRSI','LIT'])expect(world.global(name),spelling[i]+' '+name).toBe(original.globals[name]);
    expect(vm.inspect().rng.cursor).toBe(reference.random.slice(0,cp.randomPosition).filter(r=>r.category==='game').length);
    for(const interrupt of original.interrupts){const address=world.global('C-TABLE')+interrupt.offset,ticks=world.getWord(address,1);expect([world.getWord(address),ticks>=32768?ticks-65536:ticks,game.routine(world.getWord(address,2))?.name ?? world.getWord(address,2)],spelling[i]+' clock '+interrupt.offset).toEqual([interrupt.enabled,interrupt.ticks,interrupt.routine]);}
    const parsed=reference.checkpoints.findLastIndex(c=>c.input===i&&c.kind==='parser-return'),ram=snapshots[parsed]!,globals=decodeState(ram).globals;
    const syntax=world.global('P-SYNTAX'),refSyntax=globals['P-SYNTAX']!;
    expect(Boolean(syntax),spelling[i]+' syntax presence').toBe(Boolean(refSyntax));
    // Syntax lives in immutable story memory, beyond the dynamic checkpoint image.
    if(syntax){expect(refSyntax).toBeGreaterThanOrEqual(referenceStory.readUInt16BE(14));expect(Array.from({length:8},(_,byte)=>world.getByte(syntax,byte)),spelling[i]+' syntax row').toEqual([...referenceStory.subarray(refSyntax,refSyntax+8)]);}
    const ownNoun=world.global('P-ONEOBJ'),referenceNoun=original.globals['P-ONEOBJ']!;
    if(ownNoun||referenceNoun)expect(ownNoun-game.bundle.payload.memory.segments.find(s=>s.name==='dictionary')!.base,spelling[i]+' last noun').toBe(referenceNoun-snapshots[index]!.readUInt16BE(8));
    for(const tableName of ['P-ITBL','P-OTBL'])for(let word=0;word<10;word++){
      const own=world.getWord(world.global(tableName),word),expected=ram.readUInt16BE(globals[tableName]!+2*word);
      if(word===1&&own)expect(own-world.global('P-VTBL')).toBe(expected-globals['P-VTBL']!);
      else if((word===3||word===5)&&own){const dictionary=game.bundle.payload.memory.segments.find(s=>s.name==='dictionary')!;expect(own-dictionary.base).toBe(expected-ram.readUInt16BE(8));}
      else if(word>=6&&own)expect(own-world.global('P-LEXV')).toBe(expected-globals['P-LEXV']!);
      else expect(own,spelling[i]+' '+tableName+' word '+word).toBe(expected);
    }
    const dictionary=game.bundle.payload.memory.segments.find(s=>s.name==='dictionary')!,originalDictionary=snapshots[index]!.readUInt16BE(8);
    for(const name of ['SPELL-USED']){const own=world.global(name),expected=original.globals[name]!;expect(own?own-dictionary.base:null,spelling[i]+' '+name).toBe(expected?expected-originalDictionary:null);}
    const verb=world.global('P-VTBL'),refVerb=original.globals['P-VTBL']!;
    const verbWord=world.getWord(verb),refVerbWord=snapshots[index]!.readUInt16BE(refVerb);
    expect(verbWord?verbWord-dictionary.base:null,spelling[i]+' verb word').toBe(refVerbWord?refVerbWord-originalDictionary:null);
    expect([world.getByte(verb,2),world.getByte(verb,3)],spelling[i]+' verb span').toEqual([snapshots[index]![refVerb+2],snapshots[index]![refVerb+3]]);
    expect(world.getByte(world.global('P-LEXV'),1),spelling[i]+' lexical count').toBe(snapshots[index]![original.globals['P-LEXV']!+1]);
    for(let token=0;token<encodeReadText(game,spelling[i]!).tokens.length;token++){
      const own=world.global('P-LEXV')+2+4*token,ref=original.globals['P-LEXV']!+2+4*token,word=world.getWord(own),expected=snapshots[index]!.readUInt16BE(ref);
      expect(word?word-dictionary.base:null,spelling[i]+' token '+token).toBe(expected?expected-originalDictionary:null);
      expect([world.getByte(own,2),world.getByte(own,3)],spelling[i]+' token span '+token).toEqual([snapshots[index]![ref+2],snapshots[index]![ref+3]]);
    }
    for(const name of ['P-PRSO','P-PRSI','P-BUTS'])for(let word=0;word<50;word++)expect(world.getWord(world.global(name),word),spelling[i]+' '+name+' '+word).toBe(snapshots[index]!.readUInt16BE(original.globals[name]!+2*word));
    const proxy=game.bundle.payload.memory.objects.find(o=>o.name==='PSEUDO-OBJECT')!,pseudoAction=proxy.properties.find(p=>p.name==='ACTION')!,refProxy=original.objects.find(o=>o.name==='PSEUDO-OBJECT')!,refAction=refProxy.properties.find(p=>p.id===pseudoAction.number)!;
    expect(game.routine(world.getProperty(proxy.id,pseudoAction.number))?.name,spelling[i]+' pseudo handler').toBe(referenceSymbols.byAddress.get(parseInt(refAction.bytes,16)*2)?.name);
    expect(Array.from({length:4},(_,offset)=>world.getByte(world.propertyAddress(proxy.id,pseudoAction.number)-5+offset)),spelling[i]+' pseudo name').toEqual([...snapshots[index]!.subarray(refAction.address-5,refAction.address-1)]);
    for(const object of original.objects){
      // ifvms 1.1.6 leaves a stale sibling on REMOVE (REF-001). Keep the exception explicit per scenario.
      const sibling=object.parent===0&&object.sibling!==0?0:object.sibling;
      if(sibling!==object.sibling)detachedSiblings.add(object.name);
      expect([world.parent(object.id),world.nextSibling(object.id),world.firstChild(object.id)],spelling[i]+' '+object.name).toEqual([object.parent,sibling,object.child]);
      const attributes=Array.from({length:32},(_,bit)=>world.hasFlag(object.id,bit));
      expect(attributes,spelling[i]+' '+object.name+' flags').toEqual(Array.from({length:32},(_,bit)=>(parseInt(object.attributes.slice(2*(bit>>>3),2*(bit>>>3)+2),16)&(128>>>(bit%8)))!==0));
    }
    vm=Interpreter.restore(game,JSON.parse(JSON.stringify(vm.checkpoint())),{replay:tape});
  }
  expect([...detachedSiblings].sort()).toEqual([...expectedDetachedSiblings].sort());
  return {vm,reference};
}
function prepareContext(vm:Interpreter,context:ReferenceContext,replay?:Parameters<typeof Interpreter.restore>[2]){
  const world=vm.world(),id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
  world.move(world.global('PLAYER'),id(context.room));world.setGlobal('HERE',id(context.room));world.setGlobal('WINNER',world.global('PLAYER'));world.setGlobal('LIT',1);
  for(const object of context.inventory)world.move(id(object),world.global('PLAYER'));
  const checkpoint=vm.checkpoint();checkpoint.world=world.snapshot();return Interpreter.restore(game,checkpoint,replay);
}
it('uses original scope traversal for closed opaque, transparent and dark inventory cases',()=>{
  const base=new Interpreter(game);base.run();
  const entity=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
  const flag=(name:string)=>game.bundle.payload.symbols.symbols.find(s=>s.name===name)!.number!;
  const fixture=(transparent:boolean,dark=false)=>{
    const world=base.world();world.move(entity('TEAPOT'),world.global('HERE'));world.move(entity('LAMP'),entity('TEAPOT'));
    world.setFlag(entity('TEAPOT'),flag('OPENBIT'),false);world.setFlag(entity('TEAPOT'),flag('TRANSBIT'),transparent);
    if(dark){world.move(entity('TEAPOT'),world.global('PLAYER'));world.setGlobal('LIT',0);}
    const checkpoint=base.checkpoint();checkpoint.world=world.snapshot();return Interpreter.restore(game,checkpoint);
  };
  const opaque=fixture(false),before=opaque.stateHash();expect(opaque.executeAction(act('EXAMINE','EXAMINE','LAMP'))).toMatchObject({status:'error',text:[]});expect(opaque.stateHash()).toBe(before);
  for(const vm of [fixture(true),fixture(true,true)])expect(vm.executeAction(act('EXAMINE','EXAMINE','LAMP'))).toMatchObject({status:'suspended',wait:{kind:'parser'}});
});
it('rolls back ambiguous nouns, a failed second operand and command-budget exhaustion',()=>{
  const base=new Interpreter(game);base.run();const hash=base.stateHash();
  expect(base.executeAction(act('PUT','PUT-ON','LAMP','GAZEBO-TABLE'))).toMatchObject({status:'error',text:[],random:[]});expect(base.stateHash()).toBe(hash);
  const world=base.world(),broken=game.bundle.payload.world.entities.find(e=>e.name==='BROKEN-LAMP')!;
  world.move(broken.id,world.global('HERE'));const checkpoint=base.checkpoint();checkpoint.world=world.snapshot();
  const ambiguous=Interpreter.restore(game,checkpoint),before=ambiguous.stateHash();expect(ambiguous.executeAction(act('TAKE','TAKE','LAMP'))).toMatchObject({status:'error',cause:expect.stringContaining('ambiguous')});expect(ambiguous.stateHash()).toBe(before);
  const successful=Interpreter.restore(game,base.checkpoint());expect(successful.executeAction(act('TAKE','TAKE','LAMP')).status).toBe('suspended');
  const limited=base.checkpoint();limited.limits.steps=successful.inspect().steps-1;limited.steps=0;
  const bounded=Interpreter.restore(game,limited),boundedHash=bounded.stateHash();expect(bounded.executeAction(act('TAKE','TAKE','LAMP'))).toMatchObject({status:'error',cause:expect.stringContaining('budget'),text:[],random:[]});expect(bounded.stateHash()).toBe(boundedHash);
});

it('preserves explicit noun order and ALL search order, including empty-inventory global fallback',()=>{
  const turns=[act('TAKE','TAKE',['LAMP','SWORD']),act('DROP','DROP',['SWORD','LAMP']),act('TAKE','TAKE','ALL'),act('DROP','DROP','ALL'),act('DROP','DROP','ALL')];
  const {reference}=compareTurns(turns,['take lamp and sword','drop sword and lamp','take all','drop all','drop all']);
  expect(reference.transcript.at(-1)).toContain("You don't have the tunnel.");
});
it('leaves MANY refusal and mixed per-object success to translated checks and dispatch',()=>{
  compareTurns([act('PUT','PUT-ON','LAMP',['LAMP','SWORD'])],['put lamp on lamp and sword']);
  const turns=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),...['SOUTH','SOUTH','SOUTH','SW','SOUTH','SE','IN'].map(direction=>({kind:'walk',actor:'PLAYER',direction})),act('TAKE','TAKE',['NEWSPAPER','GAZEBO-TABLE','TEAPOT'])];
  const {reference}=compareTurns(turns,['take lamp','turn on lamp','south','south','south','sw','south','se','in','take paper and table and teapot']);
  expect(reference.transcript.at(-1)).toContain('table:');expect(reference.transcript.at(-1)).toContain('china teapot: Taken.');
});
it('runs TAKE ALL with one refusal and one success, preserving one command clock tick',()=>{
  const turns=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),...['SOUTH','SOUTH','SOUTH','SW','SOUTH','SE'].map(direction=>({kind:'walk',actor:'PLAYER',direction})),act('DROP','DROP','LAMP'),act('TAKE','TAKE','ALL')];
  const {reference}=compareTurns(turns,['take lamp','turn on lamp','south','south','south','sw','south','se','drop lamp','take all'],['UNICORN']);
  expect(reference.transcript.at(-1)).toContain('unicorn:');expect(reference.transcript.at(-1)).toContain('lamp: Taken.');
});

it('rolls back a later list failure and ALL match-table overflow',()=>{
  const base=new Interpreter(game);base.run();const hash=base.stateHash();
  expect(base.executeAction(act('TAKE','TAKE',['LAMP','ROBOT']))).toMatchObject({status:'error',text:[],random:[]});expect(base.stateHash()).toBe(hash);
  expect(()=>base.executeAction(act('PUT','PUT-ON',['LAMP','SWORD'],['LAMP','SWORD']))).toThrow('simultaneous');expect(base.stateHash()).toBe(hash);
  const world=base.world(),invisible=game.bundle.payload.symbols.symbols.find(s=>s.name==='INVISIBLE')!.number!;
  const visible=game.bundle.payload.world.entities.filter(e=>e.kind==='object'&&e.id!==world.global('PLAYER')&&e.properties.some(p=>p.property.name==='SYNONYM')).slice(0,50);
  expect(visible).toHaveLength(50);
  for(const object of visible){world.move(object.id,world.global('HERE'));world.setFlag(object.id,invisible,false);}
  const checkpoint=base.checkpoint();checkpoint.world=world.snapshot();const crowded=Interpreter.restore(game,checkpoint),before=crowded.stateHash();
  expect(crowded.executeAction(act('TAKE','TAKE','ALL'))).toMatchObject({status:'error',cause:expect.stringContaining('bounds'),text:[],random:[]});expect(crowded.stateHash()).toBe(before);
});

it('binds the Tea Room hole through source GLOBAL-CHECK as direct and indirect operand',()=>{
  const hole={pseudo:{room:'TEA-ROOM',word:'HOLE'}},turns=[act('EXAMINE','EXAMINE',hole),act('LOOK','LOOK-INSIDE',hole),act('PUT','PUT','LAMP',hole),act('TAKE','TAKE',hole),act('PUT','PUT',hole,hole),act('EXAMINE','EXAMINE',[hole,'LAMP']),act('EXAMINE','EXAMINE',hole)];
  const {reference}=compareTurns(turns,['examine hole','look in hole','put lamp in hole','take hole','put hole in hole','examine hole and lamp','examine hole'],[],{room:'TEA-ROOM',inventory:['LAMP']});
  expect(reference.transcript[1]).toContain('The hole is very small.');expect(reference.transcript[3]).toContain("It doesn't fit through the hole.");
});
it('rebinds shared pseudo name and handler across rooms and preserves binding in checkpoints',()=>{
  const stalagmite={pseudo:{room:'GREAT-CAVERN',word:'STALAGMITE'}},stalactite={pseudo:{room:'GREAT-CAVERN',word:'STALACTITE'}};
  compareTurns([act('EXAMINE','EXAMINE',stalagmite),act('EXAMINE','EXAMINE',stalactite)],['examine stalagmite','examine stalactite'],[],{room:'GREAT-CAVERN',inventory:[]});
  const base=new Interpreter(game);base.run();const tea=prepareContext(base,{room:'TEA-ROOM',inventory:['LAMP']}),hole={pseudo:{room:'TEA-ROOM',word:'HOLE'}};
  expect(tea.executeAction(act('EXAMINE','EXAMINE',hole))).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  const cavern=prepareContext(tea,{room:'GREAT-CAVERN',inventory:[]});expect(cavern.executeAction(act('EXAMINE','EXAMINE',stalagmite))).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  const pseudo=game.bundle.payload.memory.objects.find(o=>o.name==='PSEUDO-OBJECT')!,action=pseudo.properties.find(p=>p.name==='ACTION')!;
  expect(game.routine(cavern.world().getProperty(pseudo.id,action.number))?.name).toBe('STALA-PSEUDO');
  const restored=Interpreter.restore(game,JSON.parse(JSON.stringify(cavern.checkpoint())));expect(restored.stateHash()).toBe(cavern.stateHash());
});
it('keeps pseudo planning pure and rolls back remote selections, a later missing operand and exhausted output',()=>{
  const base=new Interpreter(game);base.run();const hole={pseudo:{room:'TEA-ROOM',word:'HOLE'}},action=act('EXAMINE','EXAMINE',hole),before=base.stateHash();
  expect(prepareAction(game,base.world(),action).direct).toMatchObject({kind:'objects',objects:[{pseudo:{word:'HOLE'}}]});expect(base.stateHash()).toBe(before);
  expect(base.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('declared room'),text:[]});expect(base.stateHash()).toBe(before);
  const tea=prepareContext(base,{room:'TEA-ROOM',inventory:[]}),teaHash=tea.stateHash();
  expect(tea.executeAction(act('PUT','PUT','ROBOT',hole))).toMatchObject({status:'error',text:[]});expect(tea.stateHash()).toBe(teaHash);
  const checkpoint=tea.checkpoint();checkpoint.limits.output=5;checkpoint.output=0;
  const bounded=Interpreter.restore(game,checkpoint),boundedHash=bounded.stateHash();expect(bounded.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('output budget'),text:[],random:[]});expect(bounded.stateHash()).toBe(boundedHash);
});

it('rejects a pseudo handler that diverges from the selected feature and restores all binding writes',()=>{
  const base=new Interpreter(game);base.run();const tea=prepareContext(base,{room:'TEA-ROOM',inventory:[]}),world=tea.world();
  const pseudo=game.bundle.payload.symbols.symbols.find(s=>s.name==='P?PSEUDO')!.number!,other=game.bundle.payload.logic.routines.find(r=>r.name==='CRETIN-FCN')!.id;
  world.putWord(world.propertyAddress(world.global('HERE'),pseudo),1,other);
  const checkpoint=tea.checkpoint();checkpoint.world=world.snapshot();const altered=Interpreter.restore(game,checkpoint),before=altered.stateHash();
  expect(altered.executeAction(act('EXAMINE','EXAMINE',{pseudo:{room:'TEA-ROOM',word:'HOLE'}}))).toMatchObject({status:'error',cause:expect.stringContaining('binding'),text:[],random:[]});expect(altered.stateHash()).toBe(before);
});

function say(verb:'ANSWER'|'SAY'|'INCANT',words:string[]){
  const row=game.bundle.payload.vocabulary.verbs.find(v=>v.name===verb)!.rows.find(r=>r.action.name===verb&&!r.slots.length)!;
  return {kind:'say',actor:'PLAYER',verb,lexicalTable:verb,syntax:row.id,words};
}
it('runs quoted ANSWER/SAY/INCANT data and the original SAY HELLO continuation',()=>{
  const {reference}=compareTurns([say('ANSWER',['XYZZYUNKNOWN']),say('SAY',['WELL']),say('INCANT',['FROBOZZ']),say('SAY',['HELLO']),act('LOOK','LOOK')],['answer "xyzzyunknown"','say "well"','incant "frobozz"','say "hello"','look']);
  expect(reference.checkpoints.filter(c=>c.input===3&&c.kind==='action-complete')).toHaveLength(2);expect(reference.final.moves).toBe(6);
});

it.each([{verb:'ANSWER' as const,words:['WELL']},{verb:'ANSWER' as const,words:['A','WELL']},{verb:'SAY' as const,words:['WELL']},{verb:'SAY' as const,words:['HELLO','WELL']}])('answers the riddle with $verb/$words after a natural journey',({verb,words})=>{
  const directions=['SOUTH','SOUTH','SOUTH','SW','SOUTH','SW','SW','SE','SE','SE','NE','SE','NORTH','SE','WEST','SE'];
  const turns=[act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),...directions.map(direction=>({kind:'walk',actor:'PLAYER',direction})),say('ANSWER',['XYZZYUNKNOWN']),say(verb,words),{kind:'walk',actor:'PLAYER',direction:'EAST'}];
  const {reference}=compareTurns(turns,['take lamp','turn on lamp',...directions.map(d=>d.toLowerCase()),'answer "xyzzyunknown"',verb.toLowerCase()+' "'+words.join(' ').toLowerCase()+'"','east']);
  expect(reference.transcript.at(-3)).toContain('A hollow laugh');expect(reference.transcript.at(-2)).toContain('stone door quietly swings open');expect(reference.final.room).toBe('PEARL-ROOM');
});
it('delegates quoted SAY to translated INCANT when the wand is active',()=>{
  const {reference}=compareTurns([act('WAVE','WAVE','WAND','SWORD'),say('SAY',['FROBOZZ']),say('INCANT',['FLOAT'])],['wave wand at sword','say "frobozz"','incant "float"'],[],{room:'INSIDE-BARROW',inventory:['WAND']});
  expect(reference.transcript[2]).toContain('The wand glows very brightly');expect(reference.transcript[3]).toContain('Nothing happens.');
});

it('lets the original SAY handler cancel HELLO when an actor is present',()=>{
  const {reference}=compareTurns([say('SAY',['HELLO'])],['say "hello"'],[],{room:'MAGNET-ROOM',inventory:[]});
  expect(reference.transcript[1]).toContain('You must address the robot directly.');expect(reference.final.moves).toBe(1);
});
it('rolls back unsupported spoken continuations, actor speech and budgets across SAY HELLO',()=>{
  const base=new Interpreter(game);base.run();const before=base.stateHash();
  expect(base.executeAction(say('SAY',['HELLO','LAMP']))).toMatchObject({status:'error',cause:expect.stringContaining('spoken command'),text:[],random:[]});expect(base.stateHash()).toBe(before);
  expect(()=>base.executeAction({...say('SAY',['HELLO']),actor:'ROBOT'})).toThrow('full parser');expect(base.stateHash()).toBe(before);
  const success=Interpreter.restore(game,base.checkpoint());expect(success.executeAction(say('SAY',['HELLO']))).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  const limited=base.checkpoint();limited.steps=0;limited.limits.steps=success.inspect().steps-1;
  const bounded=Interpreter.restore(game,limited),boundedHash=bounded.stateHash();expect(bounded.executeAction(say('SAY',['HELLO']))).toMatchObject({status:'error',cause:expect.stringContaining('step budget'),text:[],random:[]});expect(bounded.stateHash()).toBe(boundedHash);
  const output=base.checkpoint();output.output=0;output.limits.output=3;
  const quiet=Interpreter.restore(game,output),quietHash=quiet.stateHash();expect(quiet.executeAction(say('SAY',['HELLO']))).toMatchObject({status:'error',cause:expect.stringContaining('output budget'),text:[],random:[]});expect(quiet.stateHash()).toBe(quietHash);
});

it('executes the robot actor through original TELL, continuation entry and PERFORM',()=>{
  const {reference}=compareTurns([{kind:'walk',actor:'ROBOT',direction:'EAST'},act('LOOK','LOOK')],['robot, east','look'],[],{room:'MAGNET-ROOM',inventory:[]});
  expect(reference.checkpoints.filter(c=>c.input===0&&c.kind==='action-complete')).toHaveLength(2);expect(reference.final.moves).toBe(2);
});

it('matches robot inventory, refusals, movement, cage rescue and restored player context',()=>{
  const robot=(action:ReturnType<typeof act>)=>({...action,actor:'ROBOT'});
  const turns=[act('GIVE','GIVE','LAMP','ROBOT'),robot(act('DROP','DROP','LAMP')),robot(act('TAKE','TAKE','LAMP')),robot(act('LOOK','LOOK')),{kind:'walk',actor:'ROBOT',direction:'EAST'},{kind:'walk',actor:'PLAYER',direction:'EAST'},{kind:'walk',actor:'ROBOT',direction:'SOUTH'},{kind:'walk',actor:'PLAYER',direction:'SOUTH'},act('TAKE','TAKE','PALANTIR-1'),robot(act('RAISE','RAISE','CAGE')),act('LOOK','LOOK')];
  const {reference}=compareTurns(turns,['give lamp to robot','robot, drop lamp','robot, take lamp','robot, look','robot, east','east','robot, south','south','take sphere','robot, raise cage','look'],[],{room:'MAGNET-ROOM',inventory:['LAMP']});
  expect(reference.transcript[2]).toContain('Dropped.');expect(reference.transcript[4]).toContain('My programming is insufficient');expect(reference.transcript[10]).toContain('The cage shakes');expect(reference.final).toMatchObject({winner:'ADVENTURER',room:'CAGE-ROOM',moves:11,deaths:0});
});

it('honors an actor handler that cancels TELL before the requested command',()=>{
  const directions=['SOUTH','SOUTH','SOUTH','SW','SOUTH','SE'];
  const {reference}=compareTurns([act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),...directions.map(direction=>({kind:'walk',actor:'PLAYER',direction})),{kind:'walk',actor:'UNICORN',direction:'SOUTH'},act('LOOK','LOOK')],['take lamp','turn on lamp',...directions.map(d=>d.toLowerCase()),'unicorn, south','look']);
  expect(reference.transcript[9]).toContain('The unicorn listens distractedly');expect(reference.checkpoints.filter(c=>c.input===8&&c.kind==='action-complete')).toHaveLength(1);expect(reference.final).toMatchObject({room:'GARDEN-NORTH',moves:9});
});
it('resolves explicit robot lists through its visible inventory and runs one command clock tick',()=>{
  const {reference}=compareTurns([act('GIVE','GIVE','LAMP','ROBOT'),{...act('TAKE','TAKE',['LAMP','ROBOT-LABEL']),actor:'ROBOT'},{...act('DROP','DROP',['LAMP','ROBOT-LABEL']),actor:'ROBOT'},act('LOOK','LOOK')],['give lamp to robot','robot, take lamp and paper','robot, drop lamp and paper','look'],[],{room:'MAGNET-ROOM',inventory:['LAMP']});
  expect(reference.final.moves).toBe(4);expect(reference.transcript[3]).toContain('green piece of paper:');
});
it('rolls back both actor passes on missing operands, hidden actors and execution limits',()=>{
  const base=new Interpreter(game);base.run();const remoteHash=base.stateHash();
  expect(base.executeAction({kind:'walk',actor:'ROBOT',direction:'EAST'})).toMatchObject({status:'error',text:[],random:[]});expect(base.stateHash()).toBe(remoteHash);
  const local=prepareContext(base,{room:'MAGNET-ROOM',inventory:[]}),before=local.stateHash();
  expect(local.executeAction({...act('TAKE','TAKE','LAMP'),actor:'ROBOT'})).toMatchObject({status:'error',text:[],random:[]});expect(local.stateHash()).toBe(before);
  const world=local.world(),robot=game.bundle.payload.world.entities.find(e=>e.name==='ROBOT')!.id,invisible=game.bundle.payload.symbols.symbols.find(s=>s.name==='INVISIBLE')!.number!;
  world.setFlag(robot,invisible);const hidden=local.checkpoint();hidden.world=world.snapshot();const obscured=Interpreter.restore(game,hidden),hiddenHash=obscured.stateHash();
  expect(obscured.executeAction({kind:'walk',actor:'ROBOT',direction:'EAST'})).toMatchObject({status:'error',text:[]});expect(obscured.stateHash()).toBe(hiddenHash);
  const action={kind:'walk',actor:'ROBOT',direction:'EAST'},success=Interpreter.restore(game,local.checkpoint());expect(success.executeAction(action).status).toBe('suspended');
  const limited=local.checkpoint();limited.steps=0;limited.limits.steps=success.inspect().steps-1;
  const bounded=Interpreter.restore(game,limited),boundedHash=bounded.stateHash();expect(bounded.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('step budget'),text:[],random:[]});expect(bounded.stateHash()).toBe(boundedHash);
  const output=local.checkpoint();output.output=0;output.limits.output=3;const quiet=Interpreter.restore(game,output),quietHash=quiet.stateHash();
  expect(quiet.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('output budget'),text:[],random:[]});expect(quiet.stateHash()).toBe(quietHash);
});
