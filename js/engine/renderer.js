// Canvas sizing/DPR handling and frame composition.
//
// Frame order: room background → field hints → objects sorted by z (stable,
// default 0) → glider → particles → optional debug overlay (toggled with the
// backtick key via main.js).

import { ROOM_W, ROOM_H, FLOOR_Y, CEILING_Y } from '../config.js';
import { drawRoomBackground, drawObject, drawGlider, drawFieldHint } from '../render/sprites.js';

/**
 * @typedef {object} Scene
 * @property {object | null} room current RoomDef (null → plain fill)
 * @property {string | null} roomId
 * @property {Array<object>} objects object instances of the room
 * @property {object | null} glider glider state, or null to hide it
 * @property {Array<Particle>} particles pool; entries with life <= 0 are skipped
 * @property {number} time seconds since boot (drives sprite animation)
 * @property {string} state game state name (debug overlay)
 * @property {{ x: number, y: number } | null} [entryPoint] respawn point (debug overlay)
 */

/**
 * @typedef {object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} life seconds remaining (<= 0 → inactive)
 * @property {number} maxLife
 * @property {number} size
 * @property {string} color
 * @property {number} angle radians (scraps)
 * @property {'spark' | 'scrap'} shape
 */

/**
 * @typedef {object} Renderer
 * @property {HTMLCanvasElement} canvas
 * @property {CanvasRenderingContext2D} ctx
 * @property {boolean} debug
 * @property {(on: boolean) => void} setDebug
 * @property {() => boolean} toggleDebug returns the new debug state
 * @property {() => void} resize re-read devicePixelRatio and resize the backing store
 * @property {(scene: Scene, fps?: number) => void} draw compose one frame
 * @property {() => void} destroy remove listeners
 */

const EMPTY = Object.freeze([]);
const byZ = (a, b) => (a.z ?? 0) - (b.z ?? 0);
const TWO_PI = Math.PI * 2;

/**
 * Create a renderer bound to the game canvas. Sets `canvas.width/height` to
 * ROOM_W/H × devicePixelRatio and scales the context; CSS size is owned by the
 * stylesheet.
 * @param {HTMLCanvasElement} canvas
 * @param {{ debug?: boolean, minDpr?: number, maxDpr?: number }} [opts]
 * @returns {Renderer}
 */
