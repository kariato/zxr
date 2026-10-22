import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadGame, WorldState } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { buildThreeRoom } from '../tools/zil/three-room.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
const small=loadGame(packBundle(buildThreeRoom())),full=loadGame(packBundle(compileSourcePath('reference/zork2')));
const object=(name:string)=>full.bundle.payload.memory.objects.find(o=>o.name===name)!.id;

describe('owned bundle loading and memory-backed world state',()=>{
  it('loads both games with frozen definitions and independent initial-memory copies',()=>{
    expect(small.bundle.payload.world.counts.rooms).toBe(3);expect(full.bundle.payload.logic.routines).toHaveLength(414);
    expect(full.routine(full.bundle.payload.initialization.routine.id)?.name).toBe('GO');expect(full.routine(full.bundle.payload.logic.adapter!.id)).toBeUndefined();
    const one=full.createInitialMemory(),two=full.createInitialMemory();one[0]=99;expect(two[0]).toBe(3);
    expect(()=>{full.bundle.payload.memory.bytes[0]=99;}).toThrow();
    expect(()=>{full.routine(1)!.body.length=0;}).toThrow();
  });
  it('validates the complete pre-GO world image without inventing startup mutations',()=>{
    const state=WorldState.create(full);expect(()=>state.validate()).not.toThrow();
    expect(state.snapshot().bytes).toEqual(full.bundle.payload.memory.bytes);expect(state.global('HERE')).toBe(0);
    for(const record of full.bundle.payload.memory.objects){const expected=full.bundle.payload.memory.bytes[record.address+4]!;expect(state.parent(record.id)).toBe(expected);}
  });
  it('preserves ordered child lists through insertion, reordering and removal',()=>{
    const w=WorldState.create(small);expect(w.move(3,1)).toBe(1);w.move(2,1);expect(w.children(1)).toEqual([2,3]);
    w.move(3,1);expect(w.children(1)).toEqual([3,2]);w.move(3,1);expect(w.children(1)).toEqual([3,2]);
    w.remove(3);expect(w.children(1)).toEqual([2]);expect(w.parent(3)).toBe(0);expect(w.nextSibling(3)).toBe(0);
    w.move(3,2);expect(w.children(2)).toEqual([3]);expect(w.in(3,2)).toBe(true);w.validate();
  });
  it('rejects tree cycles/invalid IDs before any structural mutation',()=>{
    const w=WorldState.create(small);w.move(2,1);w.move(3,2);const before=w.worldHash();
    for(const f of [()=>w.move(1,3),()=>w.move(2,2),()=>w.move(4,1),()=>w.move(1,0),()=>w.remove(0)])expect(f).toThrow();
    expect(w.worldHash()).toBe(before);w.validate();
  });
  it('implements all 32 attribute bits including the signed high bit',()=>{
    const w=WorldState.create(small);for(let flag=0;flag<32;flag++){expect(w.hasFlag(1,flag)).toBe(false);expect(w.setFlag(1,flag)).toBe(1);expect(w.hasFlag(1,flag)).toBe(true);w.setFlag(1,flag,false);expect(w.hasFlag(1,flag)).toBe(false);}
    expect(()=>w.setFlag(1,32)).toThrow();expect(()=>w.hasFlag(0,1)).toThrow();w.validate();
  });
  it('shares big-endian globals, byte/word table storage, header flags and pointer addresses',()=>{
    const w=WorldState.create(full),clock=full.bundle.payload.memory.tables.find(t=>t.owner==='C-TABLE')!,here=full.bundle.payload.memory.globals.find(g=>g.name==='HERE')!;
    w.putWord(clock.base,0,0x1234);expect(w.getByte(clock.base)).toBe(0x12);expect(w.getByte(clock.base,1)).toBe(0x34);
    w.putByte(clock.base,1,0xab);expect(w.getWord(clock.base)).toBe(0x12ab);expect(w.rest(clock.base,6)).toBe(clock.base+6);expect(w.back(w.rest(clock.base,6),6)).toBe(clock.base);
    w.setGlobal('HERE',object('INSIDE-BARROW'));expect(w.getWord(here.address)).toBe(object('INSIDE-BARROW'));expect(w.global(here.number)).toBe(object('INSIDE-BARROW'));
    expect(w.getWord(0,1)).toBe(63);w.putWord(0,8,3);expect(w.getByte(0,17)).toBe(3);w.validate();
  });
  it('enforces allocation bounds, protected/static bytes, integral offsets and word values',()=>{
    const w=WorldState.create(small),m=small.bundle.payload.memory,globals=m.segments.find(s=>s.name==='globals')!,dictionary=m.segments.find(s=>s.name==='dictionary')!;
    const before=w.worldHash();for(const f of [()=>w.putWord(0,1,99),()=>w.putByte(dictionary.base,0,1),()=>w.getWord(globals.base,globals.length/2),()=>w.rest(globals.base,globals.length+1),()=>w.getByte(0,-1),()=>w.getWord(0,0.5),()=>w.putWord(globals.base,0,65536),()=>w.global(255)])expect(f).toThrow();
    expect(w.worldHash()).toBe(before);const end=w.rest(globals.base,globals.length);expect(end).toBe(globals.base+globals.length);expect(w.back(end,globals.length)).toBe(globals.base);
    const following=m.segments.find(s=>s.base===end)!;expect(w.getWord(end)).toBe(w.getWord(following.base));expect(()=>w.getWord(globals.base,globals.length/2)).toThrow('bounds');
  });
  it('reads defaults and exact property addresses/lengths and writes existing byte/word properties',()=>{
    const w=WorldState.create(small),north=31;expect(w.getProperty(1,north)).toBe(2);const address=w.propertyAddress(1,north);expect(w.propertySize(address)).toBe(1);expect(w.propertySize(0)).toBe(0);
    expect(w.nextProperty(1,0)).toBe(31);expect(w.nextProperty(1,31)).toBe(0);expect(w.propertyAddress(1,14)).toBe(0);expect(w.getProperty(1,14)).toBe(0);
    w.putProperty(1,north,3);expect(w.getByte(address)).toBe(3);expect(()=>w.putProperty(1,14,1)).toThrow('existing');w.validate();
    const z=WorldState.create(full);expect(z.getProperty(object('INSIDE-BARROW'),14)).toBe(5);
    const pseudo=full.bundle.payload.memory.objects.find(o=>o.name==='PSEUDO-OBJECT')!,action=pseudo.properties.find(p=>p.name==='ACTION')!;expect(z.propertyAddress(pseudo.id,action.number)-5).toBe(pseudo.propertyTable+1);
  });
  it('forks memory with independent parent/child/grandchild writes and stable snapshots',()=>{
    const a=WorldState.create(small),b=a.fork(),c=b.fork();a.move(2,1);b.move(3,1);c.setGlobal('HERE',3);
    expect(a.children(1)).toEqual([2]);expect(b.children(1)).toEqual([3]);expect(c.children(1)).toEqual([]);expect(a.global('HERE')).toBe(1);expect(c.global('HERE')).toBe(3);
    const d=a.fork();a.remove(2);expect(d.children(1)).toEqual([2]);
    for(const w of [a,b,c,d]){w.validate();const snapshot=w.snapshot(),copy=WorldState.restore(small,snapshot);expect(copy.worldHash()).toBe(w.worldHash());snapshot.bytes[0]=99;expect(copy.getByte(0)).toBe(3);}
  });
  it('rejects corrupted snapshots, tree/property layouts and reference domains without changing a parent state',()=>{
    const base=WorldState.create(full),hash=base.worldHash(),fork=base.fork();fork.setGlobal('HERE',65535);expect(()=>fork.validate()).toThrow('Unknown object');expect(base.worldHash()).toBe(hash);
    const source=WorldState.create(small),snap=source.snapshot();snap.buildHash='bad';expect(()=>WorldState.restore(small,snap)).toThrow('incompatible');
    const staticBad=source.snapshot();staticBad.bytes[0]=4;expect(()=>WorldState.restore(small,staticBad)).toThrow('protected');
    const o=small.bundle.payload.memory.objects[0]!,bad=source.snapshot();bad.bytes[o.address+4]=1;expect(()=>WorldState.restore(small,bad)).toThrow(/cycle|membership/i);
    const property=source.snapshot();property.bytes[o.properties[0]!.address-1]=0;expect(()=>WorldState.restore(small,property)).toThrow('Property layout');
    const count=source.snapshot();count.bytes[o.propertyTable]=count.bytes[o.propertyTable]!+1;expect(()=>WorldState.restore(small,count)).toThrow('Short-name');
  });
});

it('records REF-001: pinned ifvms REMOVE retains a detached sibling, while ZXR closes the tree',()=>{
  const world=WorldState.create(small);world.move(3,1);world.move(2,1);
  const require=createRequire(import.meta.url),{ZVM}=require('ifvms'),{MemoryView}=require('ifvms/src/common/utils.js'),original=new ZVM();
  original.version3=true;original.m=MemoryView(Buffer.from(world.snapshot().bytes));original.ram=original.m;
  original.objects=small.bundle.payload.memory.objects[0]!.address-9;
  original.remove_obj(2);world.remove(2);
  expect([original.get_parent(2),original.get_sibling(2),original.get_child(1)]).toEqual([0,3,3]);
  expect([world.parent(2),world.nextSibling(2),world.firstChild(1)]).toEqual([0,0,3]);
  expect(world.children(1)).toEqual([3]);world.validate();
});
