// Adapted from rougeXR 820cb92500226f5e8817c9a4a452651d94a7609c.
// Copyright (c) 2026 Mark Davey. BSD-2-Clause; see ROUGEXR-LICENSE.txt.
export interface TextStore {
  read(key:string):Promise<string|null>;write(key:string,text:string):Promise<void>;
  keys():Promise<string[]>;remove(key:string):Promise<void>;
}
/** Ordered writes, acknowledged only when the transaction commits. */
export class IndexedDbSaveStore implements TextStore {
  #database:Promise<IDBDatabase>|null=null;#writes:Promise<void>=Promise.resolve();
  readonly factory:IDBFactory|undefined;
  constructor(factory?:IDBFactory){try{this.factory=factory??globalThis.indexedDB;}catch{this.factory=undefined;}}
  #open():Promise<IDBDatabase>{
    if(!this.factory)return Promise.reject(new Error('IndexedDB is unavailable'));
    const factory=this.factory;
    if(!this.#database){
      const pending=new Promise<IDBDatabase>((resolve,reject)=>{
        const request=factory.open('zxr',1);let failed=false;
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('saves'))request.result.createObjectStore('saves');};
        request.onsuccess=()=>{const db=request.result;if(failed){db.close();return;}db.onversionchange=()=>{db.close();this.#database=null;};resolve(db);};
        request.onerror=()=>{failed=true;reject(request.error??new Error('IndexedDB open failed'));};
        request.onblocked=()=>{failed=true;reject(new Error('IndexedDB upgrade blocked'));};
      });this.#database=pending;void pending.catch(()=>{if(this.#database===pending)this.#database=null;});
    }return this.#database;
  }
  async #transaction<T>(mode:IDBTransactionMode,request:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
    const db=await this.#open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('saves',mode);let result:T;const operation=request(tx.objectStore('saves'));
      operation.onsuccess=()=>{result=operation.result;};
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error??operation.error??new Error('IndexedDB transaction failed'));
    });
  }
  async read(key:string){await this.#writes;const value=await this.#transaction('readonly',store=>store.get(key));if(value===undefined)return null;if(typeof value!=='string')throw new Error('Stored save is not text');return value;}
  async keys(){await this.#writes;return (await this.#transaction('readonly',store=>store.getAllKeys())).filter((key):key is string=>typeof key==='string');}
  #queue(action:()=>Promise<unknown>){const write=this.#writes.then(action).then(()=>{});this.#writes=write.catch(()=>{});return write;}
  write(key:string,text:string){return this.#queue(()=>this.#transaction('readwrite',store=>store.put(text,key)));}
  remove(key:string){return this.#queue(()=>this.#transaction('readwrite',store=>store.delete(key)));}
}
