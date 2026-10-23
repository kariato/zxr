import { IndexedDbSaveStore } from '../../src/persistence/indexed-db-save-store.ts';
document.querySelector('button')!.addEventListener('click',()=>void (async()=>{
  const output=document.querySelector('output')!,original=IDBObjectStore.prototype.put;let aborted=false,committed=false,acknowledged=false;
  IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){
    const request=original.call(this,value,key!);if(!aborted){aborted=true;request.addEventListener('success',()=>this.transaction.abort());}
    else this.transaction.addEventListener('complete',()=>{committed=true;});return request;
  };
  try{
    const store=new IndexedDbSaveStore();const failed=store.write('test:abort','bad').then(()=>false,()=>true);
    const success=store.write('test:committed','good').then(()=>{acknowledged=committed;});
    const missing=store.read('test:abort');await success;
    const result={aborted:await failed,missing:await missing,acknowledged,value:await store.read('test:committed'),keys:await store.keys()};
    await store.remove('test:committed');output.textContent=JSON.stringify({...result,deleted:await store.read('test:committed')});
  }catch(error){output.textContent=String(error);}finally{IDBObjectStore.prototype.put=original;}
})());
