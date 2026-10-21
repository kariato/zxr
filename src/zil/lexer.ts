import type { Position, Span, Prefix } from './ast.ts';
import { ZilError } from './diagnostics.ts';
export type TokenKind='open-form'|'close-form'|'open-list'|'close-list'|'open-vector'|'close-vector'|'prefix'|'typed'|'atom'|'number'|'string'|'character'|'eof';
export interface Token { kind:TokenKind; text:string; value?:string|number; radix?:8|10; operator?:Prefix; span:Span }
const punctuation:Record<string,TokenKind>={'<':'open-form','>':'close-form','(':'open-list',')':'close-list','[':'open-vector',']':'close-vector','#':'typed'};
const prefixes:Record<string,Prefix>={',':'global','.':'local',"'":'quote','%':'read-time','!':'segment',';':'comment'};
const delimiter=(char:string)=>/\s|[<>()\[\]"',.;%#]/u.test(char);
export function lex(source:string,file='<input>'):Token[] {
  let offset=0,line=1,column=1,afterCR=false;
  const tokens:Token[]=[];
  const position=():Position=>({offset,line,column});
  const advance=()=>{
    const char=source[offset++]!;
    if (char==='\r') {line++;column=1;afterCR=true;}
    else if (char==='\n') {if (!afterCR) line++;column=1;afterCR=false;}
    else {column++;afterCR=false;}
    return char;
  };
  const span=(start:Position):Span=>({file,start,end:position()});
  const error=(message:string,start:Position):never=>{throw new ZilError('ZIL001',message,span(start));};
  const add=(kind:TokenKind,start:Position,extra:Partial<Token>={})=>tokens.push({kind,text:source.slice(start.offset,offset),span:span(start),...extra});
  while (offset<source.length) {
    const char=source[offset]!;
    if (/\s/u.test(char)) {advance();continue;}
    const start=position();
    if (char==='%' && source[offset+1]==='%') error('The %% read macro is outside the supported Zork II subset',start);
    if (char==='"') {
      advance();let value='',closed=false;
      while (offset<source.length) {
        const next=advance();
        if (next==='"') {closed=true;break;}
        if (next==='\\') {if (offset===source.length) error('Unterminated string escape',start);value+=advance();}
        else value+=next;
      }
      if (!closed) error('Unterminated string',start);
      add('string',start,{value});continue;
    }
    if (char==='!' && source[offset+1]==='\\') {
      advance();advance();
      if (offset===source.length) error('Missing character after !\\',start);
      const code=source.codePointAt(offset)!, value=String.fromCodePoint(code);
      for (let i=0;i<value.length;i++) advance();
      add('character',start,{value});continue;
    }
    if (punctuation[char]) {advance();add(punctuation[char]!,start);continue;}
    if (prefixes[char]) {advance();add('prefix',start,{operator:prefixes[char]});continue;}
    let value='',escaped=false;
    while (offset<source.length && !delimiter(source[offset]!)) {
      const next=advance();
      if (next==='\\') {
        escaped=true;if (offset===source.length) error('Unterminated atom escape',start);value+=advance();
      } else {
        if (next.charCodeAt(0)<32 || next.charCodeAt(0)===127) error('Unexpected control character',start);
        value+=next;
      }
    }
    if (!value) error(`Unexpected character ${char}`,start);
    if (!escaped && /^[+-]?\d+$/.test(value)) {
      const number=Number(value);
      if (!Number.isSafeInteger(number)) error('Integer exceeds the exact reader range',start);
      add('number',start,{value:number===0?0:number,radix:10});
    } else if (!escaped && /^\*[+-]?\d/.test(value)) {
      if (!/^\*[+-]?[0-7]+\*$/.test(value)) error('Malformed octal integer',start);
      const body=value.slice(1,-1), number=(body.startsWith('-')?-1:1)*Number.parseInt(body.replace(/^[+-]/,''),8);
      if (!Number.isSafeInteger(number)) error('Octal integer exceeds the exact reader range',start);
      add('number',start,{value:number===0?0:number,radix:8});
    } else add('atom',start,{value});
  }
  add('eof',position());return tokens;
}
