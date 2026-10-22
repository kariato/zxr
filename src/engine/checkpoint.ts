import type { Schema } from '../zil/schema.ts';
const integer={type:'integer',minimum:0} as const;
const word={type:'integer',minimum:0,maximum:65535} as const;
const object=(properties:Record<string,Schema>):Schema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=(items:Schema,maxItems:number):Schema=>({type:'array',items,maxItems});
const nullable=(schema:Schema):Schema=>({anyOf:[schema,{type:'null'}]});
export const checkpointSchema:Schema=object({
  format:{const:'zxr-interpreter-checkpoint-v1'},inputBoundary:{enum:['parser','read']},buildHash:{type:'string',pattern:'^[0-9a-f]{64}$'},
  limits:object({steps:{...integer,minimum:1,maximum:1_000_000},depth:{...integer,minimum:1,maximum:256},output:{...integer,minimum:1,maximum:1_000_000},operands:{...integer,minimum:1,maximum:65536}}),
  steps:{...integer,maximum:1_000_000},output:{...integer,maximum:1_000_000},result:nullable(word),
  frames:array(object({program:{enum:['runtime','parser-entry','parser-checks','parser-no-verb','parser-not-here']},routine:word,locals:array(word,16),operands:array(word,65536),tasks:array({anyOf:[
    object({kind:{const:'expression'},id:integer,stage:integer,values:array(word,65536)}),
    object({kind:{const:'activation'},expression:nullable(integer),phase:{enum:['bindings','body']},index:integer,waiting:{type:'boolean'},last:word,args:array(word,15)}),
  ]},65536)}),256),
  wait:nullable(object({kind:{enum:['parser','READ','SAVE','RESTORE','RESTART','QUIT']},routine:word,expression:integer,args:array(word,15)})),
  world:object({format:{const:'zxr-world-state-v1'},buildHash:{type:'string',pattern:'^[0-9a-f]{64}$'},bytes:array({type:'integer',minimum:0,maximum:255},65536)}),
  rng:object({algorithm:{const:'xorshift32-v1'},initialSeed:{...integer,maximum:4294967295},state:{...integer,minimum:1,maximum:4294967295},position:integer,cursor:integer,replayHash:nullable({type:'string',pattern:'^[0-9a-f]{64}$'})}),
});
