import { resolve,basename,dirname } from 'node:path';
import { statSync } from 'node:fs';
import { loadProgram,expandMacros,read,head,formatDiagnostic,ZilError } from '../../src/zil/index.ts';
import { sourceFiles } from './program.ts';
export function checkSourcePath(path='reference/zork2'):string {
  const absolute=resolve(path),directory=statSync(absolute).isDirectory()?absolute:dirname(absolute);
  const entry=directory===absolute?'zork2.zil':basename(absolute).toLowerCase();
  const sources=sourceFiles(directory);
  try {
    for (const [file,text] of sources) read(text,file);
    const program=loadProgram(sources,{entry}),expanded=expandMacros(program.forms,program.definitions,program.globals);
    const count=(kinds:string[])=>program.forms.filter(n=>kinds.includes(head(n) ?? '')).length;
    return `ZIL check passed: ${sources.size} files read, ${program.files.length} loaded; ${count(['ROUTINE'])} routines, ${count(['OBJECT','ROOM'])} rooms/objects, ${count(['GLOBAL'])} globals, ${count(['SYNTAX'])} syntax entries.\nExpanded ${Object.values(expanded.counts).reduce((a,b)=>a+b,0)} macro calls. Reader/macro checks only; compilation is not implemented.`;
  } catch(error) {
    if(error instanceof ZilError) {
      const mapped=new ZilError(error.code,error.message,{...error.span,file:resolve(directory,error.span.file)});
      throw new Error(formatDiagnostic(mapped,sources.get(error.span.file)));
    }
    throw error;
  }
}
