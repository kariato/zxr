import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const stage=document.querySelector('#stage'),status=document.querySelector('#status'),select=document.querySelector('#rooms');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=THREE.ACESFilmicToneMapping;
stage.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#101a22');
scene.add(new THREE.HemisphereLight('#c5d8e8','#574632',1.5));
const camera=new THREE.PerspectiveCamera(75,1,.03,1000),controls=new OrbitControls(camera,renderer.domElement);
controls.minDistance=.1;controls.maxDistance=200;
const light=new THREE.PointLight('#ffe6c4',50,40);scene.add(light);
const loader=new GLTFLoader();
let catalogue=[],model,current,request=0,dirty=true;
function dispose(root){const geometry=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.isMesh){geometry.add(o.geometry);for(const m of [].concat(o.material)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometry.forEach(g=>g.dispose());}
function reset(){if(!current)return;camera.position.fromArray(current.camera);controls.target.copy(camera.position).add(new THREE.Vector3(0,0,-3));controls.update();dirty=true;}
async function load(id){
 const entry=catalogue.find(r=>r.room===id);if(!entry)return;
 const token=++request;select.value=id;stage.dataset.ready='loading';status.textContent='Loading '+entry.label+'…';
 try{
  const url=new URL('./models/'+id.toLowerCase()+'/room.glb',location.href);
  const gltf=await loader.loadAsync(url.href);
  if(token!==request){dispose(gltf.scene);return;}
  if(model){scene.remove(model);dispose(model);}model=gltf.scene;scene.add(model);current=entry;reset();
  const link=document.querySelector('#download');link.href=url.href;link.download=id.toLowerCase()+'.glb';
  history.replaceState(null,'','#'+id);status.textContent=entry.label+' · '+entry.triangles.toLocaleString()+' triangles · '+(entry.bytes/1e6).toFixed(2)+' MB';
  stage.dataset.ready='true';dirty=true;
 }catch(error){if(token!==request)return;stage.dataset.ready='failed';status.textContent='Could not load '+entry.label+'. Select a room to retry.';console.error(error);}
}
select.onchange=()=>load(select.value);
for(const [id,step] of [['previous',-1],['next',1]])document.querySelector('#'+id).onclick=()=>load(catalogue[(catalogue.findIndex(r=>r.room===select.value)+step+catalogue.length)%catalogue.length].room);
document.querySelector('#reset').onclick=reset;
controls.addEventListener('change',()=>{dirty=true;});
new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();dirty=true;}).observe(stage);
renderer.setAnimationLoop(()=>{if(dirty){light.position.copy(camera.position);renderer.render(scene,camera);dirty=false;}});
try{const response=await fetch('./catalogue.json');if(!response.ok)throw Error('Catalogue HTTP '+response.status);catalogue=(await response.json()).rooms;for(const r of catalogue)select.add(new Option(r.label,r.room));await load(catalogue.some(r=>r.room===location.hash.slice(1))?location.hash.slice(1):'INSIDE-BARROW');}catch(error){status.textContent='Could not load the room catalogue.';console.error(error);}
