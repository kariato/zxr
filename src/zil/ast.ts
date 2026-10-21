/** Offsets and columns count UTF-16 code units; lines/columns are one-based. End is exclusive. */
export interface Position { offset:number; line:number; column:number }
export interface Span { file:string; start:Position; end:Position }
export interface MacroOrigin { macro:string; call:Span; definition?:Span }
interface Base { span:Span; origin?:MacroOrigin[]; semantic?:{ kind:string; values:Node[] } }
export type Prefix = 'global'|'local'|'quote'|'read-time'|'segment'|'comment';
export interface Atom extends Base { kind:'atom'; value:string }
export interface Numeric extends Base { kind:'number'; value:number; radix:8|10 }
export interface Text extends Base { kind:'string'|'character'; value:string }
export interface Sequence extends Base { kind:'form'|'list'|'vector'; items:Node[] }
export interface Prefixed extends Base { kind:'prefix'; operator:Prefix; value:Node; comments:Prefixed[] }
export interface Typed extends Base { kind:'typed'; tag:Node; value:Node; tagComments:Prefixed[]; valueComments:Prefixed[] }
export type Node = Atom|Numeric|Text|Sequence|Prefixed|Typed;
export interface Document { file:string; nodes:Node[] }
export const isComment = (node:Node):boolean => node.kind === 'prefix' && node.operator === 'comment';
export const children = (node:Node):Node[] => node.kind === 'form' || node.kind === 'list' || node.kind === 'vector'
  ? node.items : node.kind === 'prefix' ? [...node.comments,node.value] : node.kind === 'typed' ? [...node.tagComments,node.tag,...node.valueComments,node.value] : [];
export function* walk(nodes:readonly Node[]):Generator<Node> { for (const node of nodes) { yield node; yield* walk(children(node)); } }
export const head = (node:Node):string|undefined => node.kind === 'form' && node.items[0]?.kind === 'atom' ? node.items[0].value : undefined;
export function atomName(node:Node|undefined):string|undefined { return node?.kind === 'atom' ? node.value : undefined; }
/** Semantic tree for round trips and deterministic hashes; source maps remain on the original nodes. */
export function shape(node:Node):unknown {
  if (node.kind === 'form' || node.kind === 'list' || node.kind === 'vector') return [node.kind,node.items.map(shape)];
  if (node.kind === 'prefix') return [node.kind,node.operator,node.comments.map(shape),shape(node.value)];
  if (node.kind === 'typed') return [node.kind,node.tagComments.map(shape),shape(node.tag),node.valueComments.map(shape),shape(node.value)];
  return node.kind === 'number' ? [node.kind,node.value,node.radix] : [node.kind,'value' in node ? node.value : undefined];
}
export function stripComments(node:Node):Node {
  if (node.kind === 'form' || node.kind === 'list' || node.kind === 'vector') return {...node,items:node.items.filter(n=>!isComment(n)).map(stripComments)};
  if (node.kind === 'prefix') return {...node,comments:[],value:stripComments(node.value)};
  if (node.kind === 'typed') return {...node,tagComments:[],valueComments:[],tag:stripComments(node.tag),value:stripComments(node.value)};
  return node;
}
