import { GameSession } from '../../src/engine/session.ts';
import type { AcceptedInput, ActionResolution, ZxrSave } from '../../src/engine/session.ts';
import type { LoadedGame } from '../../src/engine/bundle-loader.ts';
import type { SelectionRequest, OperandChoice } from '../../src/engine/selection.ts';
import type { Operand } from '../../src/engine/action-plan.ts';
import type { MenuChoice, ChoicePage } from '../../src/engine/menu.ts';
import type { WordChoice } from '../../src/engine/word-picker.ts';
import { validateSessionState } from '../../src/engine/testing.ts';
export class FuzzRandom {
  #state:number;
  constructor(seed:number){if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Chooser seed must be uint32');this.#state=seed||0x6d2b79f5;}
  next(){let x=this.#state;x^=x<<13;x^=x>>>17;x^=x<<5;return this.#state=x>>>0;}
  index(length:number){if(!Number.isSafeInteger(length)||length<1)throw new Error('Cannot choose from an empty list');return this.next()%length;}
  pick<T>(items:readonly T[]):T{return items[this.index(items.length)]!;}
  get state(){return this.#state;}
}
const mix=(n:number)=>{n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return (n^(n>>>16))>>>0;};
export const fuzzSeeds=(seed:number,game:number)=>({gameSeed:mix(seed^game),chooserSeed:mix(seed^game^0xa5a5a5a5)});
const all=<T>(page:ChoicePage<T>)=>[...page.primary,...page.more];
export interface FuzzCase {seed:number;game:number;turns:number}
export interface FuzzStats {game:number;gameSeed:number;chooserSeed:number;inputs:number;actions:number;decisions:number;hosts:number;terminated:boolean;drafts:number;multiple:number;all:number;words:number;actors:number;stateHash:string}
export interface FuzzFailureRecord {format:'zxr-fuzz-failure-v1';buildHash:string;case:FuzzCase;gameSeed:number;chooserSeed:number;chooserState:number;turn:number;stage:string;attempt:unknown;cause:string;error?:ActionResolution['error'];acceptedInputs:AcceptedInput[]}
export class FuzzFailure extends Error {
  readonly record:FuzzFailureRecord;
  constructor(record:FuzzFailureRecord){super(`Fuzz game ${record.case.game}, input ${record.turn}, ${record.stage}: ${record.cause}`);this.name='FuzzFailure';this.record=record;}
}
export interface FuzzHooks {createSession?:(game:LoadedGame,seed:number)=>GameSession}
/** Traverse every offered word group, including aliases beyond the first page. */
export function fuzzWords(session:Pick<GameSession,'words'>):WordChoice[]{
  const first=session.words({limit:100}),words=first.groups.flatMap(g=>g.words);
  for(let offset=100;offset<first.totalGroups;offset+=100)words.push(...session.words({offset,limit:100}).groups.flatMap(g=>g.words));
  return words.filter(w=>w.selectable);
}
/** Includes both primary and More choices. No handler probes or invented actions. */
export function fuzzGame(game:LoadedGame,config:FuzzCase,hooks:FuzzHooks={}):FuzzStats {
  for(const value of [config.seed,config.game])if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw new Error('Fuzz seed/game must be uint32');
  if(!Number.isSafeInteger(config.turns)||config.turns<1||config.turns>10000)throw new Error('Fuzz turns must be 1–10000');
  const {gameSeed,chooserSeed}=fuzzSeeds(config.seed,config.game),random=new FuzzRandom(chooserSeed);
  let session:GameSession|undefined,last:ActionResolution|undefined,saved:ZxrSave|undefined,stage='startup',attempt:unknown=null,turn=0,fault:ActionResolution['error'];
  const stats:FuzzStats={game:config.game,gameSeed,chooserSeed,inputs:0,actions:0,decisions:0,hosts:0,terminated:false,drafts:0,multiple:0,all:0,words:0,actors:0,stateHash:''};
  let vocabulary:WordChoice[]|undefined;
  const accepted=(packet:ActionResolution)=>{if(packet.status==='error'||packet.status==='rejected'){fault=packet.error;throw new Error(packet.error?.cause??packet.status);}last=packet;};
  const invariant=()=>{stage='invariants';const before=session!.stateHash();session!.options();session!.observe();validateSessionState(session!);if(session!.stateHash()!==before)throw new Error('options(), observe() or validation changed semantic state');};
  try{
    session=hooks.createSession?.(game,gameSeed)??new GameSession(game,{seed:gameSeed});last=session.opening();invariant();
    while(stats.inputs<config.turns){
      const o=session.observe();if(o.state==='terminal'){stats.terminated=true;break;}
      turn=stats.inputs+1;attempt=null;
      if(o.state==='host'){
        stage='host';const request=last!.host;if(!request)throw new Error('Missing correlated host request');
        let outcome:'success'|'failure'|'cancel'=request.kind==='QUIT'?'success':random.pick(['success','success','failure','cancel'] as const);
        if(request.kind==='RESTORE'&&!saved&&outcome==='success')outcome='failure';
        if(request.kind==='SAVE'&&outcome==='success')saved=structuredClone(request.save!);
        attempt={id:request.id,epoch:request.epoch,revision:request.revision,kind:request.kind,outcome,...(request.kind==='RESTORE'&&outcome==='success'?{save:saved!}:{})};
        accepted(session.completeHost(attempt as Parameters<GameSession['completeHost']>[0]));stats.hosts++;invariant();continue;
      }
      if(o.state==='pending'){
        stage='decision';const option=random.pick(session.options());attempt={expected:{epoch:o.epoch,revision:o.revision},optionId:option.id};accepted(session.execute(attempt as Parameters<GameSession['execute']>[0]));stats.decisions++;stats.inputs++;invariant();continue;
      }
      const before=session.stateHash();stage='menu';const actor=random.pick(session.actors()).actor;if(actor!=='PLAYER'&&actor!==o.perception.actor)stats.actors++;
      const menu=session.menu(actor),category=random.index(10),objects=menu.objects.flatMap(group=>all(group.choices));
      const pools=category<4?[all(menu.exits),objects,all(menu.actions),all(menu.always)]:category<7?[objects,all(menu.actions),all(menu.exits),all(menu.always)]:category<9?[all(menu.actions),all(menu.always),all(menu.exits),objects]:[all(menu.always),all(menu.actions),all(menu.exits),objects];
      const choices=pools.find(pool=>pool.length)!;const choice:MenuChoice=random.pick(choices);let draft:SelectionRequest=structuredClone(choice.draft);attempt=draft;stats.drafts++;
      for(let depth=0;depth<4;depth++){
        stage='selection';attempt=draft;const view=session.selectionMenu(draft);if(view.ready)break;
        if(view.next){
          const choices=all(view.next.choices);if(!choices.length)throw new Error('Offered family has no completion');
          if(view.next.allowAll&&random.index(5)===0){draft={...draft,operands:[...draft.operands,'ALL']};stats.all++;}
          else if(view.next.allowAll&&choices.length>1&&random.index(5)===0){
            const first=random.pick(choices),rest=choices.filter(c=>JSON.stringify(c.operand)!==JSON.stringify(first.operand)&&!(typeof first.operand==='object'&&'pseudo' in first.operand&&typeof c.operand==='object'&&'pseudo' in c.operand)),second=rest.length?random.pick(rest):first;
            draft={...draft,operands:[...draft.operands,first===second?first.operand:[first.operand,second.operand]]};if(first!==second)stats.multiple++;
          }else {const chosen:OperandChoice=random.pick(choices),operand:Operand=random.pick(chosen.spellings);draft={...draft,operands:[...draft.operands,operand]};}
        }else if(view.words){
          const words=vocabulary??=fuzzWords(session);const count=1+random.index(3);
          draft={...draft,words:Array.from({length:count},()=>random.pick(words).dictionaryIndex)};stats.words++;
        }else throw new Error('Incomplete selection has no offered next step');
      }
      stage='browsing purity';if(session.stateHash()!==before)throw new Error('Menu/selection browsing changed semantic state');
      stage='commit';attempt=draft;accepted(session.commitSelection(draft));stats.actions++;stats.inputs++;invariant();
    }
    // A source request at the budget boundary must be acknowledged and validated too.
    if(session.observe().state==='host'){
      stage='final host';const request=last!.host!;const outcome=request.kind==='QUIT'?'success':'failure';attempt={id:request.id,epoch:request.epoch,revision:request.revision,kind:request.kind,outcome};accepted(session.completeHost(attempt as Parameters<GameSession['completeHost']>[0]));stats.hosts++;invariant();
    }
    stats.terminated=session.observe().state==='terminal';stats.stateHash=session.stateHash();return stats;
  }catch(cause){throw new FuzzFailure({format:'zxr-fuzz-failure-v1',buildHash:game.buildHash,case:{...config},gameSeed,chooserSeed,chooserState:random.state,turn,stage,attempt,cause:cause instanceof Error?cause.message:String(cause),...(fault?{error:fault}:{}),acceptedInputs:session?.acceptedInputs()??[]});}
}
export function fuzzGameIndices(games:number,start=0,shard=0,shards=1):number[]{
  if(!Number.isSafeInteger(games)||games<1||!Number.isSafeInteger(start)||start<0||start+games>0x100000000||!Number.isSafeInteger(shards)||shards<1||!Number.isSafeInteger(shard)||shard<0||shard>=shards)throw new Error('Invalid campaign/shard range');
  return Array.from({length:games},(_,i)=>start+i).filter((_,i)=>i%shards===shard);
}
