import { describe, expect, it } from 'vitest';
import { ReferenceRandom } from '../tools/reference/random.ts';
import { runReference } from '../tools/reference/runner.ts';
import { decodeState, memories } from '../tools/reference/state.ts';
import { auditReference } from '../tools/reference/audit.ts';
import { loadFixtures, executeFixture } from '../tools/reference/fixtures.ts';

describe('reference interpreter', () => {
  it('matches CPython integer-seed vectors, including seed zero', () => {
    const random = new ReferenceRandom(2);
    expect(Array.from({length:15},()=>random.draw(100))).toEqual([8,12,11,47,22,95,86,40,33,78,28,78,5,75,88]);
    random.seed(0);
    expect(Array.from({length:5},()=>random.draw(100))).toEqual([50,98,54,6,34]);
    const saved = random.snapshot(), future = Array.from({length:20},()=>random.draw(32767));
    random.restore(saved);
    expect(Array.from({length:20},()=>random.draw(32767))).toEqual(future);
    expect(()=>random.draw(0)).toThrow('Invalid random range');
  });
  it('observes original output with owned call stacks without changing reference execution', () => {
    const chunks:string[]=[];let look=false;
    const traced=runReference(['look'],2,{onOutput:event=>{chunks.push(event.text);look ||= event.stack.includes('V-LOOK');event.stack.length=0;}});
    expect(traced).toEqual(runReference(['look']));expect(chunks.join('')).toBe(traced.transcript.join(''));expect(look).toBe(true);
  });
  it('marks prepared contexts, owns their metadata and validates lit rooms and inventory',()=>{
    const context={room:'TEA-ROOM',inventory:['LAMP']},run=runReference(['examine hole','put lamp in hole'],2,{context});
    expect(run.preparedContext).toEqual(context);expect(run.transcript[1]).toContain('The hole is very small.');expect(run.transcript[2]).toContain("It doesn't fit through the hole.");
    const snapshots=[...memories(run)],initial=decodeState(snapshots[0]!),prepared=decodeState(snapshots[1]!);
    expect(initial.objects.find(o=>o.id===initial.globals['HERE'])!.name).toBe('INSIDE-BARROW');
    expect(prepared.objects.find(o=>o.id===prepared.globals['HERE'])!.name).toBe('TEA-ROOM');
    expect(prepared.globals['MOVES']).toBe(initial.globals['MOVES']);expect(runReference([]).preparedContext).toBeUndefined();
    context.inventory.push('SWORD');expect(run.preparedContext!.inventory).toEqual(['LAMP']);
    for(const bad of [{room:'MISSING',inventory:[]},{room:'RIDDLE-ROOM',inventory:[]},{room:'TEA-ROOM',inventory:['ROOMS']},{room:'TEA-ROOM',inventory:['LAMP','LAMP']},{room:'TEA-ROOM',inventory:['MISSING']}])expect(()=>runReference([],2,{context:bad})).toThrow(/context/);
  });
  it('records TAKE ALL match tables and one completed move for multiple objects', () => {
    const run = runReference(['take all']);
    const parsed = run.checkpoints.find(c=>c.kind === 'parser-return')!;
    expect(parsed.parser!.direct).toHaveLength(2);
    expect(parsed.parser!.indirect).toEqual([]);
    expect(parsed.parser!.syntax).toBeGreaterThan(0);
    expect(run.final.moves).toBe(1);
    expect(run.checkpoints.filter(c=>c.kind === 'action-complete')).toHaveLength(1);
  });
  it('reconstructs object attributes, property bytes, globals and interrupt ordering', () => {
    const run = runReference(['take lamp','turn on lamp','south']);
    const ram = [...memories(run)].at(-1)!, state = decodeState(ram);
    expect(state.globals['MOVES']).toBe(3);
    expect(state.objects.find(o=>o.name === 'LAMP')!.parent).toBe(state.objects.find(o=>o.name === 'ADVENTURER')!.id);
    expect(state.interrupts.some(i=>i.routine === 'I-LANTERN' && i.enabled === 1)).toBe(true);
    expect(state.objects.find(o=>o.name === 'LAMP')!.properties.length).toBeGreaterThan(0);
    run.checkpoints[0]!.patches.push([0,'00']);
    expect(()=>[...memories(run)]).toThrow('Snapshot checksum failed');
  });
  it('captures nested prompt READs and actual game exit', () => {
    const run = runReference(['quit','no','quit','yes']);
    expect(run.checkpoints.some(c=>c.kind === 'read' && c.routine === 'YES?')).toBe(true);
    expect(run.checkpoints.at(-1)!.kind).toBe('end');
    expect(()=>runReference(['quit','yes','look'])).toThrow('after the story stopped');
  });
  it('restores world state and the interpreter RNG with upstream Quetzal saves', () => {
    const run = runReference(['take lamp','save','wait','wait','restore','wait','wait']);
    expect(run.host.map(h=>[h.operation,h.success])).toEqual([['save',true],['restore',true]]);
    const draws = (from:number,to:number)=>run.random.filter(d=>d.input>=from && d.input<=to).map(d=>[d.range,d.result,d.routine]);
    expect(draws(2,3).length).toBeGreaterThan(0);
    expect(draws(2,3)).toEqual(draws(5,6));
    expect(run.final.room).toBe('INSIDE-BARROW');
  });
  it('records reseeds and enforces finite execution and input limits', () => {
    const run = runReference(['#random 19','wait']);
    expect(run.random.some(d=>d.range === -19 && d.result === 0 && d.reseed === 19 && d.routine === 'V-RANDOM')).toBe(true);
    expect(()=>runReference([] ,2,{maxInstructions:1})).toThrow('instruction budget');
    expect(()=>runReference(['λ'])).toThrow('Non-ASCII');
    expect(()=>runReference(['x'.repeat(121)])).toThrow('input capacity');
    const memory = [...memories(runReference([]))].at(-1)!;
    const capacity = memory[decodeState(memory).globals['P-INBUF']!]!;
    expect(()=>runReference(['x'.repeat(capacity)])).toThrow('input capacity');
    expect(()=>runReference(['x'.repeat(capacity-1)])).not.toThrow();
  });
  it('reaches 400 points, victory and the FINISH suspension in the pinned walkthrough', () => {
    const manifest = loadFixtures(), run = executeFixture(manifest.fixtures.find(f=>f.id === 'walkthrough')!,manifest.seed);
    expect(run.commands).toHaveLength(386);
    expect(run.final).toMatchObject({score:400,won:true,deaths:0,moves:419});
    expect(run.checkpoints.some(c=>c.kind === 'end' && c.stack.includes('FINISH'))).toBe(true);
  });
  it('checks the source/binary mapping and inventories every release-63 death and timer', () => {
    const audit = auditReference();
    expect(audit.routines).toHaveLength(439);
    expect(audit.routines.reduce((n,r)=>n+r.instructions,0)).toBe(7139);
    expect(audit.deathSites).toHaveLength(50);
    expect(audit.interrupts).toHaveLength(23);
    expect(audit.spotChecks).toHaveLength(20);
  });
});
