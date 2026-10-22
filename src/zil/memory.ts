import { canonicalJson } from './integrity.ts';
import { atomName, head } from './ast.ts';
import type { Node, Sequence, Span } from './ast.ts';
import type { SymbolAnalysis } from './symbols.ts';
import type { StringPool } from './strings.ts';
import type { Vocabulary, VocabularyWord } from './vocabulary.ts';
import type { WorldMetadata, WorldProperty } from './world.ts';
import { encodeZText } from './encoding.ts';
import { decodeZilText } from './text.ts';
import { linkExit } from './exits.ts';
import { ZilError } from './diagnostics.ts';

export interface MemoryField {offset:number;width:number;domain:string;name?:string;target?:string;addend?:number}
export interface MemorySegment {name:string;kind:string;base:number;length:number;mutable:boolean;fields:MemoryField[];source?:Span;writableRanges?:{offset:number;length:number}[]}
export interface Relocation {address:number;width:1|2;domain:'address'|'string'|'routine';target:string;addend:number}
export interface MemoryImage {
  format:'zxr-memory-v1';semantics:'zxr-zork2-semantics-v1';stage:'memory';bytes:number[];staticBase:number;
  segments:MemorySegment[];relocations:Relocation[];
  globals:{name:string;number:number;address:number;initial:number}[];
  objects:{name:string;id:number;address:number;propertyTable:number;properties:{name:string;number:number;address:number;length:number}[]}[];
  words:{name:string;dictionaryIndex:number;address:number;primaryRole:string}[];
  tables:{name:string;owner:string;base:number;length:number;constructor:string;source:Span}[];
}
interface Value {value:number;domain:string;target?:string;addend?:number}
interface Cell {width:1|2;value:Node|Value}
interface TablePlan {name:string;owner:string;node:Sequence;mutable:boolean;cells:Cell[];segment?:MemorySegment}
const constructors=new Set(['TABLE','LTABLE','ITABLE']);
const fixed=(value:number,domain='integer',target?:string,addend?:number):Value=>({value,domain,...(target!==undefined?{target}:{}),...(addend!==undefined?{addend}:{})});

