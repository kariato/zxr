#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { GameSession, loadGame } from '../src/engine/index.ts';
import { runTerminal } from '../tools/player/terminal.ts';
import { packBundle, unpackBundle } from '../src/zil/index.ts';
import { compileSourcePath, writeBundle } from '../tools/zil/compile.ts';
import { checkSourcePath } from '../tools/zil/check.ts';
const [command,...args]=process.argv.slice(2);
if (command === '--help' || command === '-h' || !command) {
  console.log('Usage: zxr <compile|play|check> [path]\nzxr compile <source-directory|entry.zil> [--symbols] [--out file.zxb]\nzxr play [game.zxb] [--save file.json] [--seed uint32]: numbered choices; defaults to Zork II and out/zork2.save.json\nzxr check [--symbols] [entry.zil|source-directory|game.zxb]: check a bundle, or read, load and expand ZIL (defaults to reference/zork2). Zork II symbol checks run automatically for reference/zork2; --symbols opts another path into that numbering layout.');
} else if (command==='check') {
  const paths=args.filter(a=>a!=='--symbols'),flags=args.filter(a=>a==='--symbols');
  if(paths.length>1||flags.length>1||paths.some(p=>p.startsWith('-'))) {console.error('Usage: zxr check [--symbols] [entry.zil|source-directory]');process.exitCode=2;}
  else try {if(paths[0]?.endsWith('.zxb')){if(flags.length)throw new Error('--symbols is only for source input');const b=unpackBundle(readFileSync(paths[0]));console.log(`Bundle verified: ${b.payload.game.title}; ${b.buildHash}; ${b.payload.logic.routines.length} runtime routines.`);}else console.log(checkSourcePath(paths[0],{symbols:flags.length?true:undefined}));} catch(error) {console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
} else if (command==='compile') {
  let path:string|undefined,out:string|undefined,symbols=false,valid=true;
  for(let i=0;i<args.length;i++){const a=args[i]!;if(a==='--out'&&!out&&args[i+1]&&!args[i+1]!.startsWith('-'))out=args[++i];else if(a==='--symbols'&&!symbols)symbols=true;else if(!a.startsWith('-')&&!path)path=a;else valid=false;}
  if(!valid||!path){console.error('Usage: zxr compile <source-directory|entry.zil> [--symbols] [--out file.zxb]');process.exitCode=2;}
  else try {const bundle=compileSourcePath(path,{symbols}),output=writeBundle(bundle,out ?? 'out/'+bundle.payload.game.id+'.zxb');console.log(`Compiled ${bundle.payload.game.title}: ${output}\nBuild: ${bundle.buildHash}\n${bundle.payload.logic.routines.length} runtime routines; ${bundle.payload.memory.bytes.length} memory bytes; schema and references verified.`);}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
} else if (command==='play') {
  let path:string|undefined,save='out/zork2.save.json',seed:number|undefined,valid=true,hasSave=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i]!;
    if(arg==='--save'&&!hasSave&&args[i+1]&&!args[i+1]!.startsWith('-')){save=args[++i]!;hasSave=true;}
    else if(arg==='--seed'&&seed===undefined&&/^[0-9]+$/.test(args[i+1]??'')){seed=Number(args[++i]);if(!Number.isSafeInteger(seed)||seed>4294967295)valid=false;}
    else if(!arg.startsWith('-')&&!path)path=arg;else valid=false;
  }
  if(!valid){console.error('Usage: zxr play [game.zxb] [--save file.json] [--seed uint32]');process.exitCode=2;}
  else try{const game=loadGame(path?readFileSync(path):packBundle(compileSourcePath('reference/zork2')));await runTerminal(new GameSession(game,{seed}),process.stdin,process.stdout,save);}
  catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
} else {
  console.error(`Unknown command: ${command}. Run zxr --help.`);
  process.exitCode = 2;
}
