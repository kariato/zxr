import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeSymbols, compileVocabulary, expandMacros, loadProgram, read, SYNTAX_FLAGS } from '../src/zil/index.ts';
import type { Sequence, SymbolLayout, Vocabulary } from '../src/zil/index.ts';
import { auditVocabulary, buildVocabulary } from '../tools/zil/vocabulary.ts';

const vocabulary=buildVocabulary();
const verb=(name:string,v=vocabulary)=>v.verbs.find(t=>t.name===name)!;
const word=(name:string,v=vocabulary)=>v.words.find(w=>w.name===name)!;
function compile(source:string,extra:Partial<SymbolLayout>={}){
  const p=loadProgram(new Map([['zork2.zil',source]])),expanded=expandMacros(p.forms,p.definitions,p.globals);
  const layout:SymbolLayout={objects:[],globals:[],routines:['V-TEST'],words:[{name:'TEST'}],constants:{'ACT?TEST':255,'V?TEST':0},...extra};
  return compileVocabulary(expanded.forms,analyzeSymbols(p,expanded.forms,layout));
}
const fixture=(syntax:string)=>compile('<ROUTINE V-TEST ()> '+syntax,{words:[{name:'TEST'},{name:'TO'}],constants:{'ACT?TEST':255,'V?TEST':0,'PR?TO':255,'FLAG':0,'FX?FLAG':32768}});

