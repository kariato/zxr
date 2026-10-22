/** Explicit testing/debug entry point. Never re-export from the player engine API.
 * Revealed data is for tests and developer tools, not UI observations/options. */
import { GameSession } from './session.ts';
import type { SessionOptions } from './session.ts';
import { Interpreter } from './interpreter.ts';
import { TurnLoop } from './turn-loop.ts';
import { WorldState } from './world-state.ts';
import type { LoadedGame } from './bundle-loader.ts';
import type { WorldSnapshot } from './world-state.ts';
import { DIAGNOSTICS, SESSION_DEBUG, ExecutionDiagnostics } from './diagnostics.ts';
import type { TraceOptions } from './diagnostics.ts';
import { signed } from './numeric.ts';
export type { ExecutionTrace, TraceAttempt, TraceEntry, TraceFrame, TraceOptions } from './diagnostics.ts';

function revealWorld(game:LoadedGame,snapshot:WorldSnapshot) {
  const world=WorldState.restore(game,snapshot),payload=game.bundle.payload;
  const flags=payload.symbols.symbols.filter(s=>s.kind==='attribute');
  return {
    globals:payload.memory.globals.map(g=>({name:g.name,number:g.number,value:world.global(g.number),signed:signed(world.global(g.number))})),
    objects:payload.memory.objects.map(o=>({id:o.id,name:o.name,kind:payload.world.entities.find(e=>e.id===o.id)!.kind,
      parent:world.parent(o.id),children:world.children(o.id),nextSibling:world.nextSibling(o.id),
      flags:Array.from({length:32},(_,n)=>n).filter(n=>world.hasFlag(o.id,n)),
      flagNames:flags.filter(f=>world.hasFlag(o.id,f.number!)).map(f=>f.name),
      properties:o.properties.map(p=>({name:p.name,number:p.number,address:p.address,bytes:Array.from({length:p.length},(_,i)=>world.getByte(p.address,i))})),
    })),
  };
}
export function createDebugSession(game:LoadedGame,options:SessionOptions={},traceOptions:TraceOptions={}) {
  const diagnostics=new ExecutionDiagnostics(traceOptions),session=new GameSession(game,{...options,[DIAGNOSTICS]:diagnostics});
  return {session,debug:{
    trace:()=>diagnostics.trace(),clearTrace:()=>diagnostics.clear(),
    stateDump:()=>{const state=session[SESSION_DEBUG]();return {...state,world:revealWorld(game,state.checkpoint.interpreter.world)};},
    revealAll:()=>revealWorld(game,session[SESSION_DEBUG]().checkpoint.interpreter.world),
  }};
}
/** Standalone source/IR fixtures can use the same tracer without a public session. */
export function createDebugInterpreter(game:LoadedGame,options:ConstructorParameters<typeof Interpreter>[1]={},traceOptions:TraceOptions={}) {
  const diagnostics=new ExecutionDiagnostics(traceOptions),interpreter=new Interpreter(game,{...options,[DIAGNOSTICS]:diagnostics});
  return {interpreter,debug:{trace:()=>diagnostics.trace(),clearTrace:()=>diagnostics.clear(),stateDump:()=>interpreter.checkpoint(),revealAll:()=>revealWorld(game,interpreter.world().snapshot())}};
}
export function createDebugTurnLoop(game:LoadedGame,options:ConstructorParameters<typeof TurnLoop>[1]={},traceOptions:TraceOptions={}) {
  const diagnostics=new ExecutionDiagnostics(traceOptions),loop=new TurnLoop(game,{...options,[DIAGNOSTICS]:diagnostics});
  return {loop,debug:{trace:()=>diagnostics.trace(),clearTrace:()=>diagnostics.clear(),stateDump:()=>loop.checkpoint(),revealAll:()=>revealWorld(game,loop.world().snapshot())}};
}
