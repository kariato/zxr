import { readFileSync } from 'node:fs';
import type { LoadedGame, WorldState } from '../../src/engine/index.ts';
import { logicExpressions } from '../../src/zil/index.ts';
import { decodeState } from '../reference/state.ts';
import { loadSymbols, STORY } from '../reference/symbols.ts';

const referenceSymbols=loadSymbols(),referenceStory=readFileSync(STORY);

/** Independent clock comparison against an original-story dynamic-memory checkpoint.
 * Compare all 30 slots (including unused ones), typed routine identities, the unused
 * allocation tail, scheduling bounds and the lantern's changing table cursor/flags. */
export function auditClock(game:LoadedGame,world:WorldState,ram:Buffer){
  const symbols=referenceSymbols,state=decodeState(ram),story=referenceStory;
  const equal=(own:unknown,expected:unknown,label:string)=>{if(JSON.stringify(own)!==JSON.stringify(expected))throw new Error('Clock '+label+' differs: '+JSON.stringify(own)+' vs '+JSON.stringify(expected));};
  for(const name of ['MOVES','C-INTS','C-DEMONS','CLOCK-WAIT','MATCH-COUNT','DEATHS'])equal(world.global(name),state.globals[name],name);
  const base=world.global('C-TABLE'),original=state.globals['C-TABLE']!;
  for(let offset=0;offset<180;offset+=6){
    for(let n=0;n<2;n++)equal(world.getWord(base+offset,n),ram.readUInt16BE(original+offset+2*n),'slot '+offset+' word '+n);
    const own=world.getWord(base+offset,2),expected=ram.readUInt16BE(original+offset+4);
    equal(own?game.routine(own)?.name ?? own:0,expected?symbols.byAddress.get(expected*2)?.name ?? expected:0,'slot '+offset+' routine');
  }
  equal(Array.from({length:180},(_,n)=>world.getByte(base+180+n)),[...ram.subarray(original+180,original+360)],'unused allocation tail');
  const lampTable=game.bundle.payload.memory.tables.find(t=>t.owner==='LAMP-TABLE')!;
  const originalLampTable=story.readUInt16BE(story.readUInt16BE(12)+2*symbols.globals.indexOf('LAMP-TABLE'));
  equal(world.global('LAMP-TABLE')-lampTable.base,state.globals['LAMP-TABLE']!-originalLampTable,'lantern table cursor');
  for(const name of ['LAMP','MATCH']){
    const id=game.bundle.payload.world.entities.find(e=>e.name===name)!.id,object=state.objects.find(o=>o.name===name)!;
    for(const flag of ['ONBIT','RMUNGBIT','FLAMEBIT']){
      const bit=game.bundle.payload.symbols.symbols.find(s=>s.name===flag)!.number!;
      equal(world.hasFlag(id,bit),(parseInt(object.attributes.slice(2*(bit>>>3),2*(bit>>>3)+2),16)&(128>>>(bit%8)))!==0,name+' '+flag);
    }
  }
  return {slots:30,tailBytes:180,lanternCursor:world.global('LAMP-TABLE')-lampTable.base,moves:world.global('MOVES')};
}

/** Potential source reachability, not a claim that every game branch was exercised.
 * Roots are startup, verb/preaction dispatch, object handlers/pseudos and routine
 * exits. Traverse direct calls and first-class routine references, then require a
 * reachable QUEUE/INT registration and a callable runtime body for every original I-*.
 */
export function auditInterruptReachability(game:LoadedGame){
  const payload=game.bundle.payload,roots=new Set<number>([payload.initialization.routine.id]);
  for(const action of payload.vocabulary.actions){roots.add(action.routine.id);if(action.preaction)roots.add(action.preaction.id);}
  for(const entity of payload.world.entities){
    for(const p of entity.properties){if(p.kind==='routine'&&p.routine)roots.add(p.routine.id);if(p.kind==='pseudos')for(const e of p.entries)roots.add(e.routine.id);}
    for(const exit of entity.exits)for(const ref of exit.relocations)if(ref.kind==='routine')roots.add(ref.id);
  }
  const paths=new Map<number,string[]>(),queue=[...roots];
  for(const id of roots)paths.set(id,[game.routine(id)?.name ?? String(id)]);
  for(let i=0;i<queue.length;i++){
    const id=queue[i]!,routine=game.routine(id);if(!routine)continue;
    for(const e of logicExpressions(routine)){
      const next=e.op==='call'?e.routine.id:e.op==='symbol'&&e.kind==='routine'?e.value:null;
      if(next!==null&&!paths.has(next)){paths.set(next,[...paths.get(id)!,game.routine(next)?.name ?? String(next)]);queue.push(next);}
    }
  }
  return referenceSymbols.routines.filter(r=>r.name.startsWith('I-')).map(original=>{
    const routine=payload.logic.routines.find(r=>r.name===original.name);
    if(!routine||!paths.has(routine.id))throw new Error('Unreachable runtime interrupt '+original.name);
    const registrations=payload.logic.routines.filter(r=>paths.has(r.id)&&[...logicExpressions(r)].some(e=>e.op==='call'&&['QUEUE','INT'].includes(e.routine.name)&&e.args[0]?.op==='symbol'&&e.args[0].kind==='routine'&&e.args[0].value===routine.id)).map(r=>r.name);
    if(!registrations.length)throw new Error('Missing reachable clock registration for '+original.name);
    if([...logicExpressions(routine)].some(e=>e.op==='untranslated'||e.op==='unsupported-host'))throw new Error('Unsupported interrupt body '+original.name);
    return {name:routine.name,id:routine.id,path:paths.get(routine.id)!,registrations};
  });
}
