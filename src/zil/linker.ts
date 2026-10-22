import { atomName } from './ast.ts';
import { read } from './reader.ts';
import type { MemoryImage } from './memory.ts';
import { validateMemoryImage } from './memory.ts';
import type { LinkedLogic, LogicExpression, OperationsLogic } from './logic.ts';
import { assertFullyLoweredLogic } from './logic.ts';
import { ZilError } from './diagnostics.ts';

/** Link the deferred memory/address expressions without changing scopes, control flow or operand order. */
export function linkMemoryLogic(logic:OperationsLogic,image:MemoryImage):LinkedLogic {
  validateMemoryImage(image);
  const copy=JSON.parse(JSON.stringify(logic)) as OperationsLogic;
  const words=new Map(image.words.map(w=>[w.name,w]));
  const arities:Record<string,[number,number]>={GET:[2,2],PUT:[3,3],GETB:[2,2],PUTB:[3,3],REST:[1,2],BACK:[2,2]};
  for(const routine of copy.routines){
    const rewrite=(value:unknown):unknown=>{
      if(Array.isArray(value))return value.map(rewrite);
      if(!value||typeof value!=='object')return value;
      const object=value as Record<string,unknown>;
      if(object.op==='untranslated'){
        const e=value as Extract<LogicExpression,{op:'untranslated'}>,fail=(message:string):never=>{throw new ZilError('ZIL011',message,e.source);};
        const site={source:e.source,...(e.origin?{origin:e.origin}:{})};
        if(e.phase!=='2.7')return fail('Cannot link a non-memory deferred operation '+e.construct);
        if(e.construct==='dictionary-address'){
          const n=read(e.sourceText).nodes[0],key=atomName(n?.kind==='prefix'?n.value:n);
          const w=key?.startsWith('W?')?words.get(key.slice(2)):undefined;if(!w)return fail('Missing linked dictionary reference '+key);
          const segment=image.segments.find(s=>s.name==='dictionary')!;
          return {op:'address',value:w.address,allocation:segment.name,addend:w.address-segment.base,name:'W?'+w.name,...site};
        }
        const arity=arities[e.construct];
        if(arity){
          if(e.args.length<arity[0]||e.args.length>arity[1])return fail(`${e.construct} expects ${arity[0]===arity[1]?arity[0]:arity.join('..')} argument(s), got ${e.args.length}`);
          const args=e.args.map(rewrite) as LogicExpression[];
          if(e.construct==='REST'&&args.length===1)args.push({op:'literal',value:1,source:e.source});
          return {op:'memory',operator:e.construct,args,...site};
        }
        if(['TABLE','LTABLE','ITABLE'].includes(e.construct)){
          const t=image.tables.find(t=>t.owner===routine.name&&t.source.file===e.source.file&&t.source.start.offset===e.source.start.offset&&t.source.end.offset===e.source.end.offset);
          if(!t)return fail('Missing static table-literal allocation');
          return {op:'address',value:t.base,allocation:t.name,addend:0,name:t.name,tableConstructor:e.construct,...site};
        }
        return fail('Unsupported memory construct '+e.construct);
      }
      return Object.fromEntries(Object.entries(object).map(([k,v])=>[k,rewrite(v)]));
    };
    routine.bindings=rewrite(routine.bindings) as typeof routine.bindings;routine.body=rewrite(routine.body) as typeof routine.body;routine.fullyLowered=true;
  }
  const linked:LinkedLogic={...copy,stage:'linked',untranslated:[]};assertFullyLoweredLogic(linked);return linked;
}
