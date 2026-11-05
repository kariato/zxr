import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const host=document.querySelector('#viewer'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#748996');scene.fog=new THREE.Fog('#748996',45,100);
const camera=new THREE.PerspectiveCamera(43,1,.04,150),controls=new OrbitControls(camera,renderer.domElement);controls.maxDistance=100;controls.minDistance=.8;controls.maxPolarAngle=Math.PI*.9;
scene.add(new THREE.HemisphereLight('#d9edff','#574b39',2.2));
for(const [pos,intensity]of [[[-6,24,10],2.8],[[8,12,18],1.2]]){const light=new THREE.DirectionalLight('#fff1d5',intensity);light.position.set(...pos);scene.add(light);}
const ktx=new KTX2Loader().setWorkerLimit(2).detectSupport(renderer),loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
let tunnelPortal;let model,dirty=true,motion=true,last=0,disposed=false;const start=performance.now();
const waveFunctions=`vec3 riverWaves(vec2 p,float t){
 vec2 a=vec2(.32,2.5),b=vec2(1.1,4.1),c=vec2(-1.7,5.8);
 float pa=dot(p,a)-t*2.8,pb=dot(p,b)-t*4.3,pc=dot(p,c)-t*5.7;
 float h=.11*sin(pa)+.045*sin(pb)+.022*sin(pc);
 vec2 slope=.11*a*cos(pa)+.045*b*cos(pb)+.022*c*cos(pc);
 return vec3(h,slope);
}`;
const water=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:{value:0}},
 vertexShader:`uniform float uTime;varying vec3 vWorld;${waveFunctions}
 void main(){vec4 w=modelMatrix*vec4(position,1.);w.y+=riverWaves(w.xz,uTime).x;vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform float uTime;varying vec3 vWorld;${waveFunctions}
 void main(){
 vec3 wave=riverWaves(vWorld.xz,uTime);
 vec3 n=normalize(vec3(-wave.y,1.,-wave.z));
 vec3 eye=normalize(cameraPosition-vWorld);
 float fresnel=.05+.65*pow(1.-max(dot(n,eye),0.),3.);
 vec3 reflection=reflect(-eye,n);
 vec3 sky=mix(vec3(.12,.23,.27),vec3(.42,.57,.63),smoothstep(-.2,.9,reflection.y));
 float crest=.5+.5*sin(dot(vWorld.xz,vec2(.32,2.5))-uTime*2.8);
 vec3 body=mix(vec3(.008,.12,.16),vec3(.025,.32,.35),.3+.45*crest);
 float light=.6+.4*max(dot(n,normalize(vec3(-.4,1.,.3))),0.);
 vec3 colour=mix(body*light,sky,fresnel);
 colour*=mix(1.,.15,clamp((-vWorld.z-13.)/4.,0.,1.));
 gl_FragColor=vec4(colour,.9);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
function view(position,target){camera.position.set(...position);controls.target.set(...target);controls.update();dirty=true;}
document.querySelector('#overview').onclick=()=>view([0,20,36],[0,-4,-3]);
document.querySelector('#river').onclick=()=>view([0,-14.6,10],[0,-16,-10]);
document.querySelector('#west').onclick=()=>view([-5.6,1.6,10],[-3,-9,-6]);
document.querySelector('#east').onclick=()=>view([3.25,3.6,8],[5,2,-8]);
document.querySelector('#tunnel').onclick=()=>{if(!tunnelPortal)return;const p=new THREE.Vector3(...tunnelPortal.origin),d=new THREE.Vector3(...tunnelPortal.direction);p.y+=.75;view(p.clone().addScaledVector(d,-.6).toArray(),p.clone().addScaledVector(d,6).toArray());};
document.querySelector('#water').onclick=()=>{motion=!motion;document.querySelector('#water').setAttribute('aria-pressed',String(motion));dirty=true;};
controls.addEventListener('change',()=>{dirty=true;});view([0,20,36],[0,-4,-3]);
const resize=new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();dirty=true;});resize.observe(host);
renderer.setAnimationLoop(now=>{if(document.hidden||now-last<33)return;const dt=Math.min((now-last)/1000,.1);last=now;if(motion){water.uniforms.uTime.value+=dt;dirty=true;}if(dirty){renderer.render(scene,camera);dirty=false;}});
try{
 const layout=await (await fetch('./assembly.json')).json();tunnelPortal=layout.portals.find(p=>p.name==='west cave 4');
 const response=await fetch('./ravine-browser.glb');if(!response.ok)throw Error('HTTP '+response.status);const bytes=await response.arrayBuffer();
 const gltf=await loader.parseAsync(bytes,new URL('./',location.href).href);model=gltf.scene;
 let waterMeshes=0,triangles=0,meshes=0;const geometries=new Set(),textures=new Set();
 model.traverse(o=>{if(!o.isMesh)return;meshes++;geometries.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
 for(const m of [].concat(o.material))for(const v of Object.values(m))if(v?.isTexture)textures.add(v);
 let source=o,isWater=false,interior=false;while(source){if(source.name.includes('WATER')||source.userData.water_surface)isWater=true;if(source.name.includes('passage-')||/^river-source-(left|right|far|roof|floor)/.test(source.name))interior=true;source=source.parent;}
 if(interior){const darken=m=>{const dark=m.clone();dark.color.multiplyScalar(.16);return dark;};o.material=Array.isArray(o.material)?o.material.map(darken):darken(o.material);}
 if(isWater){for(const m of [].concat(o.material))m.dispose();o.material=water;waterMeshes++;}});
 if(waterMeshes!==1)throw Error('Expected one separate river surface');
 scene.add(model);model.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(model);if(![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))throw Error('Invalid scene bounds');
 const materials=new Map();model.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material)){materials.set(m,m.side);m.side=THREE.DoubleSide;}});
 const checks=layout.portals.map(p=>{const ray=new THREE.Raycaster(new THREE.Vector3(...p.origin),new THREE.Vector3(...p.direction),.01,.8);return{name:p.name,clear:ray.intersectObject(model,true).length===0};});
 const tunnelDepthChecks=layout.portals.filter(p=>p.name!=='garden gateway').map(p=>{const distance=p.name==='river source'?11.5:9.5;const ray=new THREE.Raycaster(new THREE.Vector3(...p.origin),new THREE.Vector3(...p.direction),.01,distance);return{name:p.name,distance,clear:ray.intersectObject(model,true).length===0};});
 for(const[m,side]of materials)m.side=side;
 await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
 const report={ready:true,downloadBytes:bytes.byteLength,loadMs:Math.round(performance.now()-start),meshes,uniqueGeometries:geometries.size,renderedTriangles:triangles,textures:textures.size,compressedTextures:[...textures].filter(t=>t.isCompressedTexture).length,waterMeshes,openingChecks:checks,tunnelDepthChecks,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},webglError:renderer.getContext().getError()};
 document.querySelector('#metrics').textContent=JSON.stringify(report);host.dataset.ready='true';status.textContent=`${(bytes.byteLength/1e6).toFixed(2)} MB · ${triangles.toLocaleString()} triangles · jagged ledges · deep passages`;dirty=true;
}catch(e){host.dataset.ready='failed';status.textContent='Scene could not load: '+e.message;console.error(e);}
window.addEventListener('pagehide',()=>{if(disposed)return;disposed=true;renderer.setAnimationLoop(null);resize.disconnect();controls.dispose();ktx.dispose();const mats=new Set(),tex=new Set(),geo=new Set();model?.traverse(o=>{if(o.isMesh){geo.add(o.geometry);for(const m of [].concat(o.material)){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)tex.add(v);}}});for(const g of geo)g.dispose();for(const t of tex)t.dispose();for(const m of mats)m.dispose();water.dispose();renderer.dispose();},{once:true});
