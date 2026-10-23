import type { Vocabulary } from '../zil/vocabulary.ts';

export interface WordChoice {dictionaryIndex:number;word:string;label:string;selectable:boolean}
export interface WordGroup {key:number;label:string;words:WordChoice[]}
export interface WordCatalog {groups:WordGroup[];wordCount:number;selectableCount:number}
export interface WordQuery {prefix?:string;offset?:number;limit?:number}
export interface WordPage {
  prefix:string;offset:number;limit:number;totalGroups:number;matchingWords:number;wordCount:number;selectableCount:number;groups:WordGroup[];
}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
/** Group only explicit source SYNONYM declarations; never infer puzzle answers or rank by context. */
export function buildWordCatalog(vocabulary:Vocabulary):WordCatalog {
  const words=new Map(vocabulary.words.map(w=>[w.name,w])),parents=new Map(vocabulary.words.map(w=>[w.name,w.name]));
  const root=(name:string):string=>{const parent=parents.get(name);if(parent===undefined)throw new Error('Unknown word synonym '+name);return parent===name?name:root(parent);};
  for(const group of vocabulary.synonyms)for(const alias of group.aliases){
    const a=root(group.canonical.name),b=root(alias.name);if(a!==b)parents.set(b,a);
  }
  const components=new Map<string,WordChoice[]>();
  for(const word of words.values()){
    const key=root(word.name),members=components.get(key)??[];
    // Source separators and debug/host controls are listed but cannot be quoted word selections.
    const selectable=/^[A-Z0-9]+$/.test(word.name)&&!['PERIOD','COMMA','QUOTE'].includes(word.name);
    members.push({dictionaryIndex:word.dictionaryIndex,word:word.name,label:word.name.toLowerCase(),selectable});components.set(key,members);
  }
  const groups=[...components].map(([canonical,members])=>({key:words.get(canonical)!.dictionaryIndex,label:canonical.toLowerCase(),words:members.sort((a,b)=>compare(a.word,b.word))}));
  groups.sort((a,b)=>compare(a.label,b.label));
  return {groups,wordCount:words.size,selectableCount:groups.reduce((sum,g)=>sum+g.words.filter(w=>w.selectable).length,0)};
}
export function wordPage(catalog:WordCatalog,query:WordQuery={}):WordPage {
  if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).some(k=>!['prefix','offset','limit'].includes(k)))throw new Error('Invalid word query');
  const {prefix:input='',offset=0,limit=24}=query;
  if(typeof input!=='string'||!/^[A-Za-z0-9#$]{0,32}$/.test(input)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid word query');
  const prefix=input.toUpperCase(),matching=catalog.groups.map(g=>({...g,words:g.words.filter(w=>w.word.startsWith(prefix)).map(w=>({...w}))})).filter(g=>g.words.length);
  return {prefix,offset,limit,totalGroups:matching.length,matchingWords:matching.reduce((sum,g)=>sum+g.words.length,0),wordCount:catalog.wordCount,selectableCount:catalog.selectableCount,
    groups:matching.slice(offset,offset+limit)};
}
export function pickedWords(catalog:WordCatalog,indices:readonly number[]):WordChoice[] {
  const words=new Map(catalog.groups.flatMap(g=>g.words).map(w=>[w.dictionaryIndex,w]));
  return indices.map(index=>{const word=words.get(index);if(!word?.selectable)throw new Error('Unavailable dictionary word '+index);return {...word};});
}
