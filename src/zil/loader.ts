import type { Node, Sequence, Span, Document } from './ast.ts';
import { atomName, head, isComment, stripComments } from './ast.ts';
import { read } from './reader.ts';
import { ZilError } from './diagnostics.ts';
export interface Branch { span:Span; selected:number|null; tests:Node[] }
export interface LoadedProgram {
  forms:Node[]; files:string[]; documents:Document[]; branches:Branch[];
  globals:Map<string,Node>; locals:Map<string,Node>; properties:Map<string,Node>;
  definitions:Map<string,Sequence>; directives:{name:string;value:Node;span:Span}[];
  redefinitions:{name:string;previous:Span;replacement:Span}[];
}
export interface LoadOptions { entry?:string; predgen?:boolean; defines?:Record<string,Node>; maxIncludes?:number }
const truth=(node:Node):boolean=>!(node.kind==='form' && node.items.length===0) && !(node.kind==='typed' && atomName(node.tag)==='FALSE');
const boolean=(value:boolean,span:Span):Node=>value?{kind:'atom',value:'T',span}:{kind:'form',items:[],span};
/** A deliberately finite evaluator for this game's build-time operations, not an MDL interpreter. */
export function loadProgram(sources:ReadonlyMap<string,string>,options:LoadOptions={}):LoadedProgram {
  const result:LoadedProgram={forms:[],files:[],documents:[],branches:[],globals:new Map(),locals:new Map(),properties:new Map(),definitions:new Map(),directives:[],redefinitions:[]};
  const normalized=new Map<string,{name:string;text:string}>();
  for (const [name,text] of sources) {
    const key=name.toLowerCase();
    if (normalized.has(key)) throw new Error(`Duplicate source file ${name}`);
    normalized.set(key,{name,text});
  }
  const entry=(options.entry ?? 'zork2.zil').toLowerCase();
  const initial:Span={file:entry,start:{offset:0,line:1,column:1},end:{offset:0,line:1,column:1}};
  result.globals.set('ZILCH',boolean(true,initial));
  if (options.predgen!==false) result.globals.set('PREDGEN',boolean(true,initial));
  for (const [name,value] of Object.entries(options.defines ?? {})) result.globals.set(name,value);
  const fail=(message:string,node:Node):never=>{throw new ZilError('ZIL003',message,node.span);};
  const argument=(items:Node[],index:number,owner:Node):Node=>items[index] ?? fail('Missing compile-time argument',owner);
  const nameOf=(node:Node):string=>atomName(node) ?? fail('Expected an atom name',node);
  let steps=0;
  const evaluate=(node:Node):Node=>{
    if (++steps>100_000) fail('Compile-time evaluation limit exceeded',node);
    if (node.kind==='prefix') {
      if (node.operator==='quote') return node.value;
      if (node.operator==='global' || node.operator==='local') {
        const name=nameOf(node.value), value=(node.operator==='global'?result.globals:result.locals).get(name);
        return value ?? fail(`Unassigned compile-time ${node.operator} ${name}`,node);
      }
      return fail(`Unsupported compile-time prefix ${node.operator}`,node);
    }
    if (node.kind!=='form' || !node.items.length) return node;
    const op=head(node), args=node.items.slice(1), arg=(i:number)=>argument(args,i,node);
    switch(op) {
      case 'COND': {
        const branch=select(node);
        let value:Node=boolean(false,node.span);
        for (const item of branch) value=evaluate(item);
        return value;
      }
      case 'GASSIGNED?':return boolean(result.globals.has(nameOf(arg(0))),node.span);
      case 'ASSIGNED?':return boolean(result.locals.has(nameOf(arg(0))),node.span);
      case '==?':case '=?':case 'N==?': {
        const a=evaluate(arg(0)), b=evaluate(arg(1));
        const equal=a.kind===b.kind && ('value' in a && 'value' in b ? a.value===b.value : !truth(a) && !truth(b));
        return boolean(op==='N==?'?!equal:equal,node.span);
      }
      case 'NOT':return boolean(!truth(evaluate(arg(0))),node.span);
      case 'AND':case 'OR': {
        let value:Node=boolean(op==='AND',node.span);
        for (const item of args) {value=evaluate(item);if (truth(value)===(op==='OR')) break;}
        return value;
      }
      case 'SETG':case 'SET': {
        const value=evaluate(arg(1));(op==='SETG'?result.globals:result.locals).set(nameOf(arg(0)),value);return value;
      }
      case 'PRINC':case 'FREQUENT-WORDS?':case 'ID':
        result.directives.push({name:op,value:args[0] ?? boolean(true,node.span),span:node.span});return boolean(true,node.span);
      default:return fail(`Unsupported compile-time operation ${op ?? '(non-atom)'}`,node);
    }
  };
  const select=(node:Node):Node[]=>{
    if (node.kind!=='form') return fail('Expected a COND form',node);
    const tests:Node[]=[];
    for (const [index,clause] of node.items.slice(1).entries()) {
      if (clause.kind!=='list' || !clause.items.length) return fail('Expected a nonempty compile-time COND clause',clause);
      const test=clause.items[0]!;tests.push(test);
      if (truth(evaluate(test))) {result.branches.push({span:node.span,selected:index,tests});return clause.items.slice(1);}
    }
    result.branches.push({span:node.span,selected:null,tests});return [];
  };
  const readTime=(node:Node):Node=>{
    if (node.kind==='prefix') {
      // READ-time macros run while an object is read, including inside comments/quotes.
      // The comment itself is still discarded before ordinary top-level evaluation.
      const comments=node.comments.map(n=>readTime(n)) as typeof node.comments;
      const transformed={...node,comments,value:readTime(node.value)};
      return node.operator==='read-time'?evaluate(stripComments(transformed.value)):transformed;
    }
    if (node.kind==='form' || node.kind==='list' || node.kind==='vector') return {...node,items:node.items.map(readTime)};
    if (node.kind==='typed') {
      const tagComments=node.tagComments.map(n=>readTime(n)) as typeof node.tagComments,tag=readTime(node.tag);
      const valueComments=node.valueComments.map(n=>readTime(n)) as typeof node.valueComments,value=readTime(node.value);
      return {...node,tagComments,tag,valueComments,value};
    }
    return node;
  };
  const stack:string[]=[];
  const include=(file:string,site?:Node)=>{
    if (!/^[a-z0-9_-]+\.zil$/.test(file)) {
      if (site) fail(`Unsafe INSERT-FILE name ${file}`,site);
      throw new Error(`Invalid entry filename ${file}`);
    }
    if (stack.includes(file) || result.files.length >= (options.maxIncludes ?? 100)) {
      const message=`Include cycle or limit: ${[...stack,file].join(' -> ')}`;
      throw new ZilError('ZIL003',message,site?.span ?? initial);
    }
    const input=normalized.get(file);
    if (input===undefined) throw new ZilError('ZIL003',`Source file not found: ${file}`,site?.span ?? initial);
    stack.push(file);result.files.push(input.name);
    const parsed=read(input.text,input.name);result.documents.push(parsed);
    for (const node of parsed.nodes) {const transformed=readTime(node);if (!isComment(transformed)) top(stripComments(transformed));}
    stack.pop();
  };
  const declared=new Map<string,Node>();
  const top=(node:Node)=>{
    if (node.kind!=='form' || !node.items.length) {result.forms.push(node);return;}
    const op=head(node), args=node.items.slice(1), arg=(i:number)=>argument(args,i,node);
    switch(op) {
      case 'INSERT-FILE': {
        const path=arg(0);if (path.kind!=='string') return fail('INSERT-FILE requires a string filename',path);
        include(path.value.toLowerCase().endsWith('.zil')?path.value.toLowerCase():path.value.toLowerCase()+'.zil',node);return;
      }
      case 'COND':for (const child of select(node)) top(child);return;
      case 'PROG':
        if (args[0]?.kind!=='list' || args[0].items.length) fail('Only an empty top-level PROG scope is supported',node);
        for (const child of args.slice(1)) top(child);return;
      case 'SET':case 'SETG':case 'OR':case 'AND':case 'PRINC':case 'FREQUENT-WORDS?':case 'ID':evaluate(node);break;
      case 'PROPDEF':result.properties.set(nameOf(arg(0)),arg(1));break;
      case 'DEFMAC':case 'DEFINE': {
        const name=nameOf(arg(0));
        if (result.definitions.has(name) && !truth(result.locals.get('REDEFINE') ?? boolean(false,node.span))) fail(`Duplicate macro definition ${name}`,node);
        result.definitions.set(name,node as Sequence);return;
      }
      case 'GLOBAL':case 'CONSTANT':result.globals.set(nameOf(arg(0)),arg(1));break;
    }
    if (['ROUTINE','OBJECT','ROOM','GLOBAL','CONSTANT'].includes(op ?? '')) {
      const key=`${op}:${nameOf(arg(0))}`;
      const previous=declared.get(key);
      if (previous) {
        if (!truth(result.locals.get('REDEFINE') ?? boolean(false,node.span))) fail(`Duplicate declaration ${key}`,node);
        result.redefinitions.push({name:key,previous:previous.span,replacement:node.span});
      }
      declared.set(key,node);
    }
    result.forms.push(node);
  };
  include(entry);
  result.forms=result.forms.filter(node=>{
    const op=head(node);
    if (!['ROUTINE','OBJECT','ROOM','GLOBAL','CONSTANT'].includes(op ?? '')) return true;
    return node.kind==='form' && declared.get(`${op}:${atomName(node.items[1])}`)===node;
  });
  return result;
}
