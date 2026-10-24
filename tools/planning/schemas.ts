/** Presentation-only contracts. Never imported into the semantic engine/bundle.
 * Published by schemas:record and independently checked with AJV 2020. */
const text={type:'string',minLength:1,maxLength:4000};
const symbol={type:'string',pattern:'^[A-Z][A-Z0-9?$!#-]*$',maxLength:100};
const node={type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]*$',maxLength:100};
const list=(items:object,minItems=0)=>({type:'array',items,minItems,maxItems:512});
const object=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const number=(minimum:number,maximum:number)=>({type:'number',minimum,maximum});
const vector=(min:number,max:number)=>({type:'array',items:number(min,max),minItems:3,maxItems:3});
const ref=(name:string)=>({$ref:'#/$defs/'+name});
export const sceneDirections=['NORTH','NE','EAST','SE','SOUTH','SW','WEST','NW','UP','DOWN','IN','OUT','LAND','CROSS'] as const;
const common={
  symbol,node,
  position:vector(-10000,10000),size:vector(.001,10000),
  pose:object({position:ref('position'),yawDegrees:number(-180,180)}),
  colour:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},
  provenance:{anyOf:[
    object({method:{const:'manual'},author:text}),
    object({method:{const:'model'},model:text,promptVersion:text,inputHash:{type:'string',pattern:'^[a-f0-9]{64}$'}}),
    object({method:{const:'assistant'},agent:{const:'Codex'},model:{anyOf:[text,{type:'null'}]},promptVersion:text,inputHash:{type:'string',pattern:'^[a-f0-9]{64}$'}}),
  ]},
  review:{anyOf:[object({status:{const:'draft'}}),object({status:{const:'approved'},reviewer:text,reviewedOn:{type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'}})]},
  condition:{anyOf:[
    object({kind:{const:'flag'},object:ref('symbol'),flag:ref('symbol'),set:{type:'boolean'}}),
    object({kind:{const:'global'},name:ref('symbol'),equals:{type:'integer',minimum:-32768,maximum:65535}}),
  ]},
  light:object({node:ref('node'),kind:{enum:['ambient','point','directional']},colour:ref('colour'),intensity:number(0,1000),position:ref('position')}),
};
const root=(title:string,properties:Record<string,object>,defs:Record<string,object>={})=>({
  $schema:'https://json-schema.org/draft/2020-12/schema',title,
  ...object(properties),$defs:{...common,...defs},
});
const header=(format:string)=>({format:{const:format},provenance:ref('provenance'),review:ref('review')});

export const planningSchemas={
  'scene-plan':root('ZXR scene plan v1',{
    ...header('zxr-scene-plan-v1'),room:ref('symbol'),description:text,
    sizeMetres:ref('size'),shell:{enum:['indoor','outdoor','cave']},
    spawn:ref('node'),anchors:list(object({node:ref('node'),pose:ref('pose')}),1),
    exits:list(object({direction:{enum:sceneDirections},
      to:{anyOf:[ref('symbol'),{type:'null'}]},node:ref('node'),anchor:ref('node'),sizeMetres:ref('size'),availability:{const:'engine-option'}})),
    objects:list(object({object:ref('symbol'),asset:ref('node'),anchor:ref('node'),visibility:{const:'engine-observation'}})),
    features:list(object({node:ref('node'),asset:ref('node'),anchor:ref('node'),visibleWhen:ref('condition')})),
    lighting:object({lit:list(ref('light'),1),dark:list(ref('light'),1)}),
    ambient:{anyOf:[{type:'null'},object({sound:ref('node'),description:text,gain:number(0,1)})]},
    kitParts:list(object({node:ref('node'),part:ref('node'),pose:ref('pose'),sizeMetres:ref('size'),material:ref('node')})),
  }),
  'asset-brief':root('ZXR asset brief v1',{
    ...header('zxr-asset-brief-v1'),id:ref('node'),kind:{enum:['prop','character','scenery']},
    objects:{...list(ref('symbol')),uniqueItems:true},description:text,sizeMetres:ref('size'),
    materials:list(object({name:ref('node'),description:text,colour:ref('colour'),roughness:number(0,1),metalness:number(0,1)}),1),
    requiredClips:{...list({type:'string',pattern:'^[a-z][a-z0-9_-]*$',maxLength:100}),uniqueItems:true},
    hotspotNodes:list(object({node:ref('node'),shape:{enum:['box','sphere']},sizeMetres:ref('size'),pose:ref('pose')})),
  }),
  'label-set':root('ZXR presentation label set v1',{
    ...header('zxr-label-set-v1'),id:ref('node'),language:{const:'en'},entries:list({anyOf:[
      object({kind:{const:'action'},family:{type:'string',pattern:'^[A-Z#$][A-Z0-9?$!#-]*:[0-9]+$'},template:text,
        slots:{...list({enum:['actor','direct','indirect','words']}),uniqueItems:true}}),
      object({kind:{const:'decision'},context:{enum:['yes-no','finish']},choice:{enum:['yes','no','restart','restore','quit']},text}),
    ]},1),
  }),
} as const;
