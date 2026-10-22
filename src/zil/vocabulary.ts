import { atomName, head, walk } from './ast.ts';
import type { Node, Sequence, Span } from './ast.ts';
import { ZilError } from './diagnostics.ts';
import type { SymbolAnalysis, SymbolDefinition, SymbolKind } from './symbols.ts';
import type { NamedNumber, RoutineReference, WordReference } from './world.ts';

export const SYNTAX_FLAGS={HELD:128,CARRIED:64,'ON-GROUND':16,'IN-ROOM':32,TAKE:8,MANY:4,HAVE:2} as const;
export type SyntaxRule=keyof typeof SYNTAX_FLAGS;
export interface VocabularyWord extends WordReference {
  roles:{object?:true;adjective?:NamedNumber;direction?:NamedNumber;preposition?:NamedNumber;verb?:NamedNumber;buzz?:number};
}
export interface SyntaxSlot { preposition:NamedNumber|null; find:NamedNumber|null; rules:SyntaxRule[]; flags:number }
export interface SyntaxRow {
  /** One-based row in the original lexical table; byte offset is 1 + (id-1)*8. */
  id:number;slots:SyntaxSlot[];action:NamedNumber;preaction:RoutineReference|null;bytes:number[];source:Span;
}
export interface Vocabulary {
  format:'zxr-vocabulary-v1';semantics:'zxr-zork2-semantics-v1';stage:'vocabulary';
  counts:{words:number;verbs:number;syntax:number;synonyms:number;buzz:number;directions:number;prepositions:number;actions:number};
  words:VocabularyWord[];
  verbs:{name:string;number:number;word:WordReference;rows:SyntaxRow[]}[];
  actions:{name:string;number:number;routine:RoutineReference;preaction:RoutineReference|null}[];
  prepositions:{name:string;number:number;word:WordReference}[];
  directions:{name:string;number:number;word:WordReference;source:Span}[];
  buzz:{word:WordReference;number:number;source:Span}[];
  synonyms:{canonical:WordReference;aliases:WordReference[];source:Span}[];
}
const punctuation:Record<string,string>={'.':'PERIOD',',':'COMMA','"':'QUOTE'};

