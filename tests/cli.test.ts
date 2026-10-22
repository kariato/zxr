import { execFileSync, spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceFiles } from '../tools/zil/program.ts';

it('runs the executable CLI help', () => {
  expect(execFileSync(process.execPath, ['bin/zxr.ts', '--help'], { encoding: 'utf8' })).toContain('compile|play|check');
});
it.each(['play'])('does not claim %s is implemented', command => {
  const result = spawnSync(process.execPath, ['bin/zxr.ts', command], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('not implemented');
});
it('checks the whole Zork II source project through the CLI',()=>{
  const text=execFileSync(process.execPath,['bin/zxr.ts','check','reference/zork2'],{encoding:'utf8'});
  expect(text).toContain('439 routines');expect(text).toContain('269 syntax entries');expect(text).toContain('Use zxr compile');
  expect(text).toContain('Resolved 11901 symbol references');
  expect(text).toContain('World metadata: 86 rooms, 165 objects, 220 encoded exits');
  expect(text).toContain('Vocabulary: 269 syntax rows, 689 words');
  expect(text).toContain('Memory: 19882 bytes, 45 source tables');
  expect(text).toContain('Parser split: 42 classified, 414 retained routines plus adapter');
  expect(text).toContain('Source maps: 26503 sites, 0 untranslated constructs');
  expect(text).toContain('Logic operations: 439 routines, 0 deferred memory/address sites, 1342 strings');
});
it('reports symbol errors in a source copy without changing the vendored game',()=>{
  const directory=mkdtempSync(join(tmpdir(),'zxr-symbols-'));
  try {
    const sources=sourceFiles();
    for(const [file,text] of sources)writeFileSync(join(directory,file),file==='gclock.zil'?text.replace('<SETG C-INTS','<SETG CLOCK-TYPO'):text);
    const result=spawnSync(process.execPath,['bin/zxr.ts','check','--symbols',directory],{encoding:'utf8'});
    expect(result.status).toBe(1);expect(result.stderr).toContain(join(directory,'gclock.zil')+':');
    expect(result.stderr).toContain('ZIL005: Undefined symbol CLOCK-TYPO');expect(result.stderr).toContain('^');
    writeFileSync(join(directory,'gclock.zil'),sources.get('gclock.zil')!);
    writeFileSync(join(directory,'2dungeon.zil'),sources.get('2dungeon.zil')!.replace('(DESC "lamp")','(DESC "lamp" "extra")'));
    const world=spawnSync(process.execPath,['bin/zxr.ts','check','--symbols',directory],{encoding:'utf8'});
    expect(world.status).toBe(1);expect(world.stderr).toContain(join(directory,'2dungeon.zil')+':');expect(world.stderr).toContain('ZIL006: DESC requires 1 value');expect(world.stderr).toContain('^');
    const exitSource=sources.get('2dungeon.zil')!.replace('(EAST TO TEA-ROOM)','(EAST TO LAMP)');
    expect(exitSource).not.toBe(sources.get('2dungeon.zil'));
    writeFileSync(join(directory,'2dungeon.zil'),exitSource);
    const exit=spawnSync(process.execPath,['bin/zxr.ts','check','--symbols',directory],{encoding:'utf8'});
    expect(exit.status).toBe(1);expect(exit.stderr).toContain(join(directory,'2dungeon.zil')+':');expect(exit.stderr).toContain('ZIL007: Exit destination must be a room');expect(exit.stderr).toContain('^');
    writeFileSync(join(directory,'2dungeon.zil'),sources.get('2dungeon.zil')!);
    const syntaxSource=sources.get('gsyntax.zil')!.replace('<SYNTAX VERBOSE = V-VERBOSE>','<SYNTAX VERBOSE TO = V-VERBOSE>');
    expect(syntaxSource).not.toBe(sources.get('gsyntax.zil'));
    writeFileSync(join(directory,'gsyntax.zil'),syntaxSource);
    const syntax=spawnSync(process.execPath,['bin/zxr.ts','check','--symbols',directory],{encoding:'utf8'});
    expect(syntax.status).toBe(1);expect(syntax.stderr).toContain(join(directory,'gsyntax.zil')+':');expect(syntax.stderr).toContain('ZIL008: Preposition requires an object slot');expect(syntax.stderr).toContain('^');
    writeFileSync(join(directory,'gsyntax.zil'),sources.get('gsyntax.zil')!);
    const logicSource=sources.get('2dungeon.zil')!.replace('<SETG LIT T>','<SETG LIT>');expect(logicSource).not.toBe(sources.get('2dungeon.zil'));
    writeFileSync(join(directory,'2dungeon.zil'),logicSource);
    const logic=spawnSync(process.execPath,['bin/zxr.ts','check','--symbols',directory],{encoding:'utf8'});
    expect(logic.status).toBe(1);expect(logic.stderr).toContain(join(directory,'2dungeon.zil')+':');expect(logic.stderr).toContain('ZIL009: SETG expects 2 argument(s), got 1');expect(logic.stderr).toContain('^');
    writeFileSync(join(directory,'2dungeon.zil'),sources.get('2dungeon.zil')!);
    const outputSource=sources.get('gverbs.zil')!.replace('<CRLF>','<CRLF 1>');expect(outputSource).not.toBe(sources.get('gverbs.zil'));
    writeFileSync(join(directory,'gverbs.zil'),outputSource);
    const output=spawnSync(process.execPath,['bin/zxr.ts','check','--symbols',directory],{encoding:'utf8'});
    expect(output.status).toBe(1);expect(output.stderr).toContain(join(directory,'gverbs.zil')+':');expect(output.stderr).toContain('ZIL009: CRLF expects 0 argument(s), got 1');expect(output.stderr).toContain('^');
    writeFileSync(join(directory,'gverbs.zil'),sources.get('gverbs.zil')!);
    const memorySource=sources.get('gparser.zil')!.replace('<REST .SYN>','<REST>');expect(memorySource).not.toBe(sources.get('gparser.zil'));
    writeFileSync(join(directory,'gparser.zil'),memorySource);
    const memory=spawnSync(process.execPath,['bin/zxr.ts','check','--symbols',directory],{encoding:'utf8'});
    expect(memory.status).toBe(1);expect(memory.stderr).toContain(join(directory,'gparser.zil')+':');expect(memory.stderr).toContain('ZIL011: REST expects 1..2 argument(s), got 0');expect(memory.stderr).toContain('^');
    writeFileSync(join(directory,'gparser.zil'),sources.get('gparser.zil')!);
    const parserSource=sources.get('gclock.zil')!.replace('<APPLY <GET .C ,C-RTN>>','<APPLY .C>');expect(parserSource).not.toBe(sources.get('gclock.zil'));
    writeFileSync(join(directory,'gclock.zil'),parserSource);
    const parser=spawnSync(process.execPath,['bin/zxr.ts','check','--symbols',directory],{encoding:'utf8'});
    expect(parser.status).toBe(1);expect(parser.stderr).toContain(join(directory,'gclock.zil')+':');expect(parser.stderr).toContain('ZIL012: Unclassified indirect call in CLOCKER');expect(parser.stderr).toContain('^');
  } finally {rmSync(directory,{recursive:true,force:true});}
});
it('rejects unknown or repeated check flags',()=>{
  for(const args of [['--unknown'],['--symbols','--symbols']]){
    const result=spawnSync(process.execPath,['bin/zxr.ts','check',...args],{encoding:'utf8'});expect(result.status).toBe(2);expect(result.stderr).toContain('Usage: zxr check');
  }
});
it('prints the exact path, line and column of a broken source file',()=>{
  const directory=mkdtempSync(join(tmpdir(),'zxr-reader-'));
  try {
    const path=join(directory,'broken.zil');writeFileSync(path,'<ROUTINE BAD ()\n  (A]>');
    const result=spawnSync(process.execPath,['bin/zxr.ts','check',path],{encoding:'utf8'});
    expect(result.status).toBe(1);expect(result.stderr).toContain(`${path}:2:5: ZIL002`);expect(result.stderr).toContain('    ^');
    writeFileSync(path,'<ROUTINE BAD ()\n<TELL N>>');
    const expanded=spawnSync(process.execPath,['bin/zxr.ts','check',path],{encoding:'utf8'});
    expect(expanded.status).toBe(1);expect(expanded.stderr).toContain(`${path}:2:7: ZIL004: TELL: indicator at end`);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
