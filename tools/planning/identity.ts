import { createHash } from 'node:crypto';
/** Presentation geometry uses finite fractional metres. Do not weaken the
 * engine's integer-only canonical JSON contract for this separate workflow. */
export function planningJson(value:unknown):string {
  const active=new Set<object>();
  const encode=(v:unknown):string=>{
    if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
    if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('Non-finite presentation number');return JSON.stringify(v);}
    if(!v||typeof v!=='object'||active.has(v))throw new Error('Invalid/cyclic presentation JSON');
    active.add(v);let result:string;
    if(Array.isArray(v)){if(Object.keys(v).length!==v.length)throw new Error('Sparse presentation array');result='['+v.map(encode).join(',')+']';}
    else {if(![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw new Error('Presentation JSON requires plain records');result='{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+encode((v as Record<string,unknown>)[k])).join(',')+'}';}
    active.delete(v);return result;
  };return encode(value);
}
export const digest=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const planningHash=(value:unknown)=>digest(planningJson(value));
export const planningCopy=<T>(value:T):T=>JSON.parse(planningJson(value)) as T;
