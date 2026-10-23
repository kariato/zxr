import type { LoadedGame, ZxrSave } from '../engine/index.ts';
import { zxrSaveSchema } from '../engine/index.ts';
import { assertSchema } from '../zil/schema.ts';
import type { TextStore } from './indexed-db-save-store.ts';
export const MAX_SAVE_BYTES=32*1024*1024;
export class GameSaves {
  readonly #prefix:string;
  readonly game:LoadedGame;readonly store:TextStore;readonly legacy:(()=>string|null)|undefined;
  constructor(game:LoadedGame,store:TextStore,legacy?:()=>string|null){this.game=game;this.store=store;this.legacy=legacy;this.#prefix=game.buildHash+':';}
  #key(kind:string){return this.#prefix+kind;}
  #name(name:string){const cleaned=name.trim();if(!cleaned||cleaned.length>100||/[\u0000-\u001f\u007f]/.test(cleaned))throw new Error('Checkpoint name must contain 1–100 printable characters');return cleaned;}
  parse(text:string):ZxrSave {
    if(new TextEncoder().encode(text).byteLength>MAX_SAVE_BYTES)throw new Error('Save exceeds 32 MiB');
    const save:unknown=JSON.parse(text);assertSchema(save,zxrSaveSchema,{},'save');const result=save as ZxrSave;
    if(result.buildHash!==this.game.buildHash||result.abi!==this.game.bundle.payload.versions.adapter)throw new Error('Save build or ABI mismatch');return result;
  }
  #serialize(save:ZxrSave){const text=JSON.stringify(save);this.parse(text);return text;}
  async #read(kind:string,expected:ZxrSave['kind']='boundary'){const text=await this.store.read(this.#key(kind));if(text===null)return null;const save=this.parse(text);if(save.kind!==expected)throw new Error('Stored checkpoint kind mismatch');return save;}
  async autosave(save:ZxrSave){if(save.kind!=='boundary')throw new Error('Autosave requires an ordinary boundary');await this.store.write(this.#key('auto'),this.#serialize(save));}
  readAutosave(){return this.#read('auto');}
  async saveNamed(name:string,save:ZxrSave){if(save.kind!=='boundary')throw new Error('Named checkpoints require an ordinary boundary');await this.store.write(this.#key('named:'+encodeURIComponent(this.#name(name))),this.#serialize(save));}
  async readNamed(name:string){const save=await this.#read('named:'+encodeURIComponent(this.#name(name)));if(!save)throw new Error('Checkpoint not found');return save;}
  async names(){const prefix=this.#key('named:');return (await this.store.keys()).filter(key=>key.startsWith(prefix)).map(key=>decodeURIComponent(key.slice(prefix.length))).sort((a,b)=>a.localeCompare(b));}
  removeNamed(name:string){return this.store.remove(this.#key('named:'+encodeURIComponent(this.#name(name))));}
  async writeSource(save:ZxrSave){if(save.kind!=='primitive-save')throw new Error('Source SAVE requires its suspended continuation');await this.store.write(this.#key('source'),this.#serialize(save));}
  async readSource(){
    let save=await this.#read('source','primitive-save');if(save)return save;
    const text=this.legacy?.();if(text){save=this.parse(text);await this.writeSource(save);return save;}
    throw new Error('No saved game for this build');
  }
}
