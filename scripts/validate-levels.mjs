#!/usr/bin/env node
// Validates the house data: room ids/links, object types, geometry,
// reachability of FINAL_ROOM, and that every object survives create/update/reset.
// Usage: node scripts/validate-levels.mjs   (exits non-zero on failure)

import { ROOMS, START_ROOM, START_POS, FINAL_ROOM, HOUSE_NAME } from '../js/game/levels.js';
import { OBJECT_TYPES, createObject, createRoomObjects, updateObject, resetObject } from '../js/game/objects.js';
import { WALLPAPER_STYLES } from '../js/render/sprites.js';
import { ROOM_W, ROOM_H, FLOOR_Y, GLIDER_W, GLIDER_H } from '../js/config.js';

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const CATEGORIES = new Set(['solid', 'hazard', 'pickup', 'decor']);
const rectOf = (o) => o.hitbox ?? { x: o.x, y: o.y, w: o.w, h: o.h };
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------------------------------------------------------------------------
// Rooms & links
// ---------------------------------------------------------------------------
const roomIds = Object.keys(ROOMS);
if (roomIds.length === 0) fail('ROOMS is empty');
if (typeof HOUSE_NAME !== 'string' || !HOUSE_NAME) fail('HOUSE_NAME must be a non-empty string');

const seenIds = new Set();
for (const key of roomIds) {
  const room = ROOMS[key];
  if (!room || typeof room !== 'object') { fail(`ROOMS["${key}"] is not an object`); continue; }
  if (room.id !== key) fail(`ROOMS["${key}"].id is "${room.id}" (must equal its key)`);
  if (seenIds.has(room.id)) fail(`duplicate room id "${room.id}"`);
  seenIds.add(room.id);
  if (typeof room.name !== 'string' || !room.name) fail(`room "${key}" has no name`);
  if (!Array.isArray(room.objects)) fail(`room "${key}" has no objects array`);
  if (!WALLPAPER_STYLES.includes(room.wallpaper)) {
    warn(`room "${key}" wallpaper "${room.wallpaper}" is not one of ${WALLPAPER_STYLES.join('/')} (falls back to dots)`);
  }
  for (const side of ['left', 'right']) {
    if (!(side in room)) { fail(`room "${key}" lacks "${side}" (use null for a wall)`); continue; }
    const target = room[side];
    if (target === null) continue;
    if (typeof target !== 'string' || !ROOMS[target]) { fail(`room "${key}".${side} -> "${target}" does not exist`); continue; }
    const back = side === 'left' ? 'right' : 'left';
    if (ROOMS[target][back] !== key) {
      fail(`link not symmetric: ${key}.${side} = ${target} but ${target}.${back} = ${ROOMS[target][back]}`);
    }
  }
}

if (!ROOMS[START_ROOM]) fail(`START_ROOM "${START_ROOM}" does not exist`);
if (!ROOMS[FINAL_ROOM]) fail(`FINAL_ROOM "${FINAL_ROOM}" does not exist`);
if (START_ROOM === FINAL_ROOM) fail('START_ROOM and FINAL_ROOM are the same room');
if (!START_POS || typeof START_POS.x !== 'number' || typeof START_POS.y !== 'number') {
  fail('START_POS must be { x, y }');
} else if (START_POS.x < 0 || START_POS.x + GLIDER_W > ROOM_W || START_POS.y < 0 || START_POS.y + GLIDER_H > FLOOR_Y) {
  fail(`START_POS ${JSON.stringify(START_POS)} puts the glider outside the playfield`);
}

// Reachability START_ROOM -> FINAL_ROOM via left/right links
let finalReachable = false;
const chainOrder = [];
if (ROOMS[START_ROOM]) {
  const seen = new Set([START_ROOM]);
  const queue = [START_ROOM];
  while (queue.length) {
    const id = queue.shift();
    chainOrder.push(id);
    if (id === FINAL_ROOM) finalReachable = true;
    for (const side of ['left', 'right']) {
      const t = ROOMS[id][side];
      if (t && ROOMS[t] && !seen.has(t)) { seen.add(t); queue.push(t); }
    }
  }
  for (const id of roomIds) if (!seen.has(id)) warn(`room "${id}" is not reachable from START_ROOM`);
}
if (!finalReachable) fail(`FINAL_ROOM "${FINAL_ROOM}" is not reachable from START_ROOM "${START_ROOM}"`);

// ---------------------------------------------------------------------------
// Object registry sanity
// ---------------------------------------------------------------------------
for (const [type, spec] of Object.entries(OBJECT_TYPES)) {
  if (!CATEGORIES.has(spec.category)) fail(`OBJECT_TYPES["${type}"].category "${spec.category}" is invalid`);
  if (!spec.defaults || !(spec.defaults.w > 0) || !(spec.defaults.h > 0)) fail(`OBJECT_TYPES["${type}"].defaults must have positive w/h`);
}

