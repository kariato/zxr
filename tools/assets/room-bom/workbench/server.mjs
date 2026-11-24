#!/usr/bin/env node
/**
 * Local ZXR Room Review & Rebuild Workbench server.
 *
 * Lists all 86 rooms with candidate scores, shows the 4-view comparison sheet
 * and interactive 3D GLB preview, accepts natural-language feedback (or direct
 * BOM edits), rebuilds the room through the Room BOM engine, and updates the
 * published preview GLB live.
 *
 * Usage:
 *   node tools/assets/room-bom/workbench/server.mjs
 *   PORT=4177 node tools/assets/room-bom/workbench/server.mjs
 */
import http from 'node:http';
import { readFile, writeFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
const BOM_ROOT = path.join(ROOT, 'games/zork2/planning/room-bom-prototype');
const PUB_ROOMS = path.join(ROOT, 'public/room-preview/rooms');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4177);
const HOST = process.env.HOST || '127.0.0.1';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const PREFERRED_VISION_MODELS = ['gemma4:12b', 'gemma4:26b', 'gemma3:27b', 'gemma4:e4b', 'gemini-3-flash-preview:latest'];

const schema = JSON.parse(await readFile(path.join(ROOT, 'tools/assets/room-bom/schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
const validateBom = ajv.compile(schema);
const superDescPath = path.join(BOM_ROOT, 'super-descriptions.json');
const superDescriptions = existsSync(superDescPath)
  ? JSON.parse(await readFile(superDescPath, 'utf8')).rooms || {}
  : {};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function sendFile(res, filePath, noCache = false) {
  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const data = await readFile(filePath);
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  if (noCache) headers['Cache-Control'] = 'no-store';
  res.writeHead(200, headers);
  res.end(data);
}

async function readBodyJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function runCommandStream(cmd, args, onLine) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let bufOut = '';
    let bufErr = '';
    const flushLines = (chunk, isErr) => {
      if (isErr) {
        stderr += chunk;
        bufErr += chunk;
        const parts = bufErr.split(/\r?\n/);
        bufErr = parts.pop() || '';
        for (const line of parts) if (line.trim()) onLine(line, true);
      } else {
        stdout += chunk;
        bufOut += chunk;
        const parts = bufOut.split(/\r?\n/);
        bufOut = parts.pop() || '';
        for (const line of parts) if (line.trim()) onLine(line, false);
      }
    };
    child.stdout.on('data', d => flushLines(d.toString(), false));
    child.stderr.on('data', d => flushLines(d.toString(), true));
    child.on('close', code => {
      if (bufOut.trim()) onLine(bufOut.trim(), false);
      if (bufErr.trim()) onLine(bufErr.trim(), true);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function sendNdjsonEvent(res, obj) {
  res.write(JSON.stringify(obj) + '\n');
}

async function loadRoomList() {
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'games/zork2/assets/rooms/manifest.json'), 'utf8'));
  const approvedPath = path.join(BOM_ROOT, 'approved-rooms.json');
  const approvedData = existsSync(approvedPath)
    ? JSON.parse(await readFile(approvedPath, 'utf8'))
    : { rooms: [] };
  const approvedMap = new Map(approvedData.rooms.map(r => [r.slug, r]));

  const reportPath = path.join(BOM_ROOT, 'refinement-report.json');
  const reportData = existsSync(reportPath)
    ? JSON.parse(await readFile(reportPath, 'utf8'))
    : { rooms: [] };
  const reportMap = new Map(reportData.rooms.map(r => [r.slug, r]));

  const rooms = [];
  for (const r of manifest.rooms) {
    const slug = path.dirname(r.image);
    const approvedEntry = approvedMap.get(slug);
    const bomPath = path.join(BOM_ROOT, slug, 'room-bom.json');
    const buildDir = path.join(BOM_ROOT, slug, 'build');
    const diffPath = path.join(buildDir, 'review-diff.json');
    const sumPath = path.join(buildDir, 'refinement-summary.json');
    const reviewPath = path.join(buildDir, 'review-4view.png');

    let bestScore = reportMap.get(slug)?.bestScore ?? null;
    let initScore = reportMap.get(slug)?.initScore ?? null;
    let bestIter = reportMap.get(slug)?.bestIter ?? null;

    if (existsSync(diffPath)) {
      try {
        const diff = JSON.parse(await readFile(diffPath, 'utf8'));
        bestScore = diff.overallScore;
      } catch {}
    }
    if (existsSync(sumPath)) {
      try {
        const sum = JSON.parse(await readFile(sumPath, 'utf8'));
        if (initScore === null) initScore = sum.history?.[0]?.score ?? bestScore;
        if (bestIter === null) bestIter = sum.bestIter ?? 0;
      } catch {}
    }

    rooms.push({
      slug,
      identity: r.identity,
      label: approvedEntry?.label || r.label,
      approved: Boolean(approvedEntry),
      hasBom: existsSync(bomPath),
      hasReview: existsSync(reviewPath),
      hasGlb: existsSync(path.join(PUB_ROOMS, slug, 'room.glb')),
      initScore,
      bestScore,
      delta: bestScore !== null && initScore !== null ? Number((bestScore - initScore).toFixed(2)) : null,
      bestIter,
    });
  }

  rooms.sort((a, b) => {
    const sa = a.bestScore ?? -1;
    const sb = b.bestScore ?? -1;
    if (sb !== sa) return sb - sa;
    return a.slug.localeCompare(b.slug);
  });
  return rooms;
}

/**
 * Analyze what the model thinks is missing by cross-checking:
 *  1) source-context.json (description, exits, visibleInitialObjects) vs room-bom.json
 *  2) review-diff.json (per-view structure/color/histogram/edge & band deltas)
 */
function analyzeRoomGaps(bom, sourceContext, diff) {
  const missingFeatures = [];
  const missingExits = [];
  const missingAnchors = [];
  const visualGaps = [];

  const objects = bom?.objects || [];
  const cats = new Set(objects.map(o => o.category));
  const env = bom?.envelope || {};

  if (sourceContext) {
    const descParts = [
      ...(Array.isArray(sourceContext.literalRoomDescription)
        ? sourceContext.literalRoomDescription
        : [sourceContext.literalRoomDescription || '']),
      sourceContext.safeSceneProfile || '',
    ];
    const desc = descParts.join(' ').toLowerCase();

    // 1. Check real exits vs BOM openings/doors/tunnels
    const bomExitDirs = new Set(
      objects
        .filter(o => ['opening', 'door', 'smoothed-tunnel'].includes(o.category) && o.exitDirection)
        .map(o => String(o.exitDirection).toUpperCase()),
    );
    for (const ex of sourceContext.sourceExits || []) {
      const kind = ex.view?.kind;
      const dir = String(ex.direction || '').toUpperCase();
      if (['UEXIT', 'DEXIT', 'CEXIT', 'FEXIT'].includes(kind) && ['NORTH', 'EAST', 'SOUTH', 'WEST', 'NE', 'NW', 'SE', 'SW'].includes(dir)) {
        if (!bomExitDirs.has(dir)) {
          missingExits.push({
            item: `Exit ${dir} (${kind})`,
            reason: `Declared in sourceExits (${kind}) but no matching opening/door/tunnel with exitDirection="${dir}" in room-bom.json`,
            suggestion: `add ${dir} opening`,
          });
        }
      }
    }

    // 2. Check visibleInitialObjects vs zil-prop-anchor
    const bomAnchors = new Set(
      objects.filter(o => o.category === 'zil-prop-anchor' && o.zilIdentity).map(o => String(o.zilIdentity)),
    );
    for (const obj of sourceContext.visibleInitialObjects || []) {
      if (!bomAnchors.has(obj.identity)) {
        missingAnchors.push({
          item: `ZIL Anchor: ${obj.identity}`,
          reason: `Visible initial object "${obj.label || obj.identity}" has no zil-prop-anchor in room-bom.json`,
          suggestion: `add anchor for ${obj.identity}`,
        });
      }
    }

    // 3. Check architectural/environmental features mentioned in description vs BOM
    const featureChecks = [
      {
        re: /\b(stream|river|ford|pool|water|aquarium)\b/,
        present: () => cats.has('water-surface'),
        item: 'Water surface / stream',
        reason: 'Room description mentions water/stream/pool, but no water-surface object is in the BOM.',
        suggestion: 'add water-surface',
      },
      {
        re: /\b(table|desk|workbench)\b/,
        present: () => cats.has('table') || cats.has('hero-3d') || bomAnchors.has('ALICE-TABLE') || bomAnchors.has('GAZEBO-TABLE') || bomAnchors.has('WORKBENCH') || bomAnchors.has('PTABLE'),
        item: 'Table / desk geometry',
        reason: 'Room description mentions a table/desk, but no static table or table anchor is present.',
        suggestion: 'add table',
      },
      {
        re: /\b(bookcase|bookshelf|bookshelves|shelves)\b/,
        present: () => cats.has('bookcase'),
        item: 'Bookcases / shelving',
        reason: 'Room description mentions shelves/bookcases, but no bookcase objects are in the BOM.',
        suggestion: 'add bookcases',
      },
      {
        re: /\b(rug|carpet)\b/,
        present: () => cats.has('rug'),
        item: 'Floor rug / carpet',
        reason: 'Room description mentions a rug/carpet, but no rug object is in the BOM.',
        suggestion: 'add rug',
      },
      {
        re: /\b(pillar|pillars|column|columns|pilaster|posts)\b/,
        present: () => cats.has('pillar') || bomAnchors.has('POSTS'),
        item: 'Pillars / columns',
        reason: 'Room description mentions pillars/columns, but no pillar objects are in the BOM.',
        suggestion: 'add pillars',
      },
      {
        re: /\b(stalagmite|stalagmites)\b/,
        present: () => cats.has('stalagmite-field'),
        item: 'Stalagmite formations',
        reason: 'Room description mentions stalagmites, but no stalagmite-field is in the BOM.',
        suggestion: 'add stalagmites',
      },
      {
        re: /\b(stalactite|stalactites)\b/,
        present: () => cats.has('stalactite-ceiling'),
        item: 'Ceiling stalactites',
        reason: 'Room description mentions stalactites, but no stalactite-ceiling is in the BOM.',
        suggestion: 'add stalactites',
      },
      {
        re: /\b(crack|fissure|crevice)\b/,
        present: () => cats.has('floor-crack') || cats.has('opening') || cats.has('recess') || bomAnchors.has('PCRACK'),
        item: 'Crack / fissure feature',
        reason: 'Room description mentions a crack/fissure, but no floor-crack or recess is present.',
        suggestion: 'add floor-crack',
      },
      {
        re: /\b(hedge|hedges|garden|topiary|shrubs)\b/,
        present: () => env.wallStyle === 'hedge',
        item: 'Open-air manicured hedges',
        reason: 'Garden description mentions hedges/bushes, but wallStyle is not set to open-air hedge.',
        suggestion: 'garden hedge, open sky',
      },
      {
        re: /\b(circular|round room|rotunda)\b/,
        present: () => env.shape === 'rotunda',
        item: 'Circular room geometry',
        reason: 'Room description calls this a circular/round room, but envelope shape is not rotunda.',
        suggestion: 'circular rotunda',
      },
      {
        re: /\b(octagonal|oddly-angled|diamond)\b/,
        present: () => env.shape === 'octagon',
        item: 'Octagonal / angled walls',
        reason: 'Room is described as oddly-angled/octagonal, but envelope shape is rectangular box.',
        suggestion: 'octagon',
      },
      {
        re: /\b(sky|open air|volcano|crater|chasm|gorge|ravine)\b/,
        present: () => env.ceilingStyle === 'open-sky' && Boolean(env.skybox),
        item: 'Open sky / cavern skybox',
        reason: 'Description indicates an open-air/chasm/volcano space, but ceilingStyle is enclosed or missing skybox.',
        suggestion: 'open sky',
      },
    ];

    for (const check of featureChecks) {
      if (check.re.test(desc) && !check.present()) {
        missingFeatures.push({
          item: check.item,
          reason: check.reason,
          suggestion: check.suggestion,
        });
      }
    }
  }

  // 4. Visual-diff breakdown & weakest view diagnostics
  let breakdown = null;
  if (diff?.views) {
    const entries = Object.entries(diff.views);
    const avg = field => Number((entries.reduce((s, [, v]) => s + (v[field] ?? 0), 0) / entries.length).toFixed(1));
    breakdown = {
      overall: diff.overallScore,
      colorLayout: avg('colorLayout'),
      histogram: avg('histogram'),
      structure: avg('structure'),
      edge: avg('edge'),
    };

    // Sort views weakest -> strongest
    const sortedViews = [...entries].sort((a, b) => a[1].score - b[1].score);
    for (const [k, v] of sortedViews) {
      if (v.score < 72 || (v.issues && v.issues.length)) {
        const reasons = [];
        const suggestions = [];
        if (v.lumaDelta < -0.08) { reasons.push(`too dark (${v.lumaDelta})`); suggestions.push('brighter'); }
        else if (v.lumaDelta > 0.08) { reasons.push(`too bright (+${v.lumaDelta})`); suggestions.push('darker'); }
        if (v.warmthDelta < -0.06) { reasons.push(`too cool/blue (${v.warmthDelta})`); suggestions.push('warmer lighting'); }
        else if (v.warmthDelta > 0.06) { reasons.push(`too warm/orange (+${v.warmthDelta})`); suggestions.push('cooler blue lighting'); }
        if (v.topLumaDelta < -0.12) { reasons.push(`ceiling/sky band too dark (${v.topLumaDelta})`); suggestions.push('open sky'); }
        if (v.botLumaDelta < -0.10) { reasons.push(`floor too dark (${v.botLumaDelta})`); suggestions.push('brighter floor'); }
        else if (v.botLumaDelta > 0.10) { reasons.push(`floor too bright (+${v.botLumaDelta})`); suggestions.push('darker floor'); }
        if (v.structure < 58) { reasons.push(`low structural match (${v.structure}%) — silhouettes/openings/props differ from reference`); }
        if (v.edge < 65) { reasons.push(`surface texture relief mismatch (edge ${v.edge}%)`); suggestions.push('rougher walls'); }
        if (reasons.length) {
          visualGaps.push({
            view: k,
            score: v.score,
            reason: reasons.join('; '),
            suggestion: [...new Set(suggestions)].join(', '),
          });
        }
      }
    }
  }

  return {
    breakdown,
    missingFeatures,
    missingExits,
    missingAnchors,
    visualGaps,
  };
}

async function loadRoomDetail(slug) {
  const dir = path.join(BOM_ROOT, slug);
  const bomPath = path.join(dir, 'room-bom.json');
  const buildDir = path.join(dir, 'build');
  const prevPath = path.join(buildDir, 'room-bom.prev.json');
  const diffPath = path.join(buildDir, 'review-diff.json');
  const critiquePath = path.join(buildDir, 'review-critique.txt');
  const feedbackPath = path.join(buildDir, 'refinement-feedback.md');
  const userFeedbackPath = path.join(buildDir, 'user-feedback.md');
  const reviewPath = path.join(buildDir, 'review-4view.png');
  const manifestPath = path.join(PUB_ROOMS, slug, 'manifest.json');
  const ctxPath = path.join(ROOT, 'games/zork2/assets/rooms', slug, 'source-context.json');

  const approvedPath = path.join(BOM_ROOT, 'approved-rooms.json');
  const approvedData = existsSync(approvedPath)
    ? JSON.parse(await readFile(approvedPath, 'utf8'))
    : { rooms: [] };
  const approvedEntry = approvedData.rooms.find(r => r.slug === slug) || null;

  let reviewMtime = 0;
  if (existsSync(reviewPath)) reviewMtime = (await stat(reviewPath)).mtimeMs;

  let glbMtime = 0;
  const pubGlb = path.join(PUB_ROOMS, slug, 'room.glb');
  if (existsSync(pubGlb)) glbMtime = (await stat(pubGlb)).mtimeMs;

  const bom = existsSync(bomPath) ? JSON.parse(await readFile(bomPath, 'utf8')) : null;
  const sourceContext = existsSync(ctxPath) ? JSON.parse(await readFile(ctxPath, 'utf8')) : null;
  const diff = existsSync(diffPath) ? JSON.parse(await readFile(diffPath, 'utf8')) : null;
  const llmCritiquePath = path.join(buildDir, 'llm-critique.json');

  const refDir = path.join(ROOT, 'games/zork2/assets/rooms', slug);
  const refImgPath = bom?.views?.N
    ? path.join(ROOT, bom.views.N)
    : (existsSync(path.join(refDir, 'reference-v2.png')) ? path.join(refDir, 'reference-v2.png') : path.join(refDir, 'reference-v1.png'));
  const refPromptPath = existsSync(path.join(refDir, 'reference-v2.prompt.txt'))
    ? path.join(refDir, 'reference-v2.prompt.txt')
    : path.join(refDir, 'reference-v1.prompt.txt');

  return {
    slug,
    approved: Boolean(approvedEntry),
    approvedNotes: approvedEntry?.notes || '',
    hasBom: existsSync(bomPath),
    hasBackup: existsSync(prevPath),
    hasReview: existsSync(reviewPath),
    hasPrevReview: existsSync(path.join(buildDir, 'review-4view.prev.png')),
    hasReferenceImage: existsSync(refImgPath),
    referencePrompt: existsSync(refPromptPath) ? await readFile(refPromptPath, 'utf8') : '',
    reviewMtime,
    glbMtime,
    bom,
    sourceContext,
    superDescription: superDescriptions[slug] || null,
    diff,
    analysis: analyzeRoomGaps(bom, sourceContext, diff),
    llmCritique: existsSync(llmCritiquePath) ? JSON.parse(await readFile(llmCritiquePath, 'utf8')) : null,
    critique: existsSync(critiquePath) ? await readFile(critiquePath, 'utf8') : '',
    refinementFeedback: existsSync(feedbackPath) ? await readFile(feedbackPath, 'utf8') : '',
    userFeedback: existsSync(userFeedbackPath) ? await readFile(userFeedbackPath, 'utf8') : '',
    manifest: existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : null,
  };
}

/**
 * Translate natural-language user feedback into concrete Room BOM adjustments.
 */
function applyUserFeedbackToBom(bom, feedbackText) {
  const next = structuredClone(bom);
  const text = (feedbackText || '').toLowerCase();
  const applied = [];

  const env = next.envelope;
  const lighting = env.lighting || { ambientColor: [0.12, 0.12, 0.14], ambientStrength: 0.3, lights: [] };
  env.lighting = lighting;

  const scaleLighting = (factor, label) => {
    lighting.ambientStrength = Number(clamp((lighting.ambientStrength ?? 0.3) * factor, 0.04, 2.2).toFixed(3));
    for (const l of lighting.lights || []) {
      l.energy = Number(clamp((l.energy ?? 180) * factor, 15, 2800).toFixed(1));
    }
    applied.push(label);
  };

  // Brightness / exposure
  if (/\b(much brighter|way brighter|far too dark)\b/.test(text)) {
    scaleLighting(1.55, 'Increased lighting & ambient brightness by +55%');
  } else if (/\b(brighter|too dark|lighten|more light|dim)\b/.test(text)) {
    scaleLighting(1.28, 'Increased lighting & ambient brightness by +28%');
  } else if (/\b(much darker|way darker|far too bright)\b/.test(text)) {
    scaleLighting(0.62, 'Reduced lighting & ambient brightness by -38%');
  } else if (/\b(darker|too bright|darken|less light|moodier|gloomier)\b/.test(text)) {
    scaleLighting(0.78, 'Reduced lighting & ambient brightness by -22%');
  }

  // Color temperature / warmth
  const shiftWarmth = (delta, label) => {
    for (const l of lighting.lights || []) {
      l.color = [
        Number(clamp(l.color[0] + delta, 0.10, 1.0).toFixed(3)),
        Number(clamp(l.color[1] + delta * 0.25, 0.10, 1.0).toFixed(3)),
        Number(clamp(l.color[2] - delta, 0.10, 1.0).toFixed(3)),
      ];
    }
    if (lighting.ambientColor) {
      lighting.ambientColor = [
        Number(clamp(lighting.ambientColor[0] + delta * 0.5, 0.02, 0.9).toFixed(3)),
        Number(clamp(lighting.ambientColor[1] + delta * 0.1, 0.02, 0.9).toFixed(3)),
        Number(clamp(lighting.ambientColor[2] - delta * 0.5, 0.02, 0.9).toFixed(3)),
      ];
    }
    applied.push(label);
  };

  if (/\b(warmer|more warm|amber|golden|torchlight|orangey|firelight|too blue|too cold)\b/.test(text)) {
    shiftWarmth(0.14, 'Shifted lighting warmer (more amber/red, less blue)');
  } else if (/\b(cooler|colder|more blue|icy|misty|moonlight|too orange|too warm|too yellow)\b/.test(text)) {
    shiftWarmth(-0.14, 'Shifted lighting cooler (more blue, less orange)');
  }

  // Surface brightness (floor / wall / ceiling)
  if (/\b(brighter floor|lighten floor|floor too dark)\b/.test(text) && next.surfaces.floor && !next.surfaces.floor.procedural) {
    next.surfaces.floor.colorScale = Number(clamp((next.surfaces.floor.colorScale ?? 1.0) * 1.25, 0.3, 1.9).toFixed(3));
    applied.push(`Raised floor colorScale to ${next.surfaces.floor.colorScale}`);
  } else if (/\b(darker floor|darken floor|floor too bright)\b/.test(text) && next.surfaces.floor && !next.surfaces.floor.procedural) {
    next.surfaces.floor.colorScale = Number(clamp((next.surfaces.floor.colorScale ?? 1.0) * 0.78, 0.3, 1.9).toFixed(3));
    applied.push(`Lowered floor colorScale to ${next.surfaces.floor.colorScale}`);
  }

  if (/\b(brighter wall|lighten wall|walls too dark)\b/.test(text) && next.surfaces.wall && !next.surfaces.wall.procedural) {
    next.surfaces.wall.colorScale = Number(clamp((next.surfaces.wall.colorScale ?? 1.0) * 1.25, 0.3, 1.9).toFixed(3));
    applied.push(`Raised wall colorScale to ${next.surfaces.wall.colorScale}`);
  } else if (/\b(darker wall|darken wall|walls too bright)\b/.test(text) && next.surfaces.wall && !next.surfaces.wall.procedural) {
    next.surfaces.wall.colorScale = Number(clamp((next.surfaces.wall.colorScale ?? 1.0) * 0.78, 0.3, 1.9).toFixed(3));
    applied.push(`Lowered wall colorScale to ${next.surfaces.wall.colorScale}`);
  }

  // Roughness / rock displacement
  if (/\b(rougher|more rough|jagged|rockier|more bumpy|more relief|too flat)\b/.test(text)) {
    env.wallDisplacementMetres = Number(clamp((env.wallDisplacementMetres ?? 0.2) + 0.14, 0.02, 0.95).toFixed(3));
    if (next.surfaces.wall) {
      next.surfaces.wall.normalStrength = Number(clamp((next.surfaces.wall.normalStrength ?? 1.2) + 0.25, 0.4, 2.8).toFixed(2));
    }
    applied.push(`Increased wall displacement (${env.wallDisplacementMetres}m) & normalStrength`);
  } else if (/\b(smoother|flatter|cleaner wall|less noisy|less bumpy|dressed stone)\b/.test(text)) {
    env.wallDisplacementMetres = Number(clamp((env.wallDisplacementMetres ?? 0.2) * 0.45, 0.015, 0.6).toFixed(3));
    if (next.surfaces.wall) {
      next.surfaces.wall.normalStrength = Number(clamp((next.surfaces.wall.normalStrength ?? 1.2) * 0.8, 0.4, 2.5).toFixed(2));
    }
    applied.push(`Reduced wall displacement (${env.wallDisplacementMetres}m) & normalStrength`);
  }

  // Dimensions
  const [w, d, h] = env.dimensionsMetres;
  if (/\b(taller|higher ceiling|raise ceiling)\b/.test(text)) {
    env.dimensionsMetres = [w, d, Number((h * 1.22).toFixed(2))];
    applied.push(`Increased ceiling height from ${h}m to ${env.dimensionsMetres[2]}m`);
  } else if (/\b(lower ceiling|shorter ceiling|cramped)\b/.test(text)) {
    env.dimensionsMetres = [w, d, Number(Math.max(2.5, h * 0.82).toFixed(2))];
    applied.push(`Lowered ceiling height from ${h}m to ${env.dimensionsMetres[2]}m`);
  }
  if (/\b(wider|bigger room|larger room|more spacious)\b/.test(text)) {
    env.dimensionsMetres = [
      Number((env.dimensionsMetres[0] * 1.18).toFixed(2)),
      Number((env.dimensionsMetres[1] * 1.18).toFixed(2)),
      env.dimensionsMetres[2],
    ];
    applied.push(`Expanded floor footprint to ${env.dimensionsMetres[0]}m × ${env.dimensionsMetres[1]}m`);
  } else if (/\b(smaller room|narrower|tighter)\b/.test(text)) {
    env.dimensionsMetres = [
      Number(Math.max(3.6, env.dimensionsMetres[0] * 0.84).toFixed(2)),
      Number(Math.max(3.6, env.dimensionsMetres[1] * 0.84).toFixed(2)),
      env.dimensionsMetres[2],
    ];
    applied.push(`Tightened floor footprint to ${env.dimensionsMetres[0]}m × ${env.dimensionsMetres[1]}m`);
  }

  // Ceiling / skybox / shape switches
  if (/\b(open sky|open-sky|remove ceiling|add skybox|cavern sky)\b/.test(text)) {
    env.ceilingStyle = 'open-sky';
    if (!env.skybox) {
      env.skybox = /\b(volcano|lava|lair|fire)\b/.test(text)
        ? 'src/prototype/assets/lair-skybox-v1.png'
        : 'src/prototype/assets/cavern-skybox-v1.png';
    }
    applied.push(`Switched ceilingStyle to open-sky (${env.skybox})`);
  } else if (/\b(enclosed ceiling|close ceiling|vaulted ceiling)\b/.test(text)) {
    env.ceilingStyle = 'vaulted';
    delete env.skybox;
    applied.push('Switched ceilingStyle to vaulted (enclosed)');
  } else if (/\b(flat ceiling)\b/.test(text)) {
    env.ceilingStyle = 'flat';
    delete env.skybox;
    applied.push('Switched ceilingStyle to flat');
  }

  if (/\b(circular|round room|rotunda)\b/.test(text)) {
    env.shape = 'rotunda';
    applied.push('Switched envelope shape to rotunda (circular)');
  } else if (/\b(octagon|octagonal)\b/.test(text)) {
    env.shape = 'octagon';
    applied.push('Switched envelope shape to octagon');
  } else if (/\b(box room|rectangular|square room)\b/.test(text)) {
    env.shape = 'box';
    applied.push('Switched envelope shape to box');
  } else if (/\b(organic cavern|organic-cavern)\b/.test(text)) {
    env.shape = 'organic-cavern';
    applied.push('Switched envelope shape to organic-cavern');
  }

  if (/\b(hedge wall|low hedges|garden hedge)\b/.test(text)) {
    env.wallStyle = 'hedge';
    env.ceilingStyle = 'open-sky';
    if (!env.skybox) env.skybox = 'src/prototype/assets/cavern-skybox-v1.png';
    applied.push('Switched wallStyle to open-air hedge');
  }

  return { next, applied };
}

async function updateRefinementReport(slug, bestScore, bestIter = 0) {
  const reportPath = path.join(BOM_ROOT, 'refinement-report.json');
  if (!existsSync(reportPath)) return;
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const entry = report.rooms.find(r => r.slug === slug);
  if (entry) {
    entry.bestScore = bestScore;
    entry.bestIter = bestIter;
  } else {
    report.rooms.push({ slug, initScore: bestScore, bestScore, bestIter });
    report.count = report.rooms.length;
  }
  report.rooms.sort((a, b) => a.bestScore - b.bestScore);
  report.updatedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}

async function listOllamaModels() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return { available: false, models: [], defaultModel: null };
    const data = await res.json();
    const names = (data.models || []).map(m => m.name);
    const defaultModel = PREFERRED_VISION_MODELS.find(p => names.includes(p)) || names[0] || null;
    return { available: true, models: names, defaultModel };
  } catch {
    return { available: false, models: [], defaultModel: null };
  }
}

