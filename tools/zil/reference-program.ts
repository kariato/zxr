import { readFileSync } from 'node:fs';
import { atomName, head, print, ZilError } from '../../src/zil/index.ts';
import type { Node, Sequence } from '../../src/zil/index.ts';
import { sha256 } from '../reference/symbols.ts';

export function normalizeReferenceProgram(forms:readonly Node[]) {
  const normalizations:{rule:string;routine:string;sourceHash:string;file:string;line:number;reason:string}[]=[];
  const normalized=forms.map(node=>{
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
