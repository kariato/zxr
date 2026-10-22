import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeExit, deriveExitGraph, encodeExit, linkExit, read } from '../src/zil/index.ts';
import type { EncodedExit, Sequence, WorldMetadata } from '../src/zil/index.ts';
import { auditWorldMetadata, buildWorldMetadata, worldSymbolAnalysis } from '../tools/zil/world.ts';

const {analysis}=worldSymbolAnalysis(),world=buildWorldMetadata();
const encode=(source:string)=>encodeExit(read(source,'exits.zil').nodes[0] as Sequence,analysis);
const number=(name:string)=>analysis.symbols.find(s=>s.name===name)!.number!;
const get=(entity:string,direction:string,data=world)=>data.entities.find(e=>e.name===entity)!.exits.find(e=>e.property.name===direction)!;

describe('exit property encoding',()=>{
  it('uses the original five lengths, field offsets and zero padding',()=>{
    expect(encode('(NORTH TO TEA-ROOM)').bytes).toEqual([190]);
    const blocked=encode('(DOWN "Stop!|\nReally.")');
    expect(blocked.bytes).toEqual([0,0]);expect(blocked.relocations).toEqual([{kind:'string',offset:0,text:'Stop!\nReally.'}]);
    const routine=encode('(NORTH PER MAGNET-ROOM-EXIT)');
    expect(routine.bytes).toEqual([1,67,0]);expect(routine.byteLength).toBe(3);
    expect(encode('(WEST TO VOLCANO-BOTTOM IF GNOME-DOOR-FLAG)').bytes).toEqual([176,88,0,0]);
    expect(encode('(SOUTH TO WIZARDS-WORKSHOP IF WIZ-DOOR IS OPEN)').bytes).toEqual([45,43,0,0,0]);
    expect(number('GNOME-DOOR-FLAG')).toBe(88); // Variable number for VALUE, never its current value/address.
  });
  it('links message words big-endian, preserves absent vs empty messages and does not mutate inputs',()=>{
    for(const clause of ['(NORTH "")','(NORTH TO TEA-ROOM IF GNOME-DOOR-FLAG ELSE "")','(NORTH TO TEA-ROOM IF WIZ-DOOR IS OPEN ELSE "")']){
      const exit=encode(clause),before=structuredClone(exit),offset=exit.byteLength===2?0:2;
      expect(decodeExit(exit,analysis)).toMatchObject({message:''});
      const linked=linkExit(exit,()=>0x1234);expect(linked.slice(offset,offset+2)).toEqual([0x12,0x34]);expect(exit).toEqual(before);
      if(exit.byteLength===5)expect(linked[4]).toBe(0);
    }
    expect(decodeExit(encode('(NORTH TO TEA-ROOM IF WIZ-DOOR IS OPEN)'),analysis)).toMatchObject({message:null});
    const r=encode('(NORTH PER MAGNET-ROOM-EXIT)');
    expect(linkExit(r,()=>{throw new Error('No string');})).toEqual([1,67,0]);
    expect(linkExit(r,()=>0,(name,id)=>{expect(name).toBe('MAGNET-ROOM-EXIT');expect(id).toBe(323);return 0xabcd;})).toEqual([0xab,0xcd,0]);
    for(const bad of [0,-1,65536,1.5,NaN])expect(()=>linkExit(encode('(NORTH "blocked")'),()=>bad)).toThrow('nonzero 16-bit');
  });
  it('derives graph entries from bytes and relocation data, ignoring source text and cached views',()=>{
    const exit=encode('(NORTH TO TEA-ROOM IF GNOME-DOOR-FLAG ELSE "No.")');
    exit.declaration='(NORTH TO LIBRARY)';exit.bytes[0]=number('LIBRARY');
    expect(decodeExit(exit,analysis)).toEqual({kind:'CEXIT',to:'LIBRARY',global:'GNOME-DOOR-FLAG',message:'No.'});
    const copy=structuredClone(world);get('WELL-TOP','EAST',copy).view={kind:'UEXIT',to:'LIBRARY'};
    const graph=deriveExitGraph(copy.entities,analysis);
    expect(graph.find(e=>e.from==='WELL-TOP'&&e.direction==='EAST')).toEqual({from:'WELL-TOP',direction:'EAST',kind:'UEXIT',to:'TEA-ROOM'});
  });
  it('covers every declaration including blocked/routine exits and the ROOMS self-exit with no dangling destination',()=>{
    const graph=deriveExitGraph(world.entities,analysis);expect(graph).toHaveLength(220);
    expect(graph.filter(e=>e.from==='ROOMS')).toEqual([{from:'ROOMS',direction:'IN',kind:'UEXIT',to:'ROOMS'}]);
    const byName=new Map(world.entities.map(e=>[e.name,e]));
    for(const edge of graph)if('to' in edge)expect(byName.get(edge.to)?.kind==='room'||edge.to==='ROOMS').toBe(true);
    expect(graph.filter(e=>e.kind==='FEXIT')).toHaveLength(11);expect(graph.filter(e=>e.kind==='NEXIT')).toHaveLength(21);
    const visited=new Set<string>();
    const visit=(name:string)=>{
      if(visited.has(name))return;visited.add(name);expect(byName.has(name)).toBe(true);
      for(const edge of graph.filter(e=>e.from===name))if('to' in edge)visit(edge.to);
    };
    for(const e of world.entities.filter(e=>e.kind==='room'||e.name==='ROOMS'))visit(e.name);
    expect(visited.size).toBe(87);
    expect(()=>deriveExitGraph(world.entities.filter(e=>e.name!=='TEA-ROOM'),analysis)).toThrow('Dangling exit destination');
    for(const e of world.entities)for(const p of e.exits){
      const source=readFileSync('reference/zork2/'+p.source.file,'utf8');
      expect(source.slice(p.source.start.offset,p.source.end.offset).startsWith('('+p.property.name)).toBe(true);
    }
  });
  it('rejects malformed clauses, wrong symbol domains and changed ABI layout constants',()=>{
    for(const clause of ['(NORTH)','(NORTH TO)','(NORTH TO TEA-ROOM EXTRA)','(NORTH PER MAGNET-ROOM-EXIT EXTRA)',
      '(NORTH "blocked" "extra")','(NORTH TO TEA-ROOM IF WIZ-DOOR IS SHUT)',
      '(NORTH TO TEA-ROOM IF GNOME-DOOR-FLAG ELSE)','(NORTH TO TEA-ROOM IF GNOME-DOOR-FLAG ELSE 1)',
      '(NORTH TO TEA-ROOM IF GNOME-DOOR-FLAG ELSE "No" EXTRA)','(NORTH TO LAMP)',
      '(NORTH PER LAMP)','(NORTH TO TEA-ROOM IF LAMP)','(SIZE TO TEA-ROOM)'])expect(()=>encode(clause),clause).toThrow();
    const changed=structuredClone(analysis);changed.symbols.find(s=>s.name==='DEXIT')!.number=6;
    expect(()=>encodeExit(read('(NORTH TO TEA-ROOM)').nodes[0] as Sequence,changed)).toThrow('Incompatible exit layout DEXIT');
  });
  it('rejects corrupt payloads, missing relocations, wrong padding and dangling numbers',()=>{
    const mutation=(source:string,change:(e:EncodedExit)=>void,expected:string)=>{
      const exit=encode(source);change(exit);expect(()=>decodeExit(exit,analysis)).toThrow(expected);
    };
    mutation('(NORTH TO TEA-ROOM)',e=>{e.bytes[0]=0;},'Dangling exit');
    mutation('(NORTH TO TEA-ROOM)',e=>{e.byteLength=2;},'Invalid exit byte');
    mutation('(NORTH "no")',e=>{e.relocations=[];},'Blocked exit requires');
    mutation('(NORTH "no")',e=>{e.bytes[0]=1;},'Invalid exit string relocation');
    mutation('(NORTH "no")',e=>{e.relocations.push(e.relocations[0]!);},'Overlapping');
    mutation('(NORTH PER MAGNET-ROOM-EXIT)',e=>{e.bytes[2]=1;},'padding');
    mutation('(NORTH PER MAGNET-ROOM-EXIT)',e=>{e.bytes[1]=0;},'routine relocation');
    mutation('(NORTH TO TEA-ROOM IF WIZ-DOOR IS OPEN)',e=>{e.bytes[4]=1;},'padding');
    mutation('(NORTH TO TEA-ROOM IF GNOME-DOOR-FLAG)',e=>{e.bytes[2]=1;},'Unresolved exit string');
    mutation('(NORTH TO TEA-ROOM IF GNOME-DOOR-FLAG)',e=>{e.bytes[1]=0;},'Dangling exit global');
    const e=encode('(NORTH "no")');e.relocations[0]!.offset=-1;expect(()=>linkExit(e,()=>1)).toThrow('offset');
  });
  it('audits all exit bytes against assembly/binary and detects changes in every exit domain',()=>{
    const audit=auditWorldMetadata(world);expect(audit.checked.exitProperties).toBe(220);
    expect(audit.checked.exitKinds).toEqual({UEXIT:163,NEXIT:21,FEXIT:11,CEXIT:13,DEXIT:12});
    const mutate=(change:(w:WorldMetadata)=>void)=>{const copy=structuredClone(world);change(copy);expect(()=>auditWorldMetadata(copy)).toThrow();};
    mutate(w=>{const p=get('WELL-TOP','EAST',w);p.bytes[0]=number('LIBRARY');p.view=decodeExit(p,analysis);});
    mutate(w=>{const p=get('WELL-TOP','DOWN',w),r=p.relocations[0]!;if(r.kind==='string')r.text='wrong';p.view=decodeExit(p,analysis);});
    mutate(w=>{const p=get('LEDGE-1','WEST',w);p.bytes[1]=number('SECRET-DOOR');p.view=decodeExit(p,analysis);});
    mutate(w=>{const p=get('GUARDIAN-ROOM','SOUTH',w);p.bytes[1]=number('PDOOR');p.view=decodeExit(p,analysis);});
    mutate(w=>{const p=get('MAGNET-ROOM','NORTH',w);p.bytes[1]=1;});
    mutate(w=>{get('WELL-TOP','EAST',w).view={kind:'UEXIT',to:'LIBRARY'};});
    mutate(w=>{w.entities.find(e=>e.name==='WELL-TOP')!.exits.pop();w.counts.exits--;});
  });
});