async function runVisionLlmCritique(slug, model) {
  const buildDir = path.join(BOM_ROOT, slug, 'build');
  const reviewPath = path.join(buildDir, 'review-4view.png');
  const bomPath = path.join(BOM_ROOT, slug, 'room-bom.json');
  const ctxPath = path.join(ROOT, 'games/zork2/assets/rooms', slug, 'source-context.json');
  const diffPath = path.join(buildDir, 'review-diff.json');

  if (!existsSync(reviewPath)) {
    throw new Error(`No review-4view.png found for ${slug}. Run Rebuild first.`);
  }
  // Downscale contact sheet to 1024px wide JPEG so local Vision-LLMs process it in seconds
  const tmpJpg = path.join(buildDir, 'review-4view-llm.jpg');
  const sipsRes = await runCommandStream('sips', ['-Z', '1024', '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', reviewPath, '--out', tmpJpg], () => {});
  const imgB64 = (await readFile(sipsRes.code === 0 && existsSync(tmpJpg) ? tmpJpg : reviewPath)).toString('base64');
  const bom = existsSync(bomPath) ? JSON.parse(await readFile(bomPath, 'utf8')) : null;
  const ctx = existsSync(ctxPath) ? JSON.parse(await readFile(ctxPath, 'utf8')) : null;
  const diff = existsSync(diffPath) ? JSON.parse(await readFile(diffPath, 'utf8')) : null;

  const superDescText = superDescriptions[slug]?.superDescription || (
    Array.isArray(ctx?.literalRoomDescription)
      ? ctx.literalRoomDescription.join(' ')
      : (ctx?.literalRoomDescription || '')
  );

  const prompt = [
    `You are a 3D environment technical artist reviewing a Zork II room: "${bom?.label || slug}" (${slug}).`,
    `The attached image is a 2x6 comparison grid:`,
    `- TOP ROW (columns 1–4, left to right): the 4 reference artworks for North (N), East (E), South (S), and West (W).`,
    `- BOTTOM ROW (columns 1–6, left to right): the 6 Blender 3D GLB renders for North (N), East (E), South (S), West (W), Up (ceiling), and Down (floor).`,
    ``,
    `Zork II Room Super Description:\n${superDescText}`,
    `Current BOM envelope: ${JSON.stringify(bom?.envelope || {})}`,
    `Current BOM objects: ${JSON.stringify((bom?.objects || []).map(o => ({ id: o.id, category: o.category, exitDirection: o.exitDirection, wall: o.placement?.wall })))}`,
    diff ? `Quantitative visual-diff scores: overall=${diff.overallScore}/100, views=${JSON.stringify(Object.fromEntries(Object.entries(diff.views).map(([k, v]) => [k, { score: v.score, lumaDelta: v.lumaDelta, warmthDelta: v.warmthDelta }])))}` : '',
    ``,
    `Inspect EVERY column (N, E, S, W) comparing top reference vs bottom render. Never suggest inventing exits not in the reference or baking interactive ZIL props.`,
    `Return ONLY valid JSON with this exact structure:`,
    `{`,
    `  "summary": "1-2 sentence overall diagnosis of the biggest visual gaps",`,
    `  "views": {`,
    `    "N": { "differences": "specific visual differences between top N reference and bottom N render", "howToFix": "concrete fix for N view" },`,
    `    "E": { "differences": "specific visual differences between top E reference and bottom E render", "howToFix": "concrete fix for E view" },`,
    `    "S": { "differences": "specific visual differences between top S reference and bottom S render", "howToFix": "concrete fix for S view" },`,
    `    "W": { "differences": "specific visual differences between top W reference and bottom W render", "howToFix": "concrete fix for W view" }`,
    `  },`,
    `  "pipelineFeedback": "concise comma-separated actionable directives for the Room BOM rebuild engine (e.g. brighter, warmer lighting, darker floor, rougher walls, open sky, taller ceiling, circular rotunda, octagon, smoother walls)",`,
    `  "bomPatch": {`,
    `    "lightingScale": 1.0,`,
    `    "warmthShift": 0.0,`,
    `    "wallColorScale": null,`,
    `    "floorColorScale": null,`,
    `    "wallDisplacementMetres": null`,
    `  }`,
    `}`,
  ].filter(Boolean).join('\n');

  const payload = JSON.stringify({
    model,
    stream: false,
    think: false,
    format: 'json',
    options: { temperature: 0.2, num_predict: 1000 },
    messages: [
      {
        role: 'user',
        content: prompt,
        images: [imgB64],
      },
    ],
  });

  const data = await new Promise((resolve, reject) => {
    const u = new URL(`${OLLAMA_HOST}/api/chat`);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 11434,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 600_000,
      },
      r => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if ((r.statusCode || 500) >= 400) {
            reject(new Error(`Ollama API error (${r.statusCode}): ${text.slice(0, 300)}`));
            return;
          }
          try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Ollama request timed out')); });
    req.write(payload);
    req.end();
  });
  const rawContent = data.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const m = rawContent.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Vision-LLM did not return valid JSON');
    parsed = JSON.parse(m[0]);
  }

  const result = {
    model,
    generatedAt: new Date().toISOString(),
    summary: String(parsed.summary || ''),
    views: {
      N: { differences: String(parsed.views?.N?.differences || ''), howToFix: String(parsed.views?.N?.howToFix || '') },
      E: { differences: String(parsed.views?.E?.differences || ''), howToFix: String(parsed.views?.E?.howToFix || '') },
      S: { differences: String(parsed.views?.S?.differences || ''), howToFix: String(parsed.views?.S?.howToFix || '') },
      W: { differences: String(parsed.views?.W?.differences || ''), howToFix: String(parsed.views?.W?.howToFix || '') },
    },
    pipelineFeedback: String(parsed.pipelineFeedback || ''),
    bomPatch: parsed.bomPatch && typeof parsed.bomPatch === 'object' ? parsed.bomPatch : null,
  };

  await writeFile(path.join(buildDir, 'llm-critique.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

function applyLlmPatchToBom(bom, patch) {
  if (!patch || typeof patch !== 'object') return { next: bom, applied: [] };
  const next = structuredClone(bom);
  const applied = [];
  const env = next.envelope;
  const lighting = env.lighting || { ambientColor: [0.12, 0.12, 0.14], ambientStrength: 0.3, lights: [] };
  env.lighting = lighting;

  if (typeof patch.lightingScale === 'number' && Number.isFinite(patch.lightingScale) && Math.abs(patch.lightingScale - 1.0) > 0.04) {
    const f = clamp(patch.lightingScale, 0.45, 2.0);
    lighting.ambientStrength = Number(clamp((lighting.ambientStrength ?? 0.3) * f, 0.04, 2.2).toFixed(3));
    for (const l of lighting.lights || []) {
      l.energy = Number(clamp((l.energy ?? 180) * f, 15, 2800).toFixed(1));
    }
    applied.push(`LLM lightingScale ×${f.toFixed(2)}`);
  }
  if (typeof patch.warmthShift === 'number' && Number.isFinite(patch.warmthShift) && Math.abs(patch.warmthShift) > 0.02) {
    const w = clamp(patch.warmthShift, -0.22, 0.22);
    for (const l of lighting.lights || []) {
      l.color = [
        Number(clamp(l.color[0] + w, 0.1, 1.0).toFixed(3)),
        Number(clamp(l.color[1] + w * 0.25, 0.1, 1.0).toFixed(3)),
        Number(clamp(l.color[2] - w, 0.1, 1.0).toFixed(3)),
      ];
    }
    applied.push(`LLM warmthShift ${w >= 0 ? '+' : ''}${w.toFixed(2)}`);
  }
  if (typeof patch.wallColorScale === 'number' && Number.isFinite(patch.wallColorScale) && next.surfaces.wall && !next.surfaces.wall.procedural) {
    next.surfaces.wall.colorScale = Number(clamp(patch.wallColorScale, 0.3, 1.9).toFixed(3));
    applied.push(`LLM wallColorScale=${next.surfaces.wall.colorScale}`);
  }
  if (typeof patch.floorColorScale === 'number' && Number.isFinite(patch.floorColorScale) && next.surfaces.floor && !next.surfaces.floor.procedural) {
    next.surfaces.floor.colorScale = Number(clamp(patch.floorColorScale, 0.3, 1.9).toFixed(3));
    applied.push(`LLM floorColorScale=${next.surfaces.floor.colorScale}`);
  }
  if (typeof patch.wallDisplacementMetres === 'number' && Number.isFinite(patch.wallDisplacementMetres)) {
    env.wallDisplacementMetres = Number(clamp(patch.wallDisplacementMetres, 0.015, 1.1).toFixed(3));
    applied.push(`LLM wallDisplacementMetres=${env.wallDisplacementMetres}`);
  }
  return { next, applied };
}

function sanitizeBom(candidate, original) {
  const bom = structuredClone(candidate && typeof candidate === 'object' ? candidate : original);
  // Always preserve immutable identity & asset path fields
  bom.format = 'zxr-room-bom-v1';
  bom.room = original.room;
  bom.label = original.label;
  if (original.sourceContext) bom.sourceContext = original.sourceContext;
  bom.views = structuredClone(original.views);

  // Strip unknown top-level keys
  const allowedTop = new Set(['format', 'room', 'label', 'sourceContext', 'views', 'envelope', 'surfaces', 'objects']);
  for (const k of Object.keys(bom)) if (!allowedTop.has(k)) delete bom[k];

  // Sanitize envelope
  const env = bom.envelope && typeof bom.envelope === 'object' ? bom.envelope : structuredClone(original.envelope);
  const allowedEnv = new Set(['shape', 'dimensionsMetres', 'wallStyle', 'wallDisplacementMetres', 'ceilingStyle', 'wainscotHeightMetres', 'wallSurfaces', 'skybox', 'lighting']);
  for (const k of Object.keys(env)) if (!allowedEnv.has(k)) delete env[k];
  if (!['box', 'octagon', 'organic-cavern', 'rotunda'].includes(env.shape)) env.shape = original.envelope.shape;
  if (!['rough-cavern', 'dressed-masonry', 'plaster', 'hedge'].includes(env.wallStyle)) env.wallStyle = original.envelope.wallStyle;
  if (!['flat', 'rough-cavern', 'vaulted', 'coffered', 'open-sky'].includes(env.ceilingStyle)) env.ceilingStyle = original.envelope.ceilingStyle;
  if (!Array.isArray(env.dimensionsMetres) || env.dimensionsMetres.length !== 3) {
    env.dimensionsMetres = [...original.envelope.dimensionsMetres];
  } else {
    env.dimensionsMetres = env.dimensionsMetres.map((v, i) => Number(clamp(Number(v) || original.envelope.dimensionsMetres[i], 2.2, 40.0).toFixed(2)));
  }
  if (typeof env.wallDisplacementMetres === 'number') {
    env.wallDisplacementMetres = Number(clamp(env.wallDisplacementMetres, 0.0, 1.2).toFixed(3));
  }
  if (typeof env.wainscotHeightMetres === 'number') {
    env.wainscotHeightMetres = Number(clamp(env.wainscotHeightMetres, 0.0, 2.0).toFixed(2));
  }
  if (env.lighting && typeof env.lighting === 'object') {
    const allowedL = new Set(['ambientColor', 'ambientStrength', 'lights']);
    for (const k of Object.keys(env.lighting)) if (!allowedL.has(k)) delete env.lighting[k];
    if (Array.isArray(env.lighting.lights)) {
      env.lighting.lights = env.lighting.lights
        .filter(l => l && typeof l === 'object' && Array.isArray(l.position) && l.position.length === 3 && Array.isArray(l.color) && l.color.length === 3)
        .map((l, idx) => ({
          name: String(l.name || `light-${idx + 1}`),
          position: l.position.map(n => Number((Number(n) || 0).toFixed(2))),
          color: l.color.map(n => Number(clamp(Number(n) || 0.5, 0.02, 1.0).toFixed(3))),
          energy: Number(clamp(Number(l.energy) || 180, 5, 3000).toFixed(1)),
          radius: Number(clamp(Number(l.radius) || 1.0, 0.05, 6.0).toFixed(2)),
        }));
    }
  }
  bom.envelope = env;

  // Sanitize surfaces (keep required wall/floor/ceiling)
  const surfs = bom.surfaces && typeof bom.surfaces === 'object' ? bom.surfaces : structuredClone(original.surfaces);
  for (const reqKey of ['wall', 'floor', 'ceiling']) {
    if (!surfs[reqKey] || typeof surfs[reqKey] !== 'object') surfs[reqKey] = structuredClone(original.surfaces[reqKey]);
  }
  const allowedSurf = new Set(['sourceView', 'crop', 'procedural', 'tileMetres', 'roughness', 'normalStrength', 'colorScale', 'tileable']);
  const validProc = new Set(['grey-stone', 'granite', 'light-stone', 'warm-ashlar', 'sandstone', 'radial-floor', 'dark-oak', 'weathered-oak', 'tufted-leather']);
  for (const [sname, spec] of Object.entries(surfs)) {
    if (!spec || typeof spec !== 'object') { delete surfs[sname]; continue; }
    for (const k of Object.keys(spec)) if (!allowedSurf.has(k)) delete spec[k];
    if (spec.procedural && !validProc.has(spec.procedural)) delete spec.procedural;
    if (spec.crop && (!Array.isArray(spec.crop) || spec.crop.length !== 4)) delete spec.crop;
    if (spec.crop) {
      const [x0, y0, x1, y1] = spec.crop.map(n => clamp(Number(n) || 0, 0, 1));
      spec.crop = [Math.min(x0, Math.max(0, x1 - 0.05)), Math.min(y0, Math.max(0, y1 - 0.05)), Math.max(x1, Math.min(1, x0 + 0.05)), Math.max(y1, Math.min(1, y0 + 0.05))];
    }
    if (typeof spec.colorScale === 'number') spec.colorScale = Number(clamp(spec.colorScale, 0.2, 2.0).toFixed(3));
    if (typeof spec.roughness === 'number') spec.roughness = Number(clamp(spec.roughness, 0.0, 1.0).toFixed(3));
    if (typeof spec.normalStrength === 'number') spec.normalStrength = Number(clamp(spec.normalStrength, 0.0, 3.0).toFixed(2));
    if (typeof spec.tileMetres === 'number') spec.tileMetres = Number(clamp(spec.tileMetres, 0.2, 30.0).toFixed(2));
  }
  bom.surfaces = surfs;

  // Sanitize objects and guarantee all original zil-prop-anchor objects survive
  const validCats = new Set(['well', 'opening', 'door', 'recess', 'floor-crack', 'boulder-cluster', 'river-boulders', 'water-surface', 'stalagmite-field', 'stalactite-ceiling', 'smoothed-tunnel', 'rug', 'pillar', 'table', 'chair', 'bookcase', 'stairs', 'bridge', 'wall-plaque', 'garden-bed', 'pedestal', 'hero-3d', 'zil-prop-anchor']);
  const allowedObj = new Set(['id', 'category', 'description', 'zilIdentity', 'exitDirection', 'sourceView', 'crop', 'surface', 'meshPath', 'placement']);
  const allowedPl = new Set(['wall', 'position', 'sizeMetres', 'yawDeg', 'offsetAlongWall', 'depthMetres', 'outerRadius', 'innerRadius', 'height', 'shaftDepth', 'blocks', 'count', 'spread', 'seed', 'tunnelColor', 'tunnelEnergy', 'waterColor', 'alpha', 'minHeight', 'maxHeight', 'radius', 'pathClearance', 'curveYawDeg', 'steps', 'parapetHeight']);
  const seenIds = new Set();
  const cleanObjs = [];
  for (const rawObj of Array.isArray(bom.objects) ? bom.objects : original.objects) {
    if (!rawObj || typeof rawObj !== 'object' || !validCats.has(rawObj.category) || !rawObj.placement || typeof rawObj.placement !== 'object') continue;
    const obj = {};
    for (const k of Object.keys(rawObj)) if (allowedObj.has(k)) obj[k] = rawObj[k];
    let id = String(obj.id || rawObj.category).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'obj';
    while (seenIds.has(id)) id += '-2';
    seenIds.add(id);
    obj.id = id;
    if (obj.surface && !surfs[obj.surface]) obj.surface = 'wall';
    const pl = {};
    for (const k of Object.keys(rawObj.placement)) if (allowedPl.has(k)) pl[k] = rawObj.placement[k];
    if (pl.wall && !['N', 'E', 'S', 'W'].includes(pl.wall)) delete pl.wall;
    obj.placement = pl;
    cleanObjs.push(obj);
  }
  // Ensure every original zil-prop-anchor is preserved
  const presentZil = new Set(cleanObjs.filter(o => o.category === 'zil-prop-anchor').map(o => o.zilIdentity));
  for (const origObj of original.objects || []) {
    if (origObj.category === 'zil-prop-anchor' && !presentZil.has(origObj.zilIdentity)) {
      cleanObjs.push(structuredClone(origObj));
    }
  }
  bom.objects = cleanObjs;
  return bom;
}

function diffBoms(before, after) {
  const changes = [];
  const e0 = before.envelope || {};
  const e1 = after.envelope || {};
  for (const k of ['shape', 'wallStyle', 'ceilingStyle', 'wallDisplacementMetres', 'wainscotHeightMetres', 'skybox']) {
    if (JSON.stringify(e0[k]) !== JSON.stringify(e1[k])) {
      changes.push(`envelope.${k}: ${JSON.stringify(e0[k])} → ${JSON.stringify(e1[k])}`);
    }
  }
  if (JSON.stringify(e0.dimensionsMetres) !== JSON.stringify(e1.dimensionsMetres)) {
    changes.push(`envelope.dimensionsMetres: [${e0.dimensionsMetres}] → [${e1.dimensionsMetres}]`);
  }
  if (JSON.stringify(e0.lighting) !== JSON.stringify(e1.lighting)) {
    changes.push(`envelope.lighting updated (ambientStrength ${e0.lighting?.ambientStrength} → ${e1.lighting?.ambientStrength}, ${(e1.lighting?.lights || []).length} lights)`);
  }
  for (const sname of new Set([...Object.keys(before.surfaces || {}), ...Object.keys(after.surfaces || {})])) {
    if (JSON.stringify(before.surfaces?.[sname]) !== JSON.stringify(after.surfaces?.[sname])) {
      changes.push(`surface "${sname}" updated`);
    }
  }
  const map0 = new Map((before.objects || []).map(o => [o.id, o]));
  const map1 = new Map((after.objects || []).map(o => [o.id, o]));
  for (const [id, o] of map1) {
    if (!map0.has(id)) changes.push(`Added ${o.category} "${id}"`);
    else if (JSON.stringify(map0.get(id)) !== JSON.stringify(o)) changes.push(`Modified ${o.category} "${id}"`);
  }
  for (const [id, o] of map0) {
    if (!map1.has(id)) changes.push(`Removed ${o.category} "${id}"`);
  }
  return changes;
}

async function rewriteBomWithLlm(slug, currentBom, feedbackText, model) {
  const ctxPath = path.join(ROOT, 'games/zork2/assets/rooms', slug, 'source-context.json');
  const ctx = existsSync(ctxPath) ? JSON.parse(await readFile(ctxPath, 'utf8')) : null;
  const superDescText = superDescriptions[slug]?.superDescription || (
    Array.isArray(ctx?.literalRoomDescription)
      ? ctx.literalRoomDescription.join(' ')
      : (ctx?.literalRoomDescription || '')
  );

  const prompt = [
    `You are a 3D technical artist updating a Zork II Room BOM JSON ("zxr-room-bom-v1") based on user feedback.`,
    `Room: ${currentBom.label || slug} (${slug})`,
    `Zork II Room Super Description:\n${superDescText}`,
    ``,
    `USER FEEDBACK TO IMPLEMENT:`,
    feedbackText,
    ``,
    `ALLOWED SCHEMA VALUES:`,
    `- envelope.shape: "box" | "octagon" | "organic-cavern" | "rotunda"`,
    `- envelope.wallStyle: "rough-cavern" | "dressed-masonry" | "plaster" | "hedge"`,
    `- envelope.ceilingStyle: "flat" | "rough-cavern" | "vaulted" | "coffered" | "open-sky"`,
    `- surfaces.<name>.procedural: "grey-stone" | "granite" | "light-stone" | "warm-ashlar" | "radial-floor" | "dark-oak" | "weathered-oak" | "tufted-leather"`,
    `- objects[*].category: "well" | "opening" | "door" | "recess" | "floor-crack" | "boulder-cluster" | "river-boulders" | "water-surface" | "stalagmite-field" | "stalactite-ceiling" | "smoothed-tunnel" | "rug" | "pillar" | "table" | "chair" | "bookcase" | "stairs" | "bridge" | "wall-plaque" | "garden-bed" | "pedestal" | "zil-prop-anchor"`,
    ``,
    `RULES:`,
    `1. Make REAL, visible changes to envelope, surfaces, lighting, and/or objects to satisfy the user's feedback.`,
    `2. For example: if user says "arched ceiling" -> set ceilingStyle: "vaulted"; if user asks for "solid stone arch / pronounced stone blocks" -> add or switch a surface (e.g. "arch-stone": { "procedural": "grey-stone", "tileMetres": 1.6, "normalStrength": 1.8, "roughness": 0.88 }) and assign surface: "arch-stone" on the opening; if user asks for pillars/columns/boulders/bushes/tables/bookcases/water -> add or adjust those objects with realistic positions inside dimensionsMetres!`,
    `3. NEVER invent exits not already in objects, NEVER remove any zil-prop-anchor, NEVER change format/room/views/sourceContext.`,
    `4. Return ONLY the complete updated room-bom.json object (valid JSON, no markdown).`,
    ``,
    `CURRENT room-bom.json:`,
    JSON.stringify(currentBom),
  ].join('\n');

  const payload = JSON.stringify({
    model,
    stream: false,
    think: false,
    format: 'json',
    options: { temperature: 0.2, num_predict: 3200 },
    messages: [{ role: 'user', content: prompt }],
  });

  const data = await new Promise((resolve, reject) => {
    const u = new URL(`${OLLAMA_HOST}/api/chat`);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 11434,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 180_000,
      },
      r => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if ((r.statusCode || 500) >= 400) {
            reject(new Error(`Ollama error (${r.statusCode}): ${text.slice(0, 200)}`));
            return;
          }
          try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Ollama BOM rewrite timed out')));
    req.write(payload);
    req.end();
  });

  const raw = data.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('LLM did not return valid JSON BOM');
    parsed = JSON.parse(m[0]);
  }
  return sanitizeBom(parsed, currentBom);
}

