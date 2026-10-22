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
it('rejects unsupported adapter modes and responds to remote or invisible operands',()=>{
  const vm=new Interpreter(game);vm.run();const hash=vm.stateHash();
  expect(()=>vm.executeSimpleAction(act('SAY','SAY'))).toThrow('full parser');
  expect(vm.stateHash()).toBe(hash);
  expect(vm.executeSimpleAction({...actions[0],prso:'ROBOT'})).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  const checkpoint=vm.checkpoint(),hidden=vm.world(),lamp=game.bundle.payload.world.entities.find(e=>e.name==='LAMP')!.id,invisible=game.bundle.payload.symbols.symbols.find(s=>s.name==='INVISIBLE')!.number!;
  hidden.setFlag(lamp,invisible);checkpoint.world=hidden.snapshot();const obscured=Interpreter.restore(game,checkpoint);expect(obscured.executeSimpleAction(actions[0]).text.join('')).toContain("You can't see any lamp here!");

});

function act(table:string,verb:string,prso?:Selection,prsi?:Selection,preposition?:string){
  const rows=game.bundle.payload.vocabulary.verbs.find(v=>v.name===table)!.rows.filter(r=>r.action.name===verb&&r.slots.length===(prsi?2:prso?1:0)&&(preposition===undefined||r.slots[1]?.preposition?.name===preposition)),row=rows.find(r=>!r.slots[0]?.preposition) ?? rows[0]!;
  return {kind:'act',actor:'PLAYER',verb,lexicalTable:table,syntax:row.id,...(prso?{prso}:{}),...(prsi?{prsi}:{})};
}
it('distinguishes shared nouns with source adjectives, aliases, lists and both operand slots',()=>{
  const iron={object:'KEY',noun:'KEY',adjective:'IRON'},gold={object:'GOLD-KEY',noun:'KEY',adjective:'GOLD'},green={object:'ROBOT-LABEL',noun:'PAPER',adjective:'GREEN'},news={object:'NEWSPAPER',noun:'PAPER',adjective:'NEWS'};
  const turns=[act('EXAMINE','EXAMINE',iron),act('EXAMINE','EXAMINE',gold),act('EXAMINE','EXAMINE',green),act('EXAMINE','EXAMINE',news),act('EXAMINE','EXAMINE',{object:'NEWSPAPER',noun:'NEWSPAPER'}),act('DROP','DROP',[iron,gold]),act('TAKE','TAKE',gold),act('GIVE','GIVE',gold,'ROBOT'),{...act('DROP','DROP',gold),actor:'ROBOT'},act('EXAMINE','EXAMINE',{object:'LAMP',noun:'LANTERN',adjective:'BRASS'}),act('PUT','PUT',iron,{object:'TEAPOT',noun:'TEAPOT',adjective:'CHINA'})];
  const spelling=['examine iron key','examine gold key','examine green paper','examine news paper','examine newspaper','drop iron key and gold key','take gold key','give gold key to robot','robot, drop gold key','examine brass lantern','put iron key in china teapot'];
  const {reference}=compareTurns(turns,spelling,[],{room:'MAGNET-ROOM',inventory:['KEY','GOLD-KEY','NEWSPAPER','ROBOT-LABEL','LAMP','TEAPOT']});
  expect(reference.final).toMatchObject({room:'MAGNET-ROOM',moves:9,deaths:0});
});
it('uses distinguishing adjectives without bypassing ambiguity, visibility or identity checks',()=>{
  const broken={object:'BROKEN-LAMP',noun:'LANTERN',adjective:'BROKEN'};
  compareTurns([act('EXAMINE','EXAMINE',broken),act('DROP','DROP',broken),act('TAKE','TAKE',broken)],['examine broken lantern','drop broken lantern','take broken lantern'],[],{room:'INSIDE-BARROW',inventory:['LAMP','BROKEN-LAMP']});
  const base=new Interpreter(game);base.run();const vm=prepareContext(base,{room:'INSIDE-BARROW',inventory:['LAMP','BROKEN-LAMP']}),before=vm.stateHash();
  expect(vm.executeAction(act('TAKE','TAKE',{object:'LAMP',noun:'LAMP',adjective:'BRASS'}))).toMatchObject({status:'error',cause:expect.stringContaining('ambiguous'),text:[],random:[]});expect(vm.stateHash()).toBe(before);
  const state=vm.world(),id=game.bundle.payload.world.entities.find(e=>e.name==='BROKEN-LAMP')!.id,invisible=game.bundle.payload.symbols.symbols.find(s=>s.name==='INVISIBLE')!.number!;
  state.setFlag(id,invisible);const cp=vm.checkpoint();cp.world=state.snapshot();const hidden=Interpreter.restore(game,cp);
  expect(hidden.executeAction(act('EXAMINE','EXAMINE',broken)).text.join('')).toContain("You can't see any broken lantern here!");
});
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
it('runs blocked exits through MAIN-LOOP-1 with the original fatal result and clock timing',()=>{
  const directions=['OUT','SOUTH','DOWN','SOUTH','DOWN'];
  const {reference}=compareTurns(directions.map(direction=>({kind:'walk',actor:'PLAYER',direction})),directions.map(d=>d.toLowerCase()));
  expect(reference.transcript[1]).toContain('There is no way out.');
  expect(reference.transcript[3]).toContain('narrowly averting a fatal fall.');
  expect(reference.transcript[5]).toContain('The drop would be fatal.');
  expect(reference.final).toMatchObject({room:'FOOT-BRIDGE',moves:5,deaths:0});
});
it('compares closed/open door movement and a blocked conditional exit against original full turns',()=>{
  const afterDoor=['SOUTH','NORTH','SOUTH','DOWN','DOWN','SOUTH','EAST'];
  const turns=[{kind:'walk',actor:'PLAYER',direction:'SOUTH'},act('UNLOCK','UNLOCK','PDOOR','KEY'),act('OPEN','OPEN','PDOOR'),act('TURN','LAMP-ON','LAMP'),...afterDoor.map(direction=>({kind:'walk',actor:'PLAYER',direction}))];
  const {reference}=compareTurns(turns,['south','unlock door with key','open door','turn on lamp',...afterDoor.map(d=>d.toLowerCase())],[],{room:'DREARY-ROOM',inventory:['KEY','LAMP']});
  expect(reference.transcript[1]).toContain('The door made of oak is closed.');
  expect(reference.transcript[3]).toContain('The door is now open.');
  expect(reference.transcript.at(-1)).toContain("That's a wall there.");
  expect(reference.final).toMatchObject({room:'MARBLE-HALL',moves:11,deaths:0});
});
it('uses the source conditional exit fallback when its flag is false and no message exists',()=>{
  const directions=['SOUTH','SW','WEST'];
  const {reference}=compareTurns([act('TURN','LAMP-ON','LAMP'),...directions.map(direction=>({kind:'walk',actor:'PLAYER',direction})),act('LOOK','LOOK')],['turn on lamp',...directions.map(d=>d.toLowerCase()),'look'],[],{room:'SHALLOW-FORD',inventory:['LAMP']});
  expect(reference.transcript[4]).toContain("You can't go that way.");
  expect(reference.final).toMatchObject({room:'STREAM-PATH',moves:5,deaths:0});
});
it('lets a routine exit either refuse movement or choose the destination during full turns',()=>{
  const directions=['NORTH','EAST','WEST'];
  const {reference}=compareTurns(directions.map(direction=>({kind:'walk',actor:'PLAYER',direction})),directions.map(d=>d.toLowerCase()),[],{room:'MAGNET-ROOM',inventory:[]});
  expect(reference.transcript[1]).toContain("You can't go that way.");expect(reference.transcript[2]).toContain('Machine Room');
  expect(reference.final).toMatchObject({room:'MAGNET-ROOM',moves:3,deaths:0});
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
    for(const name of ['P-NCN','P-GETFLAGS','P-NAM','P-ADJ','P-XADJ','P-SLOCBITS','P-AND','P-MULT','P-WON','P-NOT-HERE','P-CONT','QUOTE-FLAG','P-LEN','P-DIR','SCORE','WAND-ON','SPELL-VICTIM','WINNER','PRSA','PRSO','PRSI','LIT'])expect(world.global(name),spelling[i]+' '+name).toBe(original.globals[name]);
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
    for(const name of ['SPELL-USED','P-ADJN','P-XNAM','P-XADJN']){const own=world.global(name),expected=original.globals[name]!;expect(own?own-dictionary.base:null,spelling[i]+' '+name).toBe(expected?expected-originalDictionary:null);}
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
  const opaque=fixture(false);expect(opaque.executeAction(act('EXAMINE','EXAMINE','LAMP')).text.join('')).toContain("You can't see any lamp here!");
  for(const vm of [fixture(true),fixture(true,true)])expect(vm.executeAction(act('EXAMINE','EXAMINE','LAMP'))).toMatchObject({status:'suspended',wait:{kind:'parser'}});
});
it('handles missing indirect operands and rolls back ambiguity and command-budget exhaustion',()=>{
  const base=new Interpreter(game);base.run();
  expect(base.executeAction(act('PUT','PUT-ON','LAMP','GAZEBO-TABLE')).text.join('')).toContain("You don't have the lamp.");
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

it('handles missing list members and rolls back simultaneous multiplicity and ALL overflow',()=>{
  const base=new Interpreter(game);base.run();
  expect(base.executeAction(act('TAKE','TAKE',['LAMP','ROBOT'])).text.join('')).toContain("other object that you mentioned isn't here");const hash=base.stateHash();
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
it('keeps pseudo planning pure, handles a missing operand and rolls back remote features or exhausted output',()=>{
  const base=new Interpreter(game);base.run();const hole={pseudo:{room:'TEA-ROOM',word:'HOLE'}},action=act('EXAMINE','EXAMINE',hole),before=base.stateHash();
  expect(prepareAction(game,base.world(),action).direct).toMatchObject({kind:'objects',objects:[{pseudo:{word:'HOLE'}}]});expect(base.stateHash()).toBe(before);
  expect(base.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('declared room'),text:[]});expect(base.stateHash()).toBe(before);
  const tea=prepareContext(base,{room:'TEA-ROOM',inventory:[]});
  expect(tea.executeAction(act('PUT','PUT','ROBOT',hole)).text.join('')).toContain("You don't have that!");
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
it('resolves a multi-word PLAYER SAY continuation through the original HELLO object handler',()=>{
  const action={...say('SAY',['HELLO','LAMP']),continuation:act('HELLO','HELLO','LAMP')};
  const {reference}=compareTurns([action,act('LOOK','LOOK')],['say "hello lamp"','look']);
  expect(reference.transcript[1]).toContain('say "Hello" to a lamp.');expect(reference.checkpoints.filter(c=>c.input===0&&c.kind==='action-complete')).toHaveLength(2);
  expect(reference.final.moves).toBe(3);
});
it('runs structured multi-word robot quotations with direct/indirect adjectives and ordinary scope',()=>{
  const quoted=(verb:'SAY'|'ANSWER'|'INCANT',words:string[],continuation:ReturnType<typeof act>)=>({...say(verb,words),actor:'ROBOT',continuation});
  const iron={object:'KEY',noun:'KEY',adjective:'IRON'},gold={object:'GOLD-KEY',noun:'KEY',adjective:'GOLD'},pot={object:'TEAPOT',noun:'TEAPOT',adjective:'CHINA'};
  const turns=[quoted('SAY',['DROP','LAMP'],act('DROP','DROP','LAMP')),quoted('SAY',['TAKE','LAMP'],act('TAKE','TAKE','LAMP')),quoted('ANSWER',['PUT','IRON','KEY','IN','CHINA','TEAPOT'],act('PUT','PUT',iron,pot)),quoted('INCANT',['TAKE','IRON','KEY','FROM','CHINA','TEAPOT'],act('TAKE','TAKE',iron,pot,'FROM')),quoted('ANSWER',['GIVE','GOLD','KEY','TO','ROBOT'],act('GIVE','GIVE',gold,'ROBOT')),quoted('SAY',['EXAMINE','BRASS','LANTERN'],act('EXAMINE','EXAMINE',{object:'LAMP',noun:'LANTERN',adjective:'BRASS'})),act('LOOK','LOOK')];
  const {reference}=compareTurns(turns,['robot, say "drop lamp"','robot, say "take lamp"','robot, answer "put iron key in china teapot"','robot, incant "take iron key from china teapot"','robot, answer "give gold key to robot"','robot, say "examine brass lantern"','look'],[],{room:'MAGNET-ROOM',inventory:['LAMP','KEY','GOLD-KEY','TEAPOT']});
  expect(reference.transcript[1]).toContain('Dropped.');expect(reference.transcript[2]).toContain('Taken.');expect(reference.transcript[5]).toContain('The robot gladly takes');
  for(let input=0;input<6;input++)expect(reference.checkpoints.filter(c=>c.input===input&&c.kind==='action-complete')).toHaveLength(3);
});
it('preserves ordered quoted lists and ALL search order through repeated actor commands',()=>{
  const quoted=(words:string[],continuation:ReturnType<typeof act>)=>({...say('SAY',words),actor:'ROBOT',continuation});
  const turns=[quoted(['DROP','SWORD','AND','LAMP'],act('DROP','DROP',['SWORD','LAMP'])),quoted(['TAKE','ALL'],act('TAKE','TAKE','ALL')),quoted(['DROP','ALL'],act('DROP','DROP','ALL')),quoted(['TAKE','ALL'],act('TAKE','TAKE','ALL')),act('LOOK','LOOK')];
  const {reference}=compareTurns(turns,['robot, say "drop sword and lamp"','robot, say "take all"','robot, say "drop all"','robot, say "take all"','look'],[],{room:'MAGNET-ROOM',inventory:['LAMP','SWORD']});
  expect(reference.transcript[1]!.indexOf('elvish sword:')).toBeLessThan(reference.transcript[1]!.indexOf('lamp:'));
  expect(reference.final.moves).toBe(9);
});
it('preserves a quoted direct list followed by a single indirect operand',()=>{
  const action={...say('ANSWER',['GIVE','LAMP','AND','SWORD','TO','ROBOT']),actor:'ROBOT',continuation:act('GIVE','GIVE',['LAMP','SWORD'],'ROBOT')};
  const {reference}=compareTurns([action,act('LOOK','LOOK')],['robot, answer "give lamp and sword to robot"','look'],[],{room:'MAGNET-ROOM',inventory:['LAMP','SWORD']});
  expect(reference.transcript[1]).toContain('lamp: The robot gladly takes');expect(reference.transcript[1]).toContain('elvish sword: The robot gladly takes');
  expect(reference.final.moves).toBe(3);
});
it.each(['list','all'] as const)('runs translated MANY refusal for a quoted indirect %s without a command clock tick',kind=>{
  const words=kind==='list'?['PUT','LAMP','ON','LAMP','AND','SWORD']:['PUT','LAMP','ON','ALL'];
  const action={...say('INCANT',words),actor:'ROBOT',continuation:act('PUT','PUT-ON','LAMP',kind==='list'?['LAMP','SWORD']:'ALL')};
  const {reference}=compareTurns([action,act('LOOK','LOOK')],['robot, incant "'+words.join(' ').toLowerCase()+'"','look'],[],{room:'MAGNET-ROOM',inventory:['LAMP','SWORD']});
  expect(reference.transcript[1]).toContain('multiple indirect objects');expect(reference.final.moves).toBe(2);
});
it('lets a quoted ALL action mix per-object success and refusal under one command tick',()=>{
  const action={...say('ANSWER',['PUT','ALL','IN','TEAPOT']),actor:'ROBOT',continuation:act('PUT','PUT','ALL','TEAPOT')};
  const {reference}=compareTurns([action,act('LOOK','LOOK')],['robot, answer "put all in teapot"','look'],[],{room:'MAGNET-ROOM',inventory:['LAMP','SWORD','TEAPOT','KEY']});
  expect(reference.transcript[1]).toContain('rusty iron key: Done.');expect(reference.transcript[1]).toContain("china teapot: How can you do that?");expect(reference.transcript[1]).toContain("There's no room.");
  expect(reference.final.moves).toBe(3);
});
it('preserves distinguishing adjectives and lexical ordering in a quoted list',()=>{
  const iron={object:'KEY',noun:'KEY',adjective:'IRON'},gold={object:'GOLD-KEY',noun:'KEY',adjective:'GOLD'};
  const drop={...say('SAY',['DROP','IRON','KEY','AND','GOLD','KEY']),actor:'ROBOT',continuation:act('DROP','DROP',[iron,gold])};
  const take={...say('ANSWER',['TAKE','GOLD','KEY','AND','IRON','KEY']),actor:'ROBOT',continuation:act('TAKE','TAKE',[gold,iron])};
  const {reference}=compareTurns([drop,take,act('LOOK','LOOK')],['robot, say "drop iron key and gold key"','robot, answer "take gold key and iron key"','look'],[],{room:'MAGNET-ROOM',inventory:['KEY','GOLD-KEY']});
  expect(reference.transcript[1]!.indexOf('rusty iron key:')).toBeLessThan(reference.transcript[1]!.indexOf('delicate gold key:'));
  expect(reference.transcript[2]!.indexOf('delicate gold key:')).toBeLessThan(reference.transcript[2]!.indexOf('rusty iron key:'));
});
it('runs original global fallback and TAKE-CHECK refusal for empty-inventory quoted ALL',()=>{
  const action={...say('SAY',['DROP','ALL']),actor:'ROBOT',continuation:act('DROP','DROP','ALL')};
  const {reference}=compareTurns([action,act('LOOK','LOOK')],['robot, say "drop all"','look'],[],{room:'MAGNET-ROOM',inventory:[]});
  expect(reference.transcript[1]).toContain("You don't have");expect(reference.final.moves).toBe(2);
});
it('handles missing quoted list members and rolls back every mutation on budget failure',()=>{
  const base=new Interpreter(game);base.run();const local=prepareContext(base,{room:'MAGNET-ROOM',inventory:[]}),before=local.stateHash();
  const missing={...say('SAY',['TAKE','PAPER','AND','LAMP']),actor:'ROBOT',continuation:act('TAKE','TAKE',['ROBOT-LABEL','LAMP'])};
  expect(local.executeAction(missing).text.join('')).toContain("object that you mentioned isn't here");
  const held=prepareContext(base,{room:'MAGNET-ROOM',inventory:['LAMP','SWORD']}),action={...say('INCANT',['DROP','ALL']),actor:'ROBOT',continuation:act('DROP','DROP','ALL')};
  const success=Interpreter.restore(game,held.checkpoint()),result=success.executeAction(action);expect(result).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  for(const [budget,value] of [['steps',success.inspect().steps-1],['output',result.text.join('').length-1]] as const){
    const cp=held.checkpoint();cp.steps=0;cp.output=0;cp.limits[budget]=value;const limited=Interpreter.restore(game,cp),hash=limited.stateHash();
    expect(limited.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('budget'),text:[],random:[]});expect(limited.stateHash()).toBe(hash);
  }
});
it('runs translated implicit taking inside a quoted command without another acquisition turn',()=>{
  const action={...say('ANSWER',['TURN','OFF','LAMP']),actor:'ROBOT',continuation:act('TURN','LAMP-OFF','LAMP')};
  const {reference}=compareTurns([act('DROP','DROP','LAMP'),action,act('LOOK','LOOK')],['drop lamp','robot, answer "turn off lamp"','look'],[],{room:'MAGNET-ROOM',inventory:['LAMP']});
  expect(reference.transcript[2]).toContain('(Taken)');expect(reference.final.moves).toBe(4);
});
it('lets translated spell handling consume quoted words before the authored continuation is scoped',()=>{
  const action={...say('SAY',['HELLO','ROBOT']),continuation:act('HELLO','HELLO','ROBOT')};
  const {reference}=compareTurns([act('WAVE','WAVE','WAND','SWORD'),action],['wave wand at sword','say "hello robot"'],[],{room:'INSIDE-BARROW',inventory:['WAND']});
  expect(reference.transcript[2]).toContain('The wand glows very brightly');expect(reference.checkpoints.filter(c=>c.input===1&&c.kind==='action-complete')).toHaveLength(1);
});
it('handles missing quoted operands and rolls back the whole quotation on budget failure',()=>{
  const base=new Interpreter(game);base.run();const local=prepareContext(base,{room:'MAGNET-ROOM',inventory:[]}),before=local.stateHash();
  const take={...say('SAY',['TAKE','LAMP']),actor:'ROBOT',continuation:act('TAKE','TAKE','LAMP')};
  expect(local.executeAction(take).text.join('')).toContain("You can't see any lamp here!");
  const held=prepareContext(base,{room:'MAGNET-ROOM',inventory:['LAMP','TEAPOT']}),action={...say('ANSWER',['PUT','LAMP','IN','TEAPOT']),actor:'ROBOT',continuation:act('PUT','PUT','LAMP','TEAPOT')};
  const successful=Interpreter.restore(game,held.checkpoint()),result=successful.executeAction(action);expect(result).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  for(const [budget,value] of [['steps',successful.inspect().steps-1],['output',result.text.join('').length-1]] as const){
    const cp=held.checkpoint();cp.steps=0;cp.output=0;cp.limits[budget]=value;const limited=Interpreter.restore(game,cp),hash=limited.stateHash();
    expect(limited.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('budget'),text:[],random:[]});expect(limited.stateHash()).toBe(hash);
  }
});
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
it('rolls back unsupported spoken continuations and budgets across SAY HELLO',()=>{
  const base=new Interpreter(game);base.run();const before=base.stateHash();
  expect(base.executeAction(say('SAY',['HELLO','LAMP']))).toMatchObject({status:'error',cause:expect.stringContaining('spoken command'),text:[],random:[]});expect(base.stateHash()).toBe(before);
  expect(base.executeAction({...say('SAY',['HELLO']),actor:'ROBOT'}).text.join('')).toContain("You can't see any robot here!");
  const success=Interpreter.restore(game,base.checkpoint());expect(success.executeAction(say('SAY',['HELLO']))).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  const limited=base.checkpoint();limited.steps=0;limited.limits.steps=success.inspect().steps-1;
  const bounded=Interpreter.restore(game,limited),boundedHash=bounded.stateHash();expect(bounded.executeAction(say('SAY',['HELLO']))).toMatchObject({status:'error',cause:expect.stringContaining('step budget'),text:[],random:[]});expect(bounded.stateHash()).toBe(boundedHash);
  const output=base.checkpoint();output.output=0;output.limits.output=3;
  const quiet=Interpreter.restore(game,output),quietHash=quiet.stateHash();expect(quiet.executeAction(say('SAY',['HELLO']))).toMatchObject({status:'error',cause:expect.stringContaining('output budget'),text:[],random:[]});expect(quiet.stateHash()).toBe(quietHash);
});
it('runs actor speech through TELL, refusal and the retained player command continuation',()=>{
  const robot=(verb:'SAY'|'ANSWER'|'INCANT',word:string)=>({...say(verb,[word]),actor:'ROBOT'});
  const {reference}=compareTurns([robot('SAY','HELLO'),robot('ANSWER','HELLO'),robot('INCANT','FROBOZZ'),robot('SAY','L'),robot('INCANT','FROBOZZZZ'),act('LOOK','LOOK')],['robot, say "hello"','robot, answer "hello"','robot, incant "frobozz"','robot, say "l"','robot, incant "frobozzzz"','look'],[],{room:'MAGNET-ROOM',inventory:[]});
  for(let input=0;input<5;input++)expect(reference.checkpoints.filter(c=>c.input===input&&c.kind==='action-complete')).toHaveLength(3);
  expect(reference.transcript[1]).toContain('My programming is insufficient');expect(reference.transcript[1]).toContain('Hello.');
  expect(reference.transcript[3]).toContain('The FROBOZZ Corporation');expect(reference.final).toMatchObject({room:'MAGNET-ROOM',winner:'ADVENTURER',moves:11});
});
it.each(['SAY','ANSWER','INCANT'] as const)('runs source word and no-verb failures after robot %s without an extra clock tick',verb=>{
  const words=['XYZZYUNKNOWN','WELL','YES','OF','GREEN','NEWSPAPER','THE'];
  const {reference,vm}=compareTurns([...words.map(word=>({...say(verb,[word]),actor:'ROBOT'})),act('LOOK','LOOK')],[...words.map(word=>'robot, '+verb.toLowerCase()+' "'+word.toLowerCase()+'"'),'look'],[],{room:'MAGNET-ROOM',inventory:[]});
  expect(reference.transcript[1]).toContain(verb==='SAY'?'Nothing happens.':`I don't know the word "xyzzyunknown".`);
  expect(reference.transcript[2]).toContain('There was no verb in that sentence!');
  expect(reference.transcript[4]).toContain(verb==='SAY'?'Nothing happens.':'You used the word "of"');
  expect(reference.final).toMatchObject({room:'MAGNET-ROOM',winner:'ADVENTURER',moves:8});
  expect(vm.world().global('P-WON')).toBe(1);
});
it('rolls back word-error writes, output and RNG if the rejection exceeds a command budget',()=>{
  const base=new Interpreter(game);base.run();const local=prepareContext(base,{room:'MAGNET-ROOM',inventory:[]});
  for(const word of ['XYZZYUNKNOWN','WELL','GREEN']){
    const action={...say('ANSWER',[word]),actor:'ROBOT'},success=Interpreter.restore(game,local.checkpoint()),result=success.executeAction(action);
    expect(result).toMatchObject({status:'suspended',wait:{kind:'parser'}});expect(success.world().global('P-WON')).toBe(0);
    for(const [budget,value] of [['steps',success.inspect().steps-1],['output',result.text.join('').length-1]] as const){
      const cp=local.checkpoint();cp.steps=0;cp.output=0;cp.limits[budget]=value;
      const limited=Interpreter.restore(game,cp),before=limited.stateHash();
      expect(limited.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('budget'),text:[],random:[]});expect(limited.stateHash()).toBe(before);
    }
  }
});
it.each([false,true])('lets the unicorn cancel a quoted actor command before speech (structured=%s)',structured=>{
  const directions=['SOUTH','SOUTH','SOUTH','SW','SOUTH','SE'];
  const speech=structured?{...say('SAY',['TAKE','LAMP']),actor:'UNICORN',continuation:act('TAKE','TAKE','LAMP')}:{...say('SAY',['HELLO']),actor:'UNICORN'};
  const {reference}=compareTurns([act('TAKE','TAKE','LAMP'),act('TURN','LAMP-ON','LAMP'),...directions.map(direction=>({kind:'walk',actor:'PLAYER',direction})),speech,act('LOOK','LOOK')],['take lamp','turn on lamp',...directions.map(d=>d.toLowerCase()),structured?'unicorn, say "take lamp"':'unicorn, say "hello"','look']);
  expect(reference.transcript[9]).toContain('The unicorn listens distractedly');expect(reference.checkpoints.filter(c=>c.input===8&&c.kind==='action-complete')).toHaveLength(1);
  expect(reference.final).toMatchObject({room:'GARDEN-NORTH',moves:9});
});
it('rolls back actor speech and its extra command on unsupported continuations and budget failures',()=>{
  const base=new Interpreter(game);base.run();const local=prepareContext(base,{room:'MAGNET-ROOM',inventory:[]}),before=local.stateHash();
  for(const words of [['HELLO','LAMP'],['SAY'],['123'],['AGAIN'],['OOPS'],['THEN'],['ALL']]){
    expect(local.executeAction({...say('ANSWER',words),actor:'ROBOT'})).toMatchObject({status:'error',cause:expect.stringContaining('spoken command'),text:[],random:[]});expect(local.stateHash()).toBe(before);
  }
  const action={...say('SAY',['HELLO']),actor:'ROBOT'},success=Interpreter.restore(game,local.checkpoint());
  expect(success.executeAction(action)).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  for(const [budget,value,cause] of [['steps',success.inspect().steps-1,'step budget'],['output',3,'output budget']] as const){
    const cp=local.checkpoint();cp.steps=0;cp.output=0;cp.limits[budget]=value;const limited=Interpreter.restore(game,cp),hash=limited.stateHash();
    expect(limited.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining(cause),text:[],random:[]});expect(limited.stateHash()).toBe(hash);
  }
  const state=local.world(),robot=game.bundle.payload.world.entities.find(e=>e.name==='ROBOT')!.id,invisible=game.bundle.payload.symbols.symbols.find(s=>s.name==='INVISIBLE')!.number!;
  state.setFlag(robot,invisible);const cp=local.checkpoint();cp.world=state.snapshot();const hidden=Interpreter.restore(game,cp),hash=hidden.stateHash();
  expect(hidden.executeAction(action).text.join('')).toContain("You can't see any robot here!");
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
it('handles missing actor operands and hidden actors and rolls back both passes on execution limits',()=>{
  const base=new Interpreter(game);base.run();const remoteHash=base.stateHash();
  expect(base.executeAction({kind:'walk',actor:'ROBOT',direction:'EAST'}).text.join('')).toContain("You can't see any robot here!");
  const local=prepareContext(base,{room:'MAGNET-ROOM',inventory:[]}),before=local.stateHash();
  expect(local.executeAction({...act('TAKE','TAKE','LAMP'),actor:'ROBOT'}).text.join('')).toContain("I don't see any lamp here!");
  const world=local.world(),robot=game.bundle.payload.world.entities.find(e=>e.name==='ROBOT')!.id,invisible=game.bundle.payload.symbols.symbols.find(s=>s.name==='INVISIBLE')!.number!;
  world.setFlag(robot,invisible);const hidden=local.checkpoint();hidden.world=world.snapshot();const obscured=Interpreter.restore(game,hidden),hiddenHash=obscured.stateHash();
  expect(obscured.executeAction({kind:'walk',actor:'ROBOT',direction:'EAST'}).text.join('')).toContain("You can't see any robot here!");
  const action={kind:'walk',actor:'ROBOT',direction:'EAST'},success=Interpreter.restore(game,local.checkpoint());expect(success.executeAction(action).status).toBe('suspended');
  const limited=local.checkpoint();limited.steps=0;limited.limits.steps=success.inspect().steps-1;
  const bounded=Interpreter.restore(game,limited),boundedHash=bounded.stateHash();expect(bounded.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('step budget'),text:[],random:[]});expect(bounded.stateHash()).toBe(boundedHash);
  const output=local.checkpoint();output.output=0;output.limits.output=3;const quiet=Interpreter.restore(game,output),quietHash=quiet.stateHash();
  expect(quiet.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('output budget'),text:[],random:[]});expect(quiet.stateHash()).toBe(quietHash);
});


it('matches original missing direct/indirect nouns, adjectives, lists and actor cancellation',()=>{
  const broken={object:'BROKEN-LAMP',noun:'LANTERN',adjective:'BROKEN'};
  const turns=[act('TAKE','TAKE','ROBOT'),act('EXAMINE','EXAMINE',broken),act('PUT','PUT-ON','LAMP','GAZEBO-TABLE'),act('PUT','PUT','ROBOT','TEAPOT'),act('TAKE','TAKE',['LAMP','ROBOT','SWORD']),act('DROP','DROP',['SWORD','ROBOT','LAMP']),{kind:'walk',actor:'ROBOT',direction:'EAST'},{...say('SAY',['HELLO']),actor:'ROBOT'},act('LOOK','LOOK')];
  const {reference}=compareTurns(turns,['take robot','examine broken lantern','put lamp on table','put robot in teapot','take lamp and robot and sword','drop sword and robot and lamp','robot, east','robot, say "hello"','look']);
  expect(reference.transcript[4]).toContain("You don't have that!");
  expect(reference.transcript[5]).toContain("object that you mentioned isn't here");
});
it('matches missing operands during actor commands and authored quoted continuations',()=>{
  const turns=[{...act('TAKE','TAKE','LAMP'),actor:'ROBOT'},{...say('SAY',['TAKE','LAMP']),actor:'ROBOT',continuation:act('TAKE','TAKE','LAMP')},{...say('SAY',['TAKE','PAPER','AND','LAMP']),actor:'ROBOT',continuation:act('TAKE','TAKE',['ROBOT-LABEL','LAMP'])},act('LOOK','LOOK')];
  compareTurns(turns,['robot, take lamp','robot, say "take lamp"','robot, say "take paper and lamp"','look'],[],{room:'MAGNET-ROOM',inventory:[]});
});
it('matches the original dark-room missing-object refusal without advancing the clock',()=>{
  const directions=['SOUTH','SOUTH','SOUTH','SW','SOUTH'];
  const turns=[...directions.map(direction=>({kind:'walk',actor:'PLAYER',direction})),act('EXAMINE','EXAMINE','LAMP'),act('TAKE','TAKE','ROBOT'),{kind:'walk',actor:'ROBOT',direction:'EAST'},{kind:'walk',actor:'PLAYER',direction:'NORTH'}];
  const {reference}=compareTurns(turns,[...directions.map(d=>d.toLowerCase()),'examine lamp','take robot','robot, east','north']);
  expect(reference.transcript[6]).toContain("It's too dark to see!");
});


it('matches missing indirect objects, multiple missing list entries and source check precedence',()=>{
  compareTurns([act('TAKE','TAKE','LAMP'),act('GIVE','GIVE','LAMP','ROBOT'),act('PUT','PUT-ON','LAMP','GAZEBO-TABLE'),act('WAVE','WAVE','ROBOT','TEAPOT'),act('TAKE','TAKE',['ROBOT','TEAPOT']),act('GIVE','GIVE','LAMP',['ROBOT','TEAPOT'])],['take lamp','give lamp to robot','put lamp on table','wave robot at teapot','take robot and teapot','give lamp to robot and teapot']);
});
it('keeps object identity strict and rolls back missing-match writes, list mutations and output on budget failure',()=>{
  const base=new Interpreter(game);base.run();const before=base.stateHash();
  expect(base.executeAction(act('EXAMINE','EXAMINE',{object:'BROKEN-LAMP',noun:'LAMP'}))).toMatchObject({status:'error',cause:expect.stringContaining('ambiguous'),text:[],random:[]});expect(base.stateHash()).toBe(before);
  const action=act('TAKE','TAKE',['LAMP','ROBOT']),success=Interpreter.restore(game,base.checkpoint()),result=success.executeAction(action);expect(result).toMatchObject({status:'suspended',wait:{kind:'parser'}});
  for(const [budget,value] of [['steps',success.inspect().steps-1],['output',result.text.join('').length-1]] as const){
    const cp=base.checkpoint();cp.steps=0;cp.output=0;cp.limits[budget]=value;const vm=Interpreter.restore(game,cp),hash=vm.stateHash();
    expect(vm.executeAction(action)).toMatchObject({status:'error',cause:expect.stringContaining('budget'),text:[],random:[]});expect(vm.stateHash()).toBe(hash);
  }
});


it('executes a surviving quoted direction through the original movement fast path',()=>{
  compareTurns([{...say('SAY',['EAST']),actor:'ROBOT'},act('LOOK','LOOK'),{kind:'walk',actor:'PLAYER',direction:'WEST'},{...say('SAY',['WEST']),actor:'ROBOT',continuation:{kind:'walk',actor:'PLAYER',direction:'WEST'}},act('LOOK','LOOK')],['robot, say "east"','look','west','robot, say "west"','look'],[],{room:'MAGNET-ROOM',inventory:[]});
});