describe('Zork II vocabulary compilation',()=>{
  it('generates a deterministic JSON artifact covering every active declaration and word',()=>{
    expect(vocabulary.counts).toEqual({words:689,verbs:135,syntax:269,synonyms:75,buzz:38,directions:14,prepositions:18,actions:148});
    expect(vocabulary.stage).toBe('vocabulary');expect(vocabulary).toEqual(buildVocabulary());
    expect(vocabulary).toEqual(JSON.parse(readFileSync('games/zork2/vocabulary.zxr.json','utf8')));
    expect(JSON.parse(JSON.stringify(vocabulary))).toEqual(vocabulary);
    expect(vocabulary.words.map(w=>w.dictionaryIndex)).toEqual(Array.from({length:689},(_,i)=>i+1));
    expect(JSON.stringify(vocabulary)).not.toContain('referenceAddress');
    expect(auditVocabulary(vocabulary)).toEqual(JSON.parse(readFileSync('reference/vocabulary-audit.json','utf8')));
  });
  it('preserves exact compiler table order and stable one-based syntax row IDs',()=>{
    expect(vocabulary.verbs[0]).toMatchObject({name:'KISS',number:255});
    expect(verb('ANSWER').rows.map(r=>r.action.name)).toEqual(['REPLY','ANSWER']);
    expect(verb('ANSWER').rows.map(r=>r.slots.length)).toEqual([1,0]);
    expect(verb('WALK').rows.map(r=>r.slots[0]?.preposition?.name ?? null)).toEqual(['DOWN','UP','AROUND','TO','OVER','ON','WITH','IN','AWAY',null,null]);
    expect(verb('TAKE').rows[0]!.slots[1]!.preposition).toEqual({name:'FROM',number:248});
    for(const v of vocabulary.verbs)expect(v.rows.map(r=>r.id)).toEqual(v.rows.map((_,i)=>i+1));
    for(const v of vocabulary.verbs)for(const row of v.rows){
      const text=readFileSync('reference/zork2/'+row.source.file,'utf8');
      const source=text.slice(row.source.start.offset,row.source.end.offset);const parsed=read(source).nodes[0] as Sequence;expect(parsed.items[0]).toMatchObject({kind:'atom',value:'SYNTAX'});expect(parsed.items[1]).toMatchObject({kind:'atom',value:v.name});expect(source.endsWith('>')).toBe(true);
    }
  });
  it('keeps lexical codes, action numbers and routine IDs in separate namespaces including zero action',()=>{
    const take=verb('TAKE');expect(take.number).toBe(236);expect(take.rows[0]!.action).toEqual({name:'TAKE',number:96});
    const dispatch=vocabulary.actions.find(a=>a.name==='TAKE')!;expect(dispatch.routine.name).toBe('V-TAKE');expect(dispatch.preaction?.name).toBe('PRE-TAKE');
    expect(dispatch.routine.id).toBeGreaterThan(0);
    expect(vocabulary.actions[0]).toMatchObject({name:'VERBOSE',number:0,routine:{name:'V-VERBOSE'},preaction:null});
    const v=compile('<ROUTINE V-TEST ()> <SYNTAX TEST = V-TEST>');expect(v.verbs[0]!.rows[0]!.bytes).toEqual([0,0,0,0,0,0,0,0]);
  });
  it('preserves all operand rules and FIND hints independently, including indirect MANY',()=>{
    expect(SYNTAX_FLAGS).toEqual({HELD:128,CARRIED:64,'ON-GROUND':16,'IN-ROOM':32,TAKE:8,MANY:4,HAVE:2});
    const find=verb('ATTACK').rows.find(r=>r.slots.length===1)!.slots[0]!;
    expect(find.find?.name).toBe('ACTORBIT');expect(find.rules).toEqual(['ON-GROUND','IN-ROOM']);expect(find.flags).toBe(48);
    const give=verb('GIVE').rows[0]!;expect(give.slots[1]!.rules).toContain('MANY');expect(give.slots[0]!.rules).not.toContain('MANY');
    const seen=new Set(vocabulary.verbs.flatMap(t=>t.rows.flatMap(r=>r.slots.flatMap(s=>s.rules))));expect([...seen].sort()).toEqual(Object.keys(SYNTAX_FLAGS).sort());
    const v=fixture('<SYNTAX TEST OBJECT (FIND FLAG) (HELD CARRIED ON-GROUND IN-ROOM TAKE MANY HAVE) TO OBJECT = V-TEST>');
    const row=v.verbs[0]!.rows[0]!;expect(row.slots[0]!.find).toEqual({name:'FLAG',number:0});expect(row.slots[0]!.flags).toBe(254);expect(row.bytes).toEqual([2,0,255,0,0,254,0,0]);
  });
  it('inherits synonym roles without losing independent roles and keeps aliases as dictionary words',()=>{
    expect(word('REPLY').roles.verb).toEqual({name:'ANSWER',number:verb('ANSWER').number});
    expect(word('LIGHT').roles).toMatchObject({object:true,verb:{name:'LIGHT'}});
    expect(word('IN').roles).toEqual({preposition:{name:'IN',number:251},direction:{name:'IN',number:21}});
    expect(word('N').roles).toMatchObject({direction:{name:'NORTH',number:31},adjective:{name:'NORTH'}});
    expect(word('THROUGH').roles.preposition).toEqual({name:'WITH',number:254});
    expect(word('WITH').dictionaryIndex).not.toBe(word('THROUGH').dictionaryIndex);
    expect(word('IT').roles).toEqual({object:true});
    const source='<ROUTINE V-TEST ()> <SYNTAX TEST = V-TEST> <SYNONYM ALIAS SECOND> <SYNONYM TEST ALIAS>';
    const v=compile(source,{words:[{name:'TEST'},{name:'ALIAS'},{name:'SECOND'}]});
    expect(word('SECOND',v).roles).toEqual({verb:{name:'TEST',number:255}});
  });
  it('retains all active buzz words, punctuation, directions, prepositions and source positions',()=>{
    expect(vocabulary.buzz.slice(0,3).map(b=>b.word.name)).toEqual(['AGAIN','G','OOPS']);expect(vocabulary.buzz.at(-1)!.word.name).toBe('OZMOO');
    expect(vocabulary.buzz.find(b=>b.word.name==='PERIOD')!.number).toBe(241);expect(word('QUOTE').roles.buzz).toBe(239);
    expect(vocabulary.directions.map(d=>d.name)).toEqual(['NORTH','EAST','WEST','SOUTH','NE','NW','SE','SW','UP','DOWN','IN','OUT','LAND','CROSS']);
    expect(vocabulary.directions.map(d=>d.number)).toEqual(Array.from({length:14},(_,i)=>31-i));
    expect(vocabulary.prepositions.map(p=>p.number)).toEqual(Array.from({length:18},(_,i)=>238+i));
    for(const d of [...vocabulary.directions,...vocabulary.buzz]){
      const text=readFileSync('reference/zork2/'+d.source.file,'utf8');expect(text.slice(d.source.start.offset,d.source.end.offset).length).toBeGreaterThan(0);
    }
  });
  it('reports malformed grammar and unresolved names instead of silently dropping constructs',()=>{
    for(const syntax of ['<SYNTAX TEST TO = V-TEST>','<SYNTAX TEST TO TO OBJECT = V-TEST>','<SYNTAX TEST (HELD) = V-TEST>',
      '<SYNTAX TEST OBJECT TO (HELD) OBJECT = V-TEST>','<SYNTAX TEST OBJECT () = V-TEST>',
      '<SYNTAX TEST OBJECT (FIND FLAG) (FIND FLAG) = V-TEST>','<SYNTAX TEST OBJECT (HELD HELD) = V-TEST>',
      '<SYNTAX TEST OBJECT OBJECT OBJECT = V-TEST>','<SYNTAX TEST = V-TEST V-TEST V-TEST>',
      '<SYNTAX TEST OBJECT (UNKNOWN) = V-TEST>','<SYNTAX TEST = MISSING>'])expect(()=>fixture(syntax),syntax).toThrow();
    expect(()=>compile('<ROUTINE V-TEST ()> <BUZZ TEST TEST>')).toThrow('Duplicate BUZZ');
    expect(()=>compile('<ROUTINE V-TEST ()> <SYNONYM TEST>')).toThrow('canonical word and aliases');
    expect(()=>compile('<ROUTINE V-TEST ()>')).toThrow('no source role');
    expect(()=>fixture('<SYNTAX TEST = V-TEST>')).toThrow('Dictionary word has no source role: TO'); // Numbering alone must not invent a preposition declaration.
    expect(()=>compile('<ROUTINE V-TEST ()> <SYNTAX TEST = V-TEST> <SYNTAX TEST = V-TEST V-TEST>')).toThrow('Inconsistent dispatch');
  });
  it('detects mutations to ordered bytes, readable rules, namespaces, roles and dispatch',()=>{
    const mutate=(change:(v:Vocabulary)=>void,expected:string)=>{const v=structuredClone(vocabulary);change(v);expect(()=>auditVocabulary(v)).toThrow(expected);};
    mutate(v=>{verb('ANSWER',v).rows.reverse();},'exact assembly syntax rows');
    mutate(v=>{verb('TAKE',v).rows[0]!.bytes[5]=0;},'syntax rows');
    mutate(v=>{verb('TAKE',v).rows[0]!.slots[0]!.rules=[];},'rule mask');
    mutate(v=>{verb('TAKE',v).rows[0]!.source.start.line++;},'source row');
    mutate(v=>{word('REPLY',v).roles.verb!.number=236;},'dictionary roles');
    mutate(v=>{word('LIGHT',v).roles.object=undefined;},'dictionary roles');
    mutate(v=>{v.actions[0]!.routine.id=1;},'routine ID');
    mutate(v=>{v.prepositions[0]!.word.dictionaryIndex=1;},'dictionary index');
    mutate(v=>{v.directions[0]=v.directions[1]!;},'completeness/order');
    mutate(v=>{v.buzz[0]=v.buzz[1]!;},'completeness/order');
    mutate(v=>{v.synonyms.pop();v.counts.synonyms--;},'synonym declarations');
    mutate(v=>{v.counts.syntax--;},'counts');
  });
});
