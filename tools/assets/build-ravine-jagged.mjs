import {build} from 'vite';
import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),base=path.join(root,'games/zork2/planning/scenes/lower-ravine/assembled-v3');
const publicDir=path.join(root,'out/asset-production/ravine-jagged-public');await mkdir(publicDir,{recursive:true});
for(const file of ['ravine-browser.glb','assembly.json','README.md','browser-verification.json','HUNYUAN-NOTICE.txt','TENCENT-HUNYUAN-3D-2.0-LICENSE.txt'])await copyFile(path.join(base,file),path.join(publicDir,file));
await copyFile(path.join(root,'node_modules/three/LICENSE'),path.join(publicDir,'THREE-LICENSE.txt'));
for(const file of ['BASIS-LICENSE.txt','MESHOPT-LICENSE.txt'])await copyFile(path.join(root,'src/prototype/assets',file),path.join(publicDir,file));
await build({configFile:false,root:path.join(root,'tools/assets/ravine-jagged-preview'),publicDir,base:'./',build:{outDir:path.join(root,'out/ravine-jagged'),emptyOutDir:true}});
