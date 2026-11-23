#!/usr/bin/env node
/**
 * Validate a room-bom.json against schema.json, run Blender assembly, and
 * optionally compress the output GLB with gltfpack (preserving anchor:* nodes).
 *
 * Usage:
 *   node tools/assets/room-bom/run_room.mjs <room-bom.json> [--out <dir>] [--render-review] [--compress]
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
const bomArg = args.find(a => !a.startsWith('-'));
if (!bomArg) {
  console.error('Usage: node tools/assets/room-bom/run_room.mjs <room-bom.json> [--out <dir>] [--render-review] [--compress]');
  process.exit(1);
}

const bomPath = path.resolve(bomArg);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : path.join(path.dirname(bomPath), 'build');
const renderReview = args.includes('--render-review');
const compress = args.includes('--compress');

// 1. Validate BOM against JSON Schema
const schema = JSON.parse(await readFile(path.join(__dirname, 'schema.json'), 'utf8'));
const bom = JSON.parse(await readFile(bomPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);
if (!validate(bom)) {
  console.error('BOM schema validation failed:\n', JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}
console.log(`Validated BOM for ${bom.room} (${Object.keys(bom.surfaces).length} surfaces, ${bom.objects.length} objects)`);

// 2. Locate Blender
const blenderCandidates = [
  process.env.BLENDER_BIN,
  '/Applications/Blender.app/Contents/MacOS/Blender',
  'blender',
].filter(Boolean);
const blender = blenderCandidates.find(b => b === 'blender' || existsSync(b));
if (!blender) {
  console.error('Blender not found. Set BLENDER_BIN or install Blender.');
  process.exit(1);
}

const blenderArgs = [
  '--factory-startup',
  '--background',
  '--python',
  path.join(__dirname, 'assemble_room.py'),
  '--',
  bomPath,
  '--out',
  outDir,
];
if (renderReview) blenderArgs.push('--render-review');

const run = spawnSync(blender, blenderArgs, { stdio: 'inherit' });
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

// 3. Optional gltfpack compression (keeps anchor:* node names via -kn)
if (compress) {
  const gltfpack = path.join(root, 'out/asset-tools/assetfurnace/vendor/gltfpack/gltfpack');
  if (!existsSync(gltfpack)) {
    console.error('gltfpack not found at', gltfpack);
    process.exit(1);
  }
  const srcGlb = path.join(outDir, 'room.glb');
  const dstGlb = path.join(outDir, 'room-browser.glb');
  const pack = spawnSync(
    gltfpack,
    ['-i', srcGlb, '-o', dstGlb, '-cc', '-tc', 'color', '-tu', 'normal', '-tq', '8', '-kn', '-ke', '-kv'],
    { stdio: 'inherit' },
  );
  if (pack.status !== 0) process.exit(pack.status ?? 1);
  console.log('Compressed GLB written to', path.relative(root, dstGlb));
}
