import type { LoadedProgram } from './loader.ts';
import type { Node, Sequence, Span } from './ast.ts';
import { atomName, head } from './ast.ts';
import { RUNTIME_OPERATIONS } from './operations.ts';

export type SymbolKind = 'constant'|'global'|'object'|'room'|'routine'|'property'|'attribute'|'word'|'action'|'lexical-verb'|'preposition'|'adjective'|'builtin';
export interface SymbolLayout {
  objects:string[]; globals:string[]; routines:string[]; constants:Readonly<Record<string,number>>;
  words:{name:string;referenceAddress?:number}[];
}
export interface SymbolDefinition {
  name:string; kind:SymbolKind; number:number|null; source?:Span; origin:'source'|'compiler'|'compile-time';
  /** Oracle addresses are evidence only; memory layout must assign the runtime address later. */
  referenceAddress?:number;
  dictionaryIndex?:number;
}
export interface SymbolIssue { code:'ZIL005'; message:string; span:Span; routine?:string }
export interface SymbolUse { name:string; target:string; kind:SymbolKind|'local'; mode:'value'|'global-value'|'local-value'|'variable-number'|'call'|'write'; span:Span; routine?:string; slot?:number }
export interface LocalDefinition { name:string; slot:number; kind:'required'|'optional'|'aux'|'block'; source:Span }
export interface RoutineScope { name:string; locals:LocalDefinition[]; required:number; optional:number; source:Span }
export interface SymbolAnalysis { symbols:SymbolDefinition[]; references:SymbolUse[]; routines:RoutineScope[]; diagnostics:SymbolIssue[] }

