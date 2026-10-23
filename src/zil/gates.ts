import type { Schema } from './schema.ts';

/** Presentation-only predicates. Arrays are OR within a field, AND across fields. */
export interface GateTarget {verbs?:string[];actors?:string[];direct?:string[];indirect?:string[];words?:string[]}
export interface GateRule {id:string;source:string;learn:string[];targets:GateTarget[]}
const names:Schema={type:'array',items:{type:'string',minLength:1},minItems:1,maxItems:256};
export const gateRuleSchema:Schema={type:'object',additionalProperties:false,required:['id','source','learn','targets'],properties:{
  id:{type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'},source:{type:'string',minLength:1},
  learn:{type:'array',items:{type:'string',minLength:12},minItems:1,maxItems:32},
  targets:{type:'array',minItems:1,maxItems:64,items:{type:'object',additionalProperties:false,properties:{verbs:names,actors:names,direct:names,indirect:names,words:names}}},
}};