// ---------------------------------------------------------------------------
// Per-room objects: types, geometry, simulation
// ---------------------------------------------------------------------------
const SIM_SECONDS = 10;
const SIM_DT = 1 / 60;
const totals = { rooms: roomIds.length, objects: 0, byCategory: {}, byType: {}, pickups: {}, spawned: 0 };
const bump = (map, k) => { map[k] = (map[k] || 0) + 1; };

function fakeEnv(spawnList, time) {
  return {
    time,
    roomW: ROOM_W, roomH: ROOM_H, floorY: FLOOR_Y,
    glider: { x: START_POS.x, y: START_POS.y, w: GLIDER_W, h: GLIDER_H },
    spawn(inst) {
      if (!inst || typeof inst !== 'object') throw new Error('spawn() received a non-object');
      spawnList.push(inst);
    },
  };
}

for (const key of roomIds) {
  const room = ROOMS[key];
  if (!room || !Array.isArray(room.objects)) continue;
  const tag = `room "${key}"`;

  // 1. types & geometry from the definitions
  room.objects.forEach((def, i) => {
    if (!def || typeof def.type !== 'string') { fail(`${tag} object #${i} has no type`); return; }
    if (!OBJECT_TYPES[def.type]) fail(`${tag} object #${i} has unknown type "${def.type}"`);
  });

  // 2. create instances
  let instances;
  try {
    let n = 1;
    instances = createRoomObjects(room, () => n++);
  } catch (e) {
    fail(`${tag}: createRoomObjects threw: ${e.message}`);
    continue;
  }
  const ids = new Set();
  const solids = [];
  instances.forEach((inst, i) => {
    const label = `${tag} ${inst.type}#${i} @(${inst.x},${inst.y})`;
    if (typeof inst.id !== 'number') fail(`${label}: id is not a number`);
    if (ids.has(inst.id)) fail(`${label}: duplicate id ${inst.id}`);
    ids.add(inst.id);
    if (!CATEGORIES.has(inst.category)) fail(`${label}: bad category "${inst.category}"`);
    for (const k of ['x', 'y', 'w', 'h']) {
      if (typeof inst[k] !== 'number' || Number.isNaN(inst[k])) fail(`${label}: ${k} is not a number`);
    }
    if (inst.w <= 0 || inst.h <= 0) fail(`${label}: non-positive size ${inst.w}x${inst.h}`);
    if (inst.x < 0 || inst.y < 0 || inst.x + inst.w > ROOM_W || inst.y + inst.h > ROOM_H) {
      fail(`${label}: rect ${inst.w}x${inst.h} lies outside the room`);
    }
    if (inst.category !== 'decor' && inst.y + inst.h > FLOOR_Y + 0.001) {
      fail(`${label}: ${inst.category} object extends below the floor (bottom ${inst.y + inst.h} > ${FLOOR_Y})`);
    }
    if (inst.hitbox) {
      const hb = inst.hitbox;
      if (hb.x < 0 || hb.y < 0 || hb.x + hb.w > ROOM_W || hb.y + hb.h > ROOM_H) fail(`${label}: hitbox outside the room`);
    }
    if (inst.field) {
      const f = inst.field;
      for (const k of ['x', 'y', 'w', 'h', 'fx', 'fy']) if (typeof f[k] !== 'number') fail(`${label}: field.${k} missing`);
      if (f.w <= 0 || f.h <= 0) fail(`${label}: field has non-positive size`);
      if (f.x < -0.001 || f.y < -0.001 || f.x + f.w > ROOM_W + 0.001 || f.y + f.h > ROOM_H + 0.001) fail(`${label}: field outside the room`);
    }
    if (inst.category === 'pickup') {
      if (!inst.pickup || typeof inst.pickup.kind !== 'string' || typeof inst.pickup.points !== 'number') {
        fail(`${label}: pickup block missing`);
      } else bump(totals.pickups, inst.pickup.kind);
    }
    if (inst.category === 'solid' || inst.category === 'hazard') solids.push({ inst, rect: rectOf(inst) });
    totals.objects++;
    bump(totals.byCategory, inst.category);
    bump(totals.byType, inst.type);
  });

  // pickups embedded inside solids can never be collected
  for (const p of instances.filter((o) => o.category === 'pickup')) {
    for (const s of solids) {
      if (overlaps(rectOf(p), s.rect)) fail(`${tag}: ${p.type} @(${p.x},${p.y}) overlaps solid ${s.inst.type} @(${s.inst.x},${s.inst.y})`);
    }
  }
  // a solid parked in the entry strip of an enterable edge is a respawn trap
  const entryStrip = 100;
  for (const s of solids) {
    if (room.left && s.rect.x < entryStrip) warn(`${tag}: ${s.inst.type} @(${s.inst.x},${s.inst.y}) sits in the left entry strip`);
    if (room.right && room.right !== FINAL_ROOM && s.rect.x + s.rect.w > ROOM_W - entryStrip) {
      warn(`${tag}: ${s.inst.type} @(${s.inst.x},${s.inst.y}) sits in the right entry strip`);
    }
  }
  if (key === START_ROOM) {
    const g = { x: START_POS.x, y: START_POS.y, w: GLIDER_W, h: GLIDER_H };
    for (const s of solids) if (overlaps(g, s.rect)) fail(`START_POS overlaps ${s.inst.type} @(${s.inst.x},${s.inst.y})`);
  }
  if (!instances.some((o) => o.field && o.field.fy < 0)) warn(`${tag}: has no updraft (vent/candle) - low entries cannot recover`);
  if (!instances.some((o) => o.category === 'pickup')) warn(`${tag}: has no pickups`);

  // 3. simulate SIM_SECONDS of updates, including spawned objects
  const spawned = [];
  let live = instances.slice();
  let maxAlive = 0;
  try {
    for (let step = 0, time = 0; step < SIM_SECONDS / SIM_DT; step++, time += SIM_DT) {
      const env = fakeEnv(spawned, time);
      for (const inst of live) updateObject(inst, SIM_DT, env);
      if (spawned.length) {
        for (const s of spawned) {
          if (!OBJECT_TYPES[s.type]) fail(`${tag}: spawned unknown type "${s.type}"`);
          if (!CATEGORIES.has(s.category)) fail(`${tag}: spawned ${s.type} has bad category`);
          totals.spawned++;
        }
        live = live.concat(spawned.splice(0));
      }
      live = live.filter((o) => !o.dead);
      maxAlive = Math.max(maxAlive, live.length);
      for (const o of live) {
        if (Number.isNaN(o.x) || Number.isNaN(o.y)) { fail(`${tag}: ${o.type} position became NaN`); break; }
      }
    }
  } catch (e) {
    fail(`${tag}: updateObject threw: ${e.stack || e.message}`);
  }
  if (maxAlive > instances.length + 30) warn(`${tag}: up to ${maxAlive - instances.length} spawned objects alive at once`);

  // 4. reset restores the snapshot for static objects and kills transients
  try {
    for (const inst of live) resetObject(inst);
    for (const inst of instances) {
      resetObject(inst);
      if (inst.dead) fail(`${tag}: ${inst.type} @(${inst.x},${inst.y}) is dead after reset`);
    }
    const spawnedAlive = live.filter((o) => o.transient && !o.dead);
    if (spawnedAlive.length) fail(`${tag}: ${spawnedAlive.length} spawned objects survived resetObject`);
    // second create/update pass must match the first (determinism smoke test)
    const again = createRoomObjects(room);
    if (again.length !== instances.length) fail(`${tag}: createRoomObjects is not deterministic in length`);
    for (let i = 0; i < again.length; i++) {
      const a = again[i], b = instances[i];
      if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) fail(`${tag}: ${a.type}#${i} differs after reset (${b.x},${b.y},${b.w},${b.h} vs ${a.x},${a.y},${a.w},${a.h})`);
    }
  } catch (e) {
    fail(`${tag}: resetObject threw: ${e.stack || e.message}`);
  }
}

// createObject must reject unknown types
try { createObject({ type: 'definitely-not-a-type' }); fail('createObject accepted an unknown type'); } catch { /* expected */ }

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(`House: ${HOUSE_NAME}`);
console.log(`Rooms: ${totals.rooms}   start: ${START_ROOM} @ (${START_POS?.x},${START_POS?.y})   final: ${FINAL_ROOM}`);
console.log(`Chain: ${chainOrder.join(' -> ')}`);
console.log(`Objects: ${totals.objects} static (+${totals.spawned} spawned during ${SIM_SECONDS}s simulation)`);
console.log('By category:', Object.entries(totals.byCategory).map(([k, v]) => `${k}=${v}`).join('  '));
console.log('Pickups:    ', Object.entries(totals.pickups).map(([k, v]) => `${k}=${v}`).join('  '));
console.log('By type:    ', Object.entries(totals.byType).sort().map(([k, v]) => `${k}=${v}`).join('  '));
console.log(`Object types registered: ${Object.keys(OBJECT_TYPES).length}`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nOK: levels valid.');
