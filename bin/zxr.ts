#!/usr/bin/env node
import { checkSourcePath } from '../tools/zil/check.ts';
const [command,...args]=process.argv.slice(2);
if (command === '--help' || command === '-h' || !command) {
  console.log('Usage: zxr <compile|play|check> [path]\nzxr check [--symbols] [entry.zil|source-directory]: read, load and expand ZIL (defaults to reference/zork2). Zork II symbol checks run automatically for reference/zork2; --symbols opts another path into that numbering layout.');
} else if (command==='check') {
  const paths=args.filter(a=>a!=='--symbols'),flags=args.filter(a=>a==='--symbols');
  if(paths.length>1||flags.length>1||paths.some(p=>p.startsWith('-'))) {console.error('Usage: zxr check [--symbols] [entry.zil|source-directory]');process.exitCode=2;}
  else try {console.log(checkSourcePath(paths[0],{symbols:flags.length?true:undefined}));} catch(error) {console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
} else if (['compile', 'play'].includes(command)) {
  console.log(`zxr ${command}: not implemented (${command==='compile'?'phase 2 in progress':'engine phase pending'})`);
  process.exitCode = 1;
} else {
  console.error(`Unknown command: ${command}. Run zxr --help.`);
  process.exitCode = 2;
}
