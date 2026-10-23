import { runConformance } from './conformance-cli.ts';
try{runConformance('record');}catch(error){console.error(error instanceof Error?error.stack:String(error));process.exitCode=1;}
