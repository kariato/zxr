import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRoomAssetLoader } from './prototype/room-asset-loader.ts';
import cavernSkyboxUrl from './prototype/assets/cavern-skybox-v1.png?url';
import barrowSkyboxUrl from './prototype/assets/barrow-night-forest-v3.jpg?url';
import lairSkyboxUrl from './prototype/assets/lair-skybox-v1.png?url';
import movablePropsData from './prototype/assets/movable-props.json';
import { REBUILT_ROOMS, type RoomPreviewEntry, type SkyboxKey, type WalkPreset } from './room-preview-catalog.ts';

const PROP_GLB_URLS = import.meta.glob('./prototype/assets/{*.glb,props/*.glb}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const PROP_BY_ID = new Map<string, { url: string; defaultSize?: readonly number[] }>();
for (const entry of movablePropsData.assets) {
  const url = PROP_GLB_URLS[`./prototype/assets/${entry.file}`];
  if (url) {
    PROP_BY_ID.set(entry.id.toUpperCase(), { url, defaultSize: entry.sizeMetres });
  }
}

const SKYBOX_URLS: Record<SkyboxKey, string> = {
  cavern: cavernSkyboxUrl,
  barrow: barrowSkyboxUrl,
  lair: lairSkyboxUrl,
};

const APPROVED_ROOMS: Record<string, RoomPreviewEntry> = {
  'carousel-room': {
    label: 'Carousel Room',
    approved: true,
    presets: {
      'view-n': [[0.0, 1.7, 5.4], 0.0, 0.08],
      'view-e': [[-5.4, 1.7, 0.0], -Math.PI / 2, 0.08],
      'view-s': [[0.0, 1.7, -5.4], Math.PI, 0.08],
      'view-w': [[5.4, 1.7, 0.0], Math.PI / 2, 0.08],
    },
  },
  'inside-barrow': {
    label: 'Inside the Barrow',
    approved: true,
    skybox: 'barrow',
    presets: {
      'view-n': [[0.0, 1.62, -2.25], Math.PI, -0.08],
      'view-e': [[-1.2, 1.62, 0.0], -Math.PI / 2, -0.08],
      'view-s': [[0.0, 1.62, 1.8], 0.0, -0.08],
      'view-w': [[1.2, 1.62, 0.0], Math.PI / 2, -0.08],
    },
  },
  office: {
    label: "Chairman's Office",
    approved: true,
    presets: {
      'view-n': [[-0.9, 1.55, 2.4], -0.12, -0.08],
      'view-e': [[-1.4, 1.55, 0.0], -Math.PI / 2, -0.06],
      'view-s': [[0.0, 1.55, -1.0], Math.PI, -0.08],
      'view-w': [[1.2, 1.55, 0.0], Math.PI / 2, -0.06],
    },
  },
  'shallow-ford': {
    label: 'Shallow Ford',
    approved: true,
    skybox: 'cavern',
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
    approved: true,
    presets: {
      'view-n': [[0.35, 1.55, 2.1], 0.32, -0.16],
      'view-e': [[-0.4, 1.55, 0.0], -Math.PI / 2, -0.08],
      'view-s': [[0.0, 1.55, -0.8], Math.PI, -0.10],
      'view-w': [[1.0, 1.55, 0.0], Math.PI / 2, -0.10],
    },
  },
};

const ROOMS: Record<string, RoomPreviewEntry> = {
  ...APPROVED_ROOMS,
  ...REBUILT_ROOMS,
};

const DEFAULT_ROOM = APPROVED_ROOMS['carousel-room']!;
function getRoom(slug: string): RoomPreviewEntry {
  return ROOMS[slug] ?? DEFAULT_ROOM;
}

type RoomKey = string;

const params = new URLSearchParams(location.search);
const requestedRoom = params.get('room');
const initialRoom: RoomKey = requestedRoom && requestedRoom in ROOMS ? requestedRoom : 'carousel-room';

const viewport = document.getElementById('viewport')!;
const statusEl = document.getElementById('status')!;
const titleEl = document.getElementById('title')!;
const selectEl = document.getElementById('room-select') as HTMLSelectElement;
const ceilingBtn = document.getElementById('toggle-ceiling')!;
const propsBtn = document.getElementById('toggle-props');
const wireBtn = document.getElementById('toggle-wire')!;

selectEl.innerHTML = '';
const approvedGroup = document.createElement('optgroup');
approvedGroup.label = `Approved (${Object.keys(APPROVED_ROOMS).length})`;
for (const [slug, cfg] of Object.entries(APPROVED_ROOMS)) {
  const opt = document.createElement('option');
  opt.value = slug;
  opt.textContent = `${cfg.label} ✓`;
  approvedGroup.appendChild(opt);
}
selectEl.appendChild(approvedGroup);

const rebuiltGroup = document.createElement('optgroup');
rebuiltGroup.label = `Rebuilt via Room BOM (${Object.keys(REBUILT_ROOMS).length})`;
for (const [slug, cfg] of Object.entries(REBUILT_ROOMS)) {
  const opt = document.createElement('option');
  opt.value = slug;
  opt.textContent = `${cfg.label} (${slug})`;
  rebuiltGroup.appendChild(opt);
}
selectEl.appendChild(rebuiltGroup);
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
let previewPropsGroup: THREE.Group | null = null;
let showProps = true;
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
  const cfg = getRoom(slug);
  titleEl.textContent = `ZXR Room Prototype · ${cfg.label}`;
  statusEl.textContent = `Loading ${cfg.label}…`;

  if (roomRoot) {
    scene.remove(roomRoot);
    roomRoot = null;
  }
  if (previewPropsGroup) {
    scene.remove(previewPropsGroup);
    previewPropsGroup = null;
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
    textureLoader.load(SKYBOX_URLS[cfg.skybox], tex => {
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
      const anchorNodes: THREE.Object3D[] = [];
      roomRoot.updateMatrixWorld(true);
      roomRoot.traverse(obj => {
        if (obj.name.startsWith('anchor:')) {
          anchors.push(obj.name);
          anchorNodes.push(obj);
        }
        if (obj.name === 'room-ceiling') ceilingObj = obj;
        if (obj instanceof THREE.Mesh) {
          loadedMeshes.push(obj);
          if (obj.name.startsWith('wall-')) wallMeshes.push(obj);
          const geom = obj.geometry;
          tris += geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
        }
      });

      // Overlay starting ZIL prop models at anchor:* nodes (preview-only; not baked into room.glb)
      const propsGroup = new THREE.Group();
      propsGroup.name = 'preview-zil-props';
      propsGroup.visible = showProps;
      previewPropsGroup = propsGroup;
      scene.add(propsGroup);

      const FLAT_ANCHORS = new Set(['TOP-ETCHINGS', 'BOTTOM-ETCHINGS', 'PENTAGRAM', 'PCRACK', 'KEYHOLE-1', 'KEYHOLE-2', 'SLOT', 'LEAK', 'POOL', 'HEDGES']);
      const TABLE_ANCHORS = new Set(['ALICE-TABLE', 'GAZEBO-TABLE', 'WORKBENCH', 'PTABLE']);
      for (const anchor of anchorNodes) {
        const zilId = anchor.name.slice('anchor:'.length).toUpperCase();
        if (FLAT_ANCHORS.has(zilId)) continue;
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        anchor.getWorldPosition(pos);
        anchor.getWorldQuaternion(quat);
        const rawSize = Array.isArray(anchor.userData?.sizeMetres) ? anchor.userData.sizeMetres as number[] : null;
        const spec = PROP_BY_ID.get(zilId);
        const sz = rawSize ?? (spec?.defaultSize ? [...spec.defaultSize] : [0.45, 0.45, 0.45]);
        // Blender [w_X, d_Y, h_Z] -> Three.js [X, Y=height, Z=depth]
        const tw = sz[0] ?? 0.45;
        const td = sz[1] ?? 0.45;
        const th = sz[2] ?? 0.45;

        if (spec) {
          assetLoader.load(
            spec.url,
            propGltf => {
              if (currentRoom !== slug || previewPropsGroup !== propsGroup) return;
              const root = propGltf.scene;
              const box = new THREE.Box3().setFromObject(root);
              const bsize = box.getSize(new THREE.Vector3());
              const bcenter = box.getCenter(new THREE.Vector3());
              const maxDim = Math.max(bsize.x, bsize.y, bsize.z, 1e-4);
              const targetMax = Math.max(tw, td, th, 0.15);
              const s = targetMax / maxDim;
              root.scale.setScalar(s);
              root.position.set(-bcenter.x * s, -box.min.y * s, -bcenter.z * s);
              const holder = new THREE.Group();
              holder.name = `preview-prop:${zilId}`;
              holder.position.copy(pos);
              holder.quaternion.copy(quat);
              holder.add(root);
              propsGroup.add(holder);
            },
            () => {},
          );
        } else if (TABLE_ANCHORS.has(zilId)) {
          const holder = new THREE.Group();
          holder.position.copy(pos);
          holder.quaternion.copy(quat);
          const mat = new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.72 });
          const top = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.08, td), mat);
          top.position.y = th - 0.04;
          holder.add(top);
          for (const sx of [-1, 1]) {
            for (const szSign of [-1, 1]) {
              const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, th - 0.08, 0.08), mat);
              leg.position.set(sx * (tw * 0.5 - 0.12), (th - 0.08) * 0.5, szSign * (td * 0.5 - 0.12));
              holder.add(leg);
            }
          }
          propsGroup.add(holder);
        } else {
          const color = zilId === 'AQUARIUM' ? 0x267078 : zilId === 'BUCKET' ? 0x6b472a : 0x7d5a38;
          const geom = zilId === 'BUCKET'
            ? new THREE.CylinderGeometry(Math.min(tw, td) * 0.5, Math.min(tw, td) * 0.4, th, 16)
            : new THREE.BoxGeometry(tw, th, td);
          const mesh = new THREE.Mesh(
            geom,
            new THREE.MeshStandardMaterial({ color, roughness: zilId === 'AQUARIUM' ? 0.2 : 0.7, transparent: zilId === 'AQUARIUM', opacity: zilId === 'AQUARIUM' ? 0.65 : 1 }),
          );
          mesh.position.set(pos.x, pos.y + th * 0.5, pos.z);
          mesh.quaternion.copy(quat);
          propsGroup.add(mesh);
        }
      }

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
  document.getElementById(id)!.addEventListener('click', () => enterWalk(getRoom(currentRoom).presets[id]));
}
document.getElementById('view-top')!.addEventListener('click', () => {
  enterOrbit([0.0, 8.5, 9.5], [0.0, 0.8, 0.0]);
});

ceilingBtn.addEventListener('click', () => {
  const next = ceilingBtn.getAttribute('aria-pressed') !== 'true';
  ceilingBtn.setAttribute('aria-pressed', String(next));
  if (ceilingObj) ceilingObj.visible = next;
});

propsBtn?.addEventListener('click', () => {
  showProps = propsBtn.getAttribute('aria-pressed') !== 'true';
  propsBtn.setAttribute('aria-pressed', String(showProps));
  if (previewPropsGroup) previewPropsGroup.visible = showProps;
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
  if (mode !== 'walk') enterWalk(getRoom(currentRoom).presets['view-n']);
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
