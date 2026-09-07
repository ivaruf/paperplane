// Object type registry and instance factory.
// Importable in Node: no window/document/canvas access at module top level.
//
// A room definition (levels.js) lists plain ObjectDefs `{ type, x, y, ...}`;
// createObject() turns each into an instance with id/w/h/category and the
// optional hitbox/field/pickup blocks described in docs/ARCHITECTURE.md.
// updateObject() animates instances and runs spawners; resetObject() restores
// the spawn-time snapshot (transient spawned objects are simply killed).

import { ROOM_W, ROOM_H, FLOOR_Y, CEILING_Y } from '../config.js';

// ---------------------------------------------------------------------------
// Physics tuning for moving hazards (px, px/s, px/s^2)
// ---------------------------------------------------------------------------
export const VENT_FY = -140;
export const DUCT_FY = 120;
export const CANDLE_FY = -70;
export const FAN_FX = 120;

const BALLOON_SPEED = 60;
const COPTER_SPEED = 70;
const DART_SPEED = 260;
const TOAST_VY = -420;
const TOAST_GRAVITY = 500;
const DRIP_SPEED = 220;
const DRIP_SPLASH_TIME = 0.3;
const FISH_VY = -300;
const FISH_GRAVITY = 600;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const OBJECT_TYPES = {};

/**
 * Register a type.
 * spec: {
 *   category: 'solid'|'hazard'|'pickup'|'decor',
 *   defaults: { w, h },
 *   z?: number,
 *   onFloor?: boolean,     // y defaults to FLOOR_Y - h
 *   onCeiling?: boolean,   // y defaults to CEILING_Y
 *   transient?: boolean,   // spawned at runtime; removed on reset
 *   create?(inst, def), update?(inst, dt, env), reset?(inst)
 * }
 */
function defineType(type, spec) {
  OBJECT_TYPES[type] = Object.freeze({
    category: spec.category,
    defaults: Object.freeze({ w: spec.defaults.w, h: spec.defaults.h }),
    z: spec.z ?? 0,
    onFloor: !!spec.onFloor,
    onCeiling: !!spec.onCeiling,
    transient: !!spec.transient,
    create: spec.create || null,
    update: spec.update || null,
    reset: spec.reset || null,
  });
}

// ---------------------------------------------------------------------------
// Id generation
// ---------------------------------------------------------------------------
let nextId = 1;
const defaultIdGen = () => nextId++;
// Spawned hazards live in a separate id range so they never collide with ids
// handed out by a caller-supplied generator for the room's static objects.
let nextSpawnId = 1_000_000;
const spawnIdGen = () => nextSpawnId++;

// ---------------------------------------------------------------------------
// Snapshot helpers (for resetObject)
// ---------------------------------------------------------------------------
function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = clone(v[k]);
    return o;
  }
  return v;
}

