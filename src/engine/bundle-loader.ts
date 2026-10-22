import { GameRandom } from './random.ts';
import type { RandomEvent } from './random.ts';
import { unpackBundle } from '../zil/bundle.ts';
import type { GameBundle } from '../zil/bundle.ts';
import type { MappedRoutine } from '../zil/source-maps.ts';
/** An owned, validated and frozen definition; all mutable execution data lives in separate state. */
export class LoadedGame {
  readonly #bundle:GameBundle;
  readonly #routines:Map<number,MappedRoutine>;
  private constructor(bundle:GameBundle){
    const queue:unknown[]=[bundle];while(queue.length){const value=queue.pop();if(value&&typeof value==='object'){for(const child of Object.values(value))if(child&&typeof child==='object')queue.push(child);Object.freeze(value);}}
    this.#bundle=bundle;this.#routines=new Map(bundle.payload.logic.routines.map(r=>[r.id,r]));Object.freeze(this);
  }
  static load(input:string|Uint8Array):LoadedGame {return new LoadedGame(unpackBundle(input));}
  get bundle():Readonly<GameBundle>{return this.#bundle;}
  get buildHash():string{return this.#bundle.buildHash;}
  createInitialMemory():Uint8Array {return new Uint8Array(this.#bundle.payload.memory.bytes);}
  createRandom(replay?:readonly RandomEvent[]):GameRandom {return new GameRandom(this.#bundle.payload.initialization.rng.seed,replay);}
  routine(id:number):Readonly<MappedRoutine>|undefined {return this.#routines.get(id);}
}
export const loadGame=(input:string|Uint8Array)=>LoadedGame.load(input);
