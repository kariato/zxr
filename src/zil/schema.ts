/** The deliberately small JSON Schema 2020-12 vocabulary used by the published ZXR schemas. */
export interface Schema { $ref?:string;type?:'object'|'array'|'string'|'integer'|'boolean'|'null';const?:unknown;enum?:readonly unknown[];properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean|Schema;items?:Schema;prefixItems?:Schema[];minItems?:number;maxItems?:number;minLength?:number;pattern?:string;minimum?:number;maximum?:number;anyOf?:Schema[] }
export function assertSchema(value:unknown,schema:Schema,definitions:Record<string,Schema>,label='data'):void {
  let steps=0;
  const resolve=(s:Schema):Schema=>s.$ref?(Object.hasOwn(definitions,s.$ref.replace('#/$defs/',''))?definitions[s.$ref.replace('#/$defs/','')]:undefined) ?? (()=>{throw new Error('Unknown schema reference '+s.$ref);})():s;
  const check=(v:unknown,raw:Schema,path:string,depth:number):string|undefined=>{
    if(++steps>5000000||depth>256)throw new Error('Schema validation resource limit');const s=resolve(raw);
    if(s.anyOf){let branches=s.anyOf;
      if(v&&typeof v==='object'&&!Array.isArray(v)){const o=v as Record<string,unknown>;for(const key of ['op','kind','format'])if(typeof o[key]==='string'){
        const candidates=branches.filter(b=>{const rule=resolve(b).properties?.[key];return rule&&(rule.const===o[key]||rule.enum?.includes(o[key]));});if(candidates.length){branches=candidates;break;}
      }}
      let error:string|undefined;for(const branch of branches){const e=check(v,branch,path,depth+1);if(!e)return;error ??=e;}return error ?? path+': no allowed variant';
    }
    if('const' in s&&v!==s.const)return path+': expected '+JSON.stringify(s.const);
    if(s.enum&&!s.enum.includes(v))return path+': value is not allowed';
    if(s.type==='integer'){if(typeof v!=='number'||!Number.isSafeInteger(v))return path+': expected safe integer';if(s.minimum!==undefined&&v<s.minimum||s.maximum!==undefined&&v>s.maximum)return path+': integer outside bounds';}
    if(s.type==='string'){if(typeof v!=='string')return path+': expected string';if(s.minLength!==undefined&&v.length<s.minLength||s.pattern&&!new RegExp(s.pattern).test(v))return path+': invalid string';}
    if(s.type==='boolean'&&typeof v!=='boolean'||s.type==='null'&&v!==null)return path+': expected '+s.type;
    if(s.type==='array'){
      if(!Array.isArray(v))return path+': expected array';if(s.minItems!==undefined&&v.length<s.minItems||s.maxItems!==undefined&&v.length>s.maxItems)return path+': invalid array length';
      for(let i=0;i<v.length;i++){const item=s.prefixItems?.[i] ?? s.items;if(item){const e=check(v[i],item,path+'['+i+']',depth+1);if(e)return e;}}
    }
    if(s.type==='object'){
      if(!v||typeof v!=='object'||Array.isArray(v))return path+': expected object';const o=v as Record<string,unknown>;
      for(const key of s.required ?? [])if(!Object.hasOwn(o,key))return path+'.'+key+': required';
      for(const key of Object.keys(o)){const rule=s.properties&&Object.hasOwn(s.properties,key)?s.properties[key]:undefined;if(rule){const e=check(o[key],rule,path+'.'+key,depth+1);if(e)return e;}else if(s.additionalProperties===false)return path+'.'+key+': unknown property';else if(typeof s.additionalProperties==='object'){const e=check(o[key],s.additionalProperties,path+'.'+key,depth+1);if(e)return e;}}
    }
  };const error=check(value,schema,label,0);if(error)throw new Error('Schema: '+error);
}
