// Glider physics and animation state. DOM-free.
//
// The glider is a paper plane at terminal velocity: it sinks at a constant
// speed (no gravity acceleration) and the player only steers left/right.
// Velocities from object fields are added per step, never accumulated.

import { GLIDER_W, GLIDER_H } from '../config.js';

// ---- Tunables (px, px/s, px/s^2, seconds) --------------------------------
/** Constant sink speed while flying. */
export const SINK_SPEED = 55;
/** Horizontal acceleration while a direction is held. */
export const ACCEL = 700;
/** Horizontal speed cap from steering. */
export const MAX_SPEED = 230;
/** Horizontal deceleration toward 0 when no direction is held. */
export const DRAG = 500;
/** Vertical velocity added while a boost is active (negative = up). */
export const BOOST_LIFT = -170;
/** Seconds one boost charge lasts. */
export const BOOST_DURATION = 0.7;
/** Vertical velocity that replaces SINK_SPEED while helium is active. */
export const HELIUM_LIFT = -45;
/** Seconds of float granted by a helium pickup. */
export const HELIUM_DURATION = 8;
/** Boost charges granted by a battery pickup. */
export const BATTERY_CHARGES = 2;
/** Maximum stored boost charges. */
export const MAX_BOOST_CHARGES = 9;
/** Seconds the crash/burn tumble lasts before a life is deducted. */
export const CRASH_DURATION = 1.2;
/** Seconds of blinking invulnerability after (re)spawning. The glider hovers during it. */
export const SPAWN_DURATION = 1.0;
/** Downward speed of the tumbling wreck. */
export const CRASH_FALL_SPEED = 140;
/** Horizontal deceleration of the tumbling wreck. */
export const CRASH_DRAG = 300;

/**
 * @typedef {object} Glider
 * @property {number} x top-left, room coords
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} vx controlled horizontal velocity (excludes fields)
 * @property {number} vy effective vertical velocity of the last step (includes fields)
 * @property {1 | -1} facing direction of the last steering input
 * @property {'flying' | 'crashing' | 'burning' | 'spawning'} state
 * @property {number} stateTime seconds spent in the current state
 * @property {boolean} boostActive
 * @property {number} boostTime seconds of boost remaining
 * @property {number} boostCharges
 * @property {number} helium seconds of helium float remaining (0 = none)
 */

/**
 * Create a fresh glider in the 'spawning' state.
 * @param {number} [x]
 * @param {number} [y]
 * @returns {Glider}
 */
export function createGlider(x = 0, y = 0) {
  return {
    x, y, w: GLIDER_W, h: GLIDER_H,
    vx: 0, vy: 0, facing: 1,
    state: 'spawning', stateTime: 0,
    boostActive: false, boostTime: 0, boostCharges: 0,
    helium: 0,
  };
}

/**
 * Place the glider with zero velocity and no active boost/helium. Boost
 * charges are kept (they survive respawns).
 * @param {Glider} g
 * @param {number} x
 * @param {number} y
 * @param {Glider['state']} [state]
 * @returns {Glider} `g`
 */
export function resetGlider(g, x, y, state = 'spawning') {
  g.x = x;
  g.y = y;
  g.vx = 0;
  g.vy = 0;
  g.state = state;
  g.stateTime = 0;
  g.boostActive = false;
  g.boostTime = 0;
  g.helium = 0;
  return g;
}

/**
 * Whether contacts with solids/hazards/floor should destroy the glider.
 * @param {Glider} g
 * @returns {boolean}
 */
export function isVulnerable(g) {
  return g.state === 'flying';
}

/**
 * Whether the glider is in a crash/burn animation.
 * @param {Glider} g
 * @returns {boolean}
 */
export function isCrashed(g) {
  return g.state === 'crashing' || g.state === 'burning';
}

