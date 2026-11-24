#!/usr/bin/env node
/**
 * Read Zork II source context files (planning/context/*.json + assets/rooms/*\/source-context.json)
 * and synthesize a unified "Super Description" for every one of the 86 rooms, merging:
 *   - Title, ZIL ID, flags, natural lighting (ONBIT), indoors/outdoors
 *   - Static LDESC prose (literalRoomDescription)
 *   - Dynamic M-LOOK routine prose extracted from ZIL ACTION routines (guardedRoomSource / routines)
 *   - Safe scene profile (authoring brief)
 *   - Full exit topology (direction, kind, destination room name, doors, conditions, refusal messages)
 *   - Global architectural scenery (globalObjects)
 *   - Initial visible interactive objects (visibleInitialObjects, with flags & labels)
 *
 * Output:
 *   games/zork2/planning/room-bom-prototype/super-descriptions.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

/**
 * Extract human-readable TELL strings from ZIL M-LOOK / room ACTION routines.
 */
function extractMLookStrings(guardedList) {
  const texts = [];
  for (const g of guardedList || []) {
    const src = g.sourceText || '';
    if (!src) continue;
    // Prefer M-LOOK branch if present; otherwise extract TELL strings from room FCNs
    const isRoomLook = /M-LOOK/.test(src);
    if (!isRoomLook) continue;
    // Match double-quoted ZIL strings inside TELL blocks (handling escaped \" and multiline strings)
    const regex = /"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = regex.exec(src)) !== null) {
      const cleaned = m[1]
        .replace(/\\"/g, '"')
        .replace(/\|/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length >= 18 && !texts.includes(cleaned)) {
        texts.push(cleaned);
      }
    }
  }
  return texts;
}

const manifest = JSON.parse(await readFile(path.join(ROOT, 'games/zork2/assets/rooms/manifest.json'), 'utf8'));
const objectsCatalogRaw = JSON.parse(await readFile(path.join(ROOT, 'games/zork2/planning/context/objects.json'), 'utf8'));
const objectsByName = new Map((objectsCatalogRaw.objects || []).map(o => [o.name, o]));
const routinesCatalogRaw = JSON.parse(await readFile(path.join(ROOT, 'games/zork2/planning/context/routines.json'), 'utf8'));
const routinesByName = new Map((routinesCatalogRaw.routines || []).map(r => [r.name, r]));

function cleanZilStr(s) {
  return String(s || '')
    .replace(/\\"/g, '"')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract structured verb actions, room lifecycle triggers (M-ENTER/M-END/M-BEG),
 * and death conditions (JIGS-UP) from a ZIL routine's sourceText.
 */
function parseRoutineActions(routineName) {
  const r = routinesByName.get(routineName);
  if (!r || !r.sourceText) return [];
  const src = r.sourceText;
  const actions = [];

  // 1. Extract explicit <VERB? ...> branches
  const verbBlockRe = /<VERB\?\s+([^>]+)>([\s\S]*?)(?=<VERB\?|<\s*EQUAL\?\s+\.RARG|\)\s*\)\s*>|$)/g;
  let m;
  while ((m = verbBlockRe.exec(src)) !== null) {
    const verbs = m[1].trim().split(/\s+/).filter(Boolean);
    const body = m[2] || '';
    const isDeath = /JIGS-UP/.test(body);
    const movesPlayer = /\b(GOTO|DO-WALK)\b/.test(body);
    const strMatches = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => cleanZilStr(x[1])).filter(s => s.length >= 6);
    const preview = strMatches.slice(0, 2).join(' / ');
    if (verbs.length && (preview || isDeath || movesPlayer)) {
      const outcomeParts = [];
      if (isDeath) outcomeParts.push('CAN KILL PLAYER (JIGS-UP)');
      if (movesPlayer) outcomeParts.push('moves/teleports player');
      if (preview) outcomeParts.push(`"${preview.slice(0, 170)}${preview.length > 170 ? '…' : ''}"`);
      actions.push({
        routine: routineName,
        trigger: verbs.join(' / '),
        fatal: isDeath,
        result: outcomeParts.join(' — '),
      });
    }
  }

  // 2. Extract room-entry / turn-end triggers (M-ENTER, M-END, M-BEG)
  const rargRe = /<EQUAL\?\s+\.RARG\s+,(M-ENTER|M-END|M-BEG)>([\s\S]*?)(?=<EQUAL\?\s+\.RARG|$)/g;
  while ((m = rargRe.exec(src)) !== null) {
    const phase = m[1];
    const body = m[2] || '';
    const isDeath = /JIGS-UP/.test(body);
    const strMatches = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => cleanZilStr(x[1])).filter(s => s.length >= 10);
    const preview = strMatches.slice(0, 2).join(' / ');
    if (preview || isDeath) {
      const label = phase === 'M-ENTER' ? 'ON ENTER' : (phase === 'M-END' ? 'EACH TURN IN ROOM' : 'BEFORE ACTION');
      actions.push({
        routine: routineName,
        trigger: label,
        fatal: isDeath,
        result: (isDeath ? 'HAZARD / CAN KILL PLAYER — ' : '') + (preview ? `"${preview.slice(0, 170)}${preview.length > 170 ? '…' : ''}"` : 'Triggers room state logic'),
      });
    }
  }

  // 3. Catch standalone JIGS-UP messages if not already captured
  if (/JIGS-UP/.test(src) && !actions.some(a => a.fatal)) {
    const jMatch = src.match(/<JIGS-UP\s+"((?:[^"\\]|\\.)*)"/);
    actions.push({
      routine: routineName,
      trigger: 'HAZARD',
      fatal: true,
      result: jMatch ? `DEATH: "${cleanZilStr(jMatch[1]).slice(0, 170)}"` : 'Can kill the player (JIGS-UP).',
    });
  }

  return actions;
}

