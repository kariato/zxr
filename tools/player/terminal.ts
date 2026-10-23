import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type { GameSession, ZxrSave } from '../../src/engine/index.ts';
import { TextPlayer } from '../../src/player/controller.ts';
import { resolveHost } from '../../src/player/host.ts';
export async function runTerminal(session:GameSession,input:Readable,output:Writable,savePath:string){
  const player=new TextPlayer(session),lines=createInterface({input,crlfDelay:Infinity});let shown=0,prefix='',offset=0;
  let commands:(()=>void)[]=[];
  const print=()=>{
    for(const entry of player.transcript.slice(shown)){if(entry.command)output.write('\n> '+entry.command+'\n');output.write(entry.text+'\n');}shown=player.transcript.length;
    const view=player.view();output.write(`\n${view.title} | Moves: ${session.observe().moves}\n`);commands=[];
    const add=(label:string,action:()=>void)=>{commands.push(action);output.write(`${commands.length}. ${label}\n`);};
    for(const c of view.choices)add(c.label,()=>player.choose(c.key));
    if(view.words){
      const words=session.words({prefix,offset,limit:12});output.write(`Words starting with ${prefix||'(any)'}\n`);
      for(const word of words.groups.flatMap(g=>g.words).filter(w=>w.selectable))add(word.label,()=>player.addWord(word.dictionaryIndex));
      for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')add('Filter: '+prefix+letter,()=>{if(prefix.length<32){prefix+=letter;offset=0;}});
      if(prefix)add('Delete filter letter',()=>{prefix=prefix.slice(0,-1);offset=0;});
      if(offset)add('Previous words',()=>{offset=Math.max(0,offset-12);});
      if(offset+12<words.totalGroups)add('Next words',()=>{offset+=12;});
    }
    if(view.state!=='terminal')output.write('Choose a number (Ctrl-D to leave): ');
    return view.state!=='terminal';
  };
  const store={read:()=>JSON.parse(readFileSync(savePath,'utf8')) as ZxrSave,write:(save:ZxrSave)=>{
    mkdirSync(dirname(savePath),{recursive:true});const directory=mkdtempSync(join(dirname(savePath),'.zxr-save-')),temp=join(directory,'save.json');
    try{writeFileSync(temp,JSON.stringify(save)+'\n');renameSync(temp,savePath);}finally{rmSync(directory,{recursive:true,force:true});}
  }};
  try{
    if(!print())return;
    for await(const line of lines){
      const index=/^[1-9][0-9]*$/.test(line.trim())?Number(line.trim())-1:-1;
      if(!commands[index]){output.write('\nChoose one of the listed numbers.\n');}
      else try{commands[index]!();const error=resolveHost(player,store);if(error)output.write('\nStorage: '+error+'\n');}catch(error){output.write('\n'+(error instanceof Error?error.message:String(error))+'\n');}
      if(!print())break;
    }
  }finally{lines.close();}
}
