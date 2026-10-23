import type { LoadedGame } from './bundle-loader.ts';
import type { WorldState } from './world-state.ts';
import { prepareOperand } from './action-plan.ts';
import type { Operand, PlannedOperand } from './action-plan.ts';
import type { CandidateScope } from './candidates.ts';
import { decodeZText } from './text.ts';

export interface ScopeContext {
  actor?:string;
  /** Source HERE for helper comparisons; normally the actor's containing room. */
  room?:string;
  /** Already-known identities, supplied by the caller. Queries never learn or save knowledge. */
  known?:readonly string[];
}
export interface PerceivedObject {
  id:string; name:string; visible:boolean; reachable:boolean; held:boolean; carried:boolean; known:boolean;
}
export interface ScopeObservation {
  actor:string; room:{id:string;name:string}|null; lit:boolean; objects:PerceivedObject[];
}
export interface ScopeResult {
  observation:ScopeObservation;
  candidates:CandidateScope;
}

/** Independent read-only versions of META-LOC, ACCESSIBLE?, SEARCH-LIST and LIT?.
 * World memory is authoritative; no translated routines or parser scratch writes. */
export class ScopeQuery {
  readonly #game:LoadedGame; readonly #world:WorldState;
  readonly #entities:Map<number,LoadedGame['bundle']['payload']['world']['entities'][number]>;
  readonly #names:Map<string,number>; readonly #flags:Map<string,number>; readonly #properties:Map<string,number>;
  readonly actor:number; readonly here:number; readonly player:number; readonly #known:Set<string>;
  constructor(game:LoadedGame,world:WorldState,context:ScopeContext={}) {
    if(world.buildHash!==game.buildHash)throw new Error('Scope world belongs to another build');
    this.#game=game;this.#world=world;
    this.#entities=new Map(game.bundle.payload.world.entities.map(e=>[e.id,e]));this.#names=new Map([...this.#entities.values()].map(e=>[e.name,e.id]));
    const symbols=game.bundle.payload.symbols.symbols;
    this.#flags=new Map(symbols.filter(s=>s.kind==='attribute').map(s=>[s.name,s.number!]));
    this.#properties=new Map(symbols.filter(s=>s.kind==='property').map(s=>[s.name.slice(2),s.number!]));
    this.player=world.global('PLAYER');this.actor=context.actor===undefined||context.actor==='PLAYER'?this.player:this.id(context.actor);
    if(!this.flag(this.actor,'ACTORBIT'))throw new Error('Scope actor is not an initialized actor');
    const location=this.metaLocation(this.actor);
    // Local/global actor proxies (e.g. the distant unicorn) live under an
    // implementation container. Their offered command still starts in HERE;
    // the source TELL handler decides whether to accept or refuse it.
    this.here=context.room?this.id(context.room):this.#entities.get(location)?.kind==='room'?location:world.global('HERE');
    this.#known=new Set(context.known??[]);for(const name of this.#known)this.id(name);
  }
  id(name:string):number {const id=this.#names.get(name);if(id===undefined)throw new Error('Unknown scope entity '+name);return id;}
  name(id:number):string {const e=this.#entities.get(id);if(!e)throw new Error('Unknown scope object '+id);return e.name;}
  flag(id:number,name:string):boolean {const bit=this.#flags.get(name);if(bit===undefined)throw new Error('Missing scope attribute '+name);return this.#world.hasFlag(id,bit);}
  #property(id:number,name:string):number {const property=this.#properties.get(name);if(property===undefined)throw new Error('Missing scope property '+name);return this.#world.propertyAddress(id,property);}
  #member(id:number,room:number):boolean {
    const address=this.#property(room,'GLOBAL');if(!address)return false;
    return Array.from({length:this.#world.propertySize(address)},(_,i)=>this.#world.getByte(address,i)).includes(id);
  }
  metaLocation(id:number):number {
    const seen=new Set<number>();
    while(id){this.name(id);if(seen.has(id))throw new Error('Scope containment cycle');seen.add(id);
      const parent=this.#world.parent(id);if(parent===this.id('GLOBAL-OBJECTS'))return parent;
      if(parent===this.id('ROOMS'))return id;id=parent;
    }return 0;
  }
  knows(id:number):boolean {return this.#known.has(this.name(id));}
  accessible(id:number):boolean {
    const seen=new Set<number>(),location=this.#world.parent(this.actor);
    while(id){this.name(id);if(seen.has(id))throw new Error('Scope containment cycle');seen.add(id);
      if(this.flag(id,'INVISIBLE'))return false;
      const parent=this.#world.parent(id);if(!parent)return false;
      if(parent===this.id('GLOBAL-OBJECTS'))return true;
      if(parent===this.id('LOCAL-GLOBALS')&&this.#member(id,this.here))return true;
      const room=this.metaLocation(id);if(room!==this.here&&room!==location)return false;
      if(parent===this.actor||parent===this.here||parent===location)return true;
      if(!this.flag(parent,'OPENBIT'))return false;id=parent;
    }return false;
  }
  /** Exact source traversal order, including SEARCHBIT/SURFACEBIT depth rules.
   * The override models parser room scanning without changing PLAYER.TRANSBIT. */
  search(root:number,level:0|1|2=1,opaqueActor=0):number[] {
    this.name(root);const result:number[]=[],ancestors=new Set<number>();
    const visit=(parent:number,depth:0|1|2)=>{
      if(ancestors.has(parent))throw new Error('Scope containment cycle');ancestors.add(parent);
      for(const child of this.#world.children(parent)){
        if(depth!==2&&this.#property(child,'SYNONYM')&&!this.flag(child,'INVISIBLE'))result.push(child);
        const surface=this.flag(child,'SURFACEBIT'),search=this.flag(child,'SEARCHBIT');
        if((depth!==0||search||surface)&&(this.flag(child,'OPENBIT')||child!==opaqueActor&&this.flag(child,'TRANSBIT')))
          visit(child,surface||search?1:0);
      }ancestors.delete(parent);
    };visit(root,level);return result;
  }
  lit(room=this.here,roomBit=true):boolean {
    this.name(room);
    if(this.#world.global('ALWAYS-LIT')&&this.actor===this.player)return true;
    if(roomBit&&this.flag(room,'ONBIT'))return true;
    const candidates:number[]=[];
    if(this.here===room){
      candidates.push(...this.search(this.actor));
      if(this.actor!==this.player&&this.#world.parent(this.player)===room)candidates.push(...this.search(this.player));
    }
    candidates.push(...this.search(room));
    // LIT?'s THIS-IT? still reads existing noun/adjective selectors; it only overrides GWIM.
    const noun=this.#world.global('P-NAM'),adjective=this.#world.global('P-ADJ');
    return candidates.some(id=>{
      if(!this.flag(id,'ONBIT'))return false;
      const synonyms=this.#property(id,'SYNONYM'),adjectives=this.#property(id,'ADJECTIVE');
      if(noun&&(!synonyms||!Array.from({length:this.#world.propertySize(synonyms)/2},(_,i)=>this.#world.getWord(synonyms,i)).includes(noun)))return false;
      if(adjective&&(!adjectives||!Array.from({length:this.#world.propertySize(adjectives)},(_,i)=>this.#world.getByte(adjectives,i)).includes(adjective)))return false;
      return true;
    });
  }
  /** Pure counterpart of the structured adapter's DO-SL/GLOBAL-CHECK noun search.
   * Zero physical matches may take the source NOT-HERE branch; ambiguity may not. */
  acceptsSpelling(value:Operand,hints:readonly string[],verb:string):boolean {return this.spellingMatcher()(prepareOperand(this.#game,value),hints,verb);}
  /** Snapshot matcher, cached only within one session revision. */
  spellingMatcher(){
    const searches=new Map<string,number[]>(),properties=new Map<number,{invisible:boolean;nouns:Set<number>;adjectives:Set<number>}>(),lit=!!this.#world.global('LIT'),here=this.#world.global('HERE');
    const search=(root:number,depth:0|1|2=1,opaque=0)=>{const key=root+':'+depth+':'+opaque;let result=searches.get(key);if(!result){result=this.search(root,depth,opaque);searches.set(key,result);}return result;};
    const words=new Map(this.#game.bundle.payload.vocabulary.words.map(w=>[w.name,w])),addresses=new Map(this.#game.bundle.payload.memory.words.map(w=>[w.name,w.address]));
    return (operand:PlannedOperand,hints:readonly string[],verb:string):boolean=>{
    const last=operand.words.at(-1)!,word=words.get(last)!;
    const promoted=operand.adjectiveOnly?!!word.roles.object:!operand.adjective&&!!word.roles.adjective;
    const noun=operand.adjectiveOnly&&!promoted?0:addresses.get(last)!,adjective=promoted?0:operand.adjective??0;
    const matches=(id:number)=>{
      let entry=properties.get(id);if(!entry){const synonyms=this.#property(id,'SYNONYM'),adjectives=this.#property(id,'ADJECTIVE');entry={invisible:this.flag(id,'INVISIBLE'),nouns:new Set(synonyms?Array.from({length:this.#world.propertySize(synonyms)/2},(_,i)=>this.#world.getWord(synonyms,i)):[]),adjectives:new Set(adjectives?Array.from({length:this.#world.propertySize(adjectives)},(_,i)=>this.#world.getByte(adjectives,i)):[])};properties.set(id,entry);}
      return !entry.invisible&&(!noun||entry.nouns.has(noun))&&(!adjective||entry.adjectives.has(adjective));
    };
    const scan=(root:number,top:boolean,bottom:boolean,opaque=0)=>top||bottom?search(root,top&&bottom?1:top?0:2,opaque).filter(matches):[];
    const physical=(retry:boolean)=>[...(lit?scan(here,!retry||hints.includes('ON-GROUND'),!retry||hints.includes('IN-ROOM'),this.player):[]),...scan(this.player,!retry||hints.includes('HELD'),!retry||hints.includes('CARRIED'))];
    let found=physical(false);
    if(found.length>1){found=physical(true);return found.length===1&&found[0]===operand.id;}
    if(!found.length){
      const globals=this.#property(here,'GLOBAL');if(globals)found=Array.from({length:this.#world.propertySize(globals)},(_,i)=>this.#world.getByte(globals,i)).filter(matches);
      const pseudos=this.#property(here,'PSEUDO');if(pseudos&&noun)for(let i=0;i<this.#world.propertySize(pseudos);i+=4)if(this.#world.getWord(pseudos+i)===noun){found.push(this.id('PSEUDO-OBJECT'));break;}
      if(!found.length)found=search(this.id('GLOBAL-OBJECTS')).filter(matches);
      if(!found.length&&['LOOK-INSIDE','SEARCH','EXAMINE'].includes(verb))found=search(this.id('ROOMS')).filter(matches);
    }
    return found.length===0?!operand.pseudo:found.length===1&&found[0]===operand.id;
    };
  }
  #shortName(id:number):string {
    const object=this.#game.bundle.payload.memory.objects.find(o=>o.id===id)!,address=object.propertyTable;
    return decodeZText(a=>this.#world.getByte(a),address+1,this.#world.getByte(address));
  }
  result():ScopeResult {
    const w=this.#world,lit=this.lit(),inventory=new Set(this.search(this.actor));
    const visible=new Set(lit?[...this.search(this.here,1,this.actor),...inventory]:[]);
    const globalRoot=this.id('GLOBAL-OBJECTS'),localRoot=this.id('LOCAL-GLOBALS');
    const operands:Operand[]=[],objects:PerceivedObject[]=[],parents:CandidateScope['parents']={};
    const held:string[]=[],carried:string[]=[],onGround:string[]=[],inRoom:string[]=[];
    const parentName=(id:number)=>w.parent(id)?this.name(w.parent(id)):null;
    parents[this.name(this.actor)]=parentName(this.actor);
    for(const e of this.#entities.values()){
      const parent=w.parent(e.id),global=parent===globalRoot,local=parent===localRoot&&this.#member(e.id,this.here);
      if(this.flag(e.id,'INVISIBLE')||!this.#property(e.id,'SYNONYM'))continue;
      // Global nouns are addressable vocabulary, not proof of physical presence.
      const seen=visible.has(e.id)||lit&&local,owned=inventory.has(e.id);
      if(!seen&&!owned&&!global&&!local)continue;
      operands.push(e.name);parents[e.name]=parentName(e.id);
      if(parent===this.actor)held.push(e.name);if(owned)carried.push(e.name);
      if(parent===this.here)onGround.push(e.name);if(seen&&!owned)inRoom.push(e.name);
      if(seen||owned)objects.push({id:e.name,name:this.#shortName(e.id),visible:seen,reachable:this.accessible(e.id),
        held:parent===this.actor,carried:owned,known:this.knows(e.id)});
    }
    // Read the current room's mutable PSEUDO data, never activate the shared proxy.
    const pseudo=this.#property(this.here,'PSEUDO');
    if(pseudo)for(let i=0;i<this.#world.propertySize(pseudo);i+=4){
      const address=w.getWord(pseudo+i),word=this.#game.bundle.payload.memory.words.find(word=>word.address===address);
      if(!word)throw new Error('Unknown scope pseudo dictionary pointer');
      operands.push({pseudo:{room:this.name(this.here),word:word.name}});
    }
    return {observation:{actor:this.name(this.actor),room:lit?{id:this.name(this.here),name:this.#shortName(this.here)}:null,lit,objects},
      candidates:{actor:this.name(this.actor),room:this.name(this.here),operands,parents,held,carried,onGround,inRoom}};
  }
}
export const queryScope=(game:LoadedGame,world:WorldState,context:ScopeContext={}):ScopeResult=>new ScopeQuery(game,world,context).result();
