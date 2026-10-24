import { sceneDirections } from './schemas.ts';
const symbol={type:'string',pattern:'^[A-Z][A-Z0-9?$!#-]*$',maxLength:100};
const node={type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]*$',maxLength:100};
const direction={enum:sceneDirections};
const object=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const list=(items:object)=>({type:'array',items,maxItems:512});
const nullable=(value:object)=>({anyOf:[value,{type:'null'}]});
/** Reviewed assembly data, separate from AI authoring tasks and engine rules. */
export const sceneBindingsSchema={
  $schema:'https://json-schema.org/draft/2020-12/schema',title:'ZXR scene bindings v1',
  ...object({format:{const:'zxr-scene-bindings-v1'},status:{const:'draft'},scenes:list(object({
    room:symbol,planHash:{type:'string',pattern:'^[a-f0-9]{64}$'},
    group:nullable(node),origin:{type:'array',items:{type:'number',minimum:-10000,maximum:10000},minItems:3,maxItems:3},
    yawDegrees:{type:'number',minimum:-180,maximum:180},
    exits:list(object({direction,mode:{enum:['transition','continuous','blocked','alias','menu-only']},aliasOf:nullable(direction),peer:nullable(object({room:symbol,direction}))})),
    attachments:list(object({object:symbol,parent:symbol,socket:node})),
    disclosures:list(object({node,object:symbol})),
    animations:list(object({object:symbol,property:{enum:['open','on']},whenTrue:node,whenFalse:node})),
    variants:list(object({object:symbol,variant:node,description:{type:'string',minLength:1,maxLength:4000}})),
  }))}),
};
