import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const host=document.querySelector('#viewer'),status=document.querySelector('#status'),selector=document.querySelector('#part');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
host.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#202933');
const camera=new THREE.PerspectiveCamera(40,1,.02,150),controls=new OrbitControls(camera,renderer.domElement);
scene.add(new THREE.HemisphereLight('#e7eef9','#655642',2));
for(const [x,y,z,power] of [[-5,12,15,2],[20,1,10,1]]){const light=new THREE.DirectionalLight('#fff4e4',power);light.position.set(x,y,z);scene.add(light);}
const ktx=new KTX2Loader().setWorkerLimit(2).detectSupport(renderer);
const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
const models=new Map(),reports=[];let dirty=true,wire=false;
function frame(){const chosen=selector.value;let box=new THREE.Box3();for(const [name,obj]of models){obj.visible=chosen==='all'||chosen===name;if(obj.visible)box.union(new THREE.Box3().setFromObject(obj));}
 const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());const distance=Math.max(s.y,s.x/camera.aspect)*1.6+s.z;
 controls.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(.05,0,1).multiplyScalar(distance));camera.updateProjectionMatrix();controls.update();dirty=true;}
selector.onchange=frame;document.querySelector('#wire').onclick=()=>{wire=!wire;for(const obj of models.values())obj.traverse(o=>{if(o.isMesh)for(const mat of [].concat(o.material))mat.wireframe=wire;});document.querySelector('#wire').setAttribute('aria-pressed',String(wire));dirty=true;};
controls.addEventListener('change',()=>{dirty=true;});
const resize=new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();if(models.size)frame();dirty=true;});resize.observe(host);
renderer.setAnimationLoop(()=>{if(dirty){renderer.render(scene,camera);dirty=false;}});
try{
 const manifest=await (await fetch('./manifest.json')).json();let i=0;
 for(const spec of manifest.parts){status.textContent=`Loading ${spec.id} (${i+1}/11)…`;const response=await fetch(`./${spec.id}.glb`);if(!response.ok)throw Error(`${spec.id}: HTTP ${response.status}`);
 const bytes=await response.arrayBuffer(),gltf=await loader.parseAsync(bytes,new URL('./',location.href).href),model=gltf.scene;model.updateMatrixWorld(true);
 let triangles=0;const textures=new Set();model.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of [].concat(o.material))for(const v of Object.values(m))if(v?.isTexture)textures.add(v);});
 let openingClear=null;if(spec.opening){openingClear=true;const ray=new THREE.Raycaster(),sides=new Map();model.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material)){sides.set(m,m.side);m.side=THREE.DoubleSide;}});
 for(const x of [-spec.opening[0]*.25,0,spec.opening[0]*.25])for(const h of [.1,.3,.5]){ray.set(new THREE.Vector3(x,spec.opening[1]*h,1),new THREE.Vector3(0,0,-1));ray.far=2;if(ray.intersectObject(model,true).length)openingClear=false;}
 for(const [m,side]of sides)m.side=side;}
 model.position.set((i%4)*5.5,-Math.floor(i/4)*5,0);scene.add(model);models.set(spec.id,model);const option=document.createElement('option');option.value=spec.id;option.textContent=spec.id.replaceAll('-',' ');selector.append(option);
 const bounds=new THREE.Box3().setFromObject(model);if(![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))throw Error(`${spec.id}: invalid model bounds`);reports.push({id:spec.id,downloadBytes:bytes.byteLength,triangles,textures:textures.size,compressedTextures:[...textures].filter(t=>t.isCompressedTexture).length,openingClear,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}});i++;
 }
 frame();await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
 const report={ready:true,parts:reports,downloadBytes:reports.reduce((n,r)=>n+r.downloadBytes,0),camera:camera.position.toArray(),target:controls.target.toArray(),aspect:camera.aspect,webglError:renderer.getContext().getError()};document.querySelector('#metrics').textContent=JSON.stringify(report);host.dataset.ready='true';
 status.textContent=`11 components · ${(report.downloadBytes/1e6).toFixed(2)} MB total · all openings ${reports.filter(r=>r.openingClear!==null).every(r=>r.openingClear)?'clear':'NEED REVIEW'}`;
}catch(e){host.dataset.ready='failed';status.textContent=e.message;console.error(e);}
window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);resize.disconnect();controls.dispose();ktx.dispose();const mats=new Set(),textures=new Set();for(const obj of models.values())obj.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material)){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}}});for(const t of textures)t.dispose();for(const m of mats)m.dispose();renderer.dispose();},{once:true});
