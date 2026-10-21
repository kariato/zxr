import type { Node, Prefixed, Prefix, Document } from './ast.ts';
const prefixes:Record<Prefix,string>={global:',',local:'.',quote:"'",'read-time':'%',segment:'!',comment:';'};
const comments=(nodes:Prefixed[])=>nodes.length?nodes.map(print).join(' ')+' ':'';
export function print(node:Node):string {
  switch(node.kind) {
    case 'atom': {
      let value=node.value.replace(/[\\\s<>()\[\]"',.;%#]/gu,char=>'\\'+char);
      if (/^[!]|^[+-]?\d+$|^\*[+-]?\d/.test(value)) value='\\'+value;
      return value;
    }
    case 'number':return node.radix===8?`*${node.value<0?'-':''}${Math.abs(node.value).toString(8)}*`:String(node.value);
    case 'string':return '"'+node.value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
    case 'character':return '!\\'+node.value;
    case 'form':return '<'+node.items.map(print).join(' ')+'>';
    case 'list':return '('+node.items.map(print).join(' ')+')';
    case 'vector':return '['+node.items.map(print).join(' ')+']';
    case 'prefix':return prefixes[node.operator]+comments(node.comments)+print(node.value);
    case 'typed':return '#'+comments(node.tagComments)+print(node.tag)+' '+comments(node.valueComments)+print(node.value);
  }
}
export const printDocument=(parsed:Document):string=>parsed.nodes.map(print).join('\n')+'\n';
