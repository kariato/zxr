import type { ActionResolution, GameSession, HostRequest, OperandChoice, SelectionRequest, ZxrSave } from '../engine/index.ts';
import { operandIdentity } from '../engine/index.ts';
import type { ActionMenu, PagedSelection, MenuChoice, ChoicePage, Operand } from '../engine/index.ts';
export interface ChoiceTarget {family?:string;placement?:'primary'|'more';actor?:string;operand?:Operand;spelling?:Operand;all?:boolean;commit?:boolean}
export interface PlayerChoice {key:string;label:string;target?:ChoiceTarget}
export interface TranscriptEntry {command?:string;text:string}
export interface PlayerView {title:string;choices:PlayerChoice[];words:boolean;canUndoWord:boolean;canFinish:boolean;finishLabel?:string;canCancel:boolean;state:string}
/** Shared option-only navigation. Browsing never calls an engine commit. */
export class TextPlayer {
  readonly session:GameSession;readonly transcript:TranscriptEntry[]=[];
  #actor='PLAYER';#page='root';#object='';#expanded=false;#draft:SelectionRequest|undefined;
  #spelling:OperandChoice|undefined;#multiple:Operand[]|undefined;#callbacks=new Map<string,()=>void>();
  #host:HostRequest|undefined;#last!:ActionResolution;
  #menuKey='';#menu:ActionMenu|undefined;#stageDraft:SelectionRequest|undefined;#stage:PagedSelection|undefined;
  constructor(session:GameSession){this.session=session;this.receive(session.opening());}
  get host(){return this.#host;}
  get lastResult():ActionResolution {return structuredClone(this.#last);}
  receive(packet:ActionResolution,command?:string){
    this.#last=packet;this.#host=packet.host;
    this.transcript.push({...(command?{command}:{}),text:packet.text.join('')+(packet.error?'\n'+packet.error.cause:'')});
  }
  choose(key:string){const callback=this.#callbacks.get(key);if(!callback)throw new Error('Unavailable choice');this.#callbacks.clear();callback();}
  #reset(){this.#menu=undefined;this.#stage=undefined;this.#stageDraft=undefined;this.#callbacks.clear();this.#actor='PLAYER';this.#draft=undefined;this.#spelling=undefined;this.#multiple=undefined;this.#page='root';this.#expanded=false;}
  importSave(save:ZxrSave){const packet=this.session.importSave(save);this.#reset();this.#actor='PLAYER';this.receive(packet,'Restore saved game');}
  completeHost(outcome:'success'|'failure'|'cancel',save?:ZxrSave){
    const h=this.#host;if(!h)throw new Error('No host request');
    this.#reset();this.#actor='PLAYER';const packet=this.session.completeHost({id:h.id,epoch:h.epoch,revision:h.revision,kind:h.kind,outcome,...(save?{save}:{})});this.receive(packet);return packet;
  }
  addWord(index:number){if(!this.#draft)throw new Error('No word selection');const next={...this.#draft,words:[...(this.#draft.words??[]),index]};this.session.select(next);this.#draft=next;}
  removeWord(){if(this.#draft)this.#draft={...this.#draft,words:(this.#draft.words??[]).slice(0,-1)};}
  cancel():boolean {if(this.session.observe().state!=='input')return false;this.#reset();return true;}
  #completion(){
    if(!this.#draft)return null;
    let draft=this.#draft;
    if(this.#spelling)draft={...draft,operands:[...draft.operands,this.#spelling.operand]};
    if(this.#multiple){if(!this.#multiple.length)return null;draft={...draft,operands:[...draft.operands,this.#multiple]};}
    return this.session.selectionCompletion(draft);
  }
  finish():boolean {
    if(this.session.observe().state!=='input')return false;
    const draft=this.#completion();if(!draft)return false;
    const label=this.session.select(draft).label;this.#reset();this.receive(this.session.commitSelection(draft),label);return true;
  }
  #append(operand:SelectionRequest['operands'][number]){const next={...this.#draft!,operands:[...this.#draft!.operands,operand]};this.session.select(next);this.#draft=next;this.#spelling=undefined;this.#multiple=undefined;this.#expanded=false;}
  view():PlayerView {
    this.#callbacks.clear();const choices:PlayerChoice[]=[];
    const add=(label:string,callback:()=>void,target?:ChoiceTarget)=>{const key=String(choices.length+1);choices.push({key,label,...(target?{target:structuredClone(target)}: {})});this.#callbacks.set(key,callback);};
    const nav=(page:string)=>{this.#page=page;this.#expanded=false;};
    const show=<T>(page:ChoicePage<T>,label:(item:T)=>string,select:(item:T)=>void,target?:(item:T)=>ChoiceTarget)=>{
      for(const item of [...page.primary,...(this.#expanded?page.more:[])])add(label(item),()=>select(item),target?.(item));
      if(page.hasMore)add(this.#expanded?'Fewer actions':`More actions (${page.more.length})`,()=>{this.#expanded=!this.#expanded;});
    };
    const state=this.session.observe().state;
    let title=this.#actor==='PLAYER'?'Choose an action':'Choose an action: '+(this.session.actors().find(a=>a.actor===this.#actor)?.label??this.#actor.toLowerCase()),words=false;
    if(state==='host'){title='Completing '+this.#host?.kind.toLowerCase();add('Retry host operation',()=>{});}
    else if(state==='terminal')title='Game ended';
    else if(state==='pending'){
      title='Choose a response';for(const option of this.session.options())add(option.label,()=>{const {epoch,revision}=this.session.observe();this.#reset();this.receive(this.session.execute({expected:{epoch,revision},optionId:option.id}),option.label);});
    }else if(this.#draft){
      const draft=this.#draft;
      if(this.#stageDraft!==draft){this.#stage=this.session.selectionMenu(draft);this.#stageDraft=draft;}
      const view=this.#stage!;title=view.label;
      if(this.#spelling){
        title='Choose wording: '+this.#spelling.label;
        const spellings=this.#spelling.spellings;
        for(const spelling of spellings){
          const label=typeof spelling==='string'?'Object name: '+this.#spelling.label:'pseudo' in spelling?spelling.pseudo.word.toLowerCase():[spelling.adjective,'noun' in spelling?spelling.noun:undefined].filter(Boolean).join(' ').toLowerCase();
          add(label,()=>this.#append(spelling),{spelling});
        }
        add('Back',()=>{this.#spelling=undefined;});
      }else if(this.#multiple){
        title='Choose multiple objects';
        for(const c of [...view.next!.choices.primary,...view.next!.choices.more]){
          if(typeof c.operand==='object'&&'pseudo' in c.operand&&this.#multiple.some(o=>typeof o==='object'&&'pseudo' in o&&operandIdentity(o)!==operandIdentity(c.operand)))continue;
          const selected=this.#multiple.some(o=>operandIdentity(o)===operandIdentity(c.operand));
          add((selected?'Selected: ':'Select: ')+c.label,()=>{this.#multiple=selected?this.#multiple!.filter(o=>operandIdentity(o)!==operandIdentity(c.operand)):[...this.#multiple!,c.operand];},{operand:c.operand});
        }
        if(this.#multiple.length)add('Use selected objects',()=>this.#append(this.#multiple!));
        add('Back',()=>{this.#multiple=undefined;});
      }else{
        if(view.next){
          show(view.next.choices,c=>c.label,c=>{if(c.spellings.length>1)this.#spelling=c;else this.#append(c.operand);},c=>({operand:c.operand}));
          if(view.next.allowAll){add('All objects',()=>this.#append('ALL'),{all:true});add('Choose multiple objects',()=>{this.#multiple=[];});}
        }else if(view.wordPicker){words=true;}
        if(view.ready)add('Do: '+view.label,()=>{const label=view.label;this.#reset();this.receive(this.session.commitSelection(draft),label);},{commit:true});
        if(words&&(draft.words?.length??0)>0)add('Remove last word',()=>this.removeWord());
        if(draft.operands.length)add('Back',()=>{this.#draft={...draft,operands:draft.operands.slice(0,-1)};this.#expanded=false;});
      }
      add('Cancel',()=>this.#reset());
    }else{
      const actors=this.session.actors();
      const {epoch,revision}=this.session.observe(),key=epoch+':'+revision+':'+this.#actor;
      if(this.#page!=='root'&&this.#page!=='actors'&&(key!==this.#menuKey||!this.#menu)){this.#menu=this.session.menu(this.#actor);this.#menuKey=key;}
      const menu=this.#menu!;
      const select=(c:MenuChoice)=>{this.#draft=c.draft;this.#expanded=false;};
      if(this.#page==='root'){
        add('Objects',()=>nav('objects'));add('Actions',()=>nav('actions'));add('Exits',()=>nav('exits'));add('Menu: look, inventory, wait, score, save',()=>nav('always'));
        if(actors.length>1)add('Change actor',()=>nav('actors'));
      }else if(this.#page==='objects'){
        title='Objects';for(const group of menu.objects)add(group.label,()=>{this.#object=operandIdentity(group.operand);nav('object');});
      }else if(this.#page==='actors'){
        title='Choose actor';const primary=actors.filter(a=>a.placement==='primary'),more=actors.filter(a=>a.placement==='more');
        show({primary,more,total:actors.length,hasMore:more.length>0},a=>a.label,a=>{this.#actor=a.actor;nav('root');},a=>({actor:a.actor}));
      }else if(this.#page==='object'){
        const group=menu.objects.find(g=>operandIdentity(g.operand)===this.#object);title=group?.label??'Object unavailable';if(group)show(group.choices,c=>c.label,select,c=>({family:c.draft.family,placement:c.placement}));
      }else{
        const key=this.#page as 'actions'|'exits'|'always';title=key==='always'?'Menu':key==='exits'?'Exits':'Actions';show(menu[key],c=>c.label,select,c=>({family:c.draft.family,placement:c.placement}));
      }
      if(this.#page!=='root')add('Back',()=>nav(this.#page==='object'?'objects':'root'));
    }
    const completion=state==='input'?this.#completion():null;
    return {title,choices,words,canUndoWord:!!this.#draft?.words?.length,canFinish:!!completion,...(completion?{finishLabel:this.session.select(completion).label}:{}),canCancel:state==='input',state};
  }
}
