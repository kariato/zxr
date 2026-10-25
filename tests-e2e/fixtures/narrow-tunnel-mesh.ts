import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const host=document.querySelector<HTMLElement>('#viewer')!;
const status=document.querySelector<HTMLElement>('#status')!;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
host.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#17242a');
const camera=new THREE.PerspectiveCamera(40,1,.01,1000);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight('#edf5ef','#68706b',2.5));
for(const [x,y,z,intensity] of [[-10,20,20,3],[15,12,-10,2]]){
  const light=new THREE.DirectionalLight('#fff4df',intensity);light.position.set(x!,y!,z!);scene.add(light);
}
let center=new THREE.Vector3(),span=20,wireframe=false;
const materials:THREE.MeshStandardMaterial[]=[];
function view(back:boolean){
  camera.position.copy(center).add(new THREE.Vector3(back ? .35 : 0,.4,back ? -1.4 : 1.4).multiplyScalar(span));
  controls.target.copy(center);controls.update();
}
document.querySelector('#front')!.addEventListener('click',()=>view(false));
document.querySelector('#back')!.addEventListener('click',()=>view(true));
document.querySelector('#wireframe')!.addEventListener('click',()=>{
  wireframe=!wireframe;for(const material of materials)material.wireframe=wireframe;
});
const resize=new ResizeObserver(()=>{
  const width=host.clientWidth,height=host.clientHeight;
  renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
});resize.observe(host);
new GLTFLoader().load('/out/asset-production/narrow-tunnel-v1/candidate.glb',gltf=>{
  const bounds=new THREE.Box3().setFromObject(gltf.scene);center=bounds.getCenter(new THREE.Vector3());
  span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  let triangles=0;
  gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){
    triangles+=(object.geometry.index?.count??object.geometry.attributes.position!.count)/3;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(material instanceof THREE.MeshStandardMaterial)materials.push(material);
    }
  }});
  scene.add(gltf.scene);controls.minDistance=span*.15;controls.maxDistance=span*5;view(false);
  status.textContent=`Actual Hunyuan mesh · ${triangles.toLocaleString()} triangles · ready`;
  host.dataset.ready='true';
},undefined,error=>{status.textContent='Unable to load candidate: '+String(error);host.dataset.ready='failed';});
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);resize.disconnect();controls.dispose();renderer.dispose();},{once:true});
