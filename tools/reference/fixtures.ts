import { readFileSync } from 'node:fs';
import { runReference } from './runner.ts';
import type { ReferenceRun, Summary } from './runner.ts';
import { auditReference } from './audit.ts';

export interface Fixture {
  id: string; kind: 'walkthrough' | 'area' | 'death' | 'timer' | 'special'; prefix: number;
  commands?: string[]; commandFile?: string; description?: string;
  expect?: Partial<Summary>; routines?: string[]; deathPc?: number; contains?: string;
}
export function commandFile(path: string): string[] {
  return readFileSync(path, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && (!s.startsWith('#') || /^#random\s/i.test(s)));
}
export function loadFixtures(): {seed:number; fixtures:Fixture[]} {
  const manifest = JSON.parse(readFileSync('reference/scripts/fixtures.json','utf8'));
  if (manifest.format !== 'zxr-scripts-v1') throw new Error('Unknown script format');
  const ids = new Set<string>();
  for (const f of manifest.fixtures as Fixture[]) {
    if (!/^[a-z0-9-]+$/.test(f.id) || ids.has(f.id)) throw new Error(`Invalid/duplicate fixture: ${f.id}`);
    ids.add(f.id);
  }
  return manifest;
}
export function fixtureCommands(fixture:Fixture): string[] {
  const walkthrough = commandFile('reference/scripts/walkthrough.txt');
  if (fixture.prefix < 0 || fixture.prefix > walkthrough.length || !Number.isInteger(fixture.prefix)) throw new Error('Invalid fixture prefix');
  return [...walkthrough.slice(0,fixture.prefix),...(fixture.commandFile ? commandFile(`reference/scripts/${fixture.commandFile}`) : fixture.commands ?? [])];
}
export function executeFixture(fixture:Fixture, seed:number): ReferenceRun {
  const run = runReference(fixtureCommands(fixture),seed);
  for (const [key,value] of Object.entries(fixture.expect ?? {})) {
    if (run.final[key as keyof Summary] !== value) throw new Error(`${fixture.id}: expected final ${key}=${value}, got ${run.final[key as keyof Summary]}`);
  }
  for (const routine of fixture.routines ?? []) if (!run.routineCoverage.includes(routine)) throw new Error(`${fixture.id}: did not execute ${routine}`);
  if (fixture.deathPc !== undefined && !run.deaths.some(d=>d.pc === fixture.deathPc)) throw new Error(`${fixture.id}: did not hit death site ${fixture.deathPc}`);
  if (fixture.contains && !run.transcript.slice(fixture.prefix+1).join('').includes(fixture.contains)) throw new Error(`${fixture.id}: expected output ${fixture.contains}`);
  return run;
}
export function transcriptText(fixture:Fixture, run:ReferenceRun): string {
  const prefix = fixture.prefix;
  let text = prefix ? `[Setup: replay the first ${prefix} walkthrough commands, seed ${run.interpreter.seed}.]\n\n>` : run.transcript[0]!;
  for (let i=prefix;i<run.commands.length;i++) text += run.commands[i] + '\n' + run.transcript[i+1]!;
  return text + '\n';
}
export function coverageReport(runs:Map<string,ReferenceRun>) {
  const audit = auditReference();
  const timers = audit.interrupts.map(routine=>({routine,fixtures:[...runs].filter(([,run])=>run.routineCoverage.includes(routine)).map(([id])=>id)}));
  const deaths = audit.deathSites.map(site=>({...site,fixtures:[...runs].filter(([,run])=>run.deaths.some(d=>d.pc === site.pc)).map(([id])=>id)}));
  if (timers.some(t=>!t.fixtures.length) || deaths.some(d=>!d.fixtures.length)) throw new Error('Incomplete timer/death coverage');
  return {format:'zxr-reference-coverage-v1',fixtures:runs.size,timers,deaths};
}
