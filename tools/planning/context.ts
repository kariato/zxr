import { canonicalJson,hashJson,logicExpressions } from '../../src/zil/index.ts';
import type { GameBundle,LogicExpression,Span,WorldEntity } from '../../src/zil/index.ts';

export const CONTEXT_VERSION='zxr-room-context-v1';
// Dispatch/lifecycle routines can enter unrelated rooms or object handlers.
// Retain these edges as boundaries instead of presenting their text as room prose.
export const CONTEXT_DISPATCH_BOUNDARIES=['PERFORM','GOTO','DESCRIBE-ROOM','DESCRIBE-OBJECT','CLOCKER','MAIN-LOOP','MAIN-LOOP-1','GO','JIGS-UP','PARSER'] as const;
const boundaries=new Set<string>(CONTEXT_DISPATCH_BOUNDARIES);
const mutations=new Set(['FSET','FCLEAR','MOVE','REMOVE','PUTP']);
const textProperties=new Set(['LDESC','FDESC','TEXT']);
const handlers=(entity:WorldEntity)=>entity.properties.flatMap(p=>p.kind==='routine'&&p.routine?[{property:p.property.name,routine:p.routine.name}]:p.kind==='pseudos'?p.entries.map(e=>({property:'PSEUDO:'+e.word.name,routine:e.routine.name})):[]);
const unique=(values:string[])=>[...new Set(values)].sort();
function symbols(expression:LogicExpression){
  const result:{name:string;kind:string}[]=[];
  const visit=(value:unknown):void=>{
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(!value||typeof value!=='object')return;
    const data=value as Record<string,unknown>;
    if(data.op==='symbol')result.push({name:String(data.name),kind:String(data.kind)});
    if(data.op==='load'||data.op==='variable-number'||data.op==='store'||data.op==='update-compare'){
      const variable=data.variable as {scope:string;name:string};if(variable.scope==='global')result.push({name:variable.name,kind:'global'});
    }
    for(const [key,child] of Object.entries(data))if(!['source','origin'].includes(key))visit(child);
  };visit(expression);
  return [...new Map(result.map(s=>[s.kind+':'+s.name,s])).values()].sort((a,b)=>(a.kind+':'+a.name).localeCompare(b.kind+':'+b.name,'en'));
}
const literalEntity=(e:LogicExpression|undefined)=>e?.op==='symbol'&&['object','room'].includes(e.kind)?e.name:null;

/** Offline, conservative source analysis. Never runs a routine, advances RNG,
 * resolves a condition or claims that a potential arrival is reachable. */