function takeSnapshot(inst) {
  const snap = {};
  for (const k of Object.keys(inst)) snap[k] = clone(inst[k]);
  Object.defineProperty(inst, '_spawn', {
    value: snap, enumerable: false, writable: true, configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build an instance from a definition. idGen: optional `() => number`. */
export function createObject(def, idGen) {
  if (!def || typeof def.type !== 'string') {
    throw new Error('createObject: def.type must be a string');
  }
  const spec = OBJECT_TYPES[def.type];
  if (!spec) throw new Error(`createObject: unknown object type "${def.type}"`);
  const gen = typeof idGen === 'function' ? idGen : (spec.transient ? spawnIdGen : defaultIdGen);

  const inst = { ...def };
  inst.id = gen();
  inst.type = def.type;
  inst.category = spec.category;
  inst.z = def.z ?? spec.z;
  inst.w = def.w ?? spec.defaults.w;
  inst.h = def.h ?? spec.defaults.h;
  inst.x = def.x ?? 0;
  if (def.y == null) {
    inst.y = spec.onFloor ? FLOOR_Y - inst.h : (spec.onCeiling ? CEILING_Y : 0);
  }
  inst.dead = false;
  if (spec.transient) inst.transient = true;

  if (spec.create) spec.create(inst, def);
  takeSnapshot(inst);
  return inst;
}

/** Map createObject over roomDef.objects. */
export function createRoomObjects(roomDef, idGen) {
  const defs = (roomDef && roomDef.objects) || [];
  return defs.map((d) => createObject(d, idGen));
}

/**
 * Advance one instance. env = { time, roomW, roomH, floorY, spawn(inst), glider }.
 * Side-effect free apart from `inst` and `env.spawn`.
 */
export function updateObject(inst, dt, env) {
  if (!inst || inst.dead) return;
  const spec = OBJECT_TYPES[inst.type];
  if (spec && spec.update) spec.update(inst, dt, env || {});
}

/** Restore spawn-time state. Transient (spawned) objects are killed instead. */
export function resetObject(inst) {
  if (!inst) return inst;
  if (inst.transient) { inst.dead = true; return inst; }
  const snap = inst._spawn;
  if (snap) {
    for (const k of Object.keys(inst)) if (!(k in snap)) delete inst[k];
    for (const k of Object.keys(snap)) inst[k] = clone(snap[k]);
  }
  const spec = OBJECT_TYPES[inst.type];
  if (spec && spec.reset) spec.reset(inst);
  return inst;
}

// ---------------------------------------------------------------------------
// Shared helpers for type hooks
// ---------------------------------------------------------------------------
const floorOf = (env) => (env && env.floorY != null ? env.floorY : FLOOR_Y);
const roomWOf = (env) => (env && env.roomW != null ? env.roomW : ROOM_W);

function emit(env, def) {
  if (env && typeof env.spawn === 'function') {
    const child = createObject(def, spawnIdGen);
    env.spawn(child);
    return child;
  }
  return null;
}

/** Common spawner state: `interval` seconds between spawns, first after `delay`. */
function initSpawner(inst, def, defaultInterval, defaultDelay) {
  inst.interval = Math.max(0.25, def.interval ?? defaultInterval);
  inst.delay = Math.max(0, def.delay ?? defaultDelay);
  inst.timer = inst.delay;
  inst.count = 0;
}

/** Tick a spawner, calling makeDef(inst, env, n) for each spawn due. */
function tickSpawner(inst, dt, env, makeDef) {
  inst.timer -= dt;
  let guard = 0;
  while (inst.timer <= 0 && guard++ < 8) {
    emit(env, makeDef(inst, env, inst.count));
    inst.count += 1;
    inst.timer += inst.interval;
  }
}

function pickupType(kind, points, w, h) {
  return {
    category: 'pickup',
    defaults: { w, h },
    create(inst, def) {
      inst.pickup = { kind, points: def.points ?? points };
      inst.phase = (inst.x * 0.013 + inst.y * 0.007) % (Math.PI * 2);
      inst.bob = 0;
    },
    update(inst, dt) {
      inst.phase += dt * 3;
      inst.bob = Math.sin(inst.phase) * 3;
    },
  };
}

// ---------------------------------------------------------------------------
// Solid furniture
// ---------------------------------------------------------------------------
defineType('table', {
  category: 'solid', defaults: { w: 240, h: 100 },
  create(inst, def) {
    if (def.y == null) inst.y = FLOOR_Y - inst.h;
    if (def.h == null) inst.h = Math.max(20, FLOOR_Y - inst.y); // legs reach the floor
  },
});
defineType('shelf', {
  category: 'solid', defaults: { w: 240, h: 130 },
  create(inst, def) { inst.variant = def.variant || 'orange'; },
});
defineType('cabinet', { category: 'solid', defaults: { w: 160, h: 230 } });
defineType('bookcase', { category: 'solid', defaults: { w: 180, h: 300 }, onFloor: true });
defineType('filing', { category: 'solid', defaults: { w: 150, h: 150 }, onFloor: true });
defineType('lamp', {
  category: 'solid', defaults: { w: 80, h: 120 }, onCeiling: true,
  create(inst) {
    // the thin cord at the top is not deadly; only the shade is
    const cord = Math.min(24, inst.h * 0.2);
    inst.hitbox = { x: inst.x, y: inst.y + cord, w: inst.w, h: inst.h - cord };
  },
});
defineType('bracket-shelf', { category: 'solid', defaults: { w: 90, h: 30 } });
defineType('vase', { category: 'solid', defaults: { w: 60, h: 100 } });
defineType('teddy', { category: 'solid', defaults: { w: 90, h: 90 }, onFloor: true });
defineType('books', {
  category: 'solid', defaults: { w: 140, h: 90 },
  create(inst, def) { inst.variant = def.variant || 'mixed'; },
});
defineType('fan', {
  category: 'solid', defaults: { w: 70, h: 90 }, onFloor: true,
  create(inst, def) {
    inst.dir = def.dir === -1 ? -1 : 1;
    const fw = def.fieldW ?? 300;
    const fh = def.fieldH ?? 120;
    const fx = inst.dir === 1 ? inst.x + inst.w : inst.x - fw;
    inst.field = {
      x: Math.max(0, fx), y: inst.y + inst.h - fh, w: fw, h: fh,
      fx: (def.fx ?? FAN_FX) * inst.dir, fy: 0,
    };
    if (inst.field.x + inst.field.w > ROOM_W) inst.field.w = ROOM_W - inst.field.x;
    inst.spin = 0;
  },
  update(inst, dt) { inst.spin = (inst.spin + dt * 14) % (Math.PI * 2); },
});
defineType('toaster', {
  category: 'solid', defaults: { w: 90, h: 60 }, onFloor: true,
  create(inst, def) { initSpawner(inst, def, 3, 1); inst.lever = 0; },
  update(inst, dt, env) {
    inst.lever = Math.max(0, inst.lever - dt * 3);
    tickSpawner(inst, dt, env, (t) => {
      t.lever = 1;
      return { type: 'toast', x: t.x + (t.w - 40) / 2, y: t.y - 40, limitY: t.y };
    });
  },
});
defineType('fishbowl', {
  category: 'solid', defaults: { w: 90, h: 70 },
  create(inst, def) {
    if (def.y == null) inst.y = FLOOR_Y - inst.h;
    initSpawner(inst, def, 3.5, 1.5);
    inst.fishOut = 0;
    inst.fishPhase = 0;
  },
  update(inst, dt, env) {
    inst.fishPhase += dt * 2;
    inst.fishOut = Math.max(0, inst.fishOut - dt);
    tickSpawner(inst, dt, env, (t, _e, n) => {
      t.fishOut = 1.2;
      const dir = n % 2 === 0 ? 1 : -1;
      return {
        type: 'fish', x: t.x + (t.w - 30) / 2, y: t.y - 10,
        vx: 40 * dir, vy: t.fishVy ?? FISH_VY, limitY: t.y + 10,
      };
    });
  },
});

// ---------------------------------------------------------------------------
// Decor (no contact effect)
// ---------------------------------------------------------------------------
defineType('picture', {
  category: 'decor', defaults: { w: 180, h: 140 }, z: -1,
  create(inst, def) { inst.variant = def.variant || 'wave'; },
});
defineType('window', {
  category: 'decor', defaults: { w: 200, h: 220 }, z: -1,
  create(inst, def) { inst.variant = def.variant || 'day'; },
});
defineType('clock-wall', { category: 'decor', defaults: { w: 70, h: 70 }, z: -1 });
defineType('switch', { category: 'decor', defaults: { w: 20, h: 30 }, z: -1 });
defineType('outlet', { category: 'decor', defaults: { w: 24, h: 24 }, z: -1 });
defineType('rug', {
  category: 'decor', defaults: { w: 300, h: 26 }, z: -1,
  create(inst, def) {
    if (def.y == null) inst.y = FLOOR_Y + 8;
    inst.variant = def.variant || 'red';
  },
});
defineType('trophy', {
  category: 'decor', defaults: { w: 80, h: 120 }, z: -1, onFloor: true,
  create(inst) { inst.glow = 0; },
  update(inst, dt) { inst.glow = (inst.glow + dt) % 1000; },
});
defineType('sign', {
  category: 'decor', defaults: { w: 200, h: 60 }, z: -1,
  create(inst, def) { inst.text = def.text ?? ''; },
});

// ---------------------------------------------------------------------------
// Air fields
// ---------------------------------------------------------------------------
defineType('vent', {
  category: 'decor', defaults: { w: 100, h: 16 },
  create(inst, def) {
    if (def.y == null) inst.y = FLOOR_Y - inst.h;
    const fw = def.fieldW ?? inst.w;
    const top = def.fieldH != null ? Math.max(CEILING_Y, inst.y - def.fieldH) : CEILING_Y;
    inst.field = {
      x: inst.x + (inst.w - fw) / 2, y: top, w: fw, h: inst.y - top,
      fx: 0, fy: def.fy ?? VENT_FY,
    };
  },
});
defineType('duct', {
  category: 'decor', defaults: { w: 100, h: 16 }, onCeiling: true,
  create(inst, def) {
    const fw = def.fieldW ?? inst.w;
    const start = inst.y + inst.h;
    const fh = def.fieldH != null ? Math.min(def.fieldH, FLOOR_Y - start) : FLOOR_Y - start;
    inst.field = {
      x: inst.x + (inst.w - fw) / 2, y: start, w: fw, h: fh,
      fx: 0, fy: def.fy ?? DUCT_FY,
    };
  },
});

// ---------------------------------------------------------------------------
// Hazards & spawners
// ---------------------------------------------------------------------------
defineType('candle', {
  category: 'hazard', defaults: { w: 30, h: 70 },
  create(inst, def) {
    if (def.y == null) inst.y = FLOOR_Y - inst.h;
    const fw = def.fieldW ?? 60;
    inst.hitbox = { x: inst.x, y: inst.y, w: inst.w, h: inst.h };
    inst.field = {
      x: inst.x + inst.w / 2 - fw / 2, y: CEILING_Y, w: fw, h: inst.y - CEILING_Y,
      fx: 0, fy: def.fy ?? CANDLE_FY,
    };
    inst.flicker = (inst.x * 0.37) % (Math.PI * 2);
  },
  update(inst, dt) { inst.flicker = (inst.flicker + dt * 9) % (Math.PI * 2); },
});

defineType('balloon-spawner', {
  category: 'decor', defaults: { w: 60, h: 30 }, onFloor: true,
  create(inst, def) { initSpawner(inst, def, 4, 1); inst.variant = def.variant || 'basket'; },
  update(inst, dt, env) {
    tickSpawner(inst, dt, env, (t, _e, n) => ({
      type: 'balloon', x: t.x + (t.w - 40) / 2, y: t.y - 60, colorIndex: n % 4,
    }));
  },
});
defineType('balloon', {
  category: 'hazard', defaults: { w: 40, h: 60 }, z: 1, transient: true,
  create(inst, def) {
    inst.baseX = inst.x;
    inst.sway = def.sway ?? 20;
    inst.speed = def.speed ?? BALLOON_SPEED;
    inst.t = 0;
    inst.vx = 0; inst.vy = -inst.speed;
    inst.colorIndex = def.colorIndex ?? 0;
  },
  update(inst, dt) {
    inst.t += dt;
    inst.y -= inst.speed * dt;
    const nx = inst.baseX + Math.sin(inst.t * 2) * inst.sway;
    inst.vx = (nx - inst.x) / Math.max(dt, 1e-6);
    inst.x = nx;
    if (inst.y + inst.h < CEILING_Y - 4) inst.dead = true;
  },
});

defineType('copter-spawner', {
  category: 'decor', defaults: { w: 40, h: 10 }, onCeiling: true,
  create(inst, def) { initSpawner(inst, def, 3.5, 1); },
  update(inst, dt, env) {
    tickSpawner(inst, dt, env, (t, _e, n) => ({
      type: 'copter', x: t.x + (t.w - 60) / 2, y: t.y + t.h, colorIndex: n % 3,
    }));
  },
});
defineType('copter', {
  category: 'hazard', defaults: { w: 60, h: 40 }, z: 1, transient: true,
  create(inst, def) {
    inst.baseX = inst.x;
    inst.sway = def.sway ?? 40;
    inst.speed = def.speed ?? COPTER_SPEED;
    inst.t = 0; inst.rotor = 0;
    inst.vx = 0; inst.vy = inst.speed;
    inst.colorIndex = def.colorIndex ?? 0;
  },
  update(inst, dt, env) {
    inst.t += dt;
    inst.rotor = (inst.rotor + dt * 30) % (Math.PI * 2);
    inst.y += inst.speed * dt;
    const nx = inst.baseX + Math.sin(inst.t * 1.5) * inst.sway;
    inst.vx = (nx - inst.x) / Math.max(dt, 1e-6);
    inst.x = nx;
    if (inst.y > floorOf(env) + 4) inst.dead = true;
  },
});

defineType('dart-spawner', {
  category: 'decor', defaults: { w: 24, h: 40 },
  create(inst, def) {
    inst.side = def.side === 'right' ? 'right' : 'left';
    if (def.x == null) inst.x = inst.side === 'left' ? 0 : ROOM_W - inst.w;
    initSpawner(inst, def, 3, 1.5);
  },
  update(inst, dt, env) {
    tickSpawner(inst, dt, env, (t, env2) => {
      const rw = roomWOf(env2);
      const fromLeft = t.side === 'left';
      return {
        type: 'dart',
        x: fromLeft ? t.x + t.w : Math.min(t.x, rw) - 60,
        y: t.y + (t.h - 12) / 2,
        dir: fromLeft ? 1 : -1,
      };
    });
  },
});
defineType('dart', {
  category: 'hazard', defaults: { w: 60, h: 12 }, z: 1, transient: true,
  create(inst, def) {
    inst.dir = def.dir === -1 ? -1 : 1;
    inst.vx = (def.speed ?? DART_SPEED) * inst.dir;
    inst.vy = 0;
  },
  update(inst, dt, env) {
    inst.x += inst.vx * dt;
    const rw = roomWOf(env);
    if (inst.x + inst.w < -20 || inst.x > rw + 20) inst.dead = true;
  },
});

defineType('toast', {
  category: 'hazard', defaults: { w: 40, h: 40 }, z: 1, transient: true,
  create(inst, def) {
    inst.vx = def.vx ?? 0;
    inst.vy = def.vy ?? TOAST_VY;
    inst.gravity = def.gravity ?? TOAST_GRAVITY;
    inst.limitY = def.limitY ?? FLOOR_Y;
    inst.angle = 0;
  },
  update(inst, dt) {
    inst.vy += inst.gravity * dt;
    inst.x += inst.vx * dt;
    inst.y += inst.vy * dt;
    inst.angle += dt * 4;
    if (inst.vy > 0 && inst.y > inst.limitY) inst.dead = true;
  },
});

defineType('drip-spawner', {
  category: 'decor', defaults: { w: 40, h: 12 }, z: -1, onCeiling: true,
  create(inst, def) { initSpawner(inst, def, 2.5, 1); inst.landY = def.landY ?? null; },
  update(inst, dt, env) {
    tickSpawner(inst, dt, env, (t, env2) => ({
      type: 'drip', x: t.x + (t.w - 12) / 2, y: t.y + t.h,
      landY: t.landY ?? floorOf(env2),
    }));
  },
});
defineType('drip', {
  category: 'hazard', defaults: { w: 12, h: 18 }, z: 1, transient: true,
  create(inst, def) {
    inst.speed = def.speed ?? DRIP_SPEED;
    inst.vx = 0; inst.vy = inst.speed;
    inst.landY = def.landY ?? FLOOR_Y;
    inst.splash = 0;      // > 0 while splashing (harmless)
  },
  update(inst, dt, env) {
    if (inst.splash > 0) {
      inst.splash -= dt;
      if (inst.splash <= 0) inst.dead = true;
      return;
    }
    inst.y += inst.speed * dt;
    const land = inst.landY ?? floorOf(env);
    if (inst.y + inst.h >= land) {
      inst.y = land - inst.h;
      inst.splash = DRIP_SPLASH_TIME;
      inst.vy = 0;
      inst.category = 'decor'; // no longer deadly once it has hit
    }
  },
});

defineType('fish', {
  category: 'hazard', defaults: { w: 30, h: 20 }, z: 1, transient: true,
  create(inst, def) {
    inst.vx = def.vx ?? 40;
    inst.vy = def.vy ?? FISH_VY;
    inst.gravity = def.gravity ?? FISH_GRAVITY;
    inst.limitY = def.limitY ?? FLOOR_Y;
    inst.startX = inst.x;
  },
  update(inst, dt) {
    inst.vy += inst.gravity * dt;
    // arc out and back so the fish lands in the bowl again
    inst.x += inst.vx * dt;
    if (Math.abs(inst.x - inst.startX) > 26) inst.vx = -inst.vx;
    inst.y += inst.vy * dt;
    if (inst.vy > 0 && inst.y > inst.limitY) inst.dead = true;
  },
});

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------
defineType('star', pickupType('star', 100, 36, 36));
defineType('clock', pickupType('clock', 300, 44, 44));
defineType('life', pickupType('life', 50, 44, 20));
defineType('battery', pickupType('battery', 0, 28, 50));
defineType('helium', pickupType('helium', 0, 40, 60));

Object.freeze(OBJECT_TYPES);
