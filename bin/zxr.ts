#!/usr/bin/env node
import { checkSourcePath } from '../tools/zil/check.ts';
const [command,path,...extra]=process.argv.slice(2);
if (command === '--help' || command === '-h' || !command) {
  console.log('Usage: zxr <compile|play|check> [path]\nzxr check [entry.zil|source-directory]: read, load and expand ZIL (defaults to reference/zork2).');
} else if (command==='check') {
  if(extra.length || path?.startsWith('-')) {console.error('Usage: zxr check [entry.zil|source-directory]');process.exitCode=2;}
  else try {console.log(checkSourcePath(path));} catch(error) {console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
} else if (['compile', 'play'].includes(command)) {
  console.log(`zxr ${command}: not implemented (phase 1)`);
  process.exitCode = 1;
} else {
  console.error(`Unknown command: ${command}. Run zxr --help.`);
  process.exitCode = 2;
}
