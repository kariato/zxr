import { expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,rmSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unpackBundle } from '../src/zil/index.ts';
it('compiles a real .zxb and component JSON, then verifies the packed file through the same CLI',()=>{
  const dir=mkdtempSync(join(tmpdir(),'zxr-compile-'));
  try{const out=join(dir,'zork2.zxb'),text=execFileSync(process.execPath,['bin/zxr.ts','compile','reference/zork2','--out',out],{encoding:'utf8'});expect(text).toContain('412 runtime routines');const b=unpackBundle(readFileSync(out));expect(text).toContain(b.buildHash);
    for(const name of ['world','logic','vocabulary','memory','strings','symbols','source-map'])expect(existsSync(join(dir,'zork2',name+'.zxr.json'))).toBe(true);
    const checked=execFileSync(process.execPath,['bin/zxr.ts','check',out],{encoding:'utf8'});expect(checked).toContain('Bundle verified');expect(checked).toContain(b.buildHash);expect(readFileSync(join(dir,'zork2','LICENSE-MIT.txt'),'utf8')).toBe(readFileSync('reference/zork2/LICENSE','utf8'));
  }finally{rmSync(dir,{recursive:true,force:true});}
},30000);
it('rejects malformed compiler arguments before creating output',()=>{
  for(const args of [[],['--unknown'],['reference/zork2','--out'],['reference/zork2','--symbols','--symbols'],['reference/zork2','--out','a.zxb','--out','b.zxb']]){
    const result=spawnSync(process.execPath,['bin/zxr.ts','compile',...args],{encoding:'utf8'});expect(result.status).toBe(2);expect(result.stderr).toContain('Usage: zxr compile');
  }
});
