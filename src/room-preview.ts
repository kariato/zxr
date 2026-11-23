import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRoomAssetLoader } from './prototype/room-asset-loader.ts';
import cavernSkyboxUrl from './prototype/assets/cavern-skybox-v1.png?url';

type RoomKey = 'office' | 'shallow-ford' | 'well-top';
type WalkPreset = readonly [[number, number, number], number, number];

const ROOMS: Record<RoomKey, { label: string; skybox?: string; fog?: number; presets: Record<'view-n' | 'view-e' | 'view-s' | 'view-w', WalkPreset> }> = {
  office: {
    label: "Chairman's Office",
    presets: {
      'view-n': [[-0.9, 1.55, 2.4], -0.12, -0.08],
      'view-e': [[-1.4, 1.55, 0.0], -Math.PI / 2, -0.06],
      'view-s': [[0.0, 1.55, -1.0], Math.PI, -0.08],
      'view-w': [[1.2, 1.55, 0.0], Math.PI / 2, -0.06],
    },
  },
  'shallow-ford': {
    label: 'Shallow Ford',
    skybox: cavernSkyboxUrl,
    fog: 0x16222c,
    presets: {
      'view-n': [[-2.4, 1.55, 2.6], 0.12, -0.10],
      'view-e': [[-1.5, 1.55, 0.5], -Math.PI / 2, -0.10],
      'view-s': [[-0.5, 1.55, -2.0], Math.PI * 0.88, -0.08],
      'view-w': [[1.8, 1.55, 0.5], Math.PI / 2, -0.10],
    },
  },
  'well-top': {
    label: 'Top of Well',
    presets: {
      'view-n': [[0.35, 1.55, 2.1], 0.32, -0.16],
      'view-e': [[-0.4, 1.55, 0.0], -Math.PI / 2, -0.08],
      'view-s': [[0.0, 1.55, -0.8], Math.PI, -0.10],
      'view-w': [[1.0, 1.55, 0.0], Math.PI / 2, -0.10],
    },
  },
};

const params = new URLSearchParams(location.search);
const initialRoom = (params.get('room') as RoomKey) in ROOMS ? (params.get('room') as RoomKey) : 'office';

const viewport = document.getElementById('viewport')!;
const statusEl = document.getElementById('status')!;
const titleEl = document.getElementById('title')!;
const selectEl = document.getElementById('room-select') as HTMLSelectElement;
const ceilingBtn = document.getElementById('toggle-ceiling')!;
const wireBtn = document.getElementById('toggle-wire')!;
selectEl.value = initialRoom;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.domElement.tabIndex = 0;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1014);

const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 100);
camera.rotation.order = 'YXZ';

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.maxDistance = 32;
orbit.enabled = false;

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

const assetLoader = createRoomAssetLoader(renderer);
const textureLoader = new THREE.TextureLoader();

let currentRoom: RoomKey = initialRoom;
let mode: 'walk' | 'orbit' = 'walk';
let yaw = 0;
let pitch = -0.1;
let roomRoot: THREE.Object3D | null = null;
let ceilingObj: THREE.Object3D | null = null;
let loadedMeshes: THREE.Mesh[] = [];
let wallMeshes: THREE.Mesh[] = [];
let skyboxTexture: THREE.Texture | null = null;