/** Resolve names independently of file I/O, allocation or code generation. */
export function analyzeSymbols(program:LoadedProgram,forms:readonly Node[],layout:SymbolLayout):SymbolAnalysis {
  const result:SymbolAnalysis={symbols:[],references:[],routines:[],diagnostics:[]};
  const definitions=new Map<string,SymbolDefinition>(),primitive=new Set(RUNTIME_OPERATIONS);
  const initial=program.documents[0]?.nodes[0]?.span ?? {file:'<symbols>',start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0}};
  const issue=(message:string,node:Node|Span,routine?:string)=>result.diagnostics.push({code:'ZIL005',message,span:'span' in node?node.span:node,...(routine?{routine}:{})});
  const add=(symbol:SymbolDefinition)=>{
    const previous=definitions.get(symbol.name);
    if(previous){issue(`Duplicate symbol ${symbol.name} (${previous.kind} and ${symbol.kind})`,symbol.source ?? initial);return;}
    definitions.set(symbol.name,symbol);result.symbols.push(symbol);
  };
  for(const [label,names,max] of [['objects',layout.objects,255],['globals',layout.globals,240],['routines',layout.routines,65535],['words',layout.words.map(w=>w.name),65535]] as const){
    if(new Set(names).size!==names.length)issue(`Duplicate ${label} in reference layout`,initial);
    if(names.length>max)issue(`Too many ${label} in reference layout (${names.length} > ${max})`,initial);
  }
  for(const [name,value] of Object.entries(layout.constants))if(!Number.isInteger(value)||value < -32768||value>65535)issue(`Invalid reference number for ${name}: ${value}`,initial);
  const ordinal=(names:string[],name:string,base:number,span:Span):number|null=>{
    const index=names.indexOf(name);if(index<0){issue(`Missing reference number for ${name}`,span);return null;}return base+index;
  };
  for(const [name,number] of [['T',1],['FALSE-VALUE',0],['TRUE-VALUE',1]] as const)add({name,kind:'builtin',number,origin:'compiler'});
  // The assembly fixes the compiler-created namespaces; source globals/constants are added below.
  const flags=new Set(Object.keys(layout.constants).filter(n=>n.startsWith('FX?')).map(n=>n.slice(3)));
  for(const [name,value] of Object.entries(layout.constants)) {
    let kind:SymbolKind|undefined;
    if(flags.has(name))kind='attribute';
    else for(const [prefix,k] of [['P?','property'],['V?','action'],['ACT?','lexical-verb'],['PR?','preposition'],['A?','adjective']] as const)if(name.startsWith(prefix))kind=k;
    if(kind){
      const max=kind==='property'?31:kind==='attribute'?31:255,min=['attribute','action'].includes(kind)?0:1;
      if(value<min||value>max)issue(`Invalid ${kind} number for ${name}: ${value}`,initial);
      add({name,kind,number:value&0xffff,origin:'compiler'});
    }
    else if(/^(PS\?|P1\?|O\?)/.test(name)||['LOW-DIRECTION','ZORKID'].includes(name))add({name,kind:'constant',number:value&0xffff,origin:'compiler'});
  }
  for(const [i,word] of layout.words.entries())add({name:'W?'+word.name,kind:'word',number:null,dictionaryIndex:i+1,origin:'compiler',...(word.referenceAddress!==undefined?{referenceAddress:word.referenceAddress}:{})});
  for(const name of ['PREPOSITIONS','ACTIONS','PREACTIONS','VERBS'])if(layout.globals.includes(name))add({name,kind:'global',number:ordinal(layout.globals,name,16,initial),origin:'compiler'});
  const constantInitializers=new Map<string,Node>();
  for(const node of forms) {
    const op=head(node);if(!['CONSTANT','GLOBAL','OBJECT','ROOM','ROUTINE'].includes(op ?? ''))continue;
    const form=node as Sequence,name=atomName(form.items[1]);
    if(!name){issue('Declaration requires a symbol name',form.items[1] ?? node);continue;}
    const kind=({CONSTANT:'constant',GLOBAL:'global',OBJECT:'object',ROOM:'room',ROUTINE:'routine'} as Record<string,SymbolKind>)[op!]!;
    const number=kind==='constant'?null:kind==='global'?ordinal(layout.globals,name,16,node.span):kind==='routine'?ordinal(layout.routines,name,1,node.span):ordinal(layout.objects,name,1,node.span);
    add({name,kind,number,source:node.span,origin:'source'});
    if(kind==='constant'){if(form.items[2])constantInitializers.set(name,form.items[2]);else issue(`Constant ${name} requires an initializer`,node);}
  }
  for(const [name,node] of program.globals)if(!definitions.has(name) && (node.kind==='number'||(node.kind==='atom'&&node.value==='T')||(node.kind==='form'&&!node.items.length))) {
    add({name,kind:'constant',number:node.kind==='number'?node.value&0xffff:node.kind==='atom'?1:0,source:node.span,origin:'compile-time'});
  }
  const evaluating=new Set<string>();
  const evaluateConstant=(node:Node):number|null=>{
    if(node.kind==='number')return node.value&0xffff;
    if(node.kind==='form'&&!node.items.length)return 0;
    if(node.kind==='prefix' && node.operator==='global')return evaluateConstant(node.value);
    if(node.kind==='atom') {
      const d=definitions.get(node.value);if(!d){issue(`Undefined constant ${node.value}`,node);return null;}
      if(d.kind==='global'||d.kind==='word'||d.kind==='routine'){issue(`Constant initializer requires a fixed numeric value, got ${d.kind} ${d.name}`,node);return null;}
      if(d.number!==null)return d.number;
      const initializer=constantInitializers.get(node.value);if(!initializer)return null;
      if(evaluating.has(node.value)){issue(`Constant cycle involving ${node.value}`,node);return null;}
      evaluating.add(node.value);const value=evaluateConstant(initializer);evaluating.delete(node.value);d.number=value;return value;
    }
    if(node.kind==='form') {
      const op=head(node),args=node.items.slice(1).map(evaluateConstant);if(args.some(n=>n===null))return null;
      const a=args as number[],signed=(v:number)=>v&0x8000?v-0x10000:v;
      let n:number;
      if(op==='+'&&a.length>=2)n=a.reduce((x,y)=>(x+y)&0xffff);
      else if(op==='*'&&a.length>=2)n=a.reduce((x,y)=>(x*y)&0xffff);
      else if(op==='-'&&[1,2].includes(a.length))n=a.length===1?-signed(a[0]!):signed(a[0]!)-signed(a[1]!);
      else if((op==='/'||op==='MOD')&&a.length===2){if(!a[1]){issue('Division by zero in constant initializer',node);return null;}n=op==='/'?Math.trunc(signed(a[0]!)/signed(a[1]!)):signed(a[0]!)%signed(a[1]!);}
      else if((op==='BAND'||op==='BOR')&&a.length===2)n=op==='BAND'?a[0]!&a[1]!:a[0]!|a[1]!;
      else if(op==='BCOM'&&a.length===1)n=~a[0]!;
      else {issue(`Unsupported constant initializer ${op ?? '(non-atom)'}`,node);return null;}
      return n&0xffff;
    }
    issue('Unsupported constant initializer',node);return null;
  };
  for(const [name,node] of constantInitializers){const d=definitions.get(name)!;if(d.kind!=='constant')continue;d.number=evaluateConstant(node);const expected=layout.constants[name];if(expected!==undefined && d.number!==null && d.number!==(expected&0xffff))issue(`Reference constant mismatch for ${name}: source ${d.number}, reference ${expected&0xffff}`,node);}

  type Scope=Map<string,LocalDefinition>;
  const lookup=(node:Node,name:string,mode:SymbolUse['mode'],locals:Scope,routine?:string,expected?:readonly SymbolKind[]):SymbolDefinition|LocalDefinition|undefined=>{
    const local=mode!=='global-value'&&mode!=='call'?locals.get(name):undefined;
    if(local){
      if(expected){issue(`Expected ${expected.join('/')} ${name}, found local`,node,routine);return;}
      result.references.push({name,target:`${routine ?? '<block>'}:${local.slot}:${name}`,kind:'local',mode:mode==='value'?'variable-number':mode,slot:local.slot,span:node.span,...(routine?{routine}:{})});return local;
    }
    const d=definitions.get(name);
    if(!d){issue(`Undefined symbol ${name}`,node,routine);return;}
    if(mode==='local-value'){issue(`Undefined local ${name} (a ${d.kind} with that name exists)`,node,routine);return;}
    if(expected&&!expected.includes(d.kind)){issue(`Expected ${expected.join('/')} ${name}, found ${d.kind}`,node,routine);return;}
    result.references.push({name,target:d.name,kind:d.kind,mode:mode==='value'&&d.kind==='global'?'variable-number':mode,span:node.span,...(routine?{routine}:{})});return d;
  };
  const bind=(list:Node|undefined,scope:Scope,record:RoutineScope,kind:'required'|'block')=>{
    if(list?.kind!=='list'){issue('Expected a local binding list',list ?? record.source,record.name);return;}
    let mode:LocalDefinition['kind']=kind,phase=0;const owned=new Set<string>();
    for(const item of list.items) {
      if(item.kind==='string') {
        const next=item.value==='OPTIONAL'?1:item.value==='AUX'?2:0;
        if(kind==='block'||!next||next<=phase){issue(`Invalid or repeated argument section ${item.value}`,item,record.name);continue;}
        phase=next;mode=next===1?'optional':'aux';continue;
      }
      const name=item.kind==='list'?atomName(item.items[0]):atomName(item);
      if(!name){issue('Invalid local binding',item,record.name);continue;}
      if(owned.has(name)){issue(`Duplicate local ${name}`,item,record.name);continue;}owned.add(name);
      if(item.kind==='list') {
        if(item.items.length!==2){issue(`Binding ${name} requires exactly one initializer`,item,record.name);continue;}
        if(mode==='required')issue(`Required argument ${name} cannot have a default`,item,record.name);
        expression(item.items[1]!,scope,record);
      }
      const local:LocalDefinition={name,slot:record.locals.length+1,kind:mode,source:item.span};
      record.locals.push(local);scope.set(name,local);
      if(mode==='required')record.required++;else if(mode==='optional')record.optional++;
    }
  };
  const expression=(node:Node,scope:Scope,record?:RoutineScope):void=>{
    const routine=record?.name;
    if(node.kind==='number'||node.kind==='string'||node.kind==='character')return;
    if(node.kind==='typed'){if(atomName(node.tag)==='DECL')return;if(['BYTE','WORD','ZSTRING'].includes(atomName(node.tag) ?? '')){expression(node.value,scope,record);return;}issue(`Unsupported typed value ${atomName(node.tag) ?? '(non-atom)'}`,node,routine);return;}
    if(node.kind==='prefix') {
      if(!['global','local'].includes(node.operator)){issue(`Unsupported value prefix ${node.operator}`,node,routine);return;}
      const name=atomName(node.value);if(!name){issue('Value reference requires an atom',node,routine);return;}
      lookup(node,name,node.operator==='global'?'global-value':'local-value',scope,routine);return;
    }
    if(node.kind==='atom'){lookup(node,node.value,'value',scope,routine);return;}
    if(node.kind!=='form'){issue(`Unexpected ${node.kind} in expression`,node,routine);return;}
    if(!node.items.length)return;
    const op=head(node),args=node.items.slice(1);if(!op){issue('Call head must be an operation or routine name',node,routine);return;}
    if(['TABLE','LTABLE','ITABLE'].includes(op)) {
      const tableFlags=new Set(['PURE','BYTE','WORD','LENGTH','LEXV','NONE']);
      for(const arg of args){
        if(arg.kind==='atom'&&tableFlags.has(arg.value))continue;
        if(arg.kind==='list'){for(const flag of arg.items)if(flag.kind!=='atom'||!tableFlags.has(flag.value))issue('Unknown table layout flag',flag,routine);}
        else expression(arg,scope,record);
      }return;
    }
    if(op==='PROG'||op==='REPEAT') {
      if(!record){issue(`${op} requires a routine scope`,node);return;}
      const nested=new Map(scope);bind(args[0],nested,record,'block');for(const n of args.slice(1))expression(n,nested,record);return;
    }
    if(op==='COND') {
      for(const clause of args){if(clause.kind!=='list'||!clause.items.length){issue('Expected a nonempty COND clause',clause,routine);continue;}
        for(const [i,n] of clause.items.entries()){if(i===0 && atomName(n)==='ELSE')continue;expression(n,scope,record);}}
      return;
    }
    if(['SET','SETG','IGRTR?','DLESS?'].includes(op)) {
      const target=args[0],name=atomName(target);
      if(!target||!name)issue(`${op} requires a named variable`,target ?? node,routine);
      else if(op==='SET') {if(!scope.has(name))issue(`Undefined local ${name}`,target,routine);else lookup(target,name,'write',scope,routine);}
      else if(op==='SETG')lookup(target,name,'write',new Map(),routine,['global']);
      else if(scope.has(name))lookup(target,name,'variable-number',scope,routine);
      else lookup(target,name,'variable-number',scope,routine,['global']);
      for(const n of args.slice(1))expression(n,scope,record);return;
    }
    if(!primitive.has(op))lookup(node.items[0]!,op,'call',scope,routine,['routine']);
    for(const n of args)expression(n,scope,record);
  };
  const named=(node:Node|undefined,prefix:string,kinds:readonly SymbolKind[])=>{
    if(!node)return;
    const name=node.kind==='string'?node.value.toUpperCase():atomName(node);
    if(!name){issue('Expected a named reference',node);return;}
    const word=prefix==='W?'?({'.':'PERIOD',',':'COMMA','"':'QUOTE'} as Record<string,string>)[name] ?? name:name;
    lookup(node,prefix+word,'value',new Map(),undefined,kinds);
  };
  const object=(form:Sequence)=>{
    const properties=new Set<string>();
    for(const n of form.items.slice(2)) {
      if(n.kind!=='list'||!n.items.length){issue('Expected an object property list',n);continue;}
      const name=atomName(n.items[0]),args=n.items.slice(1);
      if(!name){issue('Expected a property name',n.items[0]!);continue;}
      const key=name==='IN'&&args.length===1&&args[0]?.kind==='atom'?'@location':name;
      if(properties.has(key))issue(`Duplicate object property ${name}`,n);properties.add(key);
      if(name==='DESC'){for(const a of args)if(a.kind!=='string')issue('DESC requires a string',a);continue;}
      if(name==='FLAGS'){for(const a of args)named(a,'',['attribute']);continue;}
      if(name==='IN'&&args.length===1&&args[0]?.kind==='atom'){named(args[0],'',['object','room']);continue;}
      named(n.items[0],'P?',['property']);
      if(name==='SYNONYM'){for(const a of args)named(a,'W?',['word']);continue;}
      if(name==='ADJECTIVE'){for(const a of args)named(a,'A?',['adjective']);continue;}
      if(name==='PSEUDO'){
        if(args.length%2)issue('PSEUDO requires word/routine pairs',n);
        for(let i=0;i<args.length;i+=2){named(args[i],'W?',['word']);named(args[i+1],'',['routine']);}continue;
      }
      if(['ACTION','DESCFCN','CONTFCN','ADVFCN'].includes(name)){
        for(const a of args)if(a.kind==='number'&&a.value===0)continue;else named(a,'',['routine']);continue;
      }
      if(name==='GLOBAL'){for(const a of args)named(a,'',['object','room']);continue;}
      if((definitions.get('P?'+name)?.number ?? 0)>=(layout.constants['LOW-DIRECTION'] ?? 32)) {
        if(args[0]?.kind==='string'){if(args.length!==1)issue('Blocked exit requires one string',n);continue;}
        const first=atomName(args[0]);
        if(first==='PER'){named(args[1],'',['routine']);if(args.length!==2)issue('Routine exit requires PER and one routine',n);continue;}
        if(first!=='TO'){issue('Exit requires TO, PER or a string',n);continue;}
        named(args[1],'',['object','room']);
        if(args.length>2){
          if(atomName(args[2])!=='IF'){issue('Conditional exit requires IF',args[2]!);continue;}
          const door=atomName(args[4])==='IS';named(args[3],'',door?['object','room']:['global']);
          if(door&&atomName(args[5])!=='OPEN')issue('Door exit requires IS OPEN',args[5] ?? n);
          const offset=door?6:4;
          if(args.length>offset&&(atomName(args[offset])!=='ELSE'||args[offset+1]?.kind!=='string'||args.length!==offset+2))issue('Invalid exit ELSE message',args[offset] ?? n);
        }continue;
      }
      for(const a of args)expression(a,new Map());
    }
  };
  // Resolve all executable initializers, local defaults and body references, including inactive-at-runtime branches.
  const propertyDefaults=new Set<string>();
  for(const node of forms) {
    const op=head(node);if(!op)continue;const form=node as Sequence;
    if(op==='ROUTINE') {
      const name=atomName(form.items[1]);if(!name)continue;
      const record:RoutineScope={name,locals:[],required:0,optional:0,source:node.span},scope:Scope=new Map();
      result.routines.push(record);bind(form.items[2],scope,record,'required');for(const n of form.items.slice(3))expression(n,scope,record);
    } else if(op==='GLOBAL'){if(form.items[2])expression(form.items[2],new Map());}
    else if(op==='OBJECT'||op==='ROOM')object(form);
    else if(op==='PROPDEF') {
      const name=atomName(form.items[1]);if(name)lookup(form.items[1]!,'P?'+name,'value',new Map(),undefined,['property']);
      if(name&&propertyDefaults.has(name))issue(`Duplicate property default ${name}`,node);if(name)propertyDefaults.add(name);
      if(form.items[2])expression(form.items[2],new Map());
    } else if(['SYNONYM','BUZZ','DIRECTIONS'].includes(op)) {
      for(const word of form.items.slice(1)){named(word,'W?',['word']);if(op==='DIRECTIONS')named(word,'P?',['property']);}
    } else if(op==='SYNTAX') {
      const equals=form.items.findIndex(n=>atomName(n)==='=');
      if(equals<0){issue('SYNTAX requires = and an action routine',node);continue;}
      named(form.items[1],'W?',['word']);
      for(const n of form.items.slice(2,equals)){
        if(n.kind==='atom'){if(n.value!=='OBJECT')named(n,'PR?',['preposition']);}
        else if(n.kind==='list'){
          if(atomName(n.items[0])==='FIND'){if(n.items.length!==2)issue('FIND requires one attribute',n);named(n.items[1],'',['attribute']);}
          else for(const rule of n.items)if(!['HELD','CARRIED','ON-GROUND','IN-ROOM','MANY','HAVE','TAKE'].includes(atomName(rule) ?? ''))issue('Unknown syntax slot rule',rule);
        } else issue('Invalid syntax slot',n);
      }
      for(const n of form.items.slice(equals+1))named(n,'',['routine']);
    }
  }
  // Layout records are not declarations: removing a source declaration must not be masked by the oracle.
  for(const [names,kinds] of [[layout.objects,['object','room']],[layout.globals,['global']],[layout.routines,['routine']]] as const)
    for(const name of names)if(!definitions.has(name)||!kinds.includes(definitions.get(name)!.kind as never))issue(`Reference layout has no matching source declaration: ${name}`,initial);
  return result;
}
