import type { ZxrSave } from '../engine/session.ts';
import type { TextPlayer } from './controller.ts';
export interface SaveStore {read():ZxrSave;write(save:ZxrSave):void}
/** Host effects happen only after the engine publishes a correlated request. */
export function resolveHost(player:TextPlayer,store:SaveStore):string|undefined {
  const request=player.host;if(!request)return;
  try{
    const save=request.kind==='RESTORE'?store.read():undefined;
    if(request.kind==='SAVE')store.write(request.save!);
    const result=player.completeHost('success',save);
    if(result.status==='rejected'||result.status==='error'){
      if(player.host&&request.kind==='RESTORE')player.completeHost('failure');
      return result.error?.cause??'Host operation failed';
    }
  }catch(error){player.completeHost('failure');return error instanceof Error?error.message:String(error);}
}
export interface AsyncSaveStore {read():Promise<ZxrSave>;write(save:ZxrSave):Promise<void>}
/** Correlation is rechecked after storage yields; a stale completion must never
 * complete a newer request or report failure to an unrelated continuation. */
export async function resolveHostAsync(player:TextPlayer,store:AsyncSaveStore):Promise<string|undefined>{
  const request=player.host;if(!request)return;
  const current=()=>{const h=player.host,o=player.session.observe();return h?.id===request.id&&h.kind===request.kind&&h.epoch===request.epoch&&h.revision===request.revision&&o.state==='host'&&o.epoch===request.epoch&&o.revision===request.revision;};
  try{
    const save=request.kind==='RESTORE'?await store.read():undefined;
    if(request.kind==='SAVE')await store.write(request.save!);
    if(!current())return 'Host request changed while storage was pending';
    const result=player.completeHost('success',save);
    if(result.status==='rejected'||result.status==='error'){
      if(request.kind==='RESTORE'&&current())player.completeHost('failure');return result.error?.cause??'Host operation failed';
    }
  }catch(error){if(current())player.completeHost('failure');return error instanceof Error?error.message:String(error);}
}