export function createRenderer(canvas, { debug = false, minDpr = 1, maxDpr = 4 } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Glider: could not acquire a 2D canvas context');

  let debugOn = debug;
  let dpr = 0;
  /** @type {Array<object>} reused z-sorted draw list */
  const sorted = [];

  function currentDpr() {
    const raw = globalThis.devicePixelRatio || 1;
    return Math.min(maxDpr, Math.max(minDpr, raw));
  }

  function resize() {
    dpr = currentDpr();
    canvas.width = Math.round(ROOM_W * dpr);
    canvas.height = Math.round(ROOM_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function onResize() {
    if (currentDpr() !== dpr) resize();
  }

  function drawParticles(particles) {
    if (!particles) return;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.life <= 0) continue;
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'scrap') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const w = p.size;
        const h = p.size * 0.6;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = 'rgba(40, 40, 40, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * (0.4 + 0.6 * a)), 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function strokeRect(r, color, fill) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.strokeStyle = color;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }

  function drawDebug(scene, fps) {
    const objects = scene.objects ?? EMPTY;
    ctx.save();
    ctx.lineWidth = 1;

    // Fields (blue) with their velocity contribution.
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';
    for (const inst of objects) {
      const f = inst.field;
      if (!f || inst.dead) continue;
      strokeRect(f, 'rgba(33, 150, 243, 0.9)', 'rgba(33, 150, 243, 0.12)');
      ctx.fillStyle = 'rgba(21, 101, 192, 0.95)';
      ctx.fillText(`fx ${f.fx | 0} fy ${f.fy | 0}`, f.x + 3, f.y + 3);
    }
    // Hitboxes (green): solid/hazard solid line, pickups dashed.
    for (const inst of objects) {
      if (inst.dead) continue;
      const r = inst.hitbox ?? inst;
      if (inst.category === 'solid' || inst.category === 'hazard') {
        strokeRect(r, 'rgba(0, 200, 83, 0.95)', 'rgba(0, 200, 83, 0.10)');
      } else if (inst.category === 'pickup') {
        ctx.setLineDash([3, 3]);
        strokeRect(r, 'rgba(0, 200, 83, 0.9)');
        ctx.setLineDash(EMPTY);
      } else {
        ctx.setLineDash([2, 4]);
        strokeRect(r, 'rgba(120, 120, 120, 0.6)');
        ctx.setLineDash(EMPTY);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillText(`${inst.type}#${inst.id}`, r.x + 2, r.y + r.h - 12);
    }
    // Floor / ceiling reference lines.
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(244, 67, 54, 0.7)';
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y + 0.5);
    ctx.lineTo(ROOM_W, FLOOR_Y + 0.5);
    ctx.moveTo(0, CEILING_Y + 0.5);
    ctx.lineTo(ROOM_W, CEILING_Y + 0.5);
    ctx.stroke();
    ctx.setLineDash(EMPTY);

    const g = scene.glider;
    if (g) strokeRect(g, 'rgba(244, 67, 54, 0.95)', 'rgba(244, 67, 54, 0.12)');
    const ep = scene.entryPoint;
    if (ep) {
      ctx.strokeStyle = 'rgba(156, 39, 176, 0.9)';
      ctx.beginPath();
      ctx.moveTo(ep.x - 6, ep.y);
      ctx.lineTo(ep.x + 6, ep.y);
      ctx.moveTo(ep.x, ep.y - 6);
      ctx.lineTo(ep.x, ep.y + 6);
      ctx.stroke();
    }

    // Text panel.
    const lines = [
      `${fps.toFixed(0)} fps  t=${(scene.time ?? 0).toFixed(1)}s`,
      `room: ${scene.roomId ?? '-'}  state: ${scene.state ?? '-'}`,
      `objects: ${objects.length}`,
    ];
    if (g) {
      lines.push(`glider: ${g.state} t=${g.stateTime.toFixed(2)} facing=${g.facing}`);
      lines.push(`pos ${g.x.toFixed(1)}, ${g.y.toFixed(1)}  vel ${g.vx.toFixed(0)}, ${g.vy.toFixed(0)}`);
      lines.push(`boost ${g.boostCharges}${g.boostActive ? ' (active)' : ''}  helium ${g.helium.toFixed(1)}s`);
    }
    ctx.font = '12px ui-monospace, Menlo, monospace';
    const pad = 6;
    const lineH = 15;
    let width = 0;
    for (const l of lines) width = Math.max(width, ctx.measureText(l).width);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(8, 8, width + pad * 2, lines.length * lineH + pad * 2);
    ctx.fillStyle = '#e8ffe8';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 8 + pad, 8 + pad + i * lineH);
    ctx.restore();
  }

  /**
   * Compose one frame.
   * @param {Scene} scene
   * @param {number} [fps]
   */
  function draw(scene, fps = 0) {
    onResize(); // catches DPR changes (zoom, monitor move) cheaply each frame
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const time = scene.time ?? 0;
    const objects = scene.objects ?? EMPTY;

    if (scene.room) {
      ctx.save();
      drawRoomBackground(ctx, scene.room, time);
      ctx.restore();
    } else {
      ctx.fillStyle = '#f3ead6';
      ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    }

    for (let i = 0; i < objects.length; i++) {
      const inst = objects[i];
      if (inst.field && !inst.dead) {
        ctx.save();
        drawFieldHint(ctx, inst.field, time);
        ctx.restore();
      }
    }

    sorted.length = 0;
    for (let i = 0; i < objects.length; i++) {
      if (!objects[i].dead) sorted.push(objects[i]);
    }
    sorted.sort(byZ); // Array#sort is stable: equal z keeps room definition order
    for (let i = 0; i < sorted.length; i++) {
      ctx.save();
      drawObject(ctx, sorted[i], time);
      ctx.restore();
    }

    if (scene.glider) {
      ctx.save();
      drawGlider(ctx, scene.glider, time);
      ctx.restore();
    }

    drawParticles(scene.particles);

    if (debugOn) drawDebug(scene, fps);
  }

  globalThis.addEventListener?.('resize', onResize);
  resize();

  return {
    canvas,
    ctx,
    get debug() { return debugOn; },
    setDebug(on) { debugOn = Boolean(on); },
    toggleDebug() {
      debugOn = !debugOn;
      return debugOn;
    },
    resize,
    draw,
    destroy() {
      globalThis.removeEventListener?.('resize', onResize);
    },
  };
}
