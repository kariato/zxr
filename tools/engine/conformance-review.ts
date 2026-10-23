import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import type { LoadedGame } from '../../src/engine/index.ts';
import { logicExpressions } from '../../src/zil/logic.ts';
import { hashJson } from '../../src/zil/integrity.ts';
import { loadFixtures } from '../reference/fixtures.ts';
import { runReference } from '../reference/runner.ts';
import { sha256, STORY, STORY_SHA256 } from '../reference/symbols.ts';

export interface TextDisposition {ledger:string;caseId:string;input:number;command:string;referenceText:string;engineText:string}
export interface Differences {format:'zxr-conformance-differences-v1';text:TextDisposition[]}
export function ledgerIds(ledger:string):string[]{
  const ids=[...ledger.matchAll(/^\| ([A-Z]+-[0-9]{3}) \|/gm)].map(m=>m[1]!);
  if(!ids.length||new Set(ids).size!==ids.length)throw new Error('Ledger IDs must be present and unique');return ids;
}
/** The only reviewed text exception is a single binary string alias. No generic
 * caller-provided ledger ID, substring tolerance or extra exception is accepted. */
export function validateDifferences(input:unknown,ledger:string):Differences {
  const ids=ledgerIds(ledger),record=input as Differences;
  if(!record||record.format!=='zxr-conformance-differences-v1'||Object.keys(record).sort().join(',')!=='format,text'||!Array.isArray(record.text)||record.text.length!==1)throw new Error('Unreviewed conformance text exception coverage');
  const item=record.text[0]!;
  if(!item||Object.keys(item).sort().join(',')!=='caseId,command,engineText,input,ledger,referenceText'||item.ledger!=='SRC-013'||!ids.includes(item.ledger)||item.caseId!=='death-8b33'||item.input!==38||item.command!=='play robot')throw new Error('Unreviewed conformance text exception identity');
  const golden=JSON.parse(gunzipSync(readFileSync('reference/transcripts/death-8b33.json.gz')).toString('utf8'));
  const original=golden.transcript[39] as string,prefix='Pushing the ',offset=original.indexOf('\n'+prefix+'\n')+1;
  if(golden.commands[38]!==item.command||offset<=0||original.indexOf(prefix,offset+prefix.length)!==-1||item.referenceText!==original||item.engineText!==original.slice(0,offset)+original.slice(offset+prefix.length))throw new Error('SRC-013 full texts differ from reviewed binary string alias');
  return record;
}
export function loadDifferences():Differences{return validateDifferences(JSON.parse(readFileSync('reference/conformance-differences.json','utf8')),readFileSync('games/zork2/ledger.md','utf8'));}
interface Evidence {format:string;buildHash:string;cases:{id:string;adaptations:{kind:string}[];textDifferences:{input:number;ledger:string;referenceHash:string;engineHash:string}[]}[]}
export function conformanceReview(game:LoadedGame,summary:Evidence=JSON.parse(readFileSync('reference/conformance.json','utf8')),ledger=readFileSync('games/zork2/ledger.md','utf8'),differences:unknown=JSON.parse(readFileSync('reference/conformance-differences.json','utf8'))){
  const ids=ledgerIds(ledger),policy=validateDifferences(differences,ledger),item=policy.text[0]!;
  for(const id of ['REF-001','REF-002','REF-003','SRC-011','SRC-013','SRC-014','RNG-001','HOST-001','HOST-002'])if(!ids.includes(id))throw new Error('Missing reviewed decision '+id);
  if(summary.format!=='zxr-conformance-v1'||summary.buildHash!==game.buildHash||!Array.isArray(summary.cases)||summary.cases.length!==75||!isDeepStrictEqual(summary.cases.map(c=>c.id),loadFixtures().fixtures.map(f=>f.id)))throw new Error('Review requires current complete conformance evidence');
  const mappings:Record<string,string>={'excluded-typed-input':'ADAPT-002','separate-structured-choices':'ADAPT-012','orphan-protocol':'ADAPT-012','canonical-actor-spelling':'ADAPT-015'};
  const adaptations:Record<string,number>={};
  for(const row of summary.cases)for(const adaptation of row.adaptations){const id=mappings[adaptation.kind];if(!id||!ids.includes(id))throw new Error('Unreviewed input adaptation '+adaptation.kind);adaptations[id]=(adaptations[id]??0)+1;}
  const exceptions=summary.cases.flatMap(row=>row.textDifferences.map(d=>({caseId:row.id,...d})));
  const expected=[{caseId:item.caseId,input:item.input,ledger:item.ledger,referenceHash:hashJson(item.referenceText),engineHash:hashJson(item.engineText)}];
  if(!isDeepStrictEqual(exceptions,expected))throw new Error('Conformance evidence has unreviewed text differences');
  const golden=JSON.parse(gunzipSync(readFileSync('reference/transcripts/death-8b33.json.gz')).toString('utf8'));
  if(hashJson(runReference(golden.commands,golden.interpreter.seed))!==hashJson(golden))throw new Error('SRC-013 fresh binary replay differs from frozen evidence');
  const files=['reference/zork2/gverbs.zil','reference/zork2/gverbs.zap','reference/zork2/zork2str.zap'],texts=files.map(file=>readFileSync(file,'utf8'));
  const sourceRoutine=game.bundle.payload.logic.routines.find(r=>r.name==='V-PLAY')!,sourceBody=texts[0]!.slice(sourceRoutine.source.start.offset,sourceRoutine.source.end.offset),assemblyBody=texts[1]!.match(/\.FUNCT\s+V-PLAY\b([\s\S]*?)(?=\n\s*\.FUNCT|$)/)?.[1];
  if(!sourceBody.includes('<JIGS-UP "">')||!assemblyBody?.includes('CALL\tJIGS-UP,STR?174')||!texts[2]!.includes('.GSTR STR?174,"Pushing the "')||sha256(readFileSync(STORY))!==STORY_SHA256)throw new Error('SRC-013 source/assembly/binary evidence changed');
  const routine=game.bundle.payload.logic.routines.find(r=>r.name==='V-PLAY')!,calls=[...logicExpressions(routine)].filter(e=>e.op==='call'&&e.routine.name==='JIGS-UP');
  const call=calls[0],argument=call?.op==='call'?call.args[0]:undefined;
  if(calls.length!==1||argument?.op!=='string'||game.bundle.payload.strings.entries.find(s=>s.id===argument.handle)?.text!=='')throw new Error('V-PLAY no longer preserves the source empty string');
  return {format:'zxr-conformance-review-v1',reviewedOn:'2026-10-23',buildHash:game.buildHash,ledgerHash:hashJson(ledger),ledgerIds:ids,conformanceHash:hashJson(summary),policyHash:hashJson(policy),goldenHash:hashJson(golden),sourceEvidence:files.map((file,i)=>({file,sha256:sha256(texts[i]!)})),storyHash:STORY_SHA256,adaptations,exceptions,decision:'Retain SRC-013 source empty string; apply SRC-014 guarded CLIMB membership bound correction; keep REF-001 tree repair, REF-003/RNG-001 tape/native distinction and ADAPT input policies. No additional state, text or RNG tolerance.'};
}