/**
 * Advance one physics step while flying or spawning: timers, steering,
 * sink/helium/boost lift, field velocities, and position integration.
 * Does not resolve walls/ceiling/floor — see physics.js.
 * @param {Glider} g
 * @param {number} dt seconds
 * @param {{ left: boolean, right: boolean }} controls held steering inputs
 * @param {{ fx: number, fy: number } | null} [field] summed field velocities intersecting the glider
 */
export function stepGlider(g, dt, controls, field = null) {
  g.stateTime += dt;
  if (g.state === 'spawning' && g.stateTime >= SPAWN_DURATION) {
    g.state = 'flying';
    g.stateTime = 0;
  }
  if (g.boostActive) {
    g.boostTime -= dt;
    if (g.boostTime <= 0) {
      g.boostActive = false;
      g.boostTime = 0;
    }
  }
  if (g.helium > 0) g.helium = Math.max(0, g.helium - dt);

  // Horizontal: accelerate toward +-MAX_SPEED while held, drag toward 0 otherwise.
  const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  if (dir !== 0) {
    g.facing = dir;
    g.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, g.vx + dir * ACCEL * dt));
  } else if (g.vx > 0) {
    g.vx = Math.max(0, g.vx - DRAG * dt);
  } else if (g.vx < 0) {
    g.vx = Math.min(0, g.vx + DRAG * dt);
  }

  // Vertical: constant sink (or helium float), plus boost, plus fields.
  let base = SINK_SPEED;
  if (g.state === 'spawning') base = 0;
  else if (g.helium > 0) base = HELIUM_LIFT;
  const fx = field ? field.fx : 0;
  const fy = field ? field.fy : 0;
  g.vy = base + fy + (g.boostActive ? BOOST_LIFT : 0);

  g.x += (g.vx + fx) * dt;
  g.y += g.vy * dt;
}

/**
 * Spend one boost charge if available and not already boosting.
 * @param {Glider} g
 * @returns {boolean} true when a boost started
 */
export function tryBoost(g) {
  if (g.boostActive || g.boostCharges <= 0) return false;
  g.boostCharges -= 1;
  g.boostActive = true;
  g.boostTime = BOOST_DURATION;
  return true;
}

/**
 * Add boost charges up to MAX_BOOST_CHARGES.
 * @param {Glider} g
 * @param {number} [n]
 * @returns {number} charges actually added
 */
export function addBoostCharges(g, n = BATTERY_CHARGES) {
  const before = g.boostCharges;
  g.boostCharges = Math.min(MAX_BOOST_CHARGES, before + n);
  return g.boostCharges - before;
}

/**
 * Grant helium float (refreshes to the full duration; does not stack).
 * @param {Glider} g
 * @param {number} [seconds]
 */
export function giveHelium(g, seconds = HELIUM_DURATION) {
  g.helium = Math.max(g.helium, seconds);
}

/**
 * Begin the crash animation. Cancels boost and helium.
 * @param {Glider} g
 * @param {'crash' | 'burn'} [kind] 'burn' for candles/flames → state 'burning'
 */
export function startCrash(g, kind = 'crash') {
  g.state = kind === 'burn' ? 'burning' : 'crashing';
  g.stateTime = 0;
  g.boostActive = false;
  g.boostTime = 0;
  g.helium = 0;
  g.vy = CRASH_FALL_SPEED;
}

/**
 * Advance the crash tumble: fall to the floor while horizontal momentum decays.
 * @param {Glider} g
 * @param {number} dt seconds
 * @param {number} floorY floor surface y (wreck rests on it)
 * @returns {boolean} true when the animation has finished
 */
export function stepCrash(g, dt, floorY) {
  g.stateTime += dt;
  g.vy = CRASH_FALL_SPEED;
  g.y = Math.min(g.y + g.vy * dt, floorY - g.h);
  if (g.vx > 0) g.vx = Math.max(0, g.vx - CRASH_DRAG * dt);
  else if (g.vx < 0) g.vx = Math.min(0, g.vx + CRASH_DRAG * dt);
  g.x += g.vx * dt;
  return g.stateTime >= CRASH_DURATION;
}
