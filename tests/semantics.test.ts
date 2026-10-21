import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { semanticsInventory, executable } from '../tools/zil/semantics.ts';
import { semanticsProbes } from '../tools/zil/semantics-probes.ts';
import { verifyPrimitiveInventory, scratchGroups, parserBufferGlobals, protocolGlobals } from '../tools/zil/semantics-contract.ts';
import { read, head } from '../src/zil/index.ts';

const inventory=semanticsInventory(),probes=semanticsProbes();
const scenario=(id:string)=>probes.cases.find(c=>c.id===id)!;
const parses=(id:string)=>scenario(id).checkpoints.filter(c=>c.kind==='parser-return');
const completed=(id:string)=>scenario(id).checkpoints.filter(c=>c.kind==='action-complete');

describe('phase 2.0 compatibility evidence',()=>{
  it('audits every selected routine and every operation against an independent contract',()=>{
    expect(inventory.counts).toEqual({routines:439,parserRoutines:42,operations:70});
    expect(inventory).toEqual(JSON.parse(readFileSync('reference/semantics-inventory.json','utf8')));
    expect(()=>verifyPrimitiveInventory([...inventory.operations.map(o=>o.operation),'UNSUPPORTED'])).toThrow('unknown [UNSUPPORTED]');
    expect(()=>verifyPrimitiveInventory(inventory.operations.map(o=>o.operation).filter(o=>o!=='READ'))).toThrow('unused [READ]');
    expect(inventory.operations.find(o=>o.operation==='READ')!.sites.map(s=>s.routine)).toEqual(['PARSER','FINISH','YES?']);
  });
  it('does not mistake quoted data or type declarations for runtime primitives',()=>{
    const doc=read('#DECL ((X) <PRIMTYPE VECTOR>) \'<TYPE-DATA> <GET ,X 0>','fixture.zil');
    expect([...executable(doc.nodes)].map(head).filter(Boolean)).toEqual(['GET']);
  });
  it('classifies globals explicitly without dropping persistent gameplay parser context',()=>{
    expect(inventory.globalPolicies).toHaveLength(168);
    const declared=[...scratchGroups.flatMap(g=>[...g.names]),...parserBufferGlobals,...protocolGlobals];
    expect(new Set(declared).size).toBe(declared.length);
    for(const name of declared)expect(inventory.globalPolicies.some(g=>g.name===name)).toBe(true);
    for(const name of ['PRSO','PRSI','HERE','WINNER','LIT','P-IT-OBJECT','P-GETFLAGS','P-WON','P-NAM','P-ADJ','HELLOS','YUKS'])
      expect(inventory.globalPolicies.find(g=>g.name===name)?.policy).toBe('included-game-state');
    expect(inventory.parserClassification.find(r=>r.name==='LIT?')).toMatchObject({policy:'kept',writes:['HERE','P-GWIMBIT','P-SLOCBITS','P-TABLE'],tableWrites:[',P-MERGE']});
    expect(inventory.parserClassification.find(r=>r.name==='WORD-PRINT')?.policy).toBe('kept');
  });
  it('finds all literal-base header accesses including fixed-font changes',()=>{
    expect(inventory.headerAccesses).toHaveLength(10);
    expect([...new Set(inventory.headerAccesses.map(s=>s.routine))]).toEqual(['V-SCRIPT','V-UNSCRIPT','V-VERSION','FIXED-FONT-ON','FIXED-FONT-OFF']);
    expect(completed('header').map(c=>c.header)).toEqual([
      {release:63,serial:'860811',flags2:0},{release:63,serial:'860811',flags2:1},{release:63,serial:'860811',flags2:0},
    ]);
  });
  it('reproduces the binary probes twice without altering the phase 0 corpus',()=>{
    expect(probes).toEqual(semanticsProbes());
    expect(probes).toEqual(JSON.parse(readFileSync('reference/semantics-probes.json','utf8')));
  });
  it('preserves stale scalar operands, syntax and unused lexical records',()=>{
    const [take,all,walk]=parses('ordinary-and-all');
    expect(take!.globals.PRSO).toBe(0);
    expect(take!.matchTables['P-PRSO']).toEqual([149]);
    expect(all!.globals.PRSO).toBe(149);
    expect(all!.globals['P-GETFLAGS']).toBe(1);
    expect(walk!.lex.count).toBe(1);expect(walk!.lex.words[1]!.word).toBe('ALL');
    expect(walk!.syntax).toBe(take!.syntax);
    expect(walk!.globals['P-WON']).toBe(28);expect(walk!.globals.PRSO).toBe(28);expect(walk!.globals['P-WALK-DIR']).toBe(28);
  });
  it('distinguishes quoted speech from noun-based REPLY and checks exact word/byte units',()=>{
    const one=parses('speech-one')[0]!,two=parses('speech-two')[0]!,unquoted=parses('speech-unquoted')[0]!;
    expect(one.globals).toMatchObject({'P-CONT':5,'QUOTE-FLAG':1,PRSA:19});
    expect(one.lex).toMatchObject({capacity:59,count:2});
    expect(one.lex.words.slice(0,4).map(w=>[w.index,w.word,w.length,w.offset])).toEqual([[1,'ANSWER',6,1],[3,'QUOTE',1,8],[5,'WELL',4,9],[7,'QUOTE',1,13]]);
    expect(two.lex.count).toBe(3);expect(two.lex.words[3]!.word).toBe('WELL');
    expect(unquoted.globals).toMatchObject({'P-CONT':0,'QUOTE-FLAG':0,PRSA:20});
    expect(completed('speech-one').at(-1)?.summary.moves).toBe(22);
  });
  it('keeps the extra SAY HELLO pass and the zero-cost actor TELL pass',()=>{
    expect(completed('speech-say').map(c=>c.summary.moves)).toEqual([1,2]);
    const actor=parses('actor');
    expect(actor.map(c=>c.summary.winner)).toEqual(['ADVENTURER','ROBOT','ADVENTURER']);
    expect(actor[0]!.globals).toMatchObject({'P-CONT':5,'QUOTE-FLAG':1});
    expect(actor[0]!.lex.words[1]!).toMatchObject({word:'THEN',text:','});
    expect(actor[1]!.globals).toMatchObject({'P-CONT':0,'QUOTE-FLAG':0,PRSA:140,PRSO:30});
    expect(completed('actor').map(c=>c.summary.moves)).toEqual([40,41,42]);
    expect(parses('actor-quoted')[0]!.globals['P-CONT']).toBe(7);
  });
  it('exercises the real wand, implicit take, pseudo name and nested decision READ',()=>{
    expect(parses('wand')[0]!.lex.words[2]!.word).toBe('FLOAT');
    expect(scenario('wand').transcript[0]).toContain('menhir floats');
    expect(parses('implicit-take')[0]!.globals.PRSO).toBe(83);
    expect(scenario('implicit-take').transcript[0]).toContain('(Taken)');
    expect(parses('pseudo')[0]!.matchTables['P-PRSO']).toEqual([249]);
    expect(scenario('pseudo').transcript[0]).toContain('stalag.');
    expect(scenario('decision').checkpoints.some(c=>c.kind==='read'&&c.routine==='YES?')).toBe(true);
    expect(completed('decision').map(c=>c.summary.moves)).toEqual([0,0]);
  });
});
