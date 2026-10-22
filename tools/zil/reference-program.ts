import { readFileSync } from 'node:fs';
import { atomName, head, print, ZilError } from '../../src/zil/index.ts';
import type { Node, Sequence } from '../../src/zil/index.ts';
import { sha256, STORY, STORY_SHA256 } from '../reference/symbols.ts';

export function normalizeReferenceProgram(forms:readonly Node[]) {
  const normalizations:{rule:string;routine?:string;global?:string;sourceHash:string;file:string;line:number;reason:string}[]=[];
  const normalized=forms.map(node=>{
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
