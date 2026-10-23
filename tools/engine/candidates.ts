import { buildCandidateCatalog, generateCandidates } from '../../src/engine/candidates.ts';
import { loadGame } from '../../src/engine/bundle-loader.ts';
import type { LoadedGame } from '../../src/engine/bundle-loader.ts';
import { packBundle } from '../../src/zil/bundle.ts';
import { compileSourcePath } from '../zil/compile.ts';

/** Complete membership table plus sparse nonzero ranks. Missing ranks mean zero, never exclusion. */
export function recordCandidates(game:LoadedGame=loadGame(packBundle(compileSourcePath('reference/zork2')))) {
  const catalog=buildCandidateCatalog(game);
  const objects=game.bundle.payload.world.entities.filter(e=>e.kind==='object');
  const profiles=new Map(catalog.profiles.map(p=>[p.routine,p.actions]));
  return {
    format:'zxr-candidate-audit-v1',buildHash:game.buildHash,
    policy:{membership:'Every family applies to every supplied operand; ranks never filter.',rank:'actor/room/operand/container/pseudo mention: 100; preaction binding: 10; default binding: 1; matching scope hint: 1.',
      analysis:'Conservative transitive action references, no branch execution. PERFORM is a dispatch boundary. Dynamic writes and unresolved APPLY sites are explicit.',
      scope:'Initial object parents are used only for these static tables. Runtime callers supply current parents and scope in phase 4.2.'},
    families:catalog.families,directions:catalog.directions,
    objects:objects.map(object=>{
      const set=generateCandidates(game,catalog,{actor:'ADVENTURER',room:'INSIDE-BARROW',operands:[object.name],parents:{[object.name]:object.parent?.name??null}});
      return {object:object.name,candidates:'all-families',
        // Factor common actor/room/preaction/default scores out of the object table.
        ranks:set.families.flatMap(f=>f.operands.flatMap((list,slot)=>{
          const operand=list[0]!;return operand.score?[{family:f.id,slot,score:operand.score,evidence:operand.evidence}]:[];
        }))};
    }),
    handlers:catalog.handlers.map(h=>({...h,actions:profiles.get(h.routine)??[]})),
    dynamicAssignments:catalog.dynamicAssignments,unresolvedApplies:catalog.unresolvedApplies,
  };
}
