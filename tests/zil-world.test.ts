import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeSymbols, compileWorldMetadata, decodeZilText, expandMacros, head, loadProgram } from '../src/zil/index.ts';
import type { Sequence, SymbolLayout, WorldEntity, WorldMetadata } from '../src/zil/index.ts';
import { auditWorldMetadata, auditWorldSpotChecks, buildWorldMetadata, propertyValue } from '../tools/zil/world.ts';

const world=buildWorldMetadata();
const entity=(name:string,data=world)=>data.entities.find(e=>e.name===name)!;
const prop=(e:WorldEntity,name:string)=>e.properties.find(p=>p.property.name===name)!;
const scalar=(e:WorldEntity,name:string)=>propertyValue(prop(e,name));
const properties={
  'P?SIZE':14,'P?CAPACITY':9,'P?VALUE':8,'P?TVALUE':1,'P?LDESC':13,'P?FDESC':10,'P?TEXT':7,'P?ACTION':15,
  'P?SYNONYM':17,'P?ADJECTIVE':16,'P?GLOBAL':12,'P?PSEUDO':11,'P?CONTFCN':4,'P?ADVFCN':3,'P?DESCFCN':6,
  'P?VTYPE':5,'P?STRENGTH':2,'P?NORTH':31,'P?IN':21,'LOW-DIRECTION':18,
  'A?RED':255,'A?BLUE':254,'FLAG':0,'FX?FLAG':32768,
};
/** Deliberately explicit fixture layout; production numbering remains reference-assisted. */
function compile(source:string,extra:Partial<SymbolLayout>={}) {
  const p=loadProgram(new Map([['zork2.zil',source]])),expanded=expandMacros(p.forms,p.definitions,p.globals);
  const declarations=(kinds:string[])=>p.forms.filter(n=>kinds.includes(head(n) ?? '')).map(n=>(n as Sequence).items[1]).map(n=>n?.kind==='atom'?n.value:'');
  const layout:SymbolLayout={objects:declarations(['ROOM','OBJECT']),routines:declarations(['ROUTINE']),globals:[],words:[{name:'ITEM'},{name:'FEATURE'}],constants:properties,...extra};
  const analysis=analyzeSymbols(p,expanded.forms,layout);return compileWorldMetadata(expanded.forms,analysis);
}

