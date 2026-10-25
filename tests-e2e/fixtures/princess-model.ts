import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host = document.querySelector<HTMLDivElement>('#scene')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const select = document.querySelector<HTMLSelectElement>('#animation')!;
const pause = document.querySelector<HTMLButtonElement>('#pause')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#252d39');
const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 50);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
host.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
function front() { camera.position.set(0, 1.05, 3.3); controls.target.set(0, 0.9, 0); controls.update(); }
front();
document.querySelector('#front')!.addEventListener('click', front);
document.querySelector('#back')!.addEventListener('click', () => { camera.position.set(0, 1.05, -3.3); controls.target.set(0, .9, 0); controls.update(); });
document.querySelector('#face')!.addEventListener('click', () => { camera.position.set(0, 1.5, .72); controls.target.set(0, 1.48, 0); controls.update(); });
scene.add(new THREE.HemisphereLight(0xe2efff, 0x6c5a46, 2.1));
const key = new THREE.DirectionalLight(0xffefd8, 2.5);
key.position.set(-2, 4, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0xa7caff, 1.6);
rim.position.set(2, 3, -3); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(2, 64), new THREE.MeshStandardMaterial({ color: 0x363d46, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.005; scene.add(floor);
let mixer: THREE.AnimationMixer | undefined;
let action: THREE.AnimationAction | undefined;
let paused = false;
try {
  const gltf = await new GLTFLoader().loadAsync('/out/asset-tools/princess/princess-v1.glb');
  scene.add(gltf.scene);
  let triangles = 0; let bones = 0; const materials = new Set<THREE.Material>();
  gltf.scene.traverse(object => {
    if (object instanceof THREE.Bone) bones++;
    if (object instanceof THREE.Mesh) {
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  status.textContent = `${triangles.toLocaleString()} triangles · ${bones} bones · ${materials.size} material(s) · ${gltf.animations.length} body clips. Face is static.`;
  mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) select.add(new Option(clip.name, clip.name));
  select.addEventListener('change', () => {
    action?.stop();
    const clip = gltf.animations.find(clip => clip.name === select.value);
    action = clip ? mixer!.clipAction(clip) : undefined;
    action?.reset().play();
    pause.disabled = !action;
  });
  pause.addEventListener('click', () => { paused = !paused; pause.textContent = paused ? 'Play' : 'Pause'; });
  if (gltf.animations[0]) { select.value = gltf.animations[0].name; select.dispatchEvent(new Event('change')); }
} catch (error) { status.textContent = `Model unavailable: ${String(error)}`; }
new ResizeObserver(() => {
  camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
}).observe(host);
let previous = performance.now();
renderer.setAnimationLoop(now => {
  const delta = Math.min((now - previous) / 1000, 0.05); previous = now;
  if (!paused) mixer?.update(delta);
  controls.update(); renderer.render(scene, camera);
});
