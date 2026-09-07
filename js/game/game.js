// Game state machine: 'title' | 'playing' | 'paused' | 'gameover' | 'win'.
//
// Owns score/lives/high score, the current room and its object instances, the
// glider, room transitions, respawns, pickups, and the particle effects. It
// talks to the DOM only through the injected `ui` and `audio` objects, and to
// the player only through the injected `input` (see engine/input.js).

import { ROOM_W, ROOM_H, FLOOR_Y, GLIDER_W, GLIDER_H } from '../config.js';
import { ROOMS, START_ROOM, START_POS, FINAL_ROOM, HOUSE_NAME } from './levels.js';
import { createRoomObjects, updateObject, resetObject } from './objects.js';
import {
  createGlider, resetGlider, stepGlider, stepCrash, tryBoost,
  addBoostCharges, giveHelium, startCrash, isCrashed,
} from './glider.js';
import {
  accumulateFields, findContact, collectPickups, clampCeiling, touchesFloor, resolveRoomEdges,
} from './physics.js';
import { loadHighScore, saveHighScore } from './storage.js';

/** Spare lives at the start of a game (shown as a count in the HUD). */
export const STARTING_LIVES = 3;
/** Points awarded the first time each room (other than the start room) is entered. */
export const ROOM_ENTRY_POINTS = 50;
/** Fallback points per pickup kind when the instance carries no finite `pickup.points`. */
export const PICKUP_POINTS = Object.freeze({ star: 100, clock: 300, life: 50, battery: 0, helium: 0 });
/** Sound played per pickup kind (unknown kinds play 'pickup'). */
export const PICKUP_SOUNDS = Object.freeze({ star: 'star', clock: 'clock', life: 'life', battery: 'battery', helium: 'helium' });
/** Size of the pre-allocated particle pool. */
export const MAX_PARTICLES = 192;

const SPARK_COLORS = Object.freeze(['#ffd54f', '#fff59d', '#ffffff', '#ffab40', '#ffe082']);
const SCRAP_COLORS = Object.freeze(['#ffffff', '#f4f4f4', '#e6e6e6', '#d9d9d9']);
/** Glider rect handed to objects while no glider is in play (title/gameover ambience). */
const AMBIENT_GLIDER = Object.freeze({ x: -10000, y: -10000, w: GLIDER_W, h: GLIDER_H });

/** @param {{ type?: string }} inst */
function isFlame(inst) {
  const t = String(inst.type ?? '').toLowerCase();
  return t === 'candle' || t.includes('flame');
}

/**
 * @typedef {'title' | 'playing' | 'paused' | 'gameover' | 'win'} GameState
 */


/**
 * Stable identity for a pickup across room rebuilds (ids come from a global
 * counter, but pickups never move, so type + position is unique enough).
 * @param {object} inst
 * @returns {string}
 */
function pickupKey(inst) {
  return `${inst.type}@${Math.round(inst.x)},${Math.round(inst.y)}`;
}

export class Game {
  /** @type {GameState} */
  state = 'title';
  score = 0;
  lives = STARTING_LIVES;
  highScore = 0;
  /** Seconds since boot; drives sprite animation. */
  time = 0;
  /** @type {string | null} */
  roomId = null;
  /** @type {object | null} current RoomDef */
  room = null;
  /** @type {Array<object>} object instances of the current room */
  objects = [];
  /** Where the glider entered the current room (respawn point). */
  entryPoint = { x: 0, y: 0 };
  /** @type {Set<string>} rooms entered this game (for the first-entry bonus) */
  visited = new Set();
  /** @type {Map<string, Set<string>>} per room: keys of pickups already collected this game */
  collected = new Map();
  /** @type {Array<object>} fixed-size particle pool (life <= 0 → free slot) */
  particles = [];

  #input;
  #ui;
  #audio;
  /** @type {Array<object>} instances spawned by objects during the update pass */
  #pending = [];
  #field = { fx: 0, fy: 0 };
  /** @type {Array<object>} reused pickup hit list */
  #hits = [];
  /** Copy of the glider rect handed to objects (protects the glider from mutation). */
  #gliderRect = { x: 0, y: 0, w: GLIDER_W, h: GLIDER_H };
  #heliumShown = 0;
  #env;
  #scene = { room: null, roomId: null, objects: [], glider: null, particles: [], time: 0, state: 'title', entryPoint: null };

