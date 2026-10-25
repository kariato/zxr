import * as THREE from 'three';
import { GLTFLoader,type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface Asset {id:string;sourceIdentity:string;label:string;reference:string|null;status:string;model:string|null}
const host=document.querySelector<HTMLDivElement>('#scene')!,status=document.querySelector<HTMLElement>('#status')!,select=document.querySelector<HTMLSelectElement>('#asset')!,animation=document.querySelector<HTMLSelectElement>('#animation')!;
const scene=new THREE.Scene();scene.background=new THREE.Color('#293337');
const camera=new THREE.PerspectiveCamera(36,1,.001,200);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;host.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xe1efff,0x77644a,2.1));
const light=new THREE.DirectionalLight(0xffefd9,2.5);light.position.set(-2,4,4);scene.add(light);
const rim=new THREE.DirectionalLight(0xb3cfff,1.5);rim.position.set(2,3,-3);scene.add(rim);
const floor=new THREE.Mesh(new THREE.CircleGeometry(1,64),new THREE.MeshStandardMaterial({color:0x3d4547,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
let current:GLTF|undefined,mixer:THREE.AnimationMixer|undefined,action:THREE.AnimationAction|undefined,generation=0,distance=3,wire=false;
function release(gltf:GLTF){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
  gltf.scene.traverse(n=>{if(n instanceof THREE.Mesh){geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}}if(n instanceof THREE.SkinnedMesh)skeletons.add(n.skeleton);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());skeletons.forEach(s=>s.dispose());gltf.scene.removeFromParent();
}
function view(back=false){camera.position.set(distance*.4,distance*.22,(back?-1:1)*distance);controls.target.set(0,0,0);controls.update();}
document.querySelector('#front')!.addEventListener('click',()=>view());document.querySelector('#back')!.addEventListener('click',()=>view(true));
const wireButton=document.querySelector<HTMLButtonElement>('#wire')!;
function applyWire(){current?.scene.traverse(n=>{if(n instanceof THREE.Mesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m instanceof THREE.MeshStandardMaterial)m.wireframe=wire;});}
wireButton.addEventListener('click',()=>{wire=!wire;wireButton.textContent=wire?'Hide wireframe':'Show wireframe';applyWire();});
const response=await fetch('/games/zork2/assets/catalog.json');if(!response.ok)throw new Error('Asset catalogue unavailable');
const catalog=await response.json() as {objects:Asset[]};
const assets=catalog.objects.filter(a=>/^[a-z0-9_-]+$/.test(a.id)&&['local-mesh-candidate','local-animated-candidate'].includes(a.status));
for(const asset of assets)select.add(new Option(asset.label+' ('+asset.sourceIdentity+')',asset.id));
async function load(){
  const asset=assets.find(a=>a.id===select.value);if(!asset)return;
  const request=++generation;status.textContent='Loading '+asset.label+'…';animation.replaceChildren(new Option('Rest pose',''));
  mixer?.stopAllAction();if(current){mixer?.uncacheRoot(current.scene);release(current);current=undefined;}mixer=undefined;action=undefined;
  document.querySelector<HTMLImageElement>('#reference')!.src=asset.reference?'/games/zork2/assets/'+asset.reference:'';
  try{
    if(!asset.model?.startsWith('/out/'))throw new Error('No local model');
    const gltf=await new GLTFLoader().loadAsync(asset.model);
    if(request!==generation){release(gltf);return;}current=gltf;
    const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    gltf.scene.position.sub(center);scene.add(gltf.scene);const span=Math.max(size.x,size.y,size.z,.05);
    distance=span/2/Math.tan(THREE.MathUtils.degToRad(18))*1.2;camera.near=Math.max(span/1000,.001);camera.far=span*100;camera.updateProjectionMatrix();
    floor.position.y=-size.y/2-.001;floor.scale.setScalar(span*1.2);view();applyWire();
    let triangles=0,bones=0;const materials=new Set<THREE.Material>();
    gltf.scene.traverse(n=>{if(n instanceof THREE.Bone)bones++;if(n instanceof THREE.Mesh){triangles+=(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3;for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);}});
    status.textContent=`${asset.sourceIdentity}: ${triangles.toLocaleString()} triangles · ${bones} bones · ${materials.size} material(s) · ${gltf.animations.length} clips · ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m. Draft candidate.`;
    mixer=new THREE.AnimationMixer(gltf.scene);for(const clip of gltf.animations)animation.add(new Option(clip.name,clip.name));
    const initial=gltf.animations.find(clip=>clip.name.toLowerCase()==='idle')??gltf.animations[0];
    if(initial){animation.value=initial.name;animation.dispatchEvent(new Event('change'));}
  }catch(error){if(request===generation)status.textContent='Unable to load local candidate: '+String(error);}
}
animation.addEventListener('change',()=>{action?.stop();const clip=current?.animations.find(c=>c.name===animation.value);action=clip?mixer?.clipAction(clip):undefined;if(action){action.reset();const once=['open','close'].includes(clip!.name.toLowerCase());action.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);action.clampWhenFinished=once;action.play();}});
select.addEventListener('change',()=>void load());
const requested=new URLSearchParams(location.search).get('asset');if(requested&&assets.some(a=>a.id===requested))select.value=requested;
await load();
new ResizeObserver(()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);}).observe(host);
let previous=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-previous)/1000,.05);previous=now;mixer?.update(dt);controls.update();renderer.render(scene,camera);});