describe('Zork II world metadata generation',()=>{
  it('emits all rooms/objects deterministically without claiming a runtime bundle',()=>{
    expect(world.counts).toEqual({rooms:86,objects:165,properties:795,exits:220});
    expect(world.stage).toBe('metadata');expect(world.entities.map(e=>e.id)).toEqual(Array.from({length:251},(_,i)=>i+1));
    expect(world).toEqual(buildWorldMetadata());
    expect(world).toEqual(JSON.parse(readFileSync('games/zork2/world.zxr.json','utf8')));
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
    expect(world.entities.every(e=>!e.properties.some(p=>p.property.number>=18))).toBe(true);
  });
  it('matches every metadata property, parent, flag and short name to assembly and binary',()=>{
    const audit=auditWorldMetadata(world);
    expect(audit.checked).toEqual({entities:251,rooms:86,objects:165,shortNames:251,metadataProperties:795,textProperties:175,propertyDefaults:31,exitProperties:220,exitKinds:{UEXIT:163,NEXIT:21,FEXIT:11,CEXIT:13,DEXIT:12}});
    expect(audit).toEqual(JSON.parse(readFileSync('reference/world-audit.json','utf8')));
    const spots=auditWorldSpotChecks(world);expect(spots).toHaveLength(20);expect(spots.filter(s=>s.kind==='room')).toHaveLength(10);expect(spots.filter(s=>s.kind==='object')).toHaveLength(10);
  });
  it('distinguishes containment, local globals, pseudo features and the ROOMS direction property',()=>{
    expect(entity('ROOMS').parent).toBeNull();expect(entity('ROOMS').exits).toHaveLength(1);
    expect(entity('ROOMS').exits[0]).toMatchObject({property:{name:'IN',number:21},declaration:'(IN TO ROOMS)'});
    expect(scalar(entity('NARROW-TUNNEL'),'GLOBAL')).toEqual(['BRIDGE','CHASM','STREAM','MOSS']);
    expect(entity('MOSS').parent?.name).toBe('LOCAL-GLOBALS');
    expect(scalar(entity('GREAT-CAVERN'),'PSEUDO')).toEqual([['STALAGMITE','STALA-PSEUDO'],['STALACTITE','STALA-PSEUDO']]);
    expect(world.entities.filter(e=>e.name==='PSEUDO-OBJECT')).toHaveLength(1);
    expect(entity('TEA-ROOM').exits.find(e=>e.property.name==='EAST')?.declaration).toContain('Only a mouse could get in there.');
  });
  it('keeps explicit zero properties separate from missing defaults and startup changes',()=>{
    expect(world.propertyDefaults.find(p=>p.name==='SIZE')).toMatchObject({number:14,value:5});
    expect(prop(entity('SEWL'),'SIZE')).toMatchObject({kind:'number',value:0});
    expect(entity('INSIDE-BARROW').properties.some(p=>p.property.name==='SIZE')).toBe(false);
    expect(prop(entity('ADVENTURER'),'ACTION')).toMatchObject({kind:'routine',routine:null,byteLength:2});
    expect(entity('ADVENTURER').parent).toBeNull();expect(scalar(entity('BUCKET'),'VTYPE')).toBe(0);
    expect(entity('ADVENTURER').flags.find(f=>f.name==='SACREDBIT')?.number).toBe(0);
  });
  it('preserves metadata source ranges and property layouts without assigning addresses',()=>{
    const lamp=entity('LAMP'),size=prop(lamp,'SIZE'),source=readFileSync('reference/zork2/2dungeon.zil','utf8');
    expect(source.slice(size.source.start.offset,size.source.end.offset)).toBe('(SIZE 15)');
    expect(source.slice(lamp.shortName.source!.start.offset,lamp.shortName.source!.end.offset)).toBe('(DESC "lamp")');
    expect(prop(lamp,'SYNONYM')).toMatchObject({kind:'words',byteLength:6});
    expect(prop(lamp,'ADJECTIVE')).toMatchObject({kind:'adjectives',byteLength:1});
    const words=prop(lamp,'SYNONYM');if(words.kind!=='words')throw new Error('Wrong kind');
    expect(words.words.map(w=>w.name)).toEqual(['LAMP','LANTERN','LIGHT']);
    expect(words.words.every(w=>w.dictionaryIndex>0&&!('address' in w))).toBe(true);
    expect(prop(entity('GREAT-CAVERN'),'PSEUDO').byteLength).toBe(8);
    expect(lamp.properties.map(p=>p.property.number)).toEqual([17,16,15,14,10]);
  });
  it('folds formatting newlines while retaining explicit newlines, indentation and a single space',()=>{
    expect(decodeZilText('one\ntwo\r\nthree')).toBe('one two three');
    expect(decodeZilText('Warning!|\n|\n  "quoted"|\n')).toBe('Warning!\n\n  "quoted"\n');
    expect(decodeZilText('\n|    ****  You have died  ****\n|\n|')).toBe(' \n    ****  You have died  **** \n\n');
    expect(decodeZilText(' ')).toBe(' ');expect(scalar(entity('MENHIR-ROOM'),'LDESC')).toBe(' ');
    expect(scalar(entity('MACHINE-ROOM'),'LDESC')).toContain('says\n       "DANGER -- HIGH VOLTAGE"\nThere are exits');
  });
  it('supports numeric metadata including TVALUE when the layout declares it',()=>{
    const result=compile('<PROPDEF SIZE 5> <OBJECT ROOT> <OBJECT ITEM (IN ROOT) (DESC "item") (SIZE 0) (TVALUE 12) (VALUE -1) (FLAGS FLAG) (TEXT "read|\\\"this\\\"")>');
    const item=entity('ITEM',result);expect(item.parent).toEqual({name:'ROOT',id:1});
    expect(scalar(item,'SIZE')).toBe(0);expect(scalar(item,'TVALUE')).toBe(12);expect(scalar(item,'VALUE')).toBe(65535);expect(scalar(item,'TEXT')).toBe('read\n"this"');
    expect(item.flags).toEqual([{name:'FLAG',number:0}]);
  });
  it('refuses cycles, malformed values, unknown properties and invalid property lengths',()=>{
    expect(()=>compile('<OBJECT ROOT (IN ITEM)> <OBJECT ITEM (IN ROOT)>')).toThrow('Initial containment cycle');
    expect(()=>compile('<OBJECT ROOT (DESC "one" "two")>')).toThrow('DESC requires 1 value');
    expect(()=>compile('<OBJECT ROOT (SIZE "one")>')).toThrow('Expected an atom name');
    expect(()=>compile('<OBJECT ROOT (FLAGS FLAG FLAG)>')).toThrow('Duplicate flag');
    expect(()=>compile('<OBJECT ROOT (SYNONYM ITEM ITEM ITEM ITEM ITEM)>')).toThrow('exceeds the V3 property size');
    expect(()=>compile('<OBJECT ROOT (PSEUDO "FEATURE")>')).toThrow('PSEUDO requires word/routine pairs');
    expect(()=>compile('<OBJECT ROOT (CUSTOM 1)>',{constants:{...properties,'P?CUSTOM':6}})).toThrow('Unsupported object property CUSTOM');
    expect(()=>compile('<OBJECT ROOT (ACTION UNKNOWN)>')).toThrow('Undefined symbol UNKNOWN');
  });
  it('rejects changed world metadata immediately, including names paired with the wrong IDs',()=>{
    const mutation=(change:(w:WorldMetadata)=>void,expected:string)=>{const copy=structuredClone(world);change(copy);expect(()=>auditWorldMetadata(copy)).toThrow(expected);};
    mutation(w=>{entity('LAMP',w).parent!.id=1;},'parent name/id');
    mutation(w=>{entity('LAMP',w).flags.pop();},'flags');
    mutation(w=>{entity('LAMP',w).shortName.text='wrong';},'DESC');
    mutation(w=>{const p=prop(entity('LAMP',w),'SIZE');if(p.kind==='number')p.value=1;},'assembly values');
    mutation(w=>{const p=prop(entity('LAMP',w),'FDESC');if(p.kind==='text')p.text='wrong';},'assembly values');
    mutation(w=>{const p=prop(entity('LAMP',w),'SYNONYM');if(p.kind==='words')p.words[0]!.dictionaryIndex=1;},'dictionary index');
    mutation(w=>{const p=prop(entity('LAMP',w),'ACTION');if(p.kind==='routine'&&p.routine)p.routine.id=1;},'routine id');
    mutation(w=>{const p=prop(entity('NARROW-TUNNEL',w),'GLOBAL');if(p.kind==='objects')p.objects[0]!.name='LAMP';},'local GLOBAL id');
    mutation(w=>{w.propertyDefaults[13]!.value=0;},'property defaults');
    mutation(w=>{w.counts.rooms=0;},'counts');
  });
});
