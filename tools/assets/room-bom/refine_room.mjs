#!/usr/bin/env node
/**
 * Iterative Visual-Diff Critique & Refinement Loop for Room BOMs.
 *
 * Renders 4-view GLB previews alongside the 4 reference images (`review-4view.png`),
 * computes a quantitative visual-diff score + textual critique (`review-critique.txt`),
 * writes a combined room-description + feedback prompt (`refinement-feedback.md`),
 * optionally auto-tunes lighting/surface parameters from the diff (`--auto-tune`),
 * and loops until the score plateaus or gets worse (automatically rolling back to
 * the highest-scoring iteration).
 *
 * Usage:
 *   node tools/assets/room-bom/refine_room.mjs <slug-or-room-bom.json> [--max-iters 5] [--auto-tune] [--publish]
 */
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
const targetArg = args.find(a => !a.startsWith('-'));

if (!targetArg) {
  console.error('Usage: node tools/assets/room-bom/refine_room.mjs <slug-or-room-bom.json> [--max-iters 5] [--auto-tune] [--publish]');
  process.exit(1);
}

const maxItersIdx = args.indexOf('--max-iters');
const maxIters = maxItersIdx >= 0 ? Math.max(1, Number(args[maxItersIdx + 1]) || 4) : 4;
const autoTune = args.includes('--auto-tune');
const publish = args.includes('--publish');

const bomPath = targetArg.endsWith('.json')
  ? path.resolve(targetArg)
  : path.join(ROOT, 'games/zork2/planning/room-bom-prototype', targetArg, 'room-bom.json');

if (!existsSync(bomPath)) {
  console.error('BOM not found:', bomPath);
  process.exit(1);
}

const slug = path.basename(path.dirname(bomPath));
const buildDir = path.join(path.dirname(bomPath), 'build');
const histRoot = path.join(buildDir, 'refinement-history');
await mkdir(histRoot, { recursive: true });

