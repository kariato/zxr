import { execFileSync, spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceFiles } from '../tools/zil/program.ts';

it('runs the executable CLI help', () => {
  expect(execFileSync(process.execPath, ['bin/zxr.ts', '--help'], { encoding: 'utf8' })).toContain('compile|play|check');
});
it.each(['compile', 'play'])('does not claim %s is implemented', command => {
  const result = spawnSync(process.execPath, ['bin/zxr.ts', command], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('not implemented');
});
it('checks the whole Zork II source project through the CLI',()=>{
  const text=execFileSync(process.execPath,['bin/zxr.ts','check','reference/zork2'],{encoding:'utf8'});
  expect(text).toContain('439 routines');expect(text).toContain('269 syntax entries');expect(text).toContain('compilation is not implemented');
  expect(text).toContain('Resolved 11901 symbol references');
  expect(text).toContain('World metadata: 86 rooms, 165 objects');
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
