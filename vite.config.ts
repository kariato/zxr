import { defineConfig } from 'vite';
import { compileSourcePath } from './tools/zil/compile.ts';
import { packBundle } from './src/zil/bundle.ts';
import { loadPlannerSources } from './tools/planning/inputs.ts';
import { readApprovedPlans } from './tools/planning/store.ts';
import { reviewMiddleware } from './tools/planning/review-server.ts';
import { collectLabels } from './tools/planning/labels.ts';
// Build-time/server-only compilation. The browser loads a validated bundle.
let building=false;
export default defineConfig({base:process.env.GITHUB_PAGES==='true'?'/zxr/':'./',plugins:[{
  name:'zxr-story-bundle',
  configResolved(config){building=config.command==='build';},
  buildStart(){if(building){
    const bundle=compileSourcePath('reference/zork2');
    this.emitFile({type:'asset',fileName:'games/zork2.zxb',source:packBundle(bundle)});
    const sources=loadPlannerSources(process.cwd(),bundle),plans=readApprovedPlans(process.cwd(),sources);
    this.emitFile({type:'asset',fileName:'presentation/plans.json',source:JSON.stringify(plans)+'\n'});
    this.emitFile({type:'asset',fileName:'presentation/labels.json',source:JSON.stringify({format:'zxr-labels-v1',buildHash:bundle.buildHash,...collectLabels(plans.records,sources).labels})+'\n'});
  }},
  configureServer(server){server.middlewares.use(reviewMiddleware());server.middlewares.use('/presentation/labels.json',(_req,res)=>{try{const bundle=compileSourcePath('reference/zork2'),sources=loadPlannerSources(process.cwd(),bundle);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({format:'zxr-labels-v1',buildHash:bundle.buildHash,...collectLabels(readApprovedPlans(process.cwd(),sources).records,sources).labels}));}catch(error){res.statusCode=500;res.end(String(error));}});let cached:Uint8Array|undefined;server.middlewares.use('/games/zork2.zxb',(_req,res)=>{
    try{cached??=packBundle(compileSourcePath('reference/zork2'));res.setHeader('Content-Type','application/json');res.end(cached);}
    catch(error){res.statusCode=500;res.end(error instanceof Error?error.message:String(error));}
  });},
}]});
