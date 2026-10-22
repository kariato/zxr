import { readFileSync } from 'node:fs';
import type { LoadedGame, GameAction, Operand, Selection } from '../../src/engine/index.ts';
import type { ReferenceRun } from '../reference/runner.ts';
import { memories } from '../reference/state.ts';
import { loadSymbols, STORY } from '../reference/symbols.ts';
const symbols=loadSymbols(),story=readFileSync(STORY);
/** Development-only authoring from ORIGINAL parser snapshots. No parser or oracle
 * enters the runtime; the resulting explicit actions are reviewed fixture data. */
export function authorActions(game:LoadedGame,run:ReferenceRun):GameAction[] {
  const snapshots=[...memories(run)],vocab=game.bundle.payload.vocabulary;
  return run.commands.map((command,input)=>{
    const indices=run.checkpoints.flatMap((c,i)=>c.input===input&&c.kind==='parser-return'?[i]:[]);
    const index=indices.at(-1);if(index===undefined)throw new Error('No parsed action: '+input+' '+command);
    const ram=snapshots[index]!,base=ram.readUInt16BE(12),globals=Object.fromEntries(symbols.globals.map((name,i)=>[name,ram.readUInt16BE(base+2*i)])),parsed=run.checkpoints[index]!.parser!;
    const actor=globals.WINNER===globals.PLAYER?'PLAYER':symbols.objects[globals.WINNER!]!;
    const action=vocab.actions.find(a=>a.number===globals.PRSA);if(!action)throw new Error('No action '+command);
    if(action.name==='WALK'){
      const direction=vocab.directions.find(d=>d.number===globals.PRSO);if(!direction)throw new Error('No walk direction '+command);
      return {kind:'walk',actor,direction:direction.name};
    }
    const lexical=vocab.verbs.find(v=>v.number===ram.readUInt16BE(globals['P-ITBL']!));
    const bytes=[...story.subarray(parsed.syntax,parsed.syntax+8)],row=lexical?.rows.find(r=>JSON.stringify(r.bytes)===JSON.stringify(bytes));
    if(!lexical||!row||row.action.name!==action.name)throw new Error('No syntax '+command+' '+action.name+' lexical '+lexical?.name+' bytes '+bytes);
    const words:string[]=command.toUpperCase().match(/[A-Z0-9-]+/g)??[];
    function operand(id:number):Operand {
      const entity=game.bundle.payload.world.entities.find(e=>e.id===id);if(!entity)throw new Error('No entity '+id+' '+command);
      if(entity.name==='NOT-HERE-OBJECT'){
        const adjectives=words.filter(w=>vocab.words.find(v=>v.name===w)?.roles.adjective);
        const lastNoun=[...words].reverse().find(w=>vocab.words.find(v=>v.name===w)?.roles.object);
        const candidates=game.bundle.payload.world.entities.filter(e=>e.properties.some(p=>p.kind==='words'&&p.property.name==='SYNONYM'&&p.words.some(w=>w.name===lastNoun))&&adjectives.every(a=>e.properties.some(p=>p.kind==='words'&&p.property.name==='SYNONYM'&&p.words.some(w=>w.name===a))||e.properties.some(p=>p.kind==='adjectives'&&p.adjectives.some(w=>w.name===a))));
        if(candidates.length!==1)throw new Error('Missing operand needs reviewed binding '+command+' '+candidates.map(e=>e.name));return operand(candidates[0]!.id);
      }
      if(entity.name==='PSEUDO-OBJECT'){
        const room=game.bundle.payload.world.entities.find(e=>e.id===globals.HERE)!;
        const pseudo=room.properties.flatMap(p=>p.kind==='pseudos'?p.entries:[]).find(p=>words.includes(p.word.name));
        if(!pseudo)throw new Error('No pseudo binding '+command);return {pseudo:{room:room.name,word:pseudo.word.name}};
      }
      const nouns=entity.properties.flatMap(p=>p.kind==='words'&&p.property.name==='SYNONYM'?p.words:[]);
      const adjectives=entity.properties.flatMap(p=>p.kind==='adjectives'?p.adjectives:[]);
      const explicitNoun=[...words].reverse().find(w=>nouns.some(n=>n.name===w));
      const onlyAdjective=adjectives.find(a=>words.some(w=>w.slice(0,6)===a.name.slice(0,6)));
      if(!explicitNoun&&onlyAdjective)return {object:entity.name,adjective:onlyAdjective.name};
      const noun=explicitNoun??nouns[0]?.name;
      if(!noun)throw new Error('No noun '+entity.name+' '+command);
      const adjective=words.find(w=>w!==noun&&adjectives.some(a=>a.name===w));
      return {object:entity.name,noun,...(adjective?{adjective}:{})};
    }
    const selection=(ids:number[],slot:number):Selection|undefined=>{
      if(!row!.slots[slot])return undefined;
      if(words.includes('ALL')&&row!.slots[slot]!.rules.includes('MANY'))return 'ALL';
      const operands=ids.map(operand);if(!operands.length){if(command==='take key')return {object:'KEY',noun:'KEY'};throw new Error('No operands '+input+' '+command);}return operands.length===1?operands[0]:operands;
    };
    const prso=selection(parsed.direct,0),prsi=selection(parsed.indirect,1);
    const common={actor,verb:action.name,lexicalTable:lexical.name,syntax:row.id,...(prso?{prso}:{}),...(prsi?{prsi}:{})};
    if(['SAY','ANSWER','INCANT'].includes(action.name)){
      const speech=command.match(/"([^"]+)"/);if(!speech||Array.isArray(prso)||prso==='ALL'||prsi)throw new Error('Unbound speech '+command);
      return {...common,kind:'say',words:speech[1]!.toUpperCase().split(/\s+/),...(prso?{prso:prso as Operand}:{})} as GameAction;
    }
    return {...common,kind:'act'} as GameAction;
  });
}
/** Authored period-separated original inputs become separate structured choices.
 * Quoted clauses are not split. Original grouping is retained for baseline checks. */
export function splitCommands(commands:readonly string[]):{commands:string[];groups:number[][]} {
  const flat:string[]=[],groups:number[][]=[];
  for(const [input,command] of commands.entries()){
    // ADAPT-002/011 excludes orphan clarification input. The pinned solve's
    // input 142 is an ambiguous TAKE KEY, answered by a new command, with no
    // game action or tick. Its exact original output/state is checked by replay.
    if(input===142&&command==='take key'||input===224&&command==='take off crown'){groups.push([]);continue;}
    let quoted=false,start=0;const parts:string[]=[];
    for(let n=0;n<command.length;n++){if(command[n]==='"')quoted=!quoted;if(command[n]==='.'&&!quoted){parts.push(command.slice(start,n).trim());start=n+1;}}
    parts.push(command.slice(start).trim());if(parts.some(p=>!p))throw new Error('Empty structured clause');
    groups.push(parts.map(p=>{flat.push(p);return flat.length-1;}));
  }return {commands:flat,groups};
}