  /**
   * @param {object} deps
   * @param {import('../engine/input.js').Input} deps.input
   * @param {object} deps.ui the `ui` object from js/ui.js
   * @param {object} deps.audio the `audio` object from js/audio.js
   */
  constructor({ input, ui, audio }) {
    this.#input = input;
    this.#ui = ui;
    this.#audio = audio;
    this.glider = createGlider(START_POS.x, START_POS.y);
    this.highScore = loadHighScore();
    this.#env = {
      time: 0,
      roomW: ROOM_W,
      roomH: ROOM_H,
      floorY: FLOOR_Y,
      spawn: (inst) => { if (inst) this.#pending.push(inst); },
      glider: AMBIENT_GLIDER,
    };
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
        size: 3, color: '#fff', angle: 0, spin: 0, shape: 'spark',
      });
    }
  }

  // ---- Public API -----------------------------------------------------------

  /** Show the title screen over the (animated) start room with the glider hidden. */
  showTitle() {
    this.state = 'title';
    this.score = 0;
    this.lives = STARTING_LIVES;
    this.#loadRoom(START_ROOM);
    resetGlider(this.glider, START_POS.x, START_POS.y, 'spawning');
    this.glider.boostCharges = 0;
    this.#syncHud();
    this.#ui.showScreen('title', this.#screenData({ houseName: HOUSE_NAME }));
  }

  /** Start a fresh game in START_ROOM at START_POS. Valid from any state. */
  newGame() {
    this.#audio.init();
    this.state = 'playing';
    this.score = 0;
    this.lives = STARTING_LIVES;
    this.visited.clear();
    this.collected.clear();
    this.#clearParticles();
    this.#input.reset();
    const g = this.glider;
    resetGlider(g, START_POS.x, START_POS.y, 'spawning');
    g.boostCharges = 0;
    g.facing = 1;
    this.#enterRoom(START_ROOM, START_POS.x, START_POS.y, true);
    this.#syncHud();
    this.#ui.showScreen(null);
    this.#audio.play('start');
  }

  /** Pause a running game and show the paused overlay. */
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.#ui.showScreen('paused', this.#screenData());
    this.#audio.play('pause');
  }

  /** Resume from the paused state. */
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.#input.clearPresses();
    this.#ui.showScreen(null);
  }

  /** Toggle between playing and paused. */
  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  /** Called when the document becomes hidden: pause if playing. */
  onHidden() {
    if (this.state === 'playing') this.pause();
  }

  /**
   * Toggle audio mute and toast the result.
   * @returns {boolean} the new muted state
   */
  toggleMute() {
    const muted = this.#audio.toggleMute();
    this.#ui.toast(muted ? 'Muted' : 'Sound on');
    return muted;
  }

  /**
   * Dispatch a discrete input action (from keyboard or `glider:action` events).
   * @param {string} action 'enter' | 'start' | 'resume' | 'restart' | 'pause' | 'mute'
   * @returns {boolean} true when the action was handled
   */
  handleAction(action) {
    switch (action) {
      case 'start':
        if (this.state === 'paused') this.resume();
        else if (this.state !== 'playing') this.newGame();
        return true;
      case 'restart':
        this.newGame();
        return true;
      case 'resume':
        this.resume();
        return true;
      case 'pause':
        this.togglePause();
        return true;
      case 'enter':
        if (this.state === 'paused') this.resume();
        else if (this.state !== 'playing') this.newGame();
        return true;
      case 'mute':
        this.toggleMute();
        return true;
      default:
        return false;
    }
  }

  /**
   * Advance the simulation by one fixed step.
   * @param {number} dt seconds
   */
  update(dt) {
    if (this.state === 'paused') return;
    this.time += dt;
    this.#updateParticles(dt);
    if (this.state === 'playing') this.#updatePlaying(dt);
    else if (this.room) this.#updateObjects(dt, AMBIENT_GLIDER); // ambient animation behind overlays
  }

  /**
   * The current frame's draw data (reused object; do not retain).
   * @returns {import('../engine/renderer.js').Scene}
   */
  getScene() {
    const s = this.#scene;
    s.room = this.room;
    s.roomId = this.roomId;
    s.objects = this.objects;
    s.particles = this.particles;
    s.time = this.time;
    s.state = this.state;
    s.entryPoint = this.entryPoint;
    s.glider = this.state === 'title' || this.state === 'gameover' ? null : this.glider;
    return s;
  }

  // ---- Simulation -----------------------------------------------------------

  #updatePlaying(dt) {
    const g = this.glider;
    const rect = this.#gliderRect;
    rect.x = g.x; rect.y = g.y; rect.w = g.w; rect.h = g.h;
    this.#updateObjects(dt, rect);

    if (isCrashed(g)) {
      if (stepCrash(g, dt, FLOOR_Y)) this.#loseLife();
      return;
    }

    if (this.#input.consumePress('boost') && tryBoost(g)) {
      this.#audio.play('boost');
      this.#ui.setBoost(g.boostCharges);
    }

    accumulateFields(g, this.objects, this.#field);
    stepGlider(g, dt, this.#input.state, this.#field);
    clampCeiling(g);

    const exit = resolveRoomEdges(g, this.room, ROOM_W);
    if (exit) {
      this.#changeRoom(exit);
      if (this.state !== 'playing') return; // entered FINAL_ROOM
    }

    this.#syncHelium();

    if (touchesFloor(g, FLOOR_Y)) {
      if (g.state === 'flying') {
        this.#crash(null);
        return;
      }
      g.y = FLOOR_Y - g.h; // spawning: rest on the floor until vulnerable
    }

    if (g.state === 'flying') {
      const hit = findContact(g, this.objects);
      if (hit) {
        this.#crash(hit);
        return;
      }
    }

    const hits = collectPickups(g, this.objects, this.#hits);
    for (let i = 0; i < hits.length; i++) this.#collectPickup(hits[i]);
    hits.length = 0;
  }

  #updateObjects(dt, gliderRect) {
    const env = this.#env;
    env.time = this.time;
    env.glider = gliderRect;
    const objects = this.objects;
    for (let i = 0; i < objects.length; i++) updateObject(objects[i], dt, env);
    // Compact out dead instances in place.
    let j = 0;
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if (!o.dead) objects[j++] = o;
    }
    objects.length = j;
    const pending = this.#pending;
    if (pending.length) {
      for (let i = 0; i < pending.length; i++) objects.push(pending[i]);
      pending.length = 0;
    }
  }

  // ---- Rooms ----------------------------------------------------------------

  #loadRoom(id) {
    const room = ROOMS[id];
    if (!room) throw new Error(`Glider: unknown room '${id}'`);
    this.roomId = id;
    this.room = room;
    this.#rebuildObjects();
    this.#clearParticles();
  }

  /**
   * Fresh instances for the current room, then their spawn-time state.
   * Pickups already collected in this room during this game stay gone, so a
   * death or re-entry cannot be used to farm points.
   */
  #rebuildObjects() {
    const taken = this.collected.get(this.roomId);
    let objects = createRoomObjects(this.room);
    if (taken && taken.size) objects = objects.filter((o) => !taken.has(pickupKey(o)));
    for (let i = 0; i < objects.length; i++) resetObject(objects[i]);
    this.objects = objects;
    this.#pending.length = 0;
  }

  #changeRoom(side) {
    const nextId = side === 'left' ? this.room.left : this.room.right;
    const g = this.glider;
    g.x = side === 'left' ? ROOM_W - g.w - 1 : 1;
    this.#enterRoom(nextId, g.x, g.y, false);
  }

  #enterRoom(id, x, y, initial) {
    this.#loadRoom(id);
    const g = this.glider;
    g.x = x;
    g.y = y;
    this.entryPoint.x = x;
    this.entryPoint.y = y;
    this.#ui.setRoom(this.room.name ?? id);
    if (!this.visited.has(id)) {
      this.visited.add(id);
      if (!initial) this.#addScore(ROOM_ENTRY_POINTS);
    }
    if (!initial) this.#audio.play('roomchange');
    if (id === FINAL_ROOM) this.#win();
  }

  // ---- Crash / lives --------------------------------------------------------

  #crash(inst) {
    const g = this.glider;
    const kind = inst && isFlame(inst) ? 'burn' : 'crash';
    startCrash(g, kind);
    this.#syncHelium();
    this.#audio.play(kind);
    this.#ui.flash();
    this.#burst(g.x + g.w / 2, g.y + g.h / 2, 'scrap', 14);
  }

  #loseLife() {
    this.lives -= 1;
    if (this.lives < 0) {
      this.#ui.setLives(0);
      this.#gameOver();
    } else {
      this.#ui.setLives(this.lives);
      this.#respawn();
    }
  }

  #respawn() {
    this.#rebuildObjects();
    resetGlider(this.glider, this.entryPoint.x, this.entryPoint.y, 'spawning');
    this.#syncHelium();
    this.#input.clearPresses();
  }

  #gameOver() {
    this.state = 'gameover';
    const newHighScore = this.#commitHighScore();
    this.#ui.showScreen('gameover', this.#screenData({ newHighScore }));
    this.#audio.play('gameover');
  }

  #win() {
    this.state = 'win';
    const newHighScore = this.#commitHighScore();
    this.#ui.showScreen('win', this.#screenData({ newHighScore }));
    this.#audio.play('win');
  }

  #commitHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      saveHighScore(this.highScore);
      return true;
    }
    return false;
  }

  // ---- Pickups / score ------------------------------------------------------

  #collectPickup(inst) {
    const g = this.glider;
    const pickup = inst.pickup;
    const kind = pickup?.kind;
    const points = Number.isFinite(pickup?.points) ? pickup.points : (PICKUP_POINTS[kind] ?? 0);
    switch (kind) {
      case 'life':
        this.lives += 1;
        this.#ui.setLives(this.lives);
        break;
      case 'battery':
        addBoostCharges(g);
        this.#ui.setBoost(g.boostCharges);
        break;
      case 'helium':
        giveHelium(g);
        this.#syncHelium();
        break;
      default:
        break;
    }
    if (points) this.#addScore(points);
    this.#audio.play(PICKUP_SOUNDS[kind] ?? 'pickup');
    inst.dead = true;
    let taken = this.collected.get(this.roomId);
    if (!taken) this.collected.set(this.roomId, (taken = new Set()));
    taken.add(pickupKey(inst));
    const r = inst.hitbox ?? inst;
    this.#burst(r.x + r.w / 2, r.y + r.h / 2, 'spark', 14);
  }

  #addScore(points) {
    this.score += points;
    this.#ui.setScore(this.score);
  }

  #syncHelium() {
    const h = this.glider.helium;
    const shown = h > 0 ? Math.ceil(h) : 0;
    if (shown !== this.#heliumShown) {
      this.#heliumShown = shown;
      this.#ui.setHelium(shown);
    }
  }

  #syncHud() {
    this.#ui.setScore(this.score);
    this.#ui.setLives(Math.max(0, this.lives));
    this.#ui.setBoost(this.glider.boostCharges);
    this.#heliumShown = -1;
    this.#syncHelium();
    if (this.room) this.#ui.setRoom(this.room.name ?? this.roomId);
  }

  #screenData(extra) {
    return {
      score: this.score,
      highScore: this.highScore,
      lives: Math.max(0, this.lives),
      houseName: HOUSE_NAME,
      rooms: Object.keys(ROOMS).length,
      newHighScore: false,
      ...extra,
    };
  }

  // ---- Particles ------------------------------------------------------------

  #clearParticles() {
    for (let i = 0; i < this.particles.length; i++) this.particles[i].life = 0;
  }

  #burst(x, y, shape, count) {
    const colors = shape === 'scrap' ? SCRAP_COLORS : SPARK_COLORS;
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = shape === 'scrap' ? 60 + Math.random() * 160 : 80 + Math.random() * 180;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - (shape === 'scrap' ? 60 : 40);
      p.maxLife = p.life = shape === 'scrap' ? 0.9 + Math.random() * 0.5 : 0.35 + Math.random() * 0.35;
      p.size = shape === 'scrap' ? 4 + Math.random() * 6 : 2 + Math.random() * 2;
      p.color = colors[(Math.random() * colors.length) | 0];
      p.angle = angle;
      p.spin = (Math.random() - 0.5) * 12;
      p.shape = shape;
      spawned++;
    }
  }

  #updateParticles(dt) {
    const particles = this.particles;
    const damp = Math.min(1, 2 * dt);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0;
        continue;
      }
      p.vy += (p.shape === 'scrap' ? 320 : 140) * dt;
      p.vx -= p.vx * damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      if (p.shape === 'scrap' && p.y > FLOOR_Y - 2) {
        p.y = FLOOR_Y - 2;
        p.vy = -p.vy * 0.3;
        p.vx *= 0.6;
      }
    }
  }
}
