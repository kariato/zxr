import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const params = new URLSearchParams(location.search);
const roomSlug = params.get('room') || 'well-top';
const pipeline = params.get('pipeline') || 'room-bom';
const folder = pipeline === 'scene-to-glb' ? 'scene-to-glb-prototype' : 'room-bom-prototype';
const baseUrl = `/games/zork2/planning/${folder}/${roomSlug}/build`;
const glbUrl = `${baseUrl}/room.glb`;
const manifestUrl = `${baseUrl}/manifest.json`;
const reviewUrl = `${baseUrl}/review-4view.png`;

const viewport = document.getElementById('viewport');
const statusEl = document.getElementById('status');
const titleEl = document.getElementById('title');
const refDrawer = document.getElementById('ref-drawer');
const refImg = document.getElementById('ref-img');
titleEl.textContent = `Room BOM Preview · ${roomSlug.toUpperCase()}`;
refImg.src = reviewUrl;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.domElement.tabIndex = 0;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1014);

// Load optional equirectangular skybox recorded in manifest.json (matches cavern-backdrop.ts)
fetch(manifestUrl)
  .then(r => (r.ok ? r.json() : null))
  .then(manifest => {
    if (!manifest?.skybox) return;
    new THREE.TextureLoader().load(`/${manifest.skybox}`, tex => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
      scene.backgroundIntensity = 0.85;
    });
  })
  .catch(() => {});

const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);
camera.rotation.order = 'YXZ';

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.maxDistance = 24;
orbit.enabled = false;

// Warm cavern + cool misty depth lighting
scene.add(new THREE.HemisphereLight(0xd9c5a0, 0x263542, 0.85));
const keyLight = new THREE.PointLight(0xffc27a, 18, 24, 1.4);
keyLight.position.set(-1.5, 3.2, -1.8);
scene.add(keyLight);
const eastLight = new THREE.PointLight(0xffb86b, 14, 22, 1.4);
eastLight.position.set(3.4, 2.5, 0.4);
scene.add(eastLight);
const fillLight = new THREE.PointLight(0x6e9fd4, 10, 28, 1.3);
fillLight.position.set(-1.5, 4.2, -10.5);
scene.add(fillLight);
if (roomSlug === 'shallow-ford') {
  scene.fog = new THREE.FogExp2(0x16222c, 0.028);
}

let mode = 'walk'; // 'walk' (first-person WASD + drag look) | 'orbit' (top cutaway)
let yaw = 0.32;
let pitch = -0.14;
let ceilingObj = null;
const loadedMeshes = [];
const wallMeshes = [];

