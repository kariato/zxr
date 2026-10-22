import { hashJson } from '../zil/integrity.ts';
import { assertWord, signed } from './numeric.ts';
export interface RandomEvent {range:number;result:number}
/** position counts accepted ZIL RANDOM requests, including reseeds, not internal rejection attempts. */
export interface RandomSnapshot {algorithm:'xorshift32-v1';initialSeed:number;state:number;position:number;cursor:number;replayHash:string|null}
/** Owned deterministic RNG. Oracle replay validates each request and never falls back to a fresh draw. */
export class GameRandom {
  readonly #seed:number;readonly #replay:readonly RandomEvent[]|null;readonly #replayHash:string|null;
  #state:number;#position=0;#cursor=0;#events:RandomEvent[]=[];
  constructor(seed=2,replay?:readonly RandomEvent[]){
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed must be an unsigned 32-bit integer');this.#seed=seed;this.#state=seed||0x6d2b79f5;
    this.#replay=replay?.map(e=>{if(!Number.isInteger(e.range)||e.range< -32768||e.range>32767||!Number.isInteger(e.result)||e.range>0&&(e.result<1||e.result>e.range)||e.range<=0&&e.result!==0)throw new Error('Invalid replay random event');return {range:e.range,result:e.result};}) ?? null;this.#replayHash=this.#replay?hashJson(this.#replay):null;
  }
  #next():number {let n=this.#state;n^=n<<13;n^=n>>>17;n^=n<<5;return this.#state=n>>>0;}
  random(bound:number):number {
    const range=signed(assertWord(bound)),expected=this.#replay?.[this.#cursor];
    if(this.#replay&&(!expected||expected.range!==range))throw new Error('Random replay range mismatch or exhausted tape at cursor '+this.#cursor+': expected '+(expected?.range??'end of tape')+', received '+range);
    if(this.#position===Number.MAX_SAFE_INTEGER)throw new Error('Random request counter exhausted');
    let result=0;
    if(range<=0)this.#state=(range<0?-range:this.#seed)||0x6d2b79f5;
    else if(expected)result=expected.result;
    else {// xorshift32 visits the 2^32 - 1 nonzero words. Shift that domain to zero before rejection sampling.
      const limit=Math.floor(4294967295/range)*range;let n:number;do{n=this.#next()-1;}while(n>=limit);result=n%range+1;}
    this.#position++;if(this.#replay)this.#cursor++;this.#events.push({range,result});return result;
  }
  snapshot():RandomSnapshot {return {algorithm:'xorshift32-v1',initialSeed:this.#seed,state:this.#state,position:this.#position,cursor:this.#cursor,replayHash:this.#replayHash};}
  restore(snapshot:RandomSnapshot):void {
    if(snapshot?.algorithm!=='xorshift32-v1'||snapshot.initialSeed!==this.#seed||snapshot.replayHash!==this.#replayHash||!Number.isInteger(snapshot.state)||snapshot.state<1||snapshot.state>0xffffffff||!Number.isSafeInteger(snapshot.position)||snapshot.position<0||!Number.isSafeInteger(snapshot.cursor)||snapshot.cursor<0||snapshot.cursor>(this.#replay?.length ?? 0)||this.#replay&&snapshot.cursor!==snapshot.position||!this.#replay&&snapshot.cursor!==0)throw new Error('Invalid or incompatible RNG snapshot');
    this.#state=snapshot.state;this.#position=snapshot.position;this.#cursor=snapshot.cursor;this.#events=[];
  }
  assertReplayComplete():void {if(this.#replay&&this.#cursor!==this.#replay.length)throw new Error('Unused random replay tape entries');}
  drainEvents():RandomEvent[] {const events=this.#events;this.#events=[];return events;}
}
