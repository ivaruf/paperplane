// Rect helpers, field accumulation and contact resolution. DOM-free and
// allocation-free in the per-step paths (callers pass reusable `out` objects).

import { ROOM_W, FLOOR_Y, CEILING_Y } from '../config.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {{ fx: number, fy: number }} FieldSum */

/**
 * Axis-aligned rectangle overlap test (touching edges do not count).
 * @param {Rect} a
 * @param {Rect} b
 * @returns {boolean}
 */
export function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * The rect an object instance collides with: its explicit `hitbox` if present,
 * otherwise its draw rect.
 * @param {Rect & { hitbox?: Rect }} inst
 * @returns {Rect}
 */
export function collisionRect(inst) {
  return inst.hitbox ?? inst;
}

/**
 * Whether touching this instance destroys the glider.
 * @param {{ category?: string, dead?: boolean }} inst
 * @returns {boolean}
 */
export function isBlocking(inst) {
  return !inst.dead && (inst.category === 'solid' || inst.category === 'hazard');
}

/**
 * Sum the fx/fy of every live object field the rect intersects.
 * @param {Rect} rect glider rect
 * @param {Array<{ field?: Rect & FieldSum, dead?: boolean }>} objects
 * @param {FieldSum} [out] reused accumulator; reset to 0 before summing
 * @returns {FieldSum} `out`
 */
export function accumulateFields(rect, objects, out = { fx: 0, fy: 0 }) {
  out.fx = 0;
  out.fy = 0;
  for (let i = 0; i < objects.length; i++) {
    const inst = objects[i];
    const f = inst.field;
    if (!f || inst.dead) continue;
    if (rectsIntersect(rect, f)) {
      out.fx += f.fx || 0;
      out.fy += f.fy || 0;
    }
  }
  return out;
}

/**
 * First live solid/hazard instance whose collision rect intersects `rect`.
 * @param {Rect} rect glider rect
 * @param {Array<object>} objects
 * @returns {object | null}
 */
export function findContact(rect, objects) {
  for (let i = 0; i < objects.length; i++) {
    const inst = objects[i];
    if (isBlocking(inst) && rectsIntersect(rect, collisionRect(inst))) return inst;
  }
  return null;
}

/**
 * Collect every live pickup whose collision rect intersects `rect`.
 * @param {Rect} rect glider rect
 * @param {Array<object>} objects
 * @param {Array<object>} [out] reused result array; emptied first
 * @returns {Array<object>} `out`
 */
export function collectPickups(rect, objects, out = []) {
  out.length = 0;
  for (let i = 0; i < objects.length; i++) {
    const inst = objects[i];
    if (inst.dead || inst.category !== 'pickup') continue;
    if (rectsIntersect(rect, collisionRect(inst))) out.push(inst);
  }
  return out;
}

/**
 * Keep the glider below the ceiling; zero any upward velocity when clamped.
 * @param {Rect & { vy: number }} g
 * @param {number} [ceilingY]
 * @returns {boolean} true when a clamp happened
 */
export function clampCeiling(g, ceilingY = CEILING_Y) {
  if (g.y < ceilingY) {
    g.y = ceilingY;
    if (g.vy < 0) g.vy = 0;
    return true;
  }
  return false;
}

/**
 * Whether the rect's bottom edge has reached the floor surface.
 * @param {Rect} rect
 * @param {number} [floorY]
 * @returns {boolean}
 */
export function touchesFloor(rect, floorY = FLOOR_Y) {
  return rect.y + rect.h >= floorY;
}

/**
 * Which side (if any) the rect has fully left the room on.
 * Left exit: `x + w < 0`; right exit: `x > roomW`.
 * @param {Rect} rect
 * @param {number} [roomW]
 * @returns {'left' | 'right' | null}
 */
export function edgeExit(rect, roomW = ROOM_W) {
  if (rect.x + rect.w < 0) return 'left';
  if (rect.x > roomW) return 'right';
  return null;
}

/**
 * Clamp x into [0, roomW - w] and kill velocity into the wall.
 * @param {Rect & { vx: number }} g
 * @param {number} [roomW]
 * @returns {-1 | 0 | 1} which wall was hit (0 = none)
 */
export function clampWalls(g, roomW = ROOM_W) {
  if (g.x < 0) {
    g.x = 0;
    if (g.vx < 0) g.vx = 0;
    return -1;
  }
  const maxX = roomW - g.w;
  if (g.x > maxX) {
    g.x = maxX;
    if (g.vx > 0) g.vx = 0;
    return 1;
  }
  return 0;
}

/**
 * Resolve the glider against the room's left/right edges: sides with a
 * neighbouring room let the glider fly off (returning the side once it is fully
 * outside); sides without one are solid walls and clamp x.
 * @param {Rect & { vx: number }} g
 * @param {{ left?: string | null, right?: string | null }} room
 * @param {number} [roomW]
 * @returns {'left' | 'right' | null} the side to transition through, or null
 */
export function resolveRoomEdges(g, room, roomW = ROOM_W) {
  const exit = edgeExit(g, roomW);
  if (exit === 'left' && room.left) return 'left';
  if (exit === 'right' && room.right) return 'right';
  if (!room.left && g.x < 0) clampWalls(g, roomW);
  if (!room.right && g.x > roomW - g.w) clampWalls(g, roomW);
  return null;
}