function applyLook() {
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

function enterWalk(pos, nextYaw, nextPitch = -0.1) {
  mode = 'walk';
  orbit.enabled = false;
  if (ceilingObj) ceilingObj.visible = true;
  document.getElementById('toggle-ceiling').setAttribute('aria-pressed', 'true');
  for (const w of wallMeshes) w.visible = true;
  camera.position.set(...pos);
  yaw = nextYaw;
  pitch = nextPitch;
  applyLook();
}

function enterOrbit(pos, target) {
  mode = 'orbit';
  orbit.enabled = true;
  if (ceilingObj) ceilingObj.visible = false;
  document.getElementById('toggle-ceiling').setAttribute('aria-pressed', 'false');
  camera.position.set(...pos);
  orbit.target.set(...target);
  orbit.update();
}

// Note: glTF uses Y-up, -Z = North (yaw 0), +X = East (yaw -PI/2), +Z = South (yaw PI), -X = West (yaw +PI/2)
const walkPresets = roomSlug === 'shallow-ford'
  ? {
      'view-n': [[-2.4, 1.55, 2.6], 0.12, -0.10],
      'view-e': [[-1.5, 1.55, 0.5], -Math.PI / 2, -0.10],
      'view-s': [[-0.5, 1.55, -2.0], Math.PI * 0.88, -0.08],
      'view-w': [[1.8, 1.55, 0.5], Math.PI / 2, -0.10],
    }
  : roomSlug === 'office'
    ? {
        'view-n': [[-0.9, 1.55, 2.4], -0.12, -0.08],
        'view-e': [[-1.4, 1.55, 0.0], -Math.PI / 2, -0.06],
        'view-s': [[0.0, 1.55, -1.0], Math.PI, -0.08],
        'view-w': [[1.2, 1.55, 0.0], Math.PI / 2, -0.06],
      }
    : {
        'view-n': [[0.35, 1.55, 2.1], 0.32, -0.16],
        'view-e': [[-0.4, 1.55, 0.0], -Math.PI / 2, -0.08],
        'view-s': [[0.0, 1.55, -0.8], Math.PI, -0.1],
        'view-w': [[1.0, 1.55, 0.0], Math.PI / 2, -0.1],
      };
enterWalk(...walkPresets['view-n']);

const loader = new GLTFLoader();
loader.load(
  glbUrl,
  gltf => {
    const root = gltf.scene;
    scene.add(root);
    let tris = 0;
    const anchors = [];
    root.traverse(obj => {
      if (obj.name.startsWith('anchor:')) anchors.push(obj.name);
      if (obj.name === 'room-ceiling') ceilingObj = obj;
      if (obj.isMesh) {
        loadedMeshes.push(obj);
        if (obj.name.startsWith('wall-')) wallMeshes.push(obj);
        const geom = obj.geometry;
        tris += geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
      }
    });
    statusEl.textContent = `Loaded ${roomSlug}/room.glb · ${loadedMeshes.length} meshes · ${Math.round(tris).toLocaleString()} tris` +
      (anchors.length ? ` · Anchors: ${anchors.join(', ')}` : '');
  },
  undefined,
  err => {
    statusEl.textContent = `Failed to load ${glbUrl}: ${err.message || err}`;
  },
);

for (const [id, args] of Object.entries(walkPresets)) {
  document.getElementById(id).addEventListener('click', () => enterWalk(...args));
}
document.getElementById('view-top').addEventListener('click', () => {
  enterOrbit([0.0, 7.5, 8.5], [0.0, 0.8, 0.0]);
});

const ceilingBtn = document.getElementById('toggle-ceiling');
ceilingBtn.addEventListener('click', () => {
  const next = ceilingBtn.getAttribute('aria-pressed') !== 'true';
  ceilingBtn.setAttribute('aria-pressed', String(next));
  if (ceilingObj) ceilingObj.visible = next;
});

const wireBtn = document.getElementById('toggle-wire');
wireBtn.addEventListener('click', () => {
  const next = wireBtn.getAttribute('aria-pressed') !== 'true';
  wireBtn.setAttribute('aria-pressed', String(next));
  for (const m of loadedMeshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) mat.wireframe = next;
  }
});

const refBtn = document.getElementById('toggle-ref');
refBtn.addEventListener('click', () => {
  const next = refBtn.getAttribute('aria-pressed') !== 'true';
  refBtn.setAttribute('aria-pressed', String(next));
  refDrawer.classList.toggle('open', next);
});

// First-person drag-to-look in walk mode
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => {
  renderer.domElement.focus();
  if (mode !== 'walk') return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (mode !== 'walk' || !drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  yaw -= dx * 0.0055;
  pitch = Math.max(-1.35, Math.min(1.35, pitch - dy * 0.0055));
  applyLook();
});
const endDrag = e => {
  if (drag && drag.id === e.pointerId) drag = null;
};
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// WASD / Arrow walking (works immediately anywhere on the page)
const keys = new Set();
const walkCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', e => {
  if (e.target instanceof Element && e.target.closest('input,textarea,select')) return;
  if (!walkCodes.has(e.code)) return;
  e.preventDefault();
  keys.add(e.code);
  if (mode !== 'walk') {
    // Drop back into first-person walk from current look direction
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    enterWalk([0.35, 1.55, 2.1], Math.atan2(-dir.x, -dir.z), -0.1);
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); drag = null; });

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
resize();

const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (mode === 'walk') {
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.5 : 3.0) * dt;
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    if (keys.has('KeyW') || keys.has('ArrowUp')) camera.position.addScaledVector(forward, speed);
    if (keys.has('KeyS') || keys.has('ArrowDown')) camera.position.addScaledVector(forward, -speed);
    if (keys.has('KeyD') || keys.has('ArrowRight')) camera.position.addScaledVector(right, speed);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) camera.position.addScaledVector(right, -speed);
    applyLook();
  } else {
    orbit.update();
    // Auto-hide front-blocking walls in Top cutaway / orbit mode
    for (const w of wallMeshes) {
      if (w.name === 'wall-S') w.visible = camera.position.z < 3.6;
      else if (w.name === 'wall-N') w.visible = camera.position.z > -3.6;
      else if (w.name === 'wall-E') w.visible = camera.position.x < 4.0;
      else if (w.name === 'wall-W') w.visible = camera.position.x > -4.0;
    }
  }

  renderer.render(scene, camera);
}
animate();
