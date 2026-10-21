import { resolve,basename,dirname } from 'node:path';
import { statSync } from 'node:fs';
import { loadProgram,expandMacros,read,head,formatDiagnostic,ZilError,analyzeSymbols,compileWorldMetadata } from '../../src/zil/index.ts';
import { sourceFiles } from './program.ts';
import { referenceSymbolLayout } from './symbols.ts';
import { normalizeReferenceProgram } from './reference-program.ts';
export function checkSourcePath(path='reference/zork2',options:{symbols?:boolean}={}):string {
  const absolute=resolve(path),directory=statSync(absolute).isDirectory()?absolute:dirname(absolute);
  const entry=directory===absolute?'zork2.zil':basename(absolute).toLowerCase();
  const sources=sourceFiles(directory);
  try {
    for (const [file,text] of sources) read(text,file);
    const program=loadProgram(sources,{entry}),expanded=expandMacros(program.forms,program.definitions,program.globals);
    const symbols=options.symbols ?? (directory===resolve('reference/zork2')&&entry==='zork2.zil');
    let detail='Reader/macro checks only; compilation is not implemented.';
    if(symbols){
      const normalized=normalizeReferenceProgram(expanded.forms),analysis=analyzeSymbols(program,normalized.forms,referenceSymbolLayout());
      if(analysis.diagnostics.length)throw new Error(analysis.diagnostics.map(d=>formatDiagnostic(new ZilError(d.code,d.message,{...d.span,file:resolve(directory,d.span.file)}),sources.get(d.span.file))).join('\n'));
      const world=compileWorldMetadata(normalized.forms,analysis);
      detail=`Resolved ${analysis.references.length} symbol references with the Zork II reference layout; ${normalized.normalizations.length} guarded normalization(s). World metadata: ${world.counts.rooms} rooms, ${world.counts.objects} objects. Full JSON compilation is not implemented.`;
    }
    const count=(kinds:string[])=>program.forms.filter(n=>kinds.includes(head(n) ?? '')).length;
    return `ZIL check passed: ${sources.size} files read, ${program.files.length} loaded; ${count(['ROUTINE'])} routines, ${count(['OBJECT','ROOM'])} rooms/objects, ${count(['GLOBAL'])} globals, ${count(['SYNTAX'])} syntax entries.\nExpanded ${Object.values(expanded.counts).reduce((a,b)=>a+b,0)} macro calls. ${detail}`;
  } catch(error) {
    if(error instanceof ZilError) {
      const mapped=new ZilError(error.code,error.message,{...error.span,file:resolve(directory,error.span.file)});
      throw new Error(formatDiagnostic(mapped,sources.get(error.span.file)));
    }
    throw error;
  }
}