/** Deterministic, source-built V3 data layout; this contains JSON logic references, not Z-machine bytecode. */
export function compileMemory(forms:readonly Node[],analysis:SymbolAnalysis,world:WorldMetadata,vocabulary:Vocabulary,strings:StringPool):MemoryImage {
  const fallback=forms[0]?.span ?? {file:'<memory>',start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0}};
  const fail=(message:string,node:Node|Span=fallback):never=>{throw new ZilError('ZIL011',message,'span' in node?node.span:node);};
  if(analysis.diagnostics.length){const d=analysis.diagnostics[0]!;throw new ZilError(d.code,d.message,d.span);}
  const symbols=new Map(analysis.symbols.map(s=>[s.name,s])),handles=new Map(strings.entries.map(s=>[s.text,s.id]));
  const bytes:number[]=[],segments:MemorySegment[]=[],relocations:Relocation[]=[],plans:TablePlan[]=[],byNode=new Map<Node,TablePlan>(),initializers=new Map<string,Node>();
  const align=(mutable:boolean)=>{if(bytes.length%2){const base=bytes.length;bytes.push(0);segments.push({name:'padding:'+base,kind:'padding',base,length:1,mutable,fields:[{offset:0,width:1,domain:'padding'}]});}};
  const reserve=(name:string,kind:string,length:number,mutable:boolean,source?:Span):MemorySegment=>{
    if(!Number.isInteger(length)||length<1) return fail(`Invalid allocation length for ${name}: ${length}`,source ?? fallback);
    align(mutable);
    const base=bytes.length;if(base+length>65536)return fail('Memory image exceeds the 16-bit address space',source ?? fallback);
    for(let i=0;i<length;i++)bytes.push(0);
    const s:MemorySegment={name,kind,base,length,mutable,fields:[],...(source?{source}:{})};segments.push(s);return s;
  };
  const field=(s:MemorySegment,offset:number,width:number,domain:string,name?:string,target?:string,addend?:number)=>s.fields.push({offset,width,domain,...(name?{name}:{}),...(target!==undefined?{target}:{}),...(addend!==undefined?{addend}:{})});
  const write=(s:MemorySegment,offset:number,width:1|2,v:Value,name?:string)=>{
    if(offset<0||offset+width>s.length)return fail(`Field outside ${s.name}`);
    if(!Number.isInteger(v.value)||v.value<0||v.value>(width===1?255:65535))return fail(`Value ${v.value} exceeds ${width}-byte ${s.name} field`);
    if(width===1)bytes[s.base+offset]=v.value;else {bytes[s.base+offset]=v.value>>>8;bytes[s.base+offset+1]=v.value&255;}
    field(s,offset,width,v.domain,name,v.target,v.addend);
    if(['address','string','routine'].includes(v.domain)&&v.target!==undefined)relocations.push({address:s.base+offset,width,domain:v.domain as Relocation['domain'],target:v.target,addend:v.addend ?? 0});
  };
  const blob=(s:MemorySegment,offset:number,data:readonly number[],domain:string,name?:string)=>{if(data.length){bytes.splice(s.base+offset,data.length,...data);field(s,offset,data.length,domain,name);}};
  const number=(n:Node):number=>{
    const ref=n.kind==='prefix'&&n.operator==='global'?n.value:n;
    if(ref.kind==='number')return ref.value;
    const s=symbols.get(atomName(ref) ?? '');if(!s||s.kind==='global'||s.number===null)return fail('Expected a fixed table size',n);return s.number;
  };
  const parseTable=(node:Sequence,owner:string):TablePlan=>{
    const previous=byNode.get(node);if(previous)return previous;
    const op=head(node)!,args=[...node.items.slice(1)],cells:Cell[]=[];
    const p:TablePlan={name:'table:'+owner+(plans.some(p=>p.owner===owner)?'#'+plans.filter(p=>p.owner===owner).length:''),owner,node,mutable:true,cells};plans.push(p);byNode.set(node,p);
    const cell=(n:Node):Cell=>{
      if(n.kind==='typed'){
        const tag=atomName(n.tag);if(tag!=='BYTE'&&tag!=='WORD')return fail('Unsupported table cell type '+tag,n);
        return {width:tag==='BYTE'?1:2,value:n.value};
      }
      return {width:2,value:n};
    };
    if(op==='TABLE'||op==='LTABLE'){
      if(args[0]?.kind==='list'){
        const flags=args.shift() as Sequence;
        if(op!=='TABLE'||flags.items.length!==1||atomName(flags.items[0])!=='PURE')return fail('Unsupported TABLE/LTABLE flags',flags);
        p.mutable=false;
      }
      if(op==='LTABLE')cells.push({width:2,value:fixed(args.length)});
      cells.push(...args.map(cell));
    } else {
      if(atomName(args[0])==='NONE'){
        if(args.length!==2)return fail('ITABLE NONE requires a word count',node);
        const count=number(args[1]!);if(!Number.isInteger(count)||count<1||count>32767)return fail('Invalid ITABLE word count',node);
        for(let i=0;i<count;i++)cells.push({width:2,value:fixed(0)});
      } else {
        const count=number(args[0] ?? node),flags=args[1];
        if(!Number.isInteger(count)||count<1||count>255||flags?.kind!=='list')return fail('Invalid patterned ITABLE count/flags',node);
        const names=flags.items.map(atomName).join(' '),pattern=args.slice(2).map(cell);
        if(names==='LEXV'){
          if(pattern.length!==3||pattern.map(c=>c.width).join()!=='2,1,1')return fail('LEXV requires word/byte/byte pattern',node);
          cells.push({width:1,value:fixed(count)},{width:1,value:fixed(0)});
        } else if(names==='BYTE LENGTH'){
          if(pattern.length!==1||pattern[0]!.width!==2)return fail('BYTE LENGTH requires one byte initializer',node);
          pattern[0]!.width=1;cells.push({width:1,value:fixed(count)});
        } else return fail('Unsupported ITABLE flags '+names,node);
        for(let i=0;i<count;i++)cells.push(...pattern);
      }
    }
    if(!cells.length)return fail('Empty table allocation is unsupported',node);
    if(cells.reduce((n,c)=>n+c.width,0)>65535)return fail('Table exceeds the 16-bit address space',node);
    for(const c of cells)if('kind' in c.value)scan(c.value,owner);
    return p;
  };
  const scan=(n:Node,owner:string)=>{
    if(n.kind==='typed'&&atomName(n.tag)==='DECL')return;
    if(n.kind==='form'&&constructors.has(head(n) ?? '')){parseTable(n,owner);return;}
    if(n.kind==='form'||n.kind==='list'||n.kind==='vector')for(const c of n.items)scan(c,owner);
    else if(n.kind==='prefix')scan(n.value,owner);
    else if(n.kind==='typed')scan(n.value,owner);
  };
  for(const n of forms){const op=head(n);if(op==='GLOBAL'){
    const f=n as Sequence,key=atomName(f.items[1])!;if(f.items.length!==3)return fail('GLOBAL requires one initializer',n);initializers.set(key,f.items[2]!);scan(f.items[2]!,key);
  } else if(op==='ROUTINE'){const f=n as Sequence;for(const c of f.items.slice(2))scan(c,atomName(f.items[1])!);}}
  const header=reserve('header','header',64,true);header.writableRanges=[{offset:16,length:2}];
  const globals=reserve('globals','globals',480,true),objects=reserve('objects','objects',62+world.entities.length*9,true);
  const records:MemoryImage['objects']=[],propertySegments=new Map<string,MemorySegment>();
  for(const e of world.entities){
    const encoded=encodeZText(e.shortName.text);if(encoded.length/2>255)return fail('Object short name exceeds 255 encoded words',e.source);
    const length=1+encoded.length+e.properties.reduce((n,p)=>n+1+p.byteLength,0)+e.exits.reduce((n,p)=>n+1+p.byteLength,0)+1;
    const s=reserve('properties:'+e.name,'properties',length,true,e.source);propertySegments.set(e.name,s);
    records.push({name:e.name,id:e.id,address:objects.base+62+(e.id-1)*9,propertyTable:s.base,properties:[]});
  }
  for(const p of plans.filter(p=>p.mutable))p.segment=reserve(p.name,'table',p.cells.reduce((n,c)=>n+c.width,0),true,p.node.span);
  // Static boundary is word aligned, with any prior padding kept in dynamic memory.
  align(true);
  const staticBase=bytes.length;
  for(const p of plans.filter(p=>!p.mutable))p.segment=reserve(p.name,'table',p.cells.reduce((n,c)=>n+c.width,0),false,p.node.span);
  const dictionary=reserve('dictionary','dictionary',7+vocabulary.words.length*7,false);
  const wordRecords:MemoryImage['words']=vocabulary.words.map(w=>({name:w.name,dictionaryIndex:w.dictionaryIndex,address:dictionary.base+7+(w.dictionaryIndex-1)*7,primaryRole:''}));
  const words=new Map(wordRecords.map(w=>['W?'+w.name,w]));
  const syntax=new Map(vocabulary.verbs.map(v=>[v.name,reserve('syntax:'+v.name,'syntax',1+8*v.rows.length,false)]));
  const actions=reserve('actions','dispatch',2*vocabulary.actions.length,false),preactions=reserve('preactions','dispatch',2*vocabulary.actions.length,false),verbs=reserve('verbs','dispatch',2*vocabulary.verbs.length,false),preps=reserve('prepositions','prepositions',2+4*vocabulary.prepositions.length,false);
  align(false);
  const compilerGlobals=new Map([['ACTIONS',actions],['PREACTIONS',preactions],['VERBS',verbs],['PREPOSITIONS',preps]]);
  const initialValues=new Map<string,Value>(),evaluating=new Set<string>();
  const globalValue=(key:string):Value=>{
    if(initialValues.has(key))return initialValues.get(key)!;
    if(evaluating.has(key))return fail('Global initializer cycle at '+key);
    const generated=compilerGlobals.get(key);if(generated){const v=fixed(generated.base,'address',generated.name);initialValues.set(key,v);return v;}
    const n=initializers.get(key);if(!n)return fail('Missing initializer for '+key);
    evaluating.add(key);const v=evaluate(n);evaluating.delete(key);initialValues.set(key,v);return v;
  };
  const evaluate=(n:Node):Value=>{
    if(n.kind==='number')return fixed(n.value&65535);
    if(n.kind==='string'){const text=decodeZilText(n.value),id=handles.get(text);if(id===undefined)return fail('Missing pooled string',n);return fixed(id,'string',text);}
    if(n.kind==='character'){const c=n.value==='\n'?13:n.value.codePointAt(0)!;if(c>127||n.value.length!==1)return fail('Unsupported table character',n);return fixed(c);}
    if(n.kind==='typed')return evaluate(n.value);
    if(n.kind==='prefix'){
      if(n.operator!=='global')return fail('Unsupported initializer prefix '+n.operator,n);
      const key=atomName(n.value),s=key?symbols.get(key):undefined;if(s?.kind==='global')return globalValue(key!);return evaluate(n.value);
    }
    if(n.kind==='atom'){
      const s=symbols.get(n.value);if(!s)return fail('Undefined initializer '+n.value,n);
      if(s.kind==='word'){const w=words.get(s.name);if(!w)return fail('Missing allocated dictionary word '+s.name,n);return fixed(w.address,'address','dictionary',w.address-dictionary.base);}
      if(s.number===null)return fail('Unallocated initializer '+s.name,n);
      if(s.kind==='global')return fixed(s.number,'variable',s.name);
      return fixed(s.number,['constant','builtin'].includes(s.kind)?'integer':s.kind,s.kind==='routine'?s.name:undefined);
    }
    if(n.kind==='form'){
      if(!n.items.length)return fixed(0);
      const plan=byNode.get(n);if(plan)return fixed(plan.segment!.base,'address',plan.name);
      const op=head(n),a=n.items.slice(1).map(evaluate);
      if((op==='REST'||op==='BACK')&&a.length===2&&a[0]!.domain==='address'){
        const delta=(op==='REST'?1:-1)*a[1]!.value,value=a[0]!.value+delta,target=segments.find(s=>s.name===a[0]!.target);
        if(!target||value<target.base||value>target.base+target.length||value>65535)return fail('Initializer pointer escapes allocation',n);
        return fixed(value,'address',target.name,value-target.base);
      }
      return fail('Unsupported initializer operation '+op,n);
    }
    return fail('Unsupported table initializer',n);
  };
  const globalRecords:MemoryImage['globals']=analysis.symbols.filter(s=>s.kind==='global').sort((a,b)=>a.number!-b.number!).map(s=>{
    const v=globalValue(s.name),offset=(s.number!-16)*2;write(globals,offset,2,v,s.name);return {name:s.name,number:s.number!,address:globals.base+offset,initial:v.value};
  });
  for(let offset=globalRecords.length*2;offset<480;offset+=2)write(globals,offset,2,fixed(0),'reserved');
  for(const p of plans){let offset=0;for(const c of p.cells){const v='kind' in c.value?evaluate(c.value):c.value;write(p.segment!,offset,c.width,v);offset+=c.width;}
    // Clock queue words are mutable enabled/ticks/routine records; its unused reserved half stays numeric zero.
    if(p.owner==='C-TABLE'&&p.name==='table:C-TABLE'){
      if(p.segment!.length!==360||symbols.get('C-TABLELEN')?.number!==180||symbols.get('C-INTLEN')?.number!==6)return fail('Clock table layout differs from the bootstrap contract',p.node);
      for(const f of p.segment!.fields)if(f.offset<180&&f.offset%6===4)f.domain='routine';
    }
    if(['P-LEXV','AGAIN-LEXV','RESERVE-LEXV'].includes(p.owner))for(const f of p.segment!.fields)if(f.offset>=2&&(f.offset-2)%4===0)f.domain='address';
  }
  const first=new Map<string,number>(),next=new Map<string,number>();
  for(const n of forms)if(['ROOM','OBJECT'].includes(head(n) ?? '')){const e=world.entities.find(e=>e.name===atomName((n as Sequence).items[1]))!;if(e.parent){next.set(e.name,first.get(e.parent.name) ?? 0);first.set(e.parent.name,e.id);}}
  for(const d of world.propertyDefaults)write(objects,(d.number-1)*2,2,fixed(d.value),'default:'+d.number);
  const wordValue=(name:string)=>{const w=words.get('W?'+name);if(!w)return fail('Missing dictionary word '+name);return fixed(w.address,'address','dictionary',w.address-dictionary.base);};
  const scalarProperty=(p:WorldProperty):{width:1|2;value:Value}[]=>{
    switch(p.kind){
      case 'number':return [{width:2,value:fixed(p.value)}];
      case 'text':{const id=handles.get(p.text);if(id===undefined)return fail('Missing property text',p.source);return [{width:2,value:fixed(id,'string',p.text)}];}
      case 'routine':return [{width:2,value:p.routine?fixed(p.routine.id,'routine',p.routine.name):fixed(0,'routine')}];
      case 'words':return p.words.map(w=>({width:2,value:wordValue(w.name)}));
      case 'adjectives':return p.adjectives.map(a=>({width:1,value:fixed(a.number,'adjective')}));
      case 'objects':return p.objects.map(o=>({width:1,value:fixed(o.id,'object')}));
      case 'pseudos':return p.entries.flatMap(e=>[{width:2 as const,value:wordValue(e.word.name)},{width:2 as const,value:fixed(e.routine.id,'routine',e.routine.name)}]);
    }
  };
  for(const e of world.entities){
    const offset=62+(e.id-1)*9,flags=e.flags.reduce((n,f)=>n+2**(31-f.number),0);
    write(objects,offset,2,fixed(flags>>>16),'attributes-high');write(objects,offset+2,2,fixed(flags&65535),'attributes-low');
    write(objects,offset+4,1,fixed(e.parent?.id ?? 0,'object'),'parent');write(objects,offset+5,1,fixed(next.get(e.name) ?? 0,'object'),'sibling');write(objects,offset+6,1,fixed(first.get(e.name) ?? 0,'object'),'child');
    const s=propertySegments.get(e.name)!,record=records.find(r=>r.id===e.id)!;write(objects,offset+7,2,fixed(s.base,'address',s.name),'property-table');
    const encoded=encodeZText(e.shortName.text);write(s,0,1,fixed(encoded.length/2),'short-name-length');blob(s,1,encoded,'zstring','short-name');let cursor=1+encoded.length;
    const all=[...e.properties.map(p=>({property:p.property,byteLength:p.byteLength,fields:scalarProperty(p)})),...e.exits.map(p=>{
      const data=linkExit(p,text=>handles.get(text) ?? 0),fields:{width:1|2;value:Value}[]=[];
      for(let i=0;i<data.length;){const relocation=p.relocations.find(r=>r.offset===i);
        if(relocation){fields.push({width:2,value:relocation.kind==='string'?fixed((data[i]!<<8)|data[i+1]!,'string',relocation.text):fixed(relocation.id,'routine',relocation.name)});i+=2;}
        else if(data.length>=4&&i===2){fields.push({width:2,value:fixed(0,'string')});i+=2;}
        else {const domain=i===0&&data.length!==3?'object':i===1&&data.length===4?'variable':i===1&&data.length===5?'object':'padding';fields.push({width:1,value:fixed(data[i]!,domain)});i++;}
      }
      return {property:p.property,byteLength:p.byteLength,fields};
    })].sort((a,b)=>b.property.number-a.property.number);
    for(const p of all){write(s,cursor++,1,fixed(((p.byteLength-1)<<5)|p.property.number,'property-header'));record.properties.push({name:p.property.name,number:p.property.number,address:s.base+cursor,length:p.byteLength});
      for(const f of p.fields){write(s,cursor,f.width,f.value,p.property.name);cursor+=f.width;}
    }
    write(s,cursor,1,fixed(0,'property-header'),'end');
  }
  // Primary dictionary slots are explicit layout metadata, derived from source declarations, never JSON key order.
  const metadataOrder=new Map<string,string[]>();
  for(const n of forms)if(['ROOM','OBJECT'].includes(head(n) ?? ''))for(const p of (n as Sequence).items.slice(2))if(p.kind==='list'){
    const key=atomName(p.items[0]);if(key!=='SYNONYM'&&key!=='ADJECTIVE')continue;
    for(const a of p.items.slice(1)){const w=a.kind==='string'?a.value.toUpperCase():atomName(a)!;const order=metadataOrder.get(w) ?? [];if(!order.includes(key==='SYNONYM'?'object':'adjective'))order.push(key==='SYNONYM'?'object':'adjective');metadataOrder.set(w,order);}
  }
  for(let i=0;i<vocabulary.synonyms.length;i++)for(const s of vocabulary.synonyms)if(metadataOrder.has(s.canonical.name))for(const a of s.aliases)if(!metadataOrder.has(a.name))metadataOrder.set(a.name,metadataOrder.get(s.canonical.name)!);
  blob(dictionary,0,[3,46,44,34,7,vocabulary.words.length>>>8,vocabulary.words.length&255],'dictionary-header');
  const roleMasks:Record<string,number>={object:128,verb:64,adjective:32,direction:16,preposition:8,buzz:4},selectors:Record<string,number>={object:0,verb:1,adjective:2,direction:3,preposition:0,buzz:0};
  for(const w of vocabulary.words){
    const roles=Object.keys(w.roles);if(roles.length>2)return fail('Dictionary entry exceeds two data slots: '+w.name);
    const primary=w.roles.preposition?'preposition':w.roles.buzz!==undefined?'buzz':w.roles.adjective&&w.roles.object?metadataOrder.get(w.name)?.[0]:w.roles.adjective?'adjective':w.roles.object?'object':w.roles.direction?'direction':'verb';
    if(!primary||!roles.includes(primary))return fail('Cannot derive dictionary primary role for '+w.name);
    const secondary=roles.find(r=>r!==primary),roleValue=(key:string):number=>{const value=w.roles[key as keyof VocabularyWord['roles']];return value===true?1:typeof value==='number'?value:typeof value==='object'?value.number:0;};
    const encoded=encodeZText(({PERIOD:'.',COMMA:',',QUOTE:'"'} as Record<string,string>)[w.name] ?? w.name.toLowerCase(),true),r=wordRecords[w.dictionaryIndex-1]!;r.primaryRole=primary;
    const offset=r.address-dictionary.base;blob(dictionary,offset,encoded,'dictionary-text',w.name);blob(dictionary,offset+4,[roles.reduce((mask,k)=>mask|roleMasks[k]!,0)|selectors[primary]!,roleValue(primary),secondary?roleValue(secondary):0],'dictionary-roles',w.name);
  }
  for(const v of vocabulary.verbs){const s=syntax.get(v.name)!;write(s,0,1,fixed(v.rows.length),'count');for(const row of v.rows)blob(s,1+(row.id-1)*8,row.bytes,'syntax-row',String(row.id));}
  for(const a of vocabulary.actions){write(actions,a.number*2,2,fixed(a.routine.id,'routine',a.routine.name));write(preactions,a.number*2,2,a.preaction?fixed(a.preaction.id,'routine',a.preaction.name):fixed(0,'routine'));}
  for(const v of vocabulary.verbs){const s=syntax.get(v.name)!;write(verbs,(255-v.number)*2,2,fixed(s.base,'address',s.name));}
  write(preps,0,2,fixed(vocabulary.prepositions.length),'count');vocabulary.prepositions.forEach((p,i)=>{write(preps,2+i*4,2,wordValue(p.word.name));write(preps,4+i*4,2,fixed(p.number,'preposition'));});
  // The image has data pointers, not a bytecode entry point/checksum. Only flags2 is game-writable.
  const staticTarget=segments.find(s=>s.base===staticBase)!;
  write(header,0,1,fixed(3),'version');write(header,1,1,fixed(0),'flags1');write(header,2,2,fixed(63),'release');
  write(header,4,2,fixed(staticBase,'address',staticTarget.name),'high-memory');write(header,6,2,fixed(0),'bytecode-entry-unused');
  write(header,8,2,fixed(dictionary.base,'address',dictionary.name),'dictionary');write(header,10,2,fixed(objects.base,'address',objects.name),'objects');
  write(header,12,2,fixed(globals.base,'address',globals.name),'globals');write(header,14,2,fixed(staticBase,'address',staticTarget.name),'static-memory');write(header,16,2,fixed(0),'flags2');
  blob(header,18,[...'860811'].map(c=>c.charCodeAt(0)),'ascii','serial');write(header,24,2,fixed(0,'address'),'abbreviations-unused');
  write(header,26,2,fixed(bytes.length/2),'file-length');write(header,28,2,fixed(0),'bytecode-checksum-unused');blob(header,30,Array.from({length:34},()=>0),'reserved');
  const image:MemoryImage={format:'zxr-memory-v1',semantics:'zxr-zork2-semantics-v1',stage:'memory',bytes,staticBase,segments,relocations,globals:globalRecords,objects:records,words:wordRecords,tables:plans.map(p=>({name:p.name,owner:p.owner,base:p.segment!.base,length:p.segment!.length,constructor:head(p.node)!,source:p.node.span}))};
  validateMemoryImage(image);return image;
}

