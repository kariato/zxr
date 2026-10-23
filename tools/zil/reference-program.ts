import { readFileSync } from 'node:fs';
import { atomName, head, print, ZilError } from '../../src/zil/index.ts';
import type { Node, Sequence } from '../../src/zil/index.ts';
import { sha256, STORY, STORY_SHA256 } from '../reference/symbols.ts';

export function normalizeReferenceProgram(forms:readonly Node[]) {
  const normalizations:{rule:string;routine?:string;global?:string;sourceHash:string;file:string;line:number;reason:string}[]=[];
  const normalized=forms.map(node=>{
    if(head(node)==='ROUTINE'&&atomName((node as Sequence).items[1])==='V-CLIMB-UP'){
      const sourceHash=sha256(print(node));
      if(sourceHash!=='50f488980220104c962d65b767eb12d6a2f7d27902281ff6e4fcd2e10976889b')throw new ZilError('ZIL005','SRC-014 normalization requires the audited V-CLIMB-UP source',node.span);
      const assembly=readFileSync('reference/zork2/gverbs.zap','utf8');
      if(!assembly.includes('PTSIZE\tX\n\tCALL\tZMEMQ,W?WALL,X,STACK')||sha256(readFileSync(STORY))!==STORY_SHA256)throw new Error('SRC-014 assembly/binary evidence changed');
      let replacements=0;
      const visit=(n:Node):Node=>{
        if(n.kind!=='form'&&n.kind!=='list')return n;
        if(head(n)==='ZMEMQ'&&print(n.items.at(-1)!)==='<PTSIZE .X>'){
          const size=n.items.at(-1)!,atom=(value:string):Node=>({kind:'atom',value,span:size.span}),number=(value:number):Node=>({kind:'number',value,radix:10,span:size.span}),form=(...items:Node[]):Sequence=>({kind:'form',items,span:size.span});
          replacements++;
          return {...n,items:[...n.items.slice(0,-1),{...form(atom('-'),form(atom('/'),size,number(2)),number(1)),semantic:{kind:'reference-normalization:SRC-014',values:[size]}}]};
        }
        return {...n,items:n.items.map(visit)};
      };
      const result=visit(node);if(replacements!==1)throw new Error('SRC-014 expected one synonym membership bound');
      normalizations.push({rule:'SRC-014',routine:'V-CLIMB-UP',sourceHash,file:node.span.file,line:node.span.start.line,reason:'Convert SYNONYM byte length to the inclusive word index required by ZMEMQ, matching WORD-IN-SYNONYM. The original flat-memory overread is unsafe in bounded allocations.'});
      return result;
    }
    if(head(node)==='GLOBAL'&&atomName((node as Sequence).items[1])==='INDENTS'){
      const sourceHash=sha256(print(node));
      if(sourceHash!=='3d4d6ac54dd1899cb29d8488dbc56c159c59b3e0867a6e555cbc654859984bd9')throw new ZilError('ZIL005','SRC-011 normalization requires the audited INDENTS source; review changed initializers',node.span);
      const assembly=readFileSync('reference/zork2/zork2dat.zap','utf8'),strings=readFileSync('reference/zork2/zork2str.zap','utf8');
      if(!assembly.includes('.GVAR INDENTS=T?20,TABLE')||!assembly.includes('T?20::\t.TABLE\n\tSTR?183\n\tSTR?183\n')||!strings.includes('.GSTR STR?183,"  "')||sha256(readFileSync(STORY))!==STORY_SHA256)throw new Error('SRC-011 assembly/binary evidence changed');
      const f=node as Sequence,table=f.items[2] as Sequence,empty=table.items[2]!;
      normalizations.push({rule:'SRC-011',global:'INDENTS',sourceHash,file:empty.span.file,line:empty.span.start.line,reason:'The assembly aliases the first empty-string initializer to the following two-space string. Preserve the binary table rather than applying this alias to general empty strings.'});
      return {...f,items:[...f.items.slice(0,2),{...table,items:table.items.map((n,i)=>i===2?{...n,kind:'string' as const,value:'  ',semantic:{kind:'reference-normalization:SRC-011',values:[empty]}}:n)}]};
    }
    if(head(node)!=='ROUTINE'||atomName((node as Sequence).items[1])!=='DREARY-ROOM-FCN')return node;
    const sourceHash=sha256(print(node));
    if(sourceHash!=='b73329ca559f98ba836e92d954bfb18131e21e73122e79eeec6b4d9dababa6bf')
      throw new ZilError('ZIL005','SRC-006 normalization requires the audited DREARY-ROOM-FCN source; review changed code before translating its trailing list',node.span);
    const assembly=readFileSync('reference/zork2/2actions.zap','utf8').match(/\.FUNCT\s+DREARY-ROOM-FCN[^\n]*\n([\s\S]*?)(?=\n\s*\.FUNCT)/)?.[1];
    if(!assembly?.includes('?CND1:\tCALL\tPCHECK >?TMP1\n\tRFALSE'))throw new Error('SRC-006 assembly evidence changed');
    const form=node as Sequence,tail=form.items.at(-1)!;
    if(tail.kind!=='list'||atomName(tail.items[0])!=='T')throw new Error('SRC-006 expected a trailing T list');
    const block:Sequence={kind:'form',span:tail.span,items:[{kind:'atom',value:'PROG',span:tail.span},{kind:'list',items:[],span:tail.span},...tail.items.slice(1)],semantic:{kind:'reference-normalization:SRC-006',values:[tail]}};
    normalizations.push({rule:'SRC-006',routine:'DREARY-ROOM-FCN',sourceHash,file:tail.span.file,line:tail.span.start.line,reason:'The supplied assembly executes trailing PCHECK/RFALSE after the preceding COND. Preserve that explicit fallback without granting general executable-list semantics.'});
    return {...form,items:[...form.items.slice(0,-1),block]};
  });
  return {forms:normalized,normalizations};
}
