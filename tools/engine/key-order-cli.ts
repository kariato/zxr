import { writeFileSync, mkdirSync } from 'node:fs';
import { compileSourcePath } from '../zil/compile.ts';
import { checkKeyOrder } from './key-order.ts';
try{if(process.argv.length!==2)throw new Error('Usage: key-order-cli.ts');const result=checkKeyOrder(compileSourcePath('reference/zork2'));mkdirSync('out/fuzz',{recursive:true});writeFileSync('out/fuzz/key-order.json',JSON.stringify(result,null,2)+'\n');console.log(`Key order: ${result.compilerCases} source compilations, ${result.componentCases} component links, ${result.bundleCases} bundle round trips; byte-identical ${result.buildHash}`);}
catch(cause){console.error(cause instanceof Error?cause.message:String(cause));process.exitCode=1;}
