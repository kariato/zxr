import type { Document, Node, Prefixed, Span } from './ast.ts';
import { isComment } from './ast.ts';
import { lex } from './lexer.ts';
import type { Token, TokenKind } from './lexer.ts';
import { ZilError } from './diagnostics.ts';
const containers:Partial<Record<TokenKind,{kind:'form'|'list'|'vector';close:TokenKind}>>={
  'open-form':{kind:'form',close:'close-form'},'open-list':{kind:'list',close:'close-list'},'open-vector':{kind:'vector',close:'close-vector'},
};
export function read(source:string,file='<input>',maxDepth=512):Document {
  const tokens=lex(source,file);let cursor=0;
  const error=(message:string,span:Span):never=>{throw new ZilError('ZIL002',message,span);};
  const peek=():Token=>tokens[cursor]!;
  const operand=(depth:number):{value:Node;comments:Prefixed[]}=>{
    const comments:Prefixed[]=[];
    let value=node(depth);
    while (isComment(value)) {comments.push(value as Prefixed);value=node(depth);}
    return {value,comments};
  };
  const node=(depth:number):Node=>{
    const token=peek();cursor++;
    if (depth>maxDepth) error('Reader nesting limit exceeded',token.span);
    const sequence=containers[token.kind];
    if (sequence) {
      const items:Node[]=[];
      while (peek().kind!==sequence.close) {
        if (peek().kind==='eof') error(`Unclosed ${token.text}; expected ${sequence.close}`,token.span);
        items.push(node(depth+1));
      }
      const end=peek().span.end;cursor++;
      return {kind:sequence.kind,items,span:{...token.span,end}};
    }
    if (token.kind==='prefix') {
      const {value,comments}=operand(depth+1);
      return {kind:'prefix',operator:token.operator!,value,comments,span:{...token.span,end:value.span.end}};
    }
    if (token.kind==='typed') {
      const tag=operand(depth+1), value=operand(depth+1);
      return {kind:'typed',tag:tag.value,value:value.value,tagComments:tag.comments,valueComments:value.comments,span:{...token.span,end:value.value.span.end}};
    }
    if (token.kind==='atom') return {kind:'atom',value:token.value as string,span:token.span};
    if (token.kind==='number') return {kind:'number',value:token.value as number,radix:token.radix!,span:token.span};
    if (token.kind==='string' || token.kind==='character') return {kind:token.kind,value:token.value as string,span:token.span};
    return error(token.kind==='eof'?'Expected an object before end of file':`Unexpected closing delimiter ${token.text}`,token.span);
  };
  const nodes:Node[]=[];
  while (peek().kind!=='eof') nodes.push(node(0));
  return {file,nodes};
}
