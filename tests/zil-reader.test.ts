import { describe,expect,it } from 'vitest';
import { lex,read,printDocument,print,shape,walk,isComment,head,ZilError,formatDiagnostic } from '../src/zil/index.ts';
import { sourceFiles } from '../tools/zil/program.ts';

describe('MDL lexer and reader',()=>{
  it('lexes all token kinds, escaped atoms, signed decimal and octal integers',()=>{
    const tokens=lex('<FOO (BAR) [BAZ] "a\\\"b" ,G .L \'Q %R #BYTE 1 !.X !\\> ;Z -12 +3 *377* *-10* \\#RANDOM ON!-INITIAL>','types.zil');
    expect(new Set(tokens.map(t=>t.kind))).toEqual(new Set(['open-form','close-form','open-list','close-list','open-vector','close-vector','string','prefix','typed','number','atom','character','eof']));
    expect(tokens.filter(t=>t.kind==='number').map(t=>t.value)).toEqual([1,-12,3,255,-8]);
    expect(tokens.some(t=>t.kind==='atom'&&t.value==='#RANDOM')).toBe(true);
    expect(tokens.some(t=>t.kind==='character'&&t.value==='>')).toBe(true);
  });
  it('tracks exclusive offsets and exact positions through CRLF, tabs and multiline strings',()=>{
    const tokens=lex('X\r\n\t"a\nb" ,G','positions.zil');
    expect(tokens[1]!.span).toEqual({file:'positions.zil',start:{offset:4,line:2,column:2},end:{offset:9,line:3,column:3}});
    expect(tokens[2]!.span.start).toEqual({offset:10,line:3,column:4});
    expect(tokens[3]!.span.start).toEqual({offset:11,line:3,column:5});
  });
  it('comments whole objects, retains comments, and skips commented prefix operands',()=>{
    const parsed=read('; <ROUTINE DEAD ()> <ROUTINE LIVE ()> ,;IGNORED X ; ;A B C');
    expect(parsed.nodes.map(head)).toEqual([undefined,'ROUTINE',undefined,undefined,undefined]);
    expect(isComment(parsed.nodes[0]!)).toBe(true);
    const prefix=parsed.nodes[2]!;expect(prefix).toMatchObject({kind:'prefix',operator:'global',value:{kind:'atom',value:'X'},comments:[{operator:'comment'}]});
    expect(parsed.nodes[3]).toMatchObject({kind:'prefix',operator:'comment',value:{kind:'atom',value:'B'},comments:[{value:{value:'A'}}]});
    expect(read(printDocument(parsed)).nodes.map(shape)).toEqual(parsed.nodes.map(shape));
  });
  it.each(['<A (B]>','<UNCLOSED','"unfinished','"escape\\','\\','!\\',';','*89*','9007199254740992'])('rejects malformed input with a diagnostic: %s',text=>{
    expect(()=>read(text,'bad.zil')).toThrow(ZilError);
  });
  it('reports the actual closing delimiter and shows a caret',()=>{
    try {read('<A\n  (B]>','broken.zil');throw Error('expected failure');}
    catch(error){expect(error).toBeInstanceOf(ZilError);expect(formatDiagnostic(error as ZilError,'<A\n  (B]>')).toBe('broken.zil:2:5: ZIL002: Unexpected closing delimiter ]\n  (B]>\n    ^');}
  });
  it('bounds nesting instead of overflowing the host stack',()=>expect(()=>read('<'.repeat(520)+'>'.repeat(520))).toThrow('nesting limit'));
  it('preserves escaped numeric atoms, character delimiters, typed data, segments and zero',()=>{
    const parsed=read('\\123 \\. \\!X !\\) !\\  #DECL ((A) FIX) !<F> !.A *-0* -0');
    expect(read(printDocument(parsed)).nodes.map(shape)).toEqual(parsed.nodes.map(shape));
    expect(print(parsed.nodes[0]!)).toBe('\\123');
  });
  it.each([...sourceFiles()])('reads and round-trips the complete %s without dropping object comments',(file,source)=>{
    const parsed=read(source,file),again=read(printDocument(parsed),file);
    expect(again.nodes.map(shape)).toEqual(parsed.nodes.map(shape));
    expect([...walk(read(source,file).nodes)].length).toBe([...walk(parsed.nodes)].length);
  });
});