export function buildRoomContexts(bundle:GameBundle){
  const {world,logic,strings}=bundle.payload,entities=new Map(world.entities.map(e=>[e.name,e]));
  const files=new Map(bundle.debug.sources.files.map(f=>[f.file,f.text]));
  const excerpt=(source:Span)=>files.get(source.file)?.slice(source.start.offset,source.end.offset)??null;
  const texts=new Map(strings.entries.map(s=>[s.id,s.text]));
  const routineFacts=logic.routines.map(routine=>{
    const expressions=[...logicExpressions(routine)],calls:string[]=[],unresolvedCalls:Span[]=[];
    for(const e of expressions){if(e.op==='call')calls.push(e.routine.name);if(e.op==='apply'){if(e.routine.op==='symbol'&&e.routine.kind==='routine')calls.push(e.routine.name);else unresolvedCalls.push(e.source);}}
    const textFragments=expressions.flatMap(e=>e.op==='output'?[{
      operator:e.operator,text:e.args[0]?.op==='string'?texts.get(e.args[0].handle)??null:e.operator==='CRLF'?'\n':null,
      unresolved:e.operator!=='CRLF'&&e.args[0]?.op!=='string',source:e.source,
    }]:[]);
    const effects=expressions.flatMap(e=>e.op==='object'&&mutations.has(e.operator)?[{
      operation:e.operator,target:literalEntity(e.args[0]),destination:e.operator==='MOVE'?literalEntity(e.args[1]):null,references:symbols(e),source:e.source,sourceText:excerpt(e.source),
    }]:e.op==='store'&&e.variable.scope==='global'?[{
      operation:'SETG',target:e.variable.name,destination:null,references:symbols(e.value),source:e.source,sourceText:excerpt(e.source),
    }]:e.op==='update-compare'&&e.variable.scope==='global'?[{
      operation:e.operator,target:e.variable.name,destination:null,references:symbols(e.bound),source:e.source,sourceText:excerpt(e.source),
    }]:[]);
    return {name:routine.name,source:routine.source,sourceText:excerpt(routine.source),calls:unique(calls),unresolvedCalls,
      referencedRoutines:unique(expressions.filter(e=>e.op==='symbol'&&e.kind==='routine').map(e=>(e as Extract<LogicExpression,{op:'symbol'}>).name)),
      references:[...new Map(expressions.flatMap(symbols).map(s=>[s.kind+':'+s.name,s])).values()].sort((a,b)=>(a.kind+':'+a.name).localeCompare(b.kind+':'+b.name,'en')),
      textFragments,effects};
  }).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const routines=new Map(routineFacts.map(r=>[r.name,r]));
  const effectIndex=routineFacts.flatMap(r=>r.effects.map((effect,index)=>({routine:r.name,index,...effect})));
  const ancestry=(entity:WorldEntity)=>{
    const result:string[]=[],seen=new Set([entity.name]);let parent=entity.parent?.name;
    while(parent){if(seen.has(parent))throw new Error('Initial object tree cycle at '+entity.name);seen.add(parent);result.push(parent);parent=entities.get(parent)?.parent?.name;}
    return result;
  };
  const portable=new Map<string,string[]>();
  for(const entity of world.entities.filter(e=>e.kind==='object')){
    const reasons=entity.flags.filter(f=>['TAKEBIT','TRYTAKEBIT','VEHBIT','ACTORBIT'].includes(f.name)).map(f=>'source-flag:'+f.name);
    if(effectIndex.some(e=>e.operation==='MOVE'&&e.target===entity.name))reasons.push('literal-script-move');
    if(reasons.length)portable.set(entity.name,reasons);
  }
  for(const entity of world.entities.filter(e=>e.kind==='object'))if(!portable.has(entity.name)&&ancestry(entity).some(p=>portable.has(p)))portable.set(entity.name,['inside-potentially-portable-container']);
  const objects=world.entities.filter(e=>e.kind==='object').map(entity=>{
    const chain=ancestry(entity);
    return {name:entity.name,id:entity.id,desc:entity.shortName,text:entity.properties.filter(p=>p.kind==='text'&&textProperties.has(p.property.name)),
      parent:entity.parent?.name??null,ancestry:chain,flags:entity.flags.map(f=>f.name).sort(),source:entity.source,handlers:handlers(entity),
      potentialArrivalReasons:portable.get(entity.name)??[],
      visibilityWarnings:[...(entity.flags.some(f=>f.name==='INVISIBLE')?['initially-INVISIBLE']:[]),...(entity.flags.some(f=>f.name==='NDESCBIT')?['initially-unlisted-NDESCBIT']:[]),
        ...chain.flatMap(name=>{const parent=entities.get(name);return parent?.flags.some(f=>f.name==='INVISIBLE')?['in-initially-INVISIBLE:'+name]:[];}),
        ...chain.flatMap(name=>{const f=new Set(entities.get(name)?.flags.map(f=>f.name));return f.has('CONTBIT')&&!f.has('OPENBIT')&&!f.has('TRANSBIT')&&!f.has('SURFACEBIT')?['inside-initially-closed-opaque-container:'+name]:[];})]};
  }).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const objectMap=new Map(objects.map(o=>[o.name,o]));
  const universalGlobals=objects.filter(o=>o.parent==='GLOBAL-OBJECTS'&&o.name!=='LOCAL-GLOBALS').map(o=>o.name);
  const contexts=world.entities.filter(e=>e.kind==='room').sort((a,b)=>a.name.localeCompare(b.name,'en')).map(room=>{
    const initialObjects=objects.filter(o=>o.ancestry.includes(room.name)).map(o=>o.name);
    const globals=room.properties.flatMap(p=>p.kind==='objects'&&p.property.name==='GLOBAL'?p.objects.map(o=>o.name):[]);
    const doors=room.exits.flatMap(e=>e.view.kind==='DEXIT'?[e.view.door]:[]);
    const scriptedArrivals=effectIndex.filter(e=>e.operation==='MOVE'&&e.target&&'destination' in e&&e.destination===room.name).map(e=>({object:e.target!,routine:e.routine,index:e.index}));
    const localObjects=unique([...initialObjects,...globals,...doors,...scriptedArrivals.map(a=>a.object)]);
    const roots=[...handlers(room).map(h=>h.routine),...localObjects.flatMap(name=>objectMap.get(name)?.handlers.map(h=>h.routine)??[]),...room.exits.flatMap(e=>e.view.kind==='FEXIT'?[e.view.routine]:[])];
    const reached=new Set<string>(),stopped=new Set<string>(),missing=new Set<string>();
    const visit=(name:string)=>{if(boundaries.has(name)){stopped.add(name);return;}if(reached.has(name))return;const routine=routines.get(name);if(!routine){missing.add(name);return;}reached.add(name);routine.calls.forEach(visit);};roots.forEach(visit);
    const rootGlobals=unique([...reached].flatMap(name=>routines.get(name)!.references.filter(r=>r.kind==='global').map(r=>r.name)));
    const exitGlobals=room.exits.flatMap(e=>e.view.kind==='CEXIT'?[e.view.global]:[]);
    const relatedGlobals=new Set([...rootGlobals,...exitGlobals]);
    const features=unique([...localObjects,room.name]).map(name=>{
      const entity=entities.get(name);if(!entity)throw new Error('Unknown context entity '+name);
      const evidence=effectIndex.filter(e=>e.target===name).map(e=>({routine:e.routine,index:e.index,operation:e.operation,flags:e.references.filter(r=>r.kind==='attribute').map(r=>r.name)}));
      return {name,initialFlags:entity.flags.map(f=>f.name).sort(),concealedByDeclaration:entity.flags.some(f=>f.name==='INVISIBLE'),
        unlistedByDeclaration:entity.flags.some(f=>f.name==='NDESCBIT'),
        changeable:evidence.length>0||portable.has(name)||handlers(entity).length>0||entity.flags.some(f=>['CONTBIT','DOORBIT','OPENBIT','VEHBIT'].includes(f.name)),
        stateReviewRequired:true,
        handling:'engine-controlled-separate-node',evidence};
    });
    const data={format:CONTEXT_VERSION,room:{name:room.name,id:room.id,desc:room.shortName,ldesc:room.properties.filter(p=>p.property.name==='LDESC'),source:room.source,
      flags:room.flags.map(f=>f.name).sort(),initialRoomLightFlag:room.flags.some(f=>f.name==='ONBIT'),outdoors:'not-encoded-do-not-infer-from-RLANDBIT'},
      exits:room.exits.map(exit=>({direction:exit.property.name,source:exit.source,declaration:exit.declaration,view:exit.view,
        neighbour:'to' in exit.view?{name:exit.view.to,desc:entities.get(exit.view.to)?.shortName.text??null}:null,
        geometryStatus:exit.view.kind==='UEXIT'?'requires-review':'conditional-blocked-or-computed'})),
      initialObjects,globalObjects:unique(globals),universalGlobalObjects:universalGlobals,potentialArrivals:[...portable.keys()].sort(),scriptedArrivals,features,
      routineReferencedObjects:unique([...reached].flatMap(name=>routines.get(name)!.references.filter(r=>r.kind==='object').map(r=>r.name))),
      routines:{roots:unique(roots),reachableHelpers:[...reached].sort(),dispatchBoundaries:[...stopped].sort(),missing:[...missing].sort()},
      stateDependencies:unique([...relatedGlobals]).map(name=>({name,writers:effectIndex.filter(e=>e.target===name&&['SETG','IGRTR?','DLESS?'].includes(e.operation)).map(e=>({routine:e.routine,index:e.index}))})),
      cautions:['Offline source context; never current player-visible state.','All routine text/effects are conditional possibilities, not an executed description or a reveal rule.','Potential arrivals are a conservative shared catalogue, not proven room reachability or initial scenery.','Consult routines.json for text fragments, source guards, script changes and unresolved targets/calls.','Every feature requires state review; absent literal mutation evidence does not prove a static feature. Generic handlers and raw memory writes may change computed targets.','Computed exits are not guessed; RLANDBIT means land, not outdoors.']};
    return {...data,inputHash:hashJson(data)};
  });
  const catalog={format:'zxr-context-objects-v1',objects};
  const globalDefinitions=bundle.payload.symbols.symbols.filter(s=>s.kind==='global').map(s=>({name:s.name,source:s.source??null,sourceText:s.source?excerpt(s.source):null})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const routineCatalog={format:'zxr-context-routines-v1',routines:routineFacts,globalDefinitions,unresolvedEffects:effectIndex.filter(e=>e.target===null).map(e=>({routine:e.routine,index:e.index,operation:e.operation}))};
  const index={format:'zxr-context-index-v1',builder:CONTEXT_VERSION,semanticBuildHash:bundle.buildHash,counts:{rooms:contexts.length,objects:objects.length,routines:routineFacts.length,potentialArrivals:portable.size},
    catalog:{objects:{file:'objects.json',hash:hashJson(catalog)},routines:{file:'routines.json',hash:hashJson(routineCatalog)}},
    rooms:contexts.map(c=>({room:c.room.name,file:c.room.name.toLowerCase()+'.json',inputHash:c.inputHash}))};
  // Own all outputs: callers cannot mutate the compiled bundle through metadata.
  return JSON.parse(canonicalJson({index,objects:catalog,routines:routineCatalog,rooms:contexts})) as {index:typeof index;objects:typeof catalog;routines:typeof routineCatalog;rooms:typeof contexts};
}
