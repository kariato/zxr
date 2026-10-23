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
