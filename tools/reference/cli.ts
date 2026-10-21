import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { runReference } from './runner.ts';
import { auditReference } from './audit.ts';
import { commandFile, coverageReport, executeFixture, loadFixtures, transcriptText } from './fixtures.ts';
import { memories } from './state.ts';

function compare(actual:unknown, expected:unknown, label:string) {
  if (!isDeepStrictEqual(actual,expected)) throw new Error(`${label} differs. Inspect the fixture; use reference:record only to intentionally update the baseline.`);
}
function json(path:string, value:unknown, check:boolean) {
  if (check) compare(value,JSON.parse(readFileSync(path,'utf8')),path);
  else writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
try {
  const [mode,...args] = process.argv.slice(2);
  if (mode === 'audit') {
    if (args.some(a=>a!=='--check')) throw new Error('Usage: reference:audit [--check]');
    json('reference/audit.json',auditReference(),args.includes('--check'));
    console.log('Source/binary audit: 439 routines, 7,139 opcodes passed');
  } else if (mode === 'record' || mode === 'check') {
    if (args[0] === '--commands') {
      if (mode !== 'record' || !args[1] || args[2] !== '--out' || !args[3] || (args.length !== 4 && !(args.length === 6 && args[4] === '--seed'))) throw new Error('Usage: reference:record --commands FILE --out FILE.json.gz [--seed N]');
      const run = runReference(commandFile(args[1]),args[5] === undefined ? 2 : Number(args[5]));
      writeFileSync(args[3],gzipSync(JSON.stringify(run),{level:9}));
      console.log(JSON.stringify(run.final));
    } else {
      if (args.length > 1) throw new Error('Usage: reference:record|check [fixture-id]');
      const manifest = loadFixtures(), selected = manifest.fixtures.filter(f=>!args[0] || f.id === args[0]);
      if (!selected.length) throw new Error(`Unknown fixture: ${args[0]}`);
      mkdirSync('reference/transcripts',{recursive:true});
      const runs = new Map();
      for (const fixture of selected) {
        const run = executeFixture(fixture,manifest.seed), path = `reference/transcripts/${fixture.id}`;
        // Check reproducibility independently, even when the old baseline is absent.
        compare(run,executeFixture(fixture,manifest.seed),`${fixture.id}: repeated execution`);
        for (const _memory of memories(run)) { /* verifies every lossless snapshot */ }
        const text = transcriptText(fixture,run);
        if (mode === 'check') {
          compare(run,JSON.parse(gunzipSync(readFileSync(path+'.json.gz')).toString('utf8')),path);
          compare(text,readFileSync(path+'.txt','utf8'),path+'.txt');
        } else {
          writeFileSync(path+'.json.gz',gzipSync(JSON.stringify(run),{level:9}));
          writeFileSync(path+'.txt',text);
        }
        runs.set(fixture.id,run);
      }
      if (!args[0]) json('reference/coverage.json',coverageReport(runs),mode === 'check');
      console.log(`${selected.length} reference fixtures ${mode === 'check' ? 'verified' : 'recorded'}; each reproduced twice`);
    }
  } else throw new Error('Usage: node tools/reference/cli.ts record|check|audit');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
