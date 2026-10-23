import type { LoadedGame } from './bundle-loader.ts';
import type { MemoryImage, MemorySegment } from '../zil/memory.ts';
import { hashJson } from '../zil/integrity.ts';
export interface WorldSnapshot {format:'zxr-world-state-v1';buildHash:string;bytes:number[]}
const PAGE=256;
const propertyLayouts=new WeakMap<MemoryImage,{sizes:ReadonlyMap<number,number>;headers:ReadonlySet<number>}>();
function propertyLayout(layout:MemoryImage){
  let index=propertyLayouts.get(layout);if(index)return index;
  const sizes=new Map<number,number>(),headers=new Set<number>();
  for(const o of layout.objects){
    headers.add(o.address+7);headers.add(o.address+8);headers.add(o.propertyTable);
    let end=o.propertyTable+1+2*layout.bytes[o.propertyTable]!;
    for(const p of o.properties){sizes.set(p.address,p.length);headers.add(p.address-1);end=p.address+p.length;}
    headers.add(end);
  }
  index={sizes,headers};propertyLayouts.set(layout,index);return index;
}
class MemoryPages {
  #pages:Uint8Array[];#owned=new Set<number>();readonly length:number;
  constructor(bytes:Uint8Array,pages?:Uint8Array[],length=bytes.length){this.length=length;this.#pages=pages ?? [];if(!pages)for(let i=0;i<bytes.length;i+=PAGE)this.#pages.push(bytes.slice(i,i+PAGE));}
  read(address:number):number{return this.#pages[Math.floor(address/PAGE)]![address%PAGE]!;}
  write(address:number,value:number){const page=Math.floor(address/PAGE);if(!this.#owned.has(page)){this.#pages[page]=this.#pages[page]!.slice();this.#owned.add(page);}this.#pages[page]![address%PAGE]=value;}
  fork():MemoryPages {const next=new MemoryPages(new Uint8Array(),[...this.#pages],this.length);this.#owned.clear();return next;}
  bytes():Uint8Array {const bytes=new Uint8Array(this.length);for(let i=0;i<this.#pages.length;i++)bytes.set(this.#pages[i]!,i*PAGE);return bytes;}
}
/** Raw memory remains authoritative for globals, flags, ordered trees and property data. */
export class WorldState {
  readonly #game:LoadedGame;readonly #layout:MemoryImage;#memory:MemoryPages;
  #layoutDirty=false;
  private constructor(game:LoadedGame,pages:MemoryPages,validate=true){this.#game=game;this.#layout=game.bundle.payload.memory;this.#memory=pages;if(validate)this.validate();}
  static create(game:LoadedGame):WorldState {return new WorldState(game,new MemoryPages(game.createInitialMemory()));}
  get buildHash():string{return this.#game.buildHash;}
  snapshot():WorldSnapshot {return {format:'zxr-world-state-v1',buildHash:this.buildHash,bytes:Array.from(this.#memory.bytes())};}
  worldHash():string {return hashJson(this.snapshot());}
  fork():WorldState {const next=new WorldState(this.#game,this.#memory.fork(),false);next.#layoutDirty=this.#layoutDirty;return next;}
  static restore(game:LoadedGame,snapshot:WorldSnapshot):WorldState {
    if(snapshot?.format!=='zxr-world-state-v1'||snapshot.buildHash!==game.buildHash||!Array.isArray(snapshot.bytes)||snapshot.bytes.length!==game.bundle.payload.memory.bytes.length||snapshot.bytes.some(b=>!Number.isInteger(b)||b<0||b>255))throw new Error('Invalid or incompatible world snapshot');
    return new WorldState(game,new MemoryPages(new Uint8Array(snapshot.bytes)));
  }
  #allocations(base:number):MemorySegment[] {
    const segments=this.#layout.segments;let low=0,high=segments.length;
    while(low<high){const middle=(low+high)>>>1;if(segments[middle]!.base<=base)low=middle+1;else high=middle;}
    const index=low-1,current=segments[index],previous=current?.base===base?segments[index-1]:undefined;
    return [current,previous].filter((s):s is MemorySegment=>Boolean(s&&s.kind!=='padding'&&base>=s.base&&base<=s.base+s.length));
  }
  #range(base:number,index:number,width:1|2,write=false):number {
    if(!Number.isSafeInteger(base)||!Number.isSafeInteger(index)||base<0||base>65535)throw new Error('Invalid memory address/index');
    const candidates=this.#allocations(base);if(!candidates.length)throw new Error('Address is outside an allocation');
    const address=base+index*width,segment=candidates.find(s=>address>=s.base&&address+width<=s.base+s.length);if(!segment||!Number.isSafeInteger(address)||address>65535)throw new Error('Memory access crosses allocation bounds');
    if(write&&(!segment.mutable||segment.writableRanges&&!segment.writableRanges.some(r=>address>=segment.base+r.offset&&address+width<=segment.base+r.offset+r.length)))throw new Error('Write to static or protected memory');
    return address;
  }
  #value(value:number):number {if(!Number.isSafeInteger(value)||value< -32768||value>65535)throw new Error('Value is outside the word domain');return value&65535;}
  getByte(base:number,index=0):number {return this.#memory.read(this.#range(base,index,1));}
  getWord(base:number,index=0):number {const a=this.#range(base,index,2);return this.#memory.read(a)*256+this.#memory.read(a+1);}
  putByte(base:number,index:number,value:number):1 {const a=this.#range(base,index,1,true),v=this.#value(value);if(propertyLayout(this.#layout).headers.has(a))this.#layoutDirty=true;this.#memory.write(a,v&255);return 1;}
  putWord(base:number,index:number,value:number):1 {const a=this.#range(base,index,2,true),v=this.#value(value),headers=propertyLayout(this.#layout).headers;if(headers.has(a)||headers.has(a+1))this.#layoutDirty=true;this.#memory.write(a,v>>>8);this.#memory.write(a+1,v&255);return 1;}
  rest(base:number,count=1):number {
    if(!Number.isSafeInteger(base)||!Number.isSafeInteger(count))throw new Error('Invalid pointer arithmetic');
    const next=base+count,segment=this.#allocations(base).find(s=>next>=s.base&&next<=s.base+s.length);
    if(!segment||!Number.isSafeInteger(next)||base<0||base>65535||next>65535)throw new Error('Pointer arithmetic escapes allocation');return next;
  }
  back(base:number,count:number):number {return this.rest(base,-count);}
  global(nameOrNumber:string|number):number {const g=this.#global(nameOrNumber);return this.getWord(g.address);}
  setGlobal(nameOrNumber:string|number,value:number):1 {const g=this.#global(nameOrNumber);return this.putWord(g.address,0,value);}
  #global(key:string|number){const g=this.#layout.globals.find(g=>typeof key==='string'?g.name===key:g.number===key);if(!g)throw new Error('Unknown global '+key);return g;}
  #object(id:number){const o=this.#layout.objects[id-1];if(!Number.isInteger(id)||!o||o.id!==id)throw new Error('Unknown object '+id);return o;}
  parent(id:number):number {return this.getByte(this.#object(id).address+4);}
  nextSibling(id:number):number {return this.getByte(this.#object(id).address+5);}
  firstChild(id:number):number {return this.getByte(this.#object(id).address+6);}
  children(id:number):number[] {const result:number[]=[],seen=new Set<number>();let child=this.firstChild(id);while(child){if(seen.has(child))throw new Error('Sibling cycle');this.#object(child);if(this.parent(child)!==id)throw new Error('Child/parent mismatch');seen.add(child);result.push(child);child=this.nextSibling(child);}return result;}
  in(id:number,parent:number):boolean {this.#object(parent);return this.parent(id)===parent;}
  #detachWrites(id:number):[number,number][] {
    const object=this.#object(id),parent=this.parent(id),next=this.nextSibling(id),writes:[number,number][]=[[object.address+4,0],[object.address+5,0]];
    if(parent){const siblings=this.children(parent),index=siblings.indexOf(id);if(index<0)throw new Error('Object missing from parent');writes.push([index===0?this.#object(parent).address+6:this.#object(siblings[index-1]!).address+5,next]);}
    else if(next)throw new Error('Detached object has a sibling');return writes;
  }
  remove(id:number):1 {const writes=this.#detachWrites(id);for(const [address,value] of writes)this.putByte(address,0,value);return 1;}
  move(id:number,destination:number):1 {
    const object=this.#object(id),target=this.#object(destination),seen=new Set<number>();let parent=destination;
    while(parent){if(parent===id||seen.has(parent))throw new Error('MOVE would create a containment cycle');seen.add(parent);parent=this.parent(parent);}
    const writes=this.#detachWrites(id),oldHead=this.firstChild(destination),newHead=oldHead===id?this.nextSibling(id):oldHead;
    writes.push([object.address+4,destination],[object.address+5,newHead],[target.address+6,id]);
    for(const [address,value] of writes)this.putByte(address,0,value);return 1;
  }
  hasFlag(id:number,flag:number):boolean {if(!Number.isInteger(flag)||flag<0||flag>31)throw new Error('Invalid attribute');const a=this.#object(id).address;return ((this.getWord(a)*65536+this.getWord(a+2))&2**(31-flag))!==0;}
  setFlag(id:number,flag:number,enabled=true):1 {if(!Number.isInteger(flag)||flag<0||flag>31)throw new Error('Invalid attribute');const a=this.#object(id).address,old=this.getWord(a)*65536+this.getWord(a+2),mask=2**(31-flag),value=(enabled?old|mask:old&~mask)>>>0;this.putWord(a,0,value>>>16);this.putWord(a+2,0,value&65535);return 1;}
  #properties(id:number){const object=this.#object(id),base=this.getWord(object.address+7);if(base!==object.propertyTable)throw new Error('Invalid property-table pointer');let address=base+1+2*this.getByte(base),previous=32;const result:{number:number;address:number;length:number}[]=[];
    for(let count=0;count<=31;count++){const header=this.getByte(address++);if(!header)return result;const number=header&31,length=(header>>>5)+1;if(!number||number>=previous)throw new Error('Invalid property headers');previous=number;this.#range(address,0,length===1?1:2);result.push({number,address,length});address+=length;}
    throw new Error('Property table has no terminator');
  }
  #propertyNumber(number:number){if(!Number.isInteger(number)||number<1||number>31)throw new Error('Invalid property number');}
  propertyAddress(id:number,number:number):number {this.#propertyNumber(number);return this.#properties(id).find(p=>p.number===number)?.address ?? 0;}
  getProperty(id:number,number:number):number {this.#propertyNumber(number);const p=this.#properties(id).find(p=>p.number===number);if(!p){const defaults=this.#layout.segments.find(s=>s.name==='objects')!;return this.getWord(defaults.base,number-1);}return p.length===1?this.getByte(p.address):this.getWord(p.address);}
  putProperty(id:number,number:number,value:number):1 {this.#propertyNumber(number);const p=this.#properties(id).find(p=>p.number===number);if(!p||p.length>2)throw new Error('PUTP needs an existing one/two-byte property');return p.length===1?this.putByte(p.address,0,value):this.putWord(p.address,0,value);}
  propertySize(address:number):number {
    if(address===0)return 0;
    // Validated layouts have fixed sizes. Raw header/pointer writes fall back
    // to the original memory scan until validation proves the layout again.
    if(this.#layoutDirty){for(const o of this.#layout.objects){const p=this.#properties(o.id).find(p=>p.address===address);if(p)return p.length;}throw new Error('PTSIZE requires a property data address');}
    const size=propertyLayout(this.#layout).sizes.get(address);if(size===undefined)throw new Error('PTSIZE requires a property data address');return size;
  }
  nextProperty(id:number,number:number):number {if(number!==0)this.#propertyNumber(number);const properties=this.#properties(id);if(number===0)return properties[0]?.number ?? 0;const index=properties.findIndex(p=>p.number===number);if(index<0)throw new Error('NEXTP requires an existing property');return properties[index+1]?.number ?? 0;}
  validate():void {
    const layout=this.#layout;if(this.#memory.length!==layout.bytes.length)throw new Error('World memory length mismatch');
    for(const segment of layout.segments)for(let i=0;i<segment.length;i++)if(segment.kind==='padding'||!segment.mutable||segment.writableRanges&&!segment.writableRanges.some(r=>i>=r.offset&&i<r.offset+r.length))if(this.#memory.read(segment.base+i)!==layout.bytes[segment.base+i])throw new Error('Static/protected memory changed');
    const children=new Set<number>();for(const o of layout.objects){const parent=this.parent(o.id);if(parent)this.#object(parent);for(const c of this.children(o.id)){if(children.has(c))throw new Error('Duplicate child membership');children.add(c);}
      const seen=new Set([o.id]);let current=parent;while(current){if(seen.has(current))throw new Error('Containment cycle');seen.add(current);current=this.parent(current);}
      if(!parent&&this.nextSibling(o.id))throw new Error('Detached object has a sibling');
      if(this.getByte(o.propertyTable)!==layout.bytes[o.propertyTable])throw new Error('Short-name length changed');
      const properties=this.#properties(o.id);if(properties.length!==o.properties.length||properties.some((p,i)=>p.number!==o.properties[i]!.number||p.address!==o.properties[i]!.address||p.length!==o.properties[i]!.length))throw new Error('Property layout changed');
    }
    for(const o of layout.objects)if(Boolean(this.parent(o.id))!==children.has(o.id))throw new Error('Missing child membership');
    for(const name of ['HERE','PLAYER','WINNER','P-IT-OBJECT'])if(layout.globals.some(g=>g.name===name)){const value=this.global(name);if(value)this.#object(value);}
    const handles=new Set(this.#game.bundle.payload.strings.entries.map(s=>s.id)),routines=new Set(this.#game.bundle.payload.logic.routines.map(r=>r.id));
    for(const segment of layout.segments)if(segment.mutable&&segment.kind!=='padding')for(const f of segment.fields)if(f.width===1||f.width===2){const address=segment.base+f.offset,value=f.width===1?this.getByte(address):this.getWord(address);
      if((f.domain==='object'||f.domain==='room')&&value)this.#object(value);
      if(f.domain==='routine'&&value&&!routines.has(value))throw new Error('Unknown routine reference in memory');
      if(f.domain==='string'&&value&&!handles.has(value))throw new Error('Unknown string handle in memory');
      if(f.domain==='address'&&value>layout.bytes.length)throw new Error('Address reference outside memory');
      if(f.domain==='variable'&&!layout.globals.some(g=>g.number===value))throw new Error('Unknown global variable-number reference');
    }
    this.#layoutDirty=false;
  }
}