function applyLook() {
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

function enterWalk(preset: WalkPreset) {
  const [pos, nextYaw, nextPitch] = preset;
  mode = 'walk';
  orbit.enabled = false;
  if (ceilingObj) ceilingObj.visible = true;
  ceilingBtn.setAttribute('aria-pressed', 'true');
  for (const w of wallMeshes) w.visible = true;
  camera.position.set(pos[0], pos[1], pos[2]);
  yaw = nextYaw;
  pitch = nextPitch;
  applyLook();
}

function enterOrbit(pos: [number, number, number], target: [number, number, number]) {
  mode = 'orbit';
  orbit.enabled = true;
  if (ceilingObj) ceilingObj.visible = false;
  ceilingBtn.setAttribute('aria-pressed', 'false');
  camera.position.set(pos[0], pos[1], pos[2]);
  orbit.target.set(target[0], target[1], target[2]);
  orbit.update();
}

function loadRoom(slug: RoomKey) {
  currentRoom = slug;
  const cfg = ROOMS[slug];
  titleEl.textContent = `ZXR Room Prototype · ${cfg.label}`;
  statusEl.textContent = `Loading ${cfg.label}…`;

  if (roomRoot) {
    scene.remove(roomRoot);
    roomRoot = null;
  }
  if (skyboxTexture) {
    skyboxTexture.dispose();
    skyboxTexture = null;
  }
  ceilingObj = null;
  loadedMeshes = [];
  wallMeshes = [];
  wireBtn.setAttribute('aria-pressed', 'false');

  scene.fog = cfg.fog ? new THREE.FogExp2(cfg.fog, 0.028) : null;
  if (cfg.skybox) {
    textureLoader.load(cfg.skybox, tex => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      skyboxTexture = tex;
      scene.background = tex;
      scene.backgroundIntensity = 0.85;
    });
  } else {
    scene.background = new THREE.Color(0x0b1014);
  }

  enterWalk(cfg.presets['view-n']);

  const glbUrl = `${import.meta.env.BASE_URL}room-preview/rooms/${slug}/room.glb`;
  assetLoader.load(
    glbUrl,
    gltf => {
      if (currentRoom !== slug) return;
      roomRoot = gltf.scene;
      scene.add(roomRoot);
      let tris = 0;
      const anchors: string[] = [];
      roomRoot.traverse(obj => {
        if (obj.name.startsWith('anchor:')) anchors.push(obj.name);
        if (obj.name === 'room-ceiling') ceilingObj = obj;
        if (obj instanceof THREE.Mesh) {
          loadedMeshes.push(obj);
          if (obj.name.startsWith('wall-')) wallMeshes.push(obj);
          const geom = obj.geometry;
          tris += geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
        }
      });
      statusEl.textContent =
        `Loaded ${slug}/room.glb · ${loadedMeshes.length} meshes · ${Math.round(tris).toLocaleString()} tris` +
        (anchors.length ? ` · Anchors: ${anchors.join(', ')}` : '');
    },
    () => {
      statusEl.textContent = `Failed to load ${glbUrl}`;
    },
  );
}

selectEl.addEventListener('change', () => {
  const next = selectEl.value as RoomKey;
  const url = new URL(location.href);
  url.searchParams.set('room', next);
  history.replaceState(null, '', url);
  loadRoom(next);
});

for (const id of ['view-n', 'view-e', 'view-s', 'view-w'] as const) {
  document.getElementById(id)!.addEventListener('click', () => enterWalk(ROOMS[currentRoom].presets[id]));
}
document.getElementById('view-top')!.addEventListener('click', () => {
  enterOrbit([0.0, 8.5, 9.5], [0.0, 0.8, 0.0]);
});

ceilingBtn.addEventListener('click', () => {
  const next = ceilingBtn.getAttribute('aria-pressed') !== 'true';
  ceilingBtn.setAttribute('aria-pressed', String(next));
  if (ceilingObj) ceilingObj.visible = next;
});

wireBtn.addEventListener('click', () => {
  const next = wireBtn.getAttribute('aria-pressed') !== 'true';
  wireBtn.setAttribute('aria-pressed', String(next));
  for (const m of loadedMeshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) (mat as THREE.MeshStandardMaterial).wireframe = next;
  }
});

let drag: { id: number; x: number; y: number } | null = null;
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
const endDrag = (e: PointerEvent) => {
  if (drag && drag.id === e.pointerId) drag = null;
};
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

const keys = new Set<string>();
const walkCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', e => {
  if (e.target instanceof Element && e.target.closest('input,textarea,select')) return;
  if (!walkCodes.has(e.code)) return;
  e.preventDefault();
  keys.add(e.code);
  if (mode !== 'walk') enterWalk(ROOMS[currentRoom].presets['view-n']);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  drag = null;
});

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
    for (const w of wallMeshes) {
      if (w.name === 'wall-S') w.visible = camera.position.z < 3.6;
      else if (w.name === 'wall-N') w.visible = camera.position.z > -3.6;
      else if (w.name === 'wall-E') w.visible = camera.position.x < 4.0;
      else if (w.name === 'wall-W') w.visible = camera.position.x > -4.0;
    }
  }
  renderer.render(scene, camera);
}

loadRoom(initialRoom);
animate();