// Safety check: refuse to overwrite approved rooms unless explicitly passed as full path
const approvedPath = path.join(ROOT, 'games/zork2/planning/room-bom-prototype/approved-rooms.json');
if (existsSync(approvedPath) && !targetArg.endsWith('.json')) {
  const approved = JSON.parse(await readFile(approvedPath, 'utf8'));
  if (approved.rooms.some(r => r.slug === slug)) {
    console.error(`Refusing to modify approved room "${slug}".`);
    process.exit(1);
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function runRenderAndScore(compress = false) {
  const runArgs = [path.join(__dirname, 'run_room.mjs'), bomPath, '--render-review'];
  if (compress) runArgs.push('--compress');
  const res = spawnSync(process.execPath, runArgs, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`run_room.mjs failed (exit ${res.status}):\n${res.stderr || res.stdout}`);
  }
}

async function writeFeedbackDoc(bom, diff, critiqueText, iter) {
  let ctxDesc = '';
  if (bom.sourceContext && existsSync(path.join(ROOT, bom.sourceContext))) {
    const ctx = JSON.parse(await readFile(path.join(ROOT, bom.sourceContext), 'utf8'));
    const literal = Array.isArray(ctx.literalRoomDescription)
      ? ctx.literalRoomDescription.join(' ')
      : (ctx.literalRoomDescription || '');
    ctxDesc = [
      `## Original Room Description (${bom.room} — ${bom.label || slug})`,
      literal,
      ctx.safeSceneProfile ? `\n**Scene Profile:** ${ctx.safeSceneProfile}` : '',
    ].filter(Boolean).join('\n');
  }

  const md = [
    `# Visual-Diff Refinement Feedback · ${bom.room} (Iteration ${iter})`,
    '',
    ctxDesc,
    '',
    '## Visual Comparison (Reference Views vs. GLB Preview)',
    '```text',
    critiqueText.trim(),
    '```',
    '',
    '## Actionable Prompt for Next BOM Revision',
    `Compare the top reference row against the bottom GLB render row in \`${path.relative(ROOT, path.join(buildDir, 'review-4view.png'))}\`.`,
    'Update `room-bom.json` to address the discrepancies above without inventing non-existent exits or baking interactive ZIL objects into static geometry.',
    '',
  ].join('\n');

  await writeFile(path.join(buildDir, 'refinement-feedback.md'), md);
}

function applyAutoTuneFeedback(bom, diff) {
  const next = structuredClone(bom);
  const views = Object.values(diff.views);
  const avgLuma = views.reduce((s, v) => s + v.lumaDelta, 0) / views.length;
  const avgWarm = views.reduce((s, v) => s + v.warmthDelta, 0) / views.length;
  const avgBot = views.reduce((s, v) => s + v.botLumaDelta, 0) / views.length;
  const avgMid = views.reduce((s, v) => s + v.midLumaDelta, 0) / views.length;

  let changed = false;

  // 1. Lighting brightness feedback
  const lighting = next.envelope.lighting || { ambientColor: [0.12, 0.12, 0.14], ambientStrength: 0.3, lights: [] };
  next.envelope.lighting = lighting;
  if (Math.abs(avgLuma) > 0.03) {
    const factor = clamp(1.0 - avgLuma * 2.4, 0.55, 1.85);
    lighting.ambientStrength = Number(clamp((lighting.ambientStrength ?? 0.3) * factor, 0.05, 1.8).toFixed(3));
    for (const l of lighting.lights || []) {
      l.energy = Number(clamp((l.energy ?? 180) * factor, 15, 2200).toFixed(1));
    }
    changed = true;
  }

  // 2. Color temperature / warmth feedback
  if (Math.abs(avgWarm) > 0.025) {
    const shift = clamp(-avgWarm * 0.85, -0.18, 0.18);
    for (const l of lighting.lights || []) {
      l.color = [
        Number(clamp(l.color[0] + shift, 0.12, 1.0).toFixed(3)),
        Number(clamp(l.color[1] + shift * 0.25, 0.12, 1.0).toFixed(3)),
        Number(clamp(l.color[2] - shift, 0.12, 1.0).toFixed(3)),
      ];
    }
    if (lighting.ambientColor) {
      lighting.ambientColor = [
        Number(clamp(lighting.ambientColor[0] + shift * 0.5, 0.03, 0.85).toFixed(3)),
        Number(clamp(lighting.ambientColor[1] + shift * 0.1, 0.03, 0.85).toFixed(3)),
        Number(clamp(lighting.ambientColor[2] - shift * 0.5, 0.03, 0.85).toFixed(3)),
      ];
    }
    changed = true;
  }

  // 3. Floor & wall surface colorScale feedback (for cropped surfaces)
  if (Math.abs(avgBot) > 0.04 && next.surfaces.floor && !next.surfaces.floor.procedural) {
    const cur = next.surfaces.floor.colorScale ?? 1.0;
    next.surfaces.floor.colorScale = Number(clamp(cur * (1.0 - avgBot * 1.4), 0.35, 1.85).toFixed(3));
    changed = true;
  }
  if (Math.abs(avgMid) > 0.04 && next.surfaces.wall && !next.surfaces.wall.procedural) {
    const cur = next.surfaces.wall.colorScale ?? 1.0;
    next.surfaces.wall.colorScale = Number(clamp(cur * (1.0 - avgMid * 1.3), 0.35, 1.85).toFixed(3));
    changed = true;
  }

  return { next, changed };
}

let bestScore = -1;
let bestIter = 0;
let bestBomText = await readFile(bomPath, 'utf8');
const history = [];

for (let iter = 0; iter <= maxIters; iter++) {
  runRenderAndScore(false);
  const diff = JSON.parse(await readFile(path.join(buildDir, 'review-diff.json'), 'utf8'));
  const critiqueText = await readFile(path.join(buildDir, 'review-critique.txt'), 'utf8');
  const bomText = await readFile(bomPath, 'utf8');
  const bom = JSON.parse(bomText);

  const iterDir = path.join(histRoot, `iter-${String(iter).padStart(2, '0')}`);
  await mkdir(iterDir, { recursive: true });
  await writeFile(path.join(iterDir, 'room-bom.json'), bomText);
  await copyFile(path.join(buildDir, 'review-4view.png'), path.join(iterDir, 'review-4view.png'));
  await copyFile(path.join(buildDir, 'review-diff.json'), path.join(iterDir, 'review-diff.json'));
  await copyFile(path.join(buildDir, 'review-critique.txt'), path.join(iterDir, 'review-critique.txt'));
  await writeFeedbackDoc(bom, diff, critiqueText, iter);

  const score = diff.overallScore;
  history.push({ iter, score, views: Object.fromEntries(Object.entries(diff.views).map(([k, v]) => [k, v.score])) });
  console.log(`[${slug}] iter ${iter}: score=${score.toFixed(2)} (N=${diff.views.N.score}, E=${diff.views.E.score}, S=${diff.views.S.score}, W=${diff.views.W.score})`);

  if (iter === 0) {
    bestScore = score;
    bestIter = 0;
    bestBomText = bomText;
  } else if (score < bestScore) {
    console.log(`[${slug}] Score got worse (${score.toFixed(2)} < ${bestScore.toFixed(2)}) — rolling back to iter ${bestIter} and stopping.`);
    await writeFile(bomPath, bestBomText);
    break;
  } else if (score - bestScore < 0.35) {
    bestScore = score;
    bestIter = iter;
    bestBomText = bomText;
    console.log(`[${slug}] Converged (gain < 0.35) at iter ${iter} with score ${bestScore.toFixed(2)}.`);
    break;
  } else {
    bestScore = score;
    bestIter = iter;
    bestBomText = bomText;
  }

  if (!autoTune || iter === maxIters) break;

  const { next, changed } = applyAutoTuneFeedback(bom, diff);
  if (!changed) {
    console.log(`[${slug}] No further parametric adjustments needed — stopping.`);
    break;
  }
  await writeFile(bomPath, JSON.stringify(next, null, 2) + '\n');
}

// Final compressed export of the best BOM
await writeFile(bomPath, bestBomText);
runRenderAndScore(true);

if (publish) {
  const pubDir = path.join(ROOT, 'public/room-preview/rooms', slug);
  await mkdir(pubDir, { recursive: true });
  await copyFile(path.join(buildDir, 'room-browser.glb'), path.join(pubDir, 'room.glb'));
  await copyFile(path.join(buildDir, 'manifest.json'), path.join(pubDir, 'manifest.json'));
}

const summary = { slug, bestIter, bestScore, history };
await writeFile(path.join(buildDir, 'refinement-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`[${slug}] DONE · best iter ${bestIter} · best score ${bestScore.toFixed(2)}/100`);
