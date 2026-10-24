import { loadPlannerSources,exactKeys,validateTask } from './inputs.ts';
import type { PlanTask } from './inputs.ts';
import { reviewRecords,saveReview } from './review.ts';
import { approvePlan } from './store.ts';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { compileSourcePath } from '../zil/compile.ts';
import { packBundle } from '../../src/zil/bundle.ts';
import { Interpreter,loadGame,queryAppearance } from '../../src/engine/index.ts';
import { checkSceneConsistency } from './consistency.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Local authoring only. Same-origin JSON POSTs, bounded input, no file-path API.
 * This handler is never installed by a production build. */
export function reviewMiddleware(root=process.cwd()){
  return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
    if(req.url?.split('?')[0]!=='/authoring/api'){next();return;}
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    try{
      if(!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(req.headers.host??''))throw new Error('Local authoring host required');
      if(req.method==='GET'){res.end(JSON.stringify({records:reviewRecords(root,loadPlannerSources(root))}));return;}
      if(req.method!=='POST'||req.headers.origin!=='http://'+req.headers.host||req.headers['content-type']!=='application/json')throw new Error('Same-origin JSON POST required');
      let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const data=Buffer.from(chunk);size+=data.length;if(size>4*1024*1024)throw new Error('Review request exceeds 4 MiB');chunks.push(data);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,any>,sources=loadPlannerSources(root);
      if(body.operation==='preview'){
        exactKeys(body,['operation','room','mode'],'preview request');if(typeof body.room!=='string'||!['initial','reveal','conceal','dark'].includes(body.mode as string))throw new Error('Invalid preview mode');
        const room=body.room,bundle=compileSourcePath('reference/zork2'),game=loadGame(packBundle(bundle)),vm=new Interpreter(game);vm.run();const world=vm.world();
        const id=(name:string)=>{const e=bundle.payload.world.entities.find(e=>e.name===name);if(!e)throw new Error('Unknown preview entity');return e.id;};
        if(!bundle.payload.world.entities.some(e=>e.kind==='room'&&e.name===room))throw new Error('Unknown preview room');
        world.move(id('ADVENTURER'),id(room));world.setGlobal('HERE',id(room));world.setGlobal('ALWAYS-LIT',0);
        const flag=(name:string)=>bundle.payload.symbols.symbols.find(s=>s.kind==='attribute'&&s.name===name)!.number!;
        if(body.mode==='dark'){world.setFlag(id(room),flag('ONBIT'),false);for(const e of bundle.payload.world.entities)if(e.flags.some(f=>f.name==='LIGHTBIT'))world.setFlag(e.id,flag('ONBIT'),false);}
        if(body.mode==='reveal'||body.mode==='conceal'){if(room!=='CRYPT-ROOM')throw new Error('Secret-door fixture is scoped to the crypt');world.setFlag(id(room),flag('ONBIT'),true);world.setFlag(id('DIM-DOOR'),flag('INVISIBLE'),body.mode==='conceal');}
        const records=reviewRecords(root,sources).map(e=>e.record),plan=records.find(r=>r.task.kind==='scene-plan'&&r.task.subject===room)!.document;
        const scene=checkSceneConsistency(records.map(r=>r.document),JSON.parse(readFileSync(resolve(root,'games/zork2/planning/scene-bindings.json'),'utf8')),sources).scenes.find(s=>s.room===room)!;
        res.end(JSON.stringify({plan,scene,current:queryAppearance(game,world)}));return;
      }
      if(body.operation==='approve'){
        exactKeys(body,['operation','task','expectedHash','reviewer'],'approval request');validateTask(body.task as PlanTask);const task=body.task as PlanTask;const item=reviewRecords(root,sources).find(e=>e.record.task.kind===task.kind&&e.record.task.subject===task.subject);
        if(!item||item.record.outputHash!==body.expectedHash)throw new Error('Review conflict: reload before approval');
        if(typeof body.reviewer!=='string')throw new Error('Named reviewer required');
        const file=approvePlan(root,sources,item.record,body.reviewer,new Date().toISOString().slice(0,10),item.approvedHash!==null);res.end(JSON.stringify({file}));return;
      }
      exactKeys(body,['operation','task','expectedHash','document','lockedFields'],'edit request');if(!['save','replan'].includes(body.operation as string))throw new Error('Unknown review operation');
      const record=saveReview(root,sources,body.task as PlanTask,body.expectedHash as string,body.document as Record<string,any>,body.lockedFields as string[],body.operation==='replan');res.end(JSON.stringify({record}));
    }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:String(error)}));}
  };
}