/** Source-driven syntax/word roles with injected fixed numeric namespaces; no oracle or I/O. */
export function compileVocabulary(forms:readonly Node[],analysis:SymbolAnalysis):Vocabulary {
  if(analysis.diagnostics.length){const d=analysis.diagnostics[0]!;throw new ZilError(d.code,d.message,d.span);}
  const symbols=new Map(analysis.symbols.map(s=>[s.name,s]));
  const fallback=forms[0]?.span ?? {file:'<vocabulary>',start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0}};
  const fail=(message:string,site:Node|Span=fallback):never=>{throw new ZilError('ZIL008',message,'span' in site?site.span:site);};
  const name=(node:Node):string=>atomName(node) ?? fail('Expected a vocabulary atom',node);
  const lookup=(value:string,kind:SymbolKind,site:Node|Span):SymbolDefinition=>{
    const s=symbols.get(value);if(!s||s.kind!==kind)return fail(`Expected ${kind} ${value}`,site);return s;
  };
  const numeric=(s:SymbolDefinition,site:Node|Span):number=>s.number ?? fail(`Missing number for ${s.name}`,site);
  const named=(value:string,kind:SymbolKind,prefix:string,site:Node|Span):NamedNumber=>{
    const s=lookup(prefix+value,kind,site);return {name:value,number:numeric(s,site)};
  };
  const routine=(node:Node):RoutineReference=>{const s=lookup(name(node),'routine',node);return {name:s.name,id:numeric(s,node)};};
  const words:VocabularyWord[]=analysis.symbols.filter(s=>s.kind==='word').map(s=>({name:s.name.slice(2),dictionaryIndex:s.dictionaryIndex ?? fail(`Missing dictionary index ${s.name}`),roles:{}})).sort((a,b)=>a.dictionaryIndex-b.dictionaryIndex);
  const byWord=new Map(words.map(w=>[w.name,w]));
  const wordName=(n:Node)=>punctuation[n.kind==='string'?n.value.toUpperCase():name(n)] ?? (n.kind==='string'?n.value.toUpperCase():name(n));
  const word=(n:Node):VocabularyWord=>byWord.get(wordName(n)) ?? fail(`Missing dictionary word ${wordName(n)}`,n);
  const ref=(w:WordReference):WordReference=>({name:w.name,dictionaryIndex:w.dictionaryIndex});
  const role=<K extends keyof VocabularyWord['roles']>(w:VocabularyWord,key:K,value:NonNullable<VocabularyWord['roles'][K]>,site:Node|Span)=>{
    const previous=w.roles[key];if(previous!==undefined&&JSON.stringify(previous)!==JSON.stringify(value))fail(`Conflicting ${key} role for ${w.name}`,site);
    w.roles[key]=value;
  };
  const synonyms:Vocabulary['synonyms']=[],buzz:Vocabulary['buzz']=[],directions:Vocabulary['directions']=[],verbs:Vocabulary['verbs']=[],actions=new Map<number,Vocabulary['actions'][number]>();
  const byVerb=new Map<string,Vocabulary['verbs'][number]>();
  const prepositions:Vocabulary['prepositions']=[];
  for(const node of forms){
    const op=head(node);if(!op)continue;const f=node as Sequence;
    if(op==='SYNONYM'){
      if(f.items.length<3)fail('SYNONYM requires a canonical word and aliases',node);
      synonyms.push({canonical:ref(word(f.items[1]!)),aliases:f.items.slice(2).map(n=>ref(word(n))),source:node.span});
    } else if(op==='BUZZ'){
      if(f.items.length<2)fail('BUZZ requires words',node);
      for(const n of f.items.slice(1)){
        const w=word(n);if(buzz.some(b=>b.word.name===w.name))fail(`Duplicate BUZZ word ${w.name}`,n);
        const number=255-buzz.length;if(number<1)fail('Too many buzz words',n);role(w,'buzz',number,n);buzz.push({word:ref(w),number,source:n.span});
      }
    } else if(op==='DIRECTIONS'){
      if(f.items.length<2)fail('DIRECTIONS requires words',node);
      for(const n of f.items.slice(1)){
        const w=word(n),p=named(name(n),'property','P?',n);
        if(p.number<(symbols.get('LOW-DIRECTION')?.number ?? 18))fail('Direction must name an exit property',n);
        if(directions.some(d=>d.name===p.name))fail(`Duplicate direction ${p.name}`,n);
        role(w,'direction',p,n);directions.push({...p,word:ref(w),source:n.span});
      }
    } else if(op==='OBJECT'||op==='ROOM'){
      for(const n of f.items.slice(2))if(n.kind==='list'){
        const key=atomName(n.items[0]);
        if(key==='SYNONYM')for(const a of n.items.slice(1))role(word(a),'object',true,a);
        if(key==='ADJECTIVE')for(const a of n.items.slice(1))role(word(a),'adjective',named(name(a),'adjective','A?',a),a);
        // PSEUDO words are dictionary nouns, even without a physical object synonym.
        if(key==='PSEUDO')for(let i=1;i<n.items.length;i+=2)role(word(n.items[i]!),'object',true,n.items[i]!);
      }
    } else if(op==='SYNTAX'){
      const items=f.items.slice(1),equals=items.findIndex(n=>atomName(n)==='=');
      if(equals<1||![equals+2,equals+3].includes(items.length))fail('SYNTAX requires verb, =, action and at most one preaction',node);
      const w=word(items[0]!),lexical=named(w.name,'lexical-verb','ACT?',items[0]!);
      role(w,'verb',lexical,items[0]!);
      let table=byVerb.get(w.name);if(!table){table={...lexical,word:ref(w),rows:[]};verbs.push(table);byVerb.set(w.name,table);}
      const slots:SyntaxSlot[]=[];let prep:NamedNumber|null=null;
      for(const item of items.slice(1,equals)){
        if(item.kind==='atom'){
          if(item.value==='OBJECT'){
            if(slots.length===2)fail('SYNTAX supports at most two object slots',item);
            slots.push({preposition:prep,find:null,rules:[],flags:0});prep=null;
          } else {
            if(prep)fail('Two prepositions without an object slot',item);
            prep=named(item.value,'preposition','PR?',item);
            const w=word(item);role(w,'preposition',prep,item);
            if(!prepositions.some(p=>p.name===prep!.name))prepositions.push({...prep,word:ref(w)});
          }
        } else if(item.kind==='list'){
          const slot=slots.at(-1) ?? fail('Slot rules must follow OBJECT',item);if(prep)fail('Slot rules must follow OBJECT',item);
          if(!item.items.length)fail('Empty syntax slot rules',item);
          if(atomName(item.items[0])==='FIND'){
            if(item.items.length!==2||slot.find)fail('FIND requires one attribute, once per slot',item);
            slot.find=named(name(item.items[1]!),'attribute','',item.items[1]!);
          } else for(const n of item.items){
            const rule=name(n) as SyntaxRule;if(!Object.hasOwn(SYNTAX_FLAGS,rule))fail(`Unknown syntax slot rule ${rule}`,n);
            if(slot.rules.includes(rule))fail(`Duplicate syntax slot rule ${rule}`,n);
            slot.rules.push(rule);slot.flags|=SYNTAX_FLAGS[rule];
          }
        } else fail('Invalid SYNTAX slot',item);
      }
      if(prep)fail('Preposition requires an object slot',node);
      const actionRoutine=routine(items[equals+1]!),preaction=items[equals+2]?routine(items[equals+2]!):null;
      if(!actionRoutine.name.startsWith('V-'))fail('Action must name a V- routine',items[equals+1]!);
      const action=named(actionRoutine.name.slice(2),'action','V?',items[equals+1]!);
      const dispatch={...action,routine:actionRoutine,preaction},previous=actions.get(action.number);
      if(previous&&JSON.stringify(previous)!==JSON.stringify(dispatch))fail(`Inconsistent dispatch for ${action.name}`,node);
      actions.set(action.number,dispatch);
      const bytes=[slots.length,slots[0]?.preposition?.number ?? 0,slots[1]?.preposition?.number ?? 0,slots[0]?.find?.number ?? 0,slots[1]?.find?.number ?? 0,slots[0]?.flags ?? 0,slots[1]?.flags ?? 0,action.number];
      if(bytes.some(b=>!Number.isInteger(b)||b<0||b>255))fail('Syntax row field exceeds one byte',node);
      // The original compiler prepends each new syntax to its lexical table.
      table.rows.unshift({id:0,slots,action,preaction,bytes,source:node.span});
    }
  }
  // Synonyms add roles to aliases while preserving each alias's independent roles.
  for(let pass=0;pass<=synonyms.length;pass++){
    let changed=false;
    for(const s of synonyms){const canonical=byWord.get(s.canonical.name)!;
      for(const alias of s.aliases){const w=byWord.get(alias.name)!;
        for(const key of Object.keys(canonical.roles) as (keyof VocabularyWord['roles'])[]){
          if(w.roles[key]===undefined)changed=true;
          role(w,key,canonical.roles[key]!,s.source);
        }
      }
    }
    if(!changed)break;if(pass===synonyms.length)fail('Synonym role resolution did not converge');
  }
  // Explicit W? references can create noun vocabulary without an object declaration.
  for(const node of walk(forms))if(node.kind==='atom'&&node.value.startsWith('W?')){
    const w=byWord.get(node.value.slice(2));if(w&&!Object.keys(w.roles).length)role(w,'object',true,node);
  }
  for(const w of words)if(!Object.keys(w.roles).length)fail(`Dictionary word has no source role: ${w.name}`);
  for(const v of verbs){if(v.rows.length>255)fail(`Too many syntax rows for ${v.name}`);v.rows.forEach((r,i)=>r.id=i+1);}
  verbs.sort((a,b)=>b.number-a.number);prepositions.sort((a,b)=>a.number-b.number);
  const result:Vocabulary={format:'zxr-vocabulary-v1',semantics:'zxr-zork2-semantics-v1',stage:'vocabulary',
    counts:{words:words.length,verbs:verbs.length,syntax:verbs.reduce((n,v)=>n+v.rows.length,0),synonyms:synonyms.length,buzz:buzz.length,directions:directions.length,prepositions:prepositions.length,actions:actions.size},
    words,verbs,actions:[...actions.values()].sort((a,b)=>a.number-b.number),prepositions,directions,buzz,synonyms};
  return result;
}