function describeObjectCapabilities(obj) {
  const f = new Set(obj.flags || []);
  const uses = [];
  if (f.has('TAKEBIT')) uses.push('TAKE / DROP');
  if (f.has('READBIT')) uses.push('READ');
  if (f.has('LIGHTBIT')) uses.push('TURN ON / TURN OFF (light source)');
  if (f.has('FOODBIT')) uses.push('EAT');
  if (f.has('DRINKBIT')) uses.push('DRINK');
  if (f.has('DOORBIT')) uses.push('OPEN / CLOSE / UNLOCK / GO THROUGH');
  if (f.has('CONTBIT') && !f.has('SURFACEBIT')) uses.push('OPEN / CLOSE / LOOK IN / PUT IN');
  if (f.has('SURFACEBIT')) uses.push('PUT ON / LOOK ON');
  if (f.has('WEARBIT')) uses.push('WEAR / REMOVE');
  if (f.has('WEAPONBIT')) uses.push('ATTACK WITH');
  if (f.has('BURNBIT')) uses.push('BURN / LIGHT');
  if (f.has('ACTORBIT')) uses.push('TALK TO / GIVE TO / ATTACK');
  if (f.has('VEHBIT')) uses.push('BOARD / ENTER / EXIT');
  if (f.has('INVISIBLE')) uses.push('Initially HIDDEN until revealed by puzzle/event');
  if (!uses.length) uses.push('EXAMINE (fixed room feature)');
  return uses;
}

const roomsOut = {};
let staticCount = 0;
let mLookCount = 0;
let totalStartingObjects = 0;

