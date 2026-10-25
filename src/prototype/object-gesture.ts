/** A touch hold consumes the release even when its target has since expired. */
export class ObjectHold {
  #timer:ReturnType<typeof setTimeout>|undefined;
  #consumed=false;
  start(open:()=>void){this.cancel();this.#timer=setTimeout(()=>{this.#timer=undefined;this.#consumed=true;open();},550);}
  release(){const consumed=this.#consumed;this.cancel();return consumed;}
  cancel(){if(this.#timer!==undefined)clearTimeout(this.#timer);this.#timer=undefined;this.#consumed=false;}
}
export function objectIntent(pointerType:string,handedness?:string):'menu'|'default'{
  return handedness!==undefined?(handedness==='left'?'menu':'default'):(pointerType==='touch'?'default':'menu');
}
