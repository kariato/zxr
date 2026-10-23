import { afterAll, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { packBundle } from '../src/zil/bundle.ts';
const directory=mkdtempSync(join(tmpdir(),'zxr-terminal-')),path=join(directory,'game.zxb');writeFileSync(path,packBundle(compileSourcePath('reference/zork2')));
afterAll(()=>rmSync(directory,{recursive:true,force:true}));
it('plays twenty turns through the executable terminal CLI using only numbered choices',()=>{
  const result=spawnSync(process.execPath,['bin/zxr.ts','play',path,'--save',join(directory,'save.json')],{input:'4\n3\n1\n'.repeat(20),encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('ZORK II');expect(result.stdout).toContain('Moves: 20');
  expect(result.stdout.match(/> Look\n/g)).toHaveLength(20);expect(result.stdout).not.toContain('not implemented');
});
it('rejects unlisted input without executing a command and exits cleanly on EOF',()=>{
  const result=spawnSync(process.execPath,['bin/zxr.ts','play',path],{input:'look\n0\n99999999\n',encoding:'utf8',timeout:45000});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout.match(/Choose one of the listed numbers\./g)).toHaveLength(3);
  expect(result.stdout).not.toContain('Moves: 1');
});
it('writes a primitive SAVE to the selected file and removes owned temporary files',()=>{
  const save=join(directory,'saved','game.json');
  const result=spawnSync(process.execPath,['bin/zxr.ts','play',path,'--save',save],{input:'4\n4\n1\n',encoding:'utf8',timeout:45000});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout).not.toContain('Storage:');
  expect(JSON.parse(readFileSync(save,'utf8')).kind).toBe('primitive-save');expect(readdirSync(join(directory,'saved'))).toEqual(['game.json']);
});
it('validates CLI flags, seed bounds and corrupt story bundles before entering a player loop',()=>{
  for(const args of [['--unknown'],['--seed','-1'],['--seed','4294967296'],['--save'],['--save','a','--save','b']]){
    const result=spawnSync(process.execPath,['bin/zxr.ts','play',...args],{encoding:'utf8'});expect(result.status).toBe(2);expect(result.stderr).toContain('Usage: zxr play');
  }
  const bad=join(directory,'bad.zxb');writeFileSync(bad,'{}');const result=spawnSync(process.execPath,['bin/zxr.ts','play',bad],{encoding:'utf8'});expect(result.status).toBe(1);expect(result.stderr).toContain('bundle');
});