for (const entry of manifest.rooms) {
  const slug = path.dirname(entry.image);
  const ctxPath = path.join(ROOT, 'games/zork2/assets/rooms', slug, 'source-context.json');
  const planPath = path.join(ROOT, 'games/zork2/planning/context', `${slug}.json`);

  const srcCtx = existsSync(ctxPath) ? JSON.parse(await readFile(ctxPath, 'utf8')) : {};
  const planCtx = existsSync(planPath) ? JSON.parse(await readFile(planPath, 'utf8')) : {};

  const roomMeta = planCtx.room || {};
  const label = srcCtx.label || roomMeta.desc || entry.label || slug;
  const identity = srcCtx.room || roomMeta.name || entry.identity || slug.toUpperCase();
  const flags = Array.isArray(roomMeta.flags) ? roomMeta.flags : [];
  const naturallyLit = Boolean(srcCtx.sourceLightFlag || roomMeta.initialRoomLightFlag || flags.includes('ONBIT'));
  const outdoors = roomMeta.outdoors === true;

  const ldescList = Array.isArray(srcCtx.literalRoomDescription)
    ? srcCtx.literalRoomDescription.map(s => String(s).trim()).filter(Boolean)
    : (srcCtx.literalRoomDescription ? [String(srcCtx.literalRoomDescription).trim()] : []);
  if (ldescList.length) staticCount++;

  const mLookTexts = extractMLookStrings(srcCtx.guardedRoomSource);
  if (mLookTexts.length) mLookCount++;

  const safeProfile = String(srcCtx.safeSceneProfile || '').trim();

  // Merge exits from planning/context (richer: has neighbor label, door, global condition, message)
  const rawExits = Array.isArray(planCtx.exits) && planCtx.exits.length
    ? planCtx.exits
    : (srcCtx.sourceExits || []);

  const exitsFormatted = rawExits.map(e => {
    const dir = e.direction;
    const v = e.view || {};
    const kind = v.kind || 'UEXIT';
    const destLabel = e.neighbour?.desc ? `${e.neighbour.desc} (${e.neighbour.name})` : (v.to || '');
    if (kind === 'NEXIT') {
      return `${dir}: blocked${v.message ? ` — "${v.message}"` : ''}`;
    }
    if (kind === 'DEXIT') {
      return `${dir} → ${destLabel || 'passage'} [door: ${v.door || 'door'}]`;
    }
    if (kind === 'CEXIT') {
      return `${dir} → ${destLabel || 'passage'} [conditional: ${v.global || 'state'}]`;
    }
    if (kind === 'FEXIT') {
      return `${dir} → computed/special exit (${v.routine || 'function'})`;
    }
    return `${dir} → ${destLabel || 'open passage'}`;
  });

  // Global scenery objects (architecture/environment landmarks in the room)
  const globalScenery = (planCtx.globalObjects || [])
    .map(g => (typeof g === 'string' ? g : (g.desc || g.name || g.id)))
    .filter(Boolean);

  // All starting objects in this room from ZIL source (planning/context/<slug>.json -> initialObjects + objects.json)
  const visibleIds = new Set((srcCtx.visibleInitialObjects || []).map(o => o.identity));
  const initNames = Array.isArray(planCtx.initialObjects) && planCtx.initialObjects.length
    ? planCtx.initialObjects
    : (srcCtx.visibleInitialObjects || []).map(o => o.identity);

  const startingObjects = [];
  for (const name of initNames) {
    const cat = objectsByName.get(name);
    const vis = (srcCtx.visibleInitialObjects || []).find(o => o.identity === name);
    const objFlags = cat?.flags || vis?.flags || [];
    const parent = cat?.parent || vis?.parent || identity;
    const objLabel = cat?.desc?.text || vis?.label || name;
    const isInvisible = objFlags.includes('INVISIBLE');
    const isScenery = objFlags.includes('NDESCBIT') && !objFlags.includes('TAKEBIT');
    const isTakeable = objFlags.includes('TAKEBIT');
    const isDoor = objFlags.includes('DOORBIT');
    const isActor = objFlags.includes('ACTORBIT');
    const visibility = isInvisible ? 'hidden (INVISIBLE)' : (isScenery ? 'scenery (NDESCBIT)' : (visibleIds.has(name) ? 'visible' : 'initial'));
    startingObjects.push({
      identity: name,
      label: objLabel,
      parent,
      visibility,
      takeable: isTakeable,
      door: isDoor,
      actor: isActor,
      flags: objFlags,
    });
  }
  totalStartingObjects += startingObjects.length;

  const initialObjects = startingObjects.map(o => {
    const tags = [o.identity];
    if (o.parent && o.parent !== identity) tags.push(`in/on ${o.parent}`);
    if (o.visibility !== 'visible') tags.push(o.visibility);
    if (o.takeable) tags.push('takeable');
    if (o.door) tags.push('door');
    if (o.actor) tags.push('actor');
    return `${o.label} [${tags.join(' · ')}]`;
  });

  // Build unified Super Description text
  const sections = [];
  sections.push(`${label} (${identity})`);
  sections.push(`Lighting: ${naturallyLit ? 'Naturally lit (ONBIT)' : 'Dark by default (lamp/torch lit)'}${flags.length ? ` · Flags: ${flags.join(', ')}` : ''}`);

  if (ldescList.length) {
    sections.push(`\nDescription (LDESC):\n${ldescList.join('\n')}`);
  }
  if (mLookTexts.length) {
    sections.push(`\nDynamic Room Text (M-LOOK):\n${mLookTexts.join(' ')}`);
  }
  if (safeProfile) {
    sections.push(`\nScene & Architecture Profile:\n${safeProfile}`);
  }
  if (exitsFormatted.length) {
    sections.push(`\nExits (${exitsFormatted.length}):\n- ${exitsFormatted.join('\n- ')}`);
  } else {
    sections.push('\nExits: None (enclosed / aerial / special transition)');
  }
  if (globalScenery.length) {
    sections.push(`\nGlobal Scenery: ${globalScenery.join(', ')}`);
  }
  if (initialObjects.length) {
    sections.push(`\nStarting Objects at Game Start (${initialObjects.length}):\n- ${initialObjects.join('\n- ')}`);
  } else {
    sections.push('\nStarting Objects at Game Start: None');
  }

  // Build detailed Gameplay, Actions, Hazards & Object Usage Guide
  const gameplayLines = [];

  // 1. Darkness & Grue survival rule
  const darknessRule = naturallyLit
    ? 'NATURALLY LIT (ONBIT): Room is visible without a lamp; safe from grues.'
    : 'DARK BY DEFAULT: If you enter without a lit light source (e.g. LAMP turned on), it is pitch black — moving in the dark risks being eaten by a grue (instant death).';
  gameplayLines.push(`LIGHTING & SURVIVAL:\n- ${darknessRule}`);

  // 2. Movement actions & exact results
  const moveActions = rawExits.map(e => {
    const dir = e.direction;
    const v = e.view || {};
    const kind = v.kind || 'UEXIT';
    const dest = e.neighbour?.desc ? `${e.neighbour.desc} (${e.neighbour.name})` : (v.to || 'destination');
    if (kind === 'NEXIT') return `GO ${dir} → Blocked: "${v.message || "You can't go that way."}"`;
    if (kind === 'DEXIT') return `GO ${dir} → Moves to ${dest} if door ${v.door || 'door'} is open; otherwise blocked until opened/unlocked.`;
    if (kind === 'CEXIT') return `GO ${dir} → Moves to ${dest} if ${v.global || 'condition'} is true; otherwise blocked${v.message ? `: "${v.message}"` : '.'}`;
    if (kind === 'FEXIT') return `GO ${dir} → Special routine (${v.routine || 'computed'}): destination/outcome depends on game state.`;
    return `GO ${dir} → Moves to ${dest}.`;
  });
  if (moveActions.length) {
    gameplayLines.push(`\nMOVEMENT ACTIONS & RESULTS:\n- ${moveActions.join('\n- ')}`);
  } else {
    gameplayLines.push('\nMOVEMENT ACTIONS & RESULTS:\n- No standard directional exits (requires special action, balloon/vehicle, or puzzle trigger).');
  }

  // 3. Room & puzzle routine actions/hazards
  const rootRoutines = [...new Set([
    ...(planCtx.routines?.roots || []),
    ...(srcCtx.guardedRoomSource || []).map(g => g.routine).filter(Boolean),
  ])];
  const routineActions = [];
  for (const rname of rootRoutines) {
    for (const act of parseRoutineActions(rname)) {
      routineActions.push(act);
    }
  }
  if (routineActions.length) {
    const uniqueActs = [];
    const seen = new Set();
    for (const a of routineActions) {
      const k = `${a.routine}|${a.trigger}|${a.result}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniqueActs.push(`${a.fatal ? '⚠️ ' : ''}[${a.routine}] ${a.trigger} → ${a.result}`);
    }
    gameplayLines.push(`\nSPECIAL ROOM / PUZZLE ACTIONS & HAZARDS:\n- ${uniqueActs.slice(0, 12).join('\n- ')}`);
  }

  // 4. Starting objects & how to use them
  if (startingObjects.length) {
    const objUsageLines = startingObjects.map(o => {
      const cat = objectsByName.get(o.identity);
      const caps = describeObjectCapabilities(o);
      const handlers = (cat?.handlers || []).map(h => (typeof h === 'string' ? h : h.name)).filter(Boolean);
      const handlerNote = handlers.length ? ` (handler: ${handlers.join(', ')})` : '';
      const parentNote = o.parent && o.parent !== identity ? ` [starts in/on ${o.parent}]` : '';
      return `${o.label} (${o.identity})${parentNote}: ${caps.join('; ')}${handlerNote}`;
    });
    gameplayLines.push(`\nOBJECTS & HOW TO USE THEM:\n- ${objUsageLines.join('\n- ')}`);
  } else {
    gameplayLines.push('\nOBJECTS & HOW TO USE THEM:\n- No starting objects in this room (scenery/exits only).');
  }

  const gameplayGuide = gameplayLines.join('\n');

  roomsOut[slug] = {
    slug,
    identity,
    label,
    naturallyLit,
    outdoors,
    flags,
    hasStaticLdesc: ldescList.length > 0,
    hasDynamicMLook: mLookTexts.length > 0,
    literalRoomDescription: ldescList.join('\n'),
    dynamicMLookText: mLookTexts.join(' '),
    safeSceneProfile: safeProfile,
    exits: exitsFormatted,
    globalScenery,
    startingObjects,
    initialObjects,
    darknessRule,
    routineActions,
    gameplayGuide,
    superDescription: sections.join('\n'),
  };
}

const outPath = path.join(ROOT, 'games/zork2/planning/room-bom-prototype/super-descriptions.json');
const payload = {
  format: 'zxr-room-super-descriptions-v1',
  updatedAt: new Date().toISOString(),
  totalRooms: Object.keys(roomsOut).length,
  roomsWithStaticLdesc: staticCount,
  roomsWithDynamicMLook: mLookCount,
  rooms: roomsOut,
};
await writeFile(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`Generated super-descriptions for ${payload.totalRooms} rooms (static LDESC: ${staticCount}, M-LOOK: ${mLookCount}) -> ${path.relative(ROOT, outPath)}`);
