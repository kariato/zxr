import type { Node, Sequence, Span, MacroOrigin } from './ast.ts';
import { atomName, head, walk } from './ast.ts';
import type { LoadedProgram } from './loader.ts';
import { ZilError } from './diagnostics.ts';
import { print } from './printer.ts';
import { supportedDefinitions } from './macro-definitions.ts';
export const MACROS=['TELL','VERB?','PRSO?','PRSI?','ROOM?','BSET','BCLEAR','BSET?','RFATAL','PROB','ENABLE','DISABLE','FLAMING?','OPENABLE?','ABS','MULTIFROB','MULTIBITS','D-APPLY'] as const;
export interface Expansion { forms:Node[]; counts:Record<string,number> }
/** Hand ports of the vendored MDL macro programs, including their reversal/grouping rules. */
export function expandMacros(forms:readonly Node[],definitions:ReadonlyMap<string,Sequence>=new Map(),globals:ReadonlyMap<string,Node>=new Map()):Expansion {
  const counts:Record<string,number>={}, names=new Set<string>(MACROS);
  const used=new Set([...walk(forms)].filter(n=>n.kind==='atom').map(n=>(n as {value:string}).value));
  let serial=0,steps=0;
  const expand=(node:Node,depth=0):Node=>{
    if (++steps>1_000_000 || depth>256) throw new ZilError('ZIL004','Macro expansion limit exceeded',node.span);
    if (node.kind==='prefix') return node.operator==='quote'?node:{...node,value:expand(node.value,depth+1)};
    if (node.kind==='typed') return atomName(node.tag)==='DECL'?node:{...node,tag:expand(node.tag,depth+1),value:expand(node.value,depth+1)};
    if (node.kind!=='form' && node.kind!=='list' && node.kind!=='vector') return node;
    const name=head(node);
    if (!name || !names.has(name)) return {...node,items:node.items.map(n=>expand(n,depth+1))};
    counts[name]=(counts[name] ?? 0)+1;
    const args=node.items.slice(1), span=node.span;
    const origin:MacroOrigin={macro:name,call:span,...(definitions.get(name)?{definition:definitions.get(name)!.span}:{})};
    const base={span,origin:[...(node.origin ?? []),origin]};
    const atom=(value:string):Node=>({kind:'atom',value,...base});
    const num=(value:number):Node=>({kind:'number',value,radix:10,...base});
    const text=(value:string):Node=>({kind:'string',value,...base});
    const form=(op:string,...items:Node[]):Sequence=>({kind:'form',items:[atom(op),...items],...base});
    const list=(...items:Node[]):Sequence=>({kind:'list',items,...base});
    const ref=(operator:'global'|'local',value:string):Node=>({kind:'prefix',operator,value:atom(value),comments:[],...base});
    const fail=(message:string,site:Node=node):never=>{throw new ZilError('ZIL004',`${name}: ${message}`,site.span);};
    const arity=(min:number,max=min)=>{if (args.length<min || args.length>max) fail(`expected ${min===max?min:`${min}..${max}`} arguments, got ${args.length}`);};
    const a=(i:number):Node=>args[i] ?? fail('missing argument');
    const nameOf=(value:Node):string=>atomName(value) ?? fail('expected an atom',value);
    const sequence=(value:Node):Node[]=>value.kind==='list'?value.items:fail('expected a literal argument list',value);
    const multifrob=(subject:string,values:Node[]):Node=>{
      if (!values.length) return fail('comparison needs at least one value');
      const groups:Node[]=[];
      for (let i=0;i<values.length;i+=3) {
        const group=values.slice(i,i+3).map(v=>v.kind==='atom'?ref('global',subject==='PRSA'?'V?'+v.value:v.value):v).reverse();
        groups.push(form('EQUAL?',ref('global',subject),...group));
      }
      return groups.length===1?groups[0]!:form('OR',...groups);
    };
    const multibits=(operation:string,object:Node,bits:Node[]):Node=>{
      const calls=bits.map(bit=>form(operation,object,bit.kind==='form'?bit:ref('global',nameOf(bit)))).reverse();
      return calls.length===1?calls[0]!:operation==='FSET?'?form('OR',...calls):form('PROG',list(),...calls);
    };
    let output:Node;
    switch(name) {
      case 'TELL': {
        const commands:Node[]=[];
        for (let i=0;i<args.length;i++) {
          const item=args[i]!;
          if (item.kind==='atom') {
            if (item.value==='CR' || item.value==='CRLF') {commands.push(form('CRLF'));continue;}
            const object=args[++i];if (!object) return fail('indicator at end of TELL',item);
            const indicator=item.value;
            if (['DESC','D','OBJ','O'].includes(indicator)) commands.push(form('PRINTD',object));
            else if (['A','AN'].includes(indicator)) commands.push(form('PRINTA',object));
            else if (['NUM','N'].includes(indicator)) commands.push(form('PRINTN',object));
            else if (['CHAR','CHR','C'].includes(indicator)) commands.push(form('PRINTC',object));
            else commands.push(form('PRINT',form('GETP',object,item)));
          } else if (item.kind==='string' || (item.kind==='typed' && atomName(item.tag)==='ZSTRING')) commands.push(form('PRINTI',item));
          else if (item.kind==='form' || (item.kind==='prefix' && ['global','local'].includes(item.operator))) commands.push(form('PRINT',item));
          else return fail('unsupported TELL item (use N for a number or C for a character)',item);
        }
        output=form('PROG',list(),...commands);break;
      }
      case 'VERB?':case 'PRSO?':case 'PRSI?':case 'ROOM?': {
        arity(1,Number.MAX_SAFE_INTEGER);
        const subject=({'VERB?':'PRSA','PRSO?':'PRSO','PRSI?':'PRSI','ROOM?':'HERE'} as Record<string,string>)[name]!;
        output=multifrob(subject,args);
        output.semantic={kind:({'VERB?':'verb-test','PRSO?':'direct-object-test','PRSI?':'indirect-object-test','ROOM?':'room-test'} as Record<string,string>)[name]!,values:args};break;
      }
      case 'MULTIFROB':arity(2);output=multifrob(nameOf(a(0)),sequence(a(1)));break;
      case 'BSET':case 'BCLEAR':case 'BSET?':arity(1,Number.MAX_SAFE_INTEGER);output=multibits(name==='BSET'?'FSET':name==='BCLEAR'?'FCLEAR':'FSET?',a(0),args.slice(1));break;
      case 'MULTIBITS':arity(3);output=multibits(nameOf(a(0)),a(1),sequence(a(2)));break;
      case 'RFATAL':arity(0);output=form('PROG',list(),form('PUSH',num(2)),form('RSTACK'));break;
      case 'PROB':arity(1,2);output=args.length===2?form('ZPROB',a(0)):form('G?',a(0),form('RANDOM',num(100)));break;
      case 'ENABLE':case 'DISABLE':arity(1);output=form('PUT',a(0),globals.get('C-ENABLED?') ?? num(0),num(name==='ENABLE'?1:0));break;
      case 'FLAMING?':arity(1);output=form('AND',form('FSET?',a(0),ref('global','FLAMEBIT')),form('FSET?',a(0),ref('global','ONBIT')));break;
      case 'OPENABLE?':arity(1);output=form('OR',form('FSET?',a(0),ref('global','DOORBIT')),form('FSET?',a(0),ref('global','CONTBIT')));break;
      case 'ABS':arity(1);output=form('COND',list(form('L?',a(0),num(0)),form('-',num(0),a(0))),list(atom('T'),a(0)));break;
      case 'D-APPLY': {
        arity(2,3);
        const fresh=(suffix:string)=>{let name:string;do{name=`ZXR!MACRO-${++serial}-${suffix}`;}while(used.has(name));used.add(name);return name;};
        const str=fresh('STR'),fcn=fresh('FCN'),foo=fresh('FOO'),res=fresh('RES');
        const local=(s:string)=>ref('local',s);
        const debug=ref('global','DEBUG');
        const say=(...items:Node[])=>form('TELL',...items);
        output=form('PROG',list(list(atom(str),a(0)),list(atom(fcn),a(1)),...(args.length===3?[list(atom(foo),a(2))]:[]),atom(res)),
          form('COND',list(form('NOT',local(fcn)),{kind:'form',items:[],...base}),list(atom('T'),
            form('COND',list(debug,form('COND',list(form('NOT',local(str)),say(atom('CR'),text('  Default ->'),atom('CR'))),list(atom('T'),say(atom('CR'),text('  '),local(str),text(' -> ')))))),
            form('SET',atom(res),form('APPLY',local(fcn),...(args.length===3?[local(foo)]:[]))),
            form('COND',list(form('AND',debug,local(str)),form('COND',list(form('==?',local(res),num(2)),say(text('Fatal'),atom('CR'))),list(form('NOT',local(res)),say(text('Not handled'))),list(atom('T'),say(text('Handled'),atom('CR')))))),
            local(res))));break;
      }
      default:return fail('unimplemented macro');
    }
    return expand(output,depth+1);
  };
  for (const [name,definition] of definitions) {
    if (!names.has(name)) throw new ZilError('ZIL004',`No game-specific expander for ${name}`,definition.span);
    if (print(definition)!==supportedDefinitions[name]) throw new ZilError('ZIL004',`${name} differs from the pinned Zork II definition; its hand port must be reviewed`,definition.span);
  }
  return {forms:forms.map(n=>expand(n)),counts};
}
