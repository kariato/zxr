#!/usr/bin/env node
/**
 * End-to-end Depth-Guided Decomposed Scene -> GLB orchestrator.
 *
 * Usage:
 *   node tools/assets/scene-to-glb/run_scene.mjs <scene-spec.json> \
 *     [--out <dir>] [--depth-backend auto|depth-anything|depth-pro|heuristic] \
 *     [--skip-hunyuan] [--render-review] [--compress]
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
const specArg = args.find(a => !a.startsWith('-'));
if (!specArg) {
  console.error('Usage: node tools/assets/scene-to-glb/run_scene.mjs <scene-spec.json> [--out <dir>] [--depth-backend auto|depth-anything|depth-pro|heuristic] [--skip-hunyuan] [--render-review] [--compress]');
  process.exit(1);
}

const specPath = path.resolve(specArg);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : path.join(path.dirname(specPath), 'build');
const backendIdx = args.indexOf('--depth-backend');
const depthBackend = backendIdx >= 0 && args[backendIdx + 1] ? args[backendIdx + 1] : 'auto';
const skipHunyuan = args.includes('--skip-hunyuan');
const renderReview = args.includes('--render-review');
const compress = args.includes('--compress');

const shapePy = path.join(root, 'out/asset-tools/shape-env/bin/python3');
if (!existsSync(shapePy)) {
  console.error('Expected Python environment at', shapePy);
  process.exit(1);
}

const blender = [
  process.env.BLENDER_BIN,
  '/Applications/Blender.app/Contents/MacOS/Blender',
  'blender',
].filter(Boolean).find(b => b === 'blender' || existsSync(b));
if (!blender) {
  console.error('Blender not found. Set BLENDER_BIN or install Blender.');
  process.exit(1);
}

function step(label, bin, argv) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(bin, argv, { stdio: 'inherit', cwd: root });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// Stage 1: Metric depth estimation on 4 reference views
step('Stage 1 · Metric Depth Estimation', shapePy, [
  path.join(__dirname, 'depth_estimate.py'),
  specPath,
  '--out', outDir,
  '--backend', depthBackend,
]);

// Stage 2: Foreground hero segmentation + background inpainting
step('Stage 2 · Hero Segmentation & Background Inpainting', shapePy, [
  path.join(__dirname, 'segment_and_inpaint.py'),
  specPath,
  '--out', outDir,
]);

// Stage 3: Unproject depth -> unified terrain heightfield + exact 3D hero transforms
step('Stage 3 · Depth-to-Terrain & 3D Layout', shapePy, [
  path.join(__dirname, 'depth_to_layout.py'),
  specPath,
  '--out', outDir,
]);

// Stage 4: Local MLX Hunyuan3D-2 Turbo for each segmented hero cutout
if (!skipHunyuan) {
  step('Stage 4 · Local MLX Hunyuan3D-2 Hero Generation', shapePy, [
    path.join(__dirname, 'generate_heroes.py'),
    specPath,
    '--out', outDir,
  ]);
} else {
  console.log('\n=== Stage 4 · Skipped (--skip-hunyuan) ===');
}

// Stage 5: Blender assembly -> room.glb + optional 4-view review
const blenderArgs = [
  '--factory-startup',
  '--background',
  '--python', path.join(__dirname, 'assemble_scene.py'),
  '--',
  specPath,
  '--out', outDir,
];
if (renderReview) blenderArgs.push('--render-review');
step('Stage 5 · Blender Scene Assembly', blender, blenderArgs);

// Optional Stage 6: gltfpack compression
if (compress) {
  const gltfpack = path.join(root, 'out/asset-tools/assetfurnace/vendor/gltfpack/gltfpack');
  if (!existsSync(gltfpack)) {
    console.error('gltfpack not found at', gltfpack);
    process.exit(1);
  }
  step('Stage 6 · gltfpack Compression', gltfpack, [
    '-i', path.join(outDir, 'room.glb'),
    '-o', path.join(outDir, 'room-browser.glb'),
    '-cc', '-tc', 'color', '-tu', 'normal', '-tq', '8', '-kn', '-ke', '-kv',
  ]);
}
