import { resolve, basename, dirname } from 'node:path';
import { mkdirSync, statSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { analyzeSymbols, BUNDLE_VERSIONS, compileMemory, compileVocabulary, compileWorldMetadata, createBundle, expandMacros, formatDiagnostic, linkMemoryLogic, loadProgram, mapLogicSources, packBundle, runtimeLogic, splitParserLibrary, translateLogic, ZilError } from '../../src/zil/index.ts';
import type { GameBundle, RuntimeSymbols, SymbolAnalysis, MemoryImage } from '../../src/zil/index.ts';
import { sourceFiles } from './program.ts';
import { referenceSymbolLayout } from './symbols.ts';
import { normalizeReferenceProgram } from './reference-program.ts';
export function runtimeSymbols(analysis:SymbolAnalysis,memory:MemoryImage):RuntimeSymbols {
  return {format:'zxr-symbols-v1',symbols:analysis.symbols.map(({referenceAddress,...s})=>s.kind==='word'?{...s,number:memory.words.find(w=>'W?'+w.name===s.name)!.address}:s)};
}
export function compileSourcePath(path:string,options:{symbols?:boolean}={}):GameBundle {
  const absolute=resolve(path),directory=statSync(absolute).isDirectory()?absolute:dirname(absolute),entry=directory===absolute?'zork2.zil':basename(absolute).toLowerCase(),files=sourceFiles(directory);
  if(directory!==resolve('reference/zork2')&&!options.symbols)throw new Error('Only Zork II reference numbering is supported; use --symbols for a source copy.');
  try {
    const program=loadProgram(files,{entry}),expanded=expandMacros(program.forms,program.definitions,program.globals),normalized=normalizeReferenceProgram(expanded.forms),analysis=analyzeSymbols(program,normalized.forms,referenceSymbolLayout());
    if(analysis.diagnostics.length){const d=analysis.diagnostics[0]!;throw new ZilError(d.code,d.message,d.span);}
    const world=compileWorldMetadata(normalized.forms,analysis),vocabulary=compileVocabulary(normalized.forms,analysis),operations=translateLogic(normalized.forms,analysis),memory=compileMemory(normalized.forms,analysis,world,vocabulary,operations.strings),logic=linkMemoryLogic(operations,memory),parser=splitParserLibrary(logic,memory),mapped=mapLogicSources(logic,files,{parser,forms:normalized.forms}),go=logic.routines.find(r=>r.name==='GO')!;
    return createBundle({game:{id:'zork2',title:'Zork II'},versions:BUNDLE_VERSIONS,initialization:{kind:'call-entry',routine:{name:go.name,id:go.id},checkpoint:'pre-GO',rng:{algorithm:'xorshift32-v1',seed:2}},gateRules:[],world,vocabulary,memory,strings:operations.strings,symbols:runtimeSymbols(analysis,memory),logic:runtimeLogic(mapped)},{sources:mapped.sources,report:mapped.report,parser:parser.partition},[{spdx:'MIT',text:readFileSync('reference/zork2/LICENSE','utf8')}]);
  }catch(error){if(error instanceof ZilError)throw new Error(formatDiagnostic(new ZilError(error.code,error.message,{...error.span,file:resolve(directory,error.span.file)}),files.get(error.span.file)));throw error;}
}
export function writeBundle(bundle:GameBundle,path:string){
  const absolute=resolve(path);if(!absolute.endsWith('.zxb'))throw new Error('Bundle output must end in .zxb');
  const bytes=packBundle(bundle),directory=absolute.slice(0,-4),components:Record<string,unknown>={world:bundle.payload.world,logic:bundle.payload.logic,vocabulary:bundle.payload.vocabulary,memory:bundle.payload.memory,strings:bundle.payload.strings,symbols:bundle.payload.symbols,'source-map':bundle.debug.sources};
  mkdirSync(directory,{recursive:true});
  for(const [name,data] of Object.entries(components))writeFileSync(resolve(directory,name+'.zxr.json'),JSON.stringify(data)+'\n');
  for(const license of bundle.licenses)writeFileSync(resolve(directory,'LICENSE-'+license.spdx+'.txt'),license.text);
  writeFileSync(resolve(directory,'translation-report.json'),JSON.stringify(bundle.debug.report,null,2)+'\n');
  const temporary=absolute+'.tmp';try{writeFileSync(temporary,bytes);renameSync(temporary,absolute);}finally{rmSync(temporary,{force:true});}
  return absolute;
}