const activeBuilds = new Set();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = url.pathname;

    // Static workbench UI
    if (pathname === '/' || pathname === '/index.html') {
      return await sendFile(res, path.join(__dirname, 'index.html'), true);
    }

    // Serve interactive 3D preview from dist/ + live public/room-preview/rooms/
    if (pathname === '/preview/room-preview.html') {
      return await sendFile(res, path.join(DIST_DIR, 'room-preview.html'), true);
    }
    if (pathname.startsWith('/preview/assets/')) {
      const rel = pathname.slice('/preview/assets/'.length);
      if (rel.includes('..')) return sendJson(res, 400, { error: 'invalid path' });
      return await sendFile(res, path.join(DIST_DIR, 'assets', rel), false);
    }
    if (pathname.startsWith('/preview/room-preview/rooms/')) {
      const rel = pathname.slice('/preview/room-preview/rooms/'.length);
      if (rel.includes('..')) return sendJson(res, 400, { error: 'invalid path' });
      return await sendFile(res, path.join(PUB_ROOMS, rel), true);
    }

    // API: List available local Ollama LLM models
    if (pathname === '/api/llm/models' && req.method === 'GET') {
      const info = await listOllamaModels();
      return sendJson(res, 200, info);
    }

    // API: List all rooms
    if (pathname === '/api/rooms' && req.method === 'GET') {
      const rooms = await loadRoomList();
      return sendJson(res, 200, { rooms });
    }

    // API: Room detail / review image / rebuild / rollback / approve
    const roomMatch = pathname.match(/^\/api\/rooms\/([a-z0-9-]+)(?:\/([a-z-]+))?$/);
    if (roomMatch) {
      const [, slug, action] = roomMatch;

      if (!action && req.method === 'GET') {
        const detail = await loadRoomDetail(slug);
        return sendJson(res, 200, detail);
      }

      if (action === 'review-image' && req.method === 'GET') {
        return await sendFile(res, path.join(BOM_ROOT, slug, 'build/review-4view.png'), true);
      }

      if (action === 'prev-review-image' && req.method === 'GET') {
        return await sendFile(res, path.join(BOM_ROOT, slug, 'build/review-4view.prev.png'), true);
      }

      if (action === 'reference-image' && req.method === 'GET') {
        const bomPath = path.join(BOM_ROOT, slug, 'room-bom.json');
        const bom = existsSync(bomPath) ? JSON.parse(await readFile(bomPath, 'utf8')) : null;
        const refDir = path.join(ROOT, 'games/zork2/assets/rooms', slug);
        const refImgPath = bom?.views?.N
          ? path.join(ROOT, bom.views.N)
          : (existsSync(path.join(refDir, 'reference-v2.png')) ? path.join(refDir, 'reference-v2.png') : path.join(refDir, 'reference-v1.png'));
        return await sendFile(res, refImgPath, false);
      }

      if (action === 'llm-critique' && req.method === 'POST') {
        const body = await readBodyJson(req);
        const info = await listOllamaModels();
        if (!info.available || !info.models.length) {
          return sendJson(res, 503, { error: `Ollama not reachable at ${OLLAMA_HOST}` });
        }
        const model = body.model && info.models.includes(body.model) ? body.model : info.defaultModel;
        const critique = await runVisionLlmCritique(slug, model);
        return sendJson(res, 200, { ok: true, llmCritique: critique });
      }

      if (action === 'rebuild' && req.method === 'POST') {
        if (activeBuilds.has(slug)) {
          return sendJson(res, 409, { error: `Rebuild already in progress for ${slug}` });
        }
        const bomPath = path.join(BOM_ROOT, slug, 'room-bom.json');
        if (!existsSync(bomPath)) {
          return sendJson(res, 404, { error: `No room-bom.json found for ${slug}` });
        }

        const body = await readBodyJson(req);
        const feedback = String(body.feedback || '').trim();
        const mode = body.mode === 'auto-refine' ? 'auto-refine' : 'feedback';
        const maxIters = clamp(Number(body.maxIters || 3), 1, 6);
        const totalSteps = mode === 'auto-refine' ? maxIters + 4 : 6;

        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Accel-Buffering': 'no',
        });
        const emitProgress = (step, label, detail = '') => {
          sendNdjsonEvent(res, { type: 'progress', step, totalSteps, label, detail });
        };

        activeBuilds.add(slug);
        try {
          emitProgress(1, 'Applying feedback & saving BOM backup', feedback ? `Feedback: "${feedback.slice(0, 80)}"` : 'Using current / edited BOM');
          const buildDir = path.join(BOM_ROOT, slug, 'build');
          await mkdir(buildDir, { recursive: true });

          const origBomText = await readFile(bomPath, 'utf8');
          const origBomObj = JSON.parse(origBomText);
          const prevDiffPath = path.join(buildDir, 'review-diff.json');
          const prevDiff = existsSync(prevDiffPath)
            ? JSON.parse(await readFile(prevDiffPath, 'utf8'))
            : null;
          const prevScore = prevDiff?.overallScore ?? null;
          await writeFile(path.join(buildDir, 'room-bom.prev.json'), origBomText);
          const curReviewPng = path.join(buildDir, 'review-4view.png');
          if (existsSync(curReviewPng)) {
            await copyFile(curReviewPng, path.join(buildDir, 'review-4view.prev.png'));
          }

          let baseBom = body.bomOverride ? body.bomOverride : structuredClone(origBomObj);
          let applied = [];
          if (body.llmPatch) {
            const resPatch = applyLlmPatchToBom(baseBom, body.llmPatch);
            baseBom = resPatch.next;
            applied.push(...resPatch.applied);
          }
          if (feedback) {
            // Try local Ollama LLM to translate rich natural-language feedback into real BOM edits
            const ollamaInfo = await listOllamaModels();
            const llmModel = body.llmModel && ollamaInfo.models.includes(body.llmModel)
              ? body.llmModel
              : ollamaInfo.defaultModel;
            if (ollamaInfo.available && llmModel && !body.bomOverride) {
              emitProgress(1, `Translating feedback into BOM edits with ${llmModel}…`, `"${feedback.slice(0, 90)}"`);
              try {
                const llmBom = await rewriteBomWithLlm(slug, baseBom, feedback, llmModel);
                if (validateBom(llmBom)) {
                  const llmChanges = diffBoms(baseBom, llmBom);
                  if (llmChanges.length) {
                    baseBom = llmBom;
                    applied.push(...llmChanges);
                  }
                }
              } catch (e) {
                sendNdjsonEvent(res, { type: 'log', line: `[LLM BOM rewrite skipped: ${e.message}]` });
              }
            }

            // Also run deterministic keyword fallback if LLM made no changes
            if (!applied.length) {
              const resApply = applyUserFeedbackToBom(baseBom, feedback);
              baseBom = resApply.next;
              applied.push(...resApply.applied);
            }

            const userFbPath = path.join(buildDir, 'user-feedback.md');
            const prevFb = existsSync(userFbPath) ? await readFile(userFbPath, 'utf8') : `# User Feedback Log · ${slug}\n\n`;
            const entry = `## ${new Date().toISOString()}\n- **Feedback:** ${feedback}\n- **Mode:** ${mode}\n- **Applied:** ${applied.length ? applied.join('; ') : 'Recorded (no BOM fields changed)'}\n\n`;
            await writeFile(userFbPath, prevFb + entry);
          }

          emitProgress(2, 'Validating Room BOM against schema', applied.length ? `${applied.length} adjustment(s) applied` : 'Checking schema.json constraints');
          if (!validateBom(baseBom)) {
            sendNdjsonEvent(res, {
              type: 'error',
              error: 'BOM schema validation failed',
              details: validateBom.errors,
            });
            res.end();
            return;
          }

          await writeFile(bomPath, JSON.stringify(baseBom, null, 2) + '\n');

          let runRes;
          if (mode === 'auto-refine') {
            let currentIter = 0;
            emitProgress(3, `Auto-refine iteration 0 of ${maxIters}`, 'Rendering baseline & scoring visual diff…');
            runRes = await runCommandStream(
              process.execPath,
              [
                path.join(ROOT, 'tools/assets/room-bom/refine_room.mjs'),
                bomPath,
                '--auto-tune',
                '--publish',
                '--max-iters',
                String(maxIters),
              ],
              line => {
                sendNdjsonEvent(res, { type: 'log', line });
                const mIter = line.match(/iter (\d+): score=([0-9.]+)/);
                if (mIter) {
                  currentIter = Number(mIter[1]);
                  const sc = mIter[2];
                  emitProgress(
                    Math.min(totalSteps - 1, 3 + currentIter),
                    `Auto-refine iteration ${currentIter} complete (score ${sc}/100)`,
                    currentIter < maxIters ? `Tuning BOM for iteration ${currentIter + 1}…` : 'Finalizing best iteration…',
                  );
                } else if (line.includes('rolling back')) {
                  emitProgress(totalSteps - 1, 'Score regressed — rolling back to best iteration', line);
                } else if (line.includes('Converged') || line.includes('No further parametric')) {
                  emitProgress(totalSteps - 1, 'Converged — exporting & compressing best GLB', line);
                }
              },
            );
          } else {
            emitProgress(3, 'Assembling 3D room geometry in Blender', 'Building meshes, PBR textures, and ZIL anchors…');
            let renderedViews = 0;
            runRes = await runCommandStream(
              process.execPath,
              [path.join(ROOT, 'tools/assets/room-bom/run_room.mjs'), bomPath, '--render-review', '--compress'],
              line => {
                sendNdjsonEvent(res, { type: 'log', line });
                if (line.includes('Finished glTF 2.0 export')) {
                  emitProgress(4, 'Rendering 6-view comparison & scoring diff', 'Rendering N / E / S / W / Up / Down previews in Cycles…');
                } else if (/render-[NESWUD]\.png/.test(line)) {
                  renderedViews++;
                  const vMatch = line.match(/render-([NESWUD])\.png/);
                  const vNames = { N: 'North', E: 'East', S: 'South', W: 'West', U: 'Up (ceiling)', D: 'Down (floor)' };
                  const vName = vMatch ? (vNames[vMatch[1]] || vMatch[1]) : '';
                  emitProgress(4, `Rendering 6-view comparison (${renderedViews}/6 views done)`, `Rendered ${vName} view`);
                } else if (line.includes('Blender quit')) {
                  emitProgress(5, 'Compressing browser GLB with gltfpack', 'Optimizing meshes & Basis textures…');
                } else if (line.includes('Compressed GLB written')) {
                  emitProgress(6, 'Publishing updated GLB to preview server', 'Copying room-browser.glb & manifest.json…');
                }
              },
            );
            if (runRes.code === 0) {
              emitProgress(6, 'Publishing updated GLB to preview server', 'Updating room-preview assets & score report…');
              const pubDir = path.join(PUB_ROOMS, slug);
              await mkdir(pubDir, { recursive: true });
              await copyFile(path.join(buildDir, 'room-browser.glb'), path.join(pubDir, 'room.glb'));
              await copyFile(path.join(buildDir, 'manifest.json'), path.join(pubDir, 'manifest.json'));
            }
          }

          if (runRes.code !== 0) {
            await writeFile(bomPath, origBomText);
            sendNdjsonEvent(res, {
              type: 'error',
              error: 'Room BOM engine failed (previous BOM restored)',
              log: (runRes.stderr || runRes.stdout).slice(-2000),
            });
            res.end();
            return;
          }

          const diffPath = path.join(buildDir, 'review-diff.json');
          if (existsSync(diffPath)) {
            const diff = JSON.parse(await readFile(diffPath, 'utf8'));
            await updateRefinementReport(slug, diff.overallScore, 0);
          }

          const detail = await loadRoomDetail(slug);
          emitProgress(totalSteps, 'Update ready!', `Score: ${detail.diff ? detail.diff.overallScore.toFixed(2) + '/100' : 'done'}`);
          sendNdjsonEvent(res, {
            type: 'done',
            ok: true,
            prevScore,
            prevDiff,
            applied,
            log: (runRes.stdout + '\n' + runRes.stderr).trim().slice(-2500),
            room: detail,
          });
          res.end();
          return;
        } finally {
          activeBuilds.delete(slug);
        }
      }

      if (action === 'rollback' && req.method === 'POST') {
        const bomPath = path.join(BOM_ROOT, slug, 'room-bom.json');
        const buildDir = path.join(BOM_ROOT, slug, 'build');
        const prevPath = path.join(buildDir, 'room-bom.prev.json');
        if (!existsSync(prevPath)) {
          return sendJson(res, 404, { error: 'No previous BOM snapshot available to roll back to' });
        }
        await copyFile(prevPath, bomPath);
        const runRes = await runCommandStream(
          process.execPath,
          [path.join(ROOT, 'tools/assets/room-bom/run_room.mjs'), bomPath, '--render-review', '--compress'],
          () => {},
        );
        if (runRes.code !== 0) {
          return sendJson(res, 500, { error: 'Rollback rebuild failed', log: runRes.stderr });
        }
        const pubDir = path.join(PUB_ROOMS, slug);
        await mkdir(pubDir, { recursive: true });
        await copyFile(path.join(buildDir, 'room-browser.glb'), path.join(pubDir, 'room.glb'));
        await copyFile(path.join(buildDir, 'manifest.json'), path.join(pubDir, 'manifest.json'));
        const diffPath = path.join(buildDir, 'review-diff.json');
        if (existsSync(diffPath)) {
          const diff = JSON.parse(await readFile(diffPath, 'utf8'));
          await updateRefinementReport(slug, diff.overallScore, 0);
        }
        const detail = await loadRoomDetail(slug);
        return sendJson(res, 200, { ok: true, room: detail });
      }

      if (action === 'approve' && req.method === 'POST') {
        const body = await readBodyJson(req);
        const approve = body.approved !== false;
        const notes = String(body.notes || '').trim();
        const approvedPath = path.join(BOM_ROOT, 'approved-rooms.json');
        const approvedData = JSON.parse(await readFile(approvedPath, 'utf8'));
        const existingIdx = approvedData.rooms.findIndex(r => r.slug === slug);

        if (approve) {
          const bomPath = path.join(BOM_ROOT, slug, 'room-bom.json');
          const bom = existsSync(bomPath) ? JSON.parse(await readFile(bomPath, 'utf8')) : null;
          const entry = {
            room: bom?.room || slug.toUpperCase(),
            slug,
            label: bom?.label || slug,
            status: 'good',
            bom: `games/zork2/planning/room-bom-prototype/${slug}/room-bom.json`,
            glb: `public/room-preview/rooms/${slug}/room.glb`,
            skybox: bom?.envelope?.skybox || null,
            notes: notes || 'Approved via Room Review Workbench.',
          };
          if (existingIdx >= 0) approvedData.rooms[existingIdx] = { ...approvedData.rooms[existingIdx], ...entry };
          else approvedData.rooms.push(entry);
        } else if (existingIdx >= 0) {
          approvedData.rooms.splice(existingIdx, 1);
        }
        approvedData.updatedAt = new Date().toISOString().slice(0, 10);
        await writeFile(approvedPath, JSON.stringify(approvedData, null, 2) + '\n');
        const detail = await loadRoomDetail(slug);
        return sendJson(res, 200, { ok: true, room: detail });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ZXR Room Review Workbench running at http://${HOST}:${PORT}`);
});
