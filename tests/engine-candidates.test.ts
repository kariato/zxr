import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildCandidateCatalog, DISPATCH_LAYERS, generateCandidates, Interpreter, loadGame, prepareAction } from '../src/engine/index.ts';
import type { CandidateScope } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { recordCandidates } from '../tools/engine/candidates.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),catalog=buildCandidateCatalog(game);
const scope=(extra:Partial<CandidateScope>={}):CandidateScope=>({actor:'ADVENTURER',room:'INSIDE-BARROW',operands:['LAMP','SWORD'],parents:{LAMP:'INSIDE-BARROW',SWORD:'ADVENTURER'},...extra});
const family=(set:ReturnType<typeof generateCandidates>,id:string)=>set.families.find(f=>f.id===id)!;

it('commits the complete syntax membership and rank evidence for all 165 objects',()=>{
  const audit=recordCandidates(game);expect(audit).toEqual(JSON.parse(readFileSync('reference/candidate-audit.json','utf8')));
  expect(audit.objects).toHaveLength(165);expect(new Set(audit.objects.map(o=>o.object)).size).toBe(165);
  expect(audit.objects.every(o=>o.candidates==='all-families')).toBe(true);
  expect(catalog.families).toHaveLength(269);
  expect(new Set(catalog.families.map(f=>f.id)).size).toBe(269);
});
it('retains every syntax row, zero-object action, and direction with an empty scope',()=>{
  const set=generateCandidates(game,catalog,scope({operands:[]}));
  expect(set.families.map(f=>f.id).sort()).toEqual(catalog.families.map(f=>f.id).sort());
  expect(set.exits.map(e=>e.direction)).toEqual(game.bundle.payload.vocabulary.directions.map(d=>d.name));
  expect(set.exits.some(e=>e.direction==='NORTH')).toBe(true); // blocked at the initial barrow
  expect(family(set,'LOOK:12').operands).toEqual([]);
  expect(set.families.filter(f=>f.shadowedBy).map(f=>f.id).sort()).toEqual(['CLIMB:6','CLIMB:8']);
});
it('keeps FIND, possession, multiplicity and scope hints in their distinct roles',()=>{
  const set=generateCandidates(game,catalog,scope({operands:['AQUARIUM','SWORD'],parents:{},held:[]}));
  const attack=family(set,'ATTACK:1');expect(attack.slots[0]!.find).toBe('ACTORBIT');
  expect(attack.operands[0]!.map(o=>o.operand)).toContain('AQUARIUM');
  expect(attack.operands[1]!.map(o=>o.operand)).toContain('SWORD');
  expect(attack.slots[1]).toMatchObject({possession:['HAVE'],scopeHints:['HELD','CARRIED'],many:false});
  expect(family(set,'TAKE:8').slots[0]!.many).toBe(true);
  const vm=new Interpreter(game);vm.run();
  expect(prepareAction(game,vm.world(),{kind:'act',actor:'PLAYER',lexicalTable:'ATTACK',syntax:1,verb:'ATTACK',prso:'AQUARIUM',prsi:'SWORD'}).direct).toBeDefined();
});
it('boosts the indirect-object collar puzzle, room riddle, and container rule through their actual dispatch layers',()=>{
  const set=generateCandidates(game,catalog,scope({room:'CERBERUS-ROOM',operands:['COLLAR','CERBERUS'],parents:{}}));
  const put=family(set,'PUT:6'),dog=put.operands[1]!.find(o=>o.operand==='CERBERUS')!;
  expect(dog.evidence).toContainEqual(expect.objectContaining({layer:'indirect',handler:'CERBERUS-FCN',mentions:expect.arrayContaining(['CERBERUS-FCN'])}));
  expect(dog.score).toBeGreaterThanOrEqual(100);
  expect(put.score).toBeGreaterThan(family(set,'COUNT:1').score);
  const riddle=generateCandidates(game,catalog,scope({room:'RIDDLE-ROOM',operands:[]}));
  const answer=family(riddle,'ANSWER:2');expect(answer.input).toBe('say');
  expect(answer.evidence).toContainEqual(expect.objectContaining({layer:'room',handler:'RIDDLE-ROOM-FCN'}));
  expect(answer.score).toBeGreaterThan(family(riddle,'LOOK:12').score);
  const bucket=generateCandidates(game,catalog,scope({operands:['WATER'],parents:{WATER:'BUCKET'}}));
  expect(family(bucket,'TAKE:8').operands[0]![0]!.evidence).toContainEqual(expect.objectContaining({layer:'container',handler:'BUCKET-CONT'}));
  const moved=generateCandidates(game,catalog,scope({operands:['WATER'],parents:{WATER:'ADVENTURER'}}));
  expect(family(moved,'TAKE:8').operands[0]![0]!.evidence.some(e=>e.handler==='BUCKET-CONT')).toBe(false);
});
it('covers actor, room M-BEG, preaction, indirect, container, direct, default, and pseudo dispatch',()=>{
  const sets=[
    generateCandidates(game,catalog,scope({room:'RIDDLE-ROOM',operands:['CERBERUS','WATER',{pseudo:{room:'RIDDLE-ROOM',word:'RIDDLE'}}],parents:{WATER:'BUCKET'}})),
    generateCandidates(game,catalog,scope({actor:'ROBOT',room:'MACHINE-ROOM',operands:['LAMP'],parents:{}})),
  ];
  const layers=new Set(sets.flatMap(s=>s.families.flatMap(f=>[...f.evidence,...f.operands.flatMap(list=>list.flatMap(o=>o.evidence))])).map(e=>e.layer));
  expect([...layers].sort()).toEqual([...DISPATCH_LAYERS].sort());
  const pseudo=family(sets[0]!,'LOOK:8').operands[0]!.find(o=>typeof o.operand!=='string')!;
  expect(pseudo.evidence).toContainEqual(expect.objectContaining({layer:'pseudo',handler:'RIDDLE-PSEUDO'}));
});
it('dispatches M-BEG through the actor immediate location when riding inside a vehicle',()=>{
  const set=generateCandidates(game,catalog,scope({room:'WELL-BOTTOM',parents:{ADVENTURER:'BUCKET'}}));
  const kick=set.families.find(f=>f.verb==='KICK')!;
  expect(kick.evidence).toContainEqual(expect.objectContaining({layer:'room',owner:'BUCKET',handler:'BUCKET-FCN'}));
});
it('finds runtime ACTION assignments and transitive helper mentions without evaluating a branch',()=>{
  expect(catalog.dynamicAssignments.filter(a=>a.handlers.includes('MAGIC-ACTOR')).map(a=>a.writer).sort()).toEqual(['I-WIZARD','WIZARD-FCN']);
  const set=generateCandidates(game,catalog,scope());
  expect(family(set,'WAIT:1').evidence).toContainEqual(expect.objectContaining({layer:'actor',handler:'MAGIC-ACTOR',dynamic:true}));
  const dog=catalog.profiles.find(p=>p.routine==='CERBERUS-FCN')!;
  expect(dog.actions.find(a=>a.verb==='HELLO')!.mentions).toContain('HELLO?');
  // Pseudo routine pointers come from GLOBAL-CHECK's table read, represented by explicit PSEUDO declarations.
  expect(catalog.dynamicAssignments.filter(a=>a.unresolved)).toEqual([expect.objectContaining({writer:'GLOBAL-CHECK',target:'PSEUDO-OBJECT'})]);
  expect(catalog.unresolvedApplies.length).toBeGreaterThan(0);
});
it('uses independent slot lists and hint boosts without removing operands or forming pairs',()=>{
  const before=generateCandidates(game,catalog,scope()),after=generateCandidates(game,catalog,scope({held:['LAMP']}));
  const a=family(before,'ATTACK:1'),b=family(after,'ATTACK:1');
  expect(b.operands).toHaveLength(2);expect(b.operands.map(list=>list.length)).toEqual([2,2]);
  expect(b.operands[1]!.find(o=>o.operand==='LAMP')!.score-a.operands[1]!.find(o=>o.operand==='LAMP')!.score).toBe(1);
  expect(b.operands[1]!.find(o=>o.operand==='LAMP')!.hints).toEqual(['HELD']);
  expect(before.families.map(f=>f.id).sort()).toEqual(after.families.map(f=>f.id).sort());
});
it('does not change world, randomness, save bytes, scope inputs or immutable definitions',()=>{
  const vm=new Interpreter(game);vm.run();const before=vm.stateHash(),input=scope(),snapshot=JSON.stringify(input),definition=JSON.stringify(game.bundle);
  const first=generateCandidates(game,catalog,input);
  expect(generateCandidates(game,buildCandidateCatalog(game),input)).toEqual(first);
  expect(vm.stateHash()).toBe(before);expect(JSON.stringify(input)).toBe(snapshot);expect(JSON.stringify(game.bundle)).toBe(definition);
});
it('rejects mismatched definitions and misspelled scope identities',()=>{
  expect(()=>generateCandidates(game,{...catalog,buildHash:'wrong'},scope())).toThrow('another build');
  expect(()=>generateCandidates(game,catalog,scope({room:'MISSING'}))).toThrow('room');
  expect(()=>generateCandidates(game,catalog,scope({operands:['MISSING']}))).toThrow('operand');
  expect(()=>generateCandidates(game,catalog,scope({operands:[{pseudo:{room:'RIDDLE-ROOM',word:'MISSING'}}]}))).toThrow('pseudo');
  expect(()=>generateCandidates(game,catalog,scope({parents:{WATER:'MISSING'}}))).toThrow('parent');
});
it('owns result arrays and lexical operands so a caller cannot alter later queries',()=>{
  const operand={pseudo:{room:'RIDDLE-ROOM',word:'RIDDLE'}},input=scope({room:'RIDDLE-ROOM',operands:[operand]});
  const before=generateCandidates(game,catalog,input),changed=generateCandidates(game,catalog,input);
  const examine=family(changed,'LOOK:8');examine.slots[0]!.scopeHints.length=0;
  examine.operands[0]![0]!.evidence[0]!.mentions.length=0;
  (examine.operands[0]![0]!.operand as typeof operand).pseudo.word='ALTERED';
  expect(operand.pseudo.word).toBe('RIDDLE');expect(generateCandidates(game,catalog,input)).toEqual(before);
});