export function validateMemoryImage(image:MemoryImage):void {
  const fail=(m:string):never=>{throw new Error('Memory layout: '+m);};
  if(image.format!=='zxr-memory-v1'||image.semantics!=='zxr-zork2-semantics-v1'||image.stage!=='memory'||image.bytes.length>65536||image.bytes.length%2!==0||image.bytes.some(b=>!Number.isInteger(b)||b<0||b>255))fail('invalid image format/bytes');
  if(!Number.isInteger(image.staticBase)||image.staticBase%2||image.staticBase<64||image.staticBase>=image.bytes.length)fail('invalid static boundary');
  let end=0;const names=new Set<string>();for(const s of image.segments){
    if(names.has(s.name)||s.base!==end||s.length<1||s.base+s.length>image.bytes.length)fail('overlapping, missing or duplicate allocation '+s.name);names.add(s.name);end=s.base+s.length;
    if((s.base<image.staticBase)!==s.mutable)fail('static boundary mismatch '+s.name);
    let covered=0;for(const f of [...s.fields].sort((a,b)=>a.offset-b.offset)){if(f.offset!==covered||!Number.isInteger(f.width)||f.width<1||f.offset+f.width>s.length)fail('invalid field coverage '+s.name);covered+=f.width;}if(covered!==s.length)fail('incomplete fields '+s.name);
    for(const r of s.writableRanges ?? [])if(r.offset<0||r.length<1||r.offset+r.length>s.length||!s.mutable)fail('invalid writable range');
  }
  if(end!==image.bytes.length)fail('unallocated image tail');
  const declared=image.segments.flatMap(s=>s.fields.filter(f=>f.target!==undefined&&['address','string','routine'].includes(f.domain)).map(f=>({address:s.base+f.offset,width:f.width,domain:f.domain,target:f.target,addend:f.addend ?? 0})));
  const key=(r:unknown)=>canonicalJson(r);if(JSON.stringify(declared.map(key).sort())!==JSON.stringify(image.relocations.map(key).sort()))fail('relocation coverage mismatch');
  const word=(a:number)=>image.bytes[a]!*256+image.bytes[a+1]!;
  for(const r of image.relocations){
    if(r.width!==1&&r.width!==2)fail('bad relocation width');
    const s=image.segments.find(s=>r.address>=s.base&&r.address+r.width<=s.base+s.length);if(!s)fail('relocation outside allocation');
    const v=r.width===1?image.bytes[r.address]!:word(r.address);
    if(r.domain==='address'){const target=image.segments.find(s=>s.name===r.target);if(!target||r.addend<0||r.addend>target.length||v!==target.base+r.addend)fail('unresolved pointer relocation '+r.target);}
    else if(v===0)fail('zero string/routine relocation');
  }
  const header=image.segments.find(s=>s.name==='header'),dict=image.segments.find(s=>s.name==='dictionary'),objects=image.segments.find(s=>s.name==='objects'),globals=image.segments.find(s=>s.name==='globals');
  if(header?.base!==0||image.bytes[0]!==3||word(8)!==dict?.base||word(10)!==objects?.base||word(12)!==globals?.base||word(14)!==image.staticBase)fail('invalid header pointers');
  if(image.objects.length>255||image.objects.some((o,i)=>o.id!==i+1)||new Set(image.objects.map(o=>o.name)).size!==image.objects.length)fail('invalid object numbering');
  const byId=new Map(image.objects.map(o=>[o.id,o])),children=new Set<number>();
  for(const o of image.objects){let child=image.bytes[o.address+6]!,seen=new Set<number>();
    while(child){const c=byId.get(child) ?? fail('invalid child');if(seen.has(child)||children.has(child)||image.bytes[c.address+4]!==o.id)fail('invalid child/sibling tree');seen.add(child);children.add(child);child=image.bytes[c.address+5]!;}
    let parent=image.bytes[o.address+4]!,ancestors=new Set<number>([o.id]);while(parent){const p=byId.get(parent) ?? fail('invalid parent');if(ancestors.has(parent))fail('containment cycle/invalid parent');ancestors.add(parent);parent=image.bytes[p.address+4]!;}
  }
  for(const o of image.objects){if(Boolean(image.bytes[o.address+4])!==children.has(o.id))fail('missing child-tree membership');}
  if(word(dict!.base+5)!==image.words.length||image.bytes[dict!.base+4]!==7||image.words.some((w,i)=>w.dictionaryIndex!==i+1||w.address!==dict!.base+7+i*7)||dict!.length!==7+image.words.length*7)fail('dictionary layout mismatch');
  for(const g of image.globals)if(g.address!==globals!.base+2*(g.number-16)||word(g.address)!==g.initial)fail('global initializer mismatch');
  for(const o of image.objects){if(o.address!==objects!.base+62+(o.id-1)*9||word(o.address+7)!==o.propertyTable)fail('object pointer mismatch');
    let cursor=o.propertyTable+1+2*image.bytes[o.propertyTable]!,last=32;
    for(const p of o.properties){const b=image.bytes[cursor++]!;if((b&31)!==p.number||(b>>>5)+1!==p.length||p.number>=last||p.address!==cursor)fail('property layout mismatch '+o.name);last=p.number;cursor+=p.length;}
    if(image.bytes[cursor]!==0)fail('missing property terminator');
  }
}
