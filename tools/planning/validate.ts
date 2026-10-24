import Ajv2020 from 'ajv/dist/2020.js';
import { planningSchemas } from './schemas.ts';
const ajv=new Ajv2020({strict:true,allErrors:true});
const validators=Object.fromEntries(Object.entries(planningSchemas).map(([name,schema])=>[name,ajv.compile(schema)]));
type RecordValue=Record<string,any>;
/** Shape and local references only. Cross-room/source/GLB checks belong to 6.5/7.4. */
export function validatePlanning(kind:keyof typeof planningSchemas,input:unknown):void {
  const validate=validators[kind]!;
  if(!validate(input))throw new Error(kind+': '+ajv.errorsText(validate.errors,{separator:'; '}));
  const data=input as RecordValue;
  const unique=(values:string[],label:string)=>{if(new Set(values).size!==values.length)throw new Error(kind+': duplicate '+label);};
  if(kind==='scene-plan'){
    unique(data.anchors.map((a:RecordValue)=>a.node),'anchor');
    unique([...data.anchors,...data.exits,...data.features,...data.kitParts,...data.lighting.lit,...data.lighting.dark].map((n:RecordValue)=>n.node),'node');
    unique(data.exits.map((e:RecordValue)=>e.direction),'exit direction');unique(data.objects.map((o:RecordValue)=>o.object),'object placement');
    const anchors=new Set(data.anchors.map((a:RecordValue)=>a.node));
    for(const name of [data.spawn,...[...data.exits,...data.objects,...data.features].map((v:RecordValue)=>v.anchor)])if(!anchors.has(name))throw new Error(kind+': missing anchor '+name);
  }
  if(kind==='asset-brief'){
    unique(data.materials.map((m:RecordValue)=>m.name),'material');unique(data.hotspotNodes.map((h:RecordValue)=>h.node),'hotspot node');
    if(data.kind==='scenery'&&(data.objects.length||data.hotspotNodes.length))throw new Error(kind+': scenery cannot claim game objects or interactive hotspots');
    if(data.kind!=='scenery'&&!data.objects.length)throw new Error(kind+': interactive assets require source objects');
  }
  if(kind==='label-set'){
    unique(data.entries.map((e:RecordValue)=>e.kind==='action'?'action:'+e.family:'decision:'+e.context+':'+e.choice),'label binding');
    for(const entry of data.entries){
      if(entry.kind==='decision'){
        if(!(entry.context==='yes-no'?['yes','no']:['restart','restore','quit']).includes(entry.choice))throw new Error(kind+': decision choice does not match context');
        continue;
      }
      const placeholders=[...entry.template.matchAll(/\{([^{}]+)\}/g)].map((m:RegExpMatchArray)=>m[1]!);
      if(entry.template.replace(/\{([^{}]+)\}/g,'').match(/[{}]/)||placeholders.some((name:string)=>!entry.slots.includes(name))||entry.slots.some((name:string)=>!placeholders.includes(name)))throw new Error(kind+': template placeholders differ from slots');
    }
  }
}
