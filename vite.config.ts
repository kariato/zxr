import { defineConfig } from 'vite';
import { compileSourcePath } from './tools/zil/compile.ts';
import { packBundle } from './src/zil/bundle.ts';
// Build-time/server-only compilation. The browser loads a validated bundle.
let building=false;
export default defineConfig({base:process.env.GITHUB_PAGES==='true'?'/zxr/':'./',plugins:[{
  name:'zxr-story-bundle',
  configResolved(config){building=config.command==='build';},
  buildStart(){if(building)this.emitFile({type:'asset',fileName:'games/zork2.zxb',source:packBundle(compileSourcePath('reference/zork2'))});},
  configureServer(server){let cached:Uint8Array|undefined;server.middlewares.use('/games/zork2.zxb',(_req,res)=>{
    try{cached??=packBundle(compileSourcePath('reference/zork2'));res.setHeader('Content-Type','application/json');res.end(cached);}
    catch(error){res.statusCode=500;res.end(error instanceof Error?error.message:String(error));}
  });},
}]});
