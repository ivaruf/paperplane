// Procedural sprites: room background, objects, glider, field hints.
// Only touches the ctx it is handed. Importable in Node (document/canvas are
// only accessed lazily inside functions, and guarded).

import { ROOM_W, ROOM_H, FLOOR_Y, GLIDER_W, GLIDER_H } from '../config.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const PAL = {
  wall: '#f3ead6',
  floor: '#c9c9c9',
  floorLine: '#8f8f8f',
  floorHi: '#ececec',
  baseboard: '#dcdcdc',
  outline: '#3a2a1a',
  oakLight: '#d9a86a',
  oakMid: '#c98f52',
  oakDark: '#8a5a2b',
  cream: '#f0e6b8',
  creamDark: '#e4d8a2',
  mint: '#b8dcc0',
  mintDark: '#5a7a62',
  vase: '#a9b6cc',
  brass: '#d4a017',
  brassDark: '#8a6a10',
  steel: '#b9bfc4',
  steelDark: '#6b7175',
  frame: '#9a9a9a',
  frameDark: '#5f5f5f',
  mat: '#ebebeb',
  paper: '#ffffff',
  paperShade: '#efefef',
  fold: '#bfbfbf',
  gold: '#e0b23a',
  goldDark: '#b8860b',
  red: '#e8524a',
  blue: '#4b8fd6',
  yellow: '#f2c14e',
  green: '#7bc47f',
};

const BOOK_PALETTES = {
  warm: ['#d9534f', '#e39b3a', '#c8763b', '#b23a48', '#e8c25a'],
  cool: ['#3d6fa8', '#5aa0c8', '#7b9cc7', '#2f5f8f', '#a2c3e0'],
  green: ['#4d8f5a', '#7bb36e', '#2f6b3b', '#9fcf88', '#5c9c62'],
  pink: ['#e8a0b4', '#d97a95', '#f2c1cf', '#c05e7a', '#f7dbe3'],
  orange: ['#e8913a', '#f0b45c', '#c76a1e', '#f4cf8a', '#d9772d'],
  mixed: ['#d9534f', '#3d6fa8', '#e39b3a', '#4d8f5a', '#7b9cc7', '#e8c25a'],
};
const BALLOON_COLORS = [PAL.red, PAL.blue, PAL.yellow, PAL.green];
const RUG_COLORS = { red: '#c7564d', blue: '#5a78a8', green: '#5f8f6a' };

export const WALLPAPER_STYLES = ['plain', 'dots', 'stripes', 'floral', 'diamonds', 'tiles', 'planks'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function rng(seed) {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (inst) => (inst.id | 0) * 31 + (inst.x | 0) * 7 + (inst.y | 0) * 13;

function box(ctx, x, y, w, h, fill, stroke = PAL.outline, lw = 2) {
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  if (stroke && lw > 0) {
    ctx.lineWidth = lw; ctx.strokeStyle = stroke;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  }
}
function rrPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
function rbox(ctx, x, y, w, h, r, fill, stroke = PAL.outline, lw = 2) {
  rrPath(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function circle(ctx, cx, cy, r, fill, stroke = null, lw = 2) {
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function ellipse(ctx, cx, cy, rx, ry, fill, stroke = null, lw = 2) {
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function line(ctx, x1, y1, x2, y2, color, lw = 2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}
function poly(ctx, pts, fill, stroke = PAL.outline, lw = 2) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
}

/** A row of standing books filling [x, x+w] with height up to h (bottom aligned). */
function drawBookRow(ctx, x, y, w, h, seed, paletteName) {
  const pal = BOOK_PALETTES[paletteName] || BOOK_PALETTES.mixed;
  const rand = rng(seed);
  let bx = x;
  let i = 0;
  while (bx < x + w - 6) {
    const bw = Math.min(x + w - bx, 9 + Math.floor(rand() * 12));
    const bh = Math.max(10, h * (0.6 + rand() * 0.4));
    const color = pal[(i + Math.floor(rand() * 2)) % pal.length];
    box(ctx, bx, y + h - bh, bw, bh, color, PAL.outline, 1.5);
    // spine bands
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(bx + 2, y + h - bh + 5, bw - 4, 2);
    ctx.fillRect(bx + 2, y + h - 8, bw - 4, 2);
    bx += bw; i++;
  }
}

/** A stack of lying books occupying the rect. */
function drawBookStack(ctx, x, y, w, h, seed, paletteName) {
  const pal = BOOK_PALETTES[paletteName] || BOOK_PALETTES.mixed;
  const rand = rng(seed);
  const n = Math.max(2, Math.round(h / 22));
  const bh = h / n;
  for (let i = 0; i < n; i++) {
    const bw = w * (0.78 + rand() * 0.22);
    const bx = x + (w - bw) * rand();
    const by = y + i * bh;
    const color = pal[i % pal.length];
    box(ctx, bx, by, bw, bh, color, PAL.outline, 1.5);
    // page edge on the right
    ctx.fillStyle = '#f5efe0';
    ctx.fillRect(bx + bw - 8, by + 2, 6, bh - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(bx + 2, by + bh - 4, bw - 10, 1.5);
  }
}

// ---------------------------------------------------------------------------
// Wallpaper patterns (cached per style|colour)
// ---------------------------------------------------------------------------
const patternCache = new Map();

function makeTileCanvas(ctx, w, h) {
  let c = null;
  try {
    const doc = ctx && ctx.canvas && ctx.canvas.ownerDocument;
    if (doc && typeof doc.createElement === 'function') c = doc.createElement('canvas');
    else if (typeof document !== 'undefined') c = document.createElement('canvas');
    else if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  } catch { c = null; }
  if (!c) return null;
  c.width = w; c.height = h;
  return c;
}

const WALL_TILES = {
  plain: null,
  dots: [32, 32, (t) => {
    t.fillStyle = 'rgba(90,70,40,0.10)';
    circle(t, 8, 8, 1.7, 'rgba(90,70,40,0.10)');
    circle(t, 24, 24, 1.7, 'rgba(90,70,40,0.10)');
  }],
  stripes: [40, 8, (t) => {
    t.fillStyle = 'rgba(255,255,255,0.30)'; t.fillRect(0, 0, 14, 8);
    t.fillStyle = 'rgba(90,70,40,0.06)'; t.fillRect(20, 0, 2, 8);
  }],
  floral: [64, 64, (t) => {
    const flower = (cx, cy) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circle(t, cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 4.5, 3.4, 'rgba(200,120,130,0.16)');
      }
      circle(t, cx, cy, 2.2, 'rgba(220,180,80,0.30)');
      ellipse(t, cx + 8, cy + 5, 4, 2, 'rgba(120,160,110,0.18)');
      ellipse(t, cx - 8, cy - 5, 4, 2, 'rgba(120,160,110,0.18)');
    };
    flower(16, 16); flower(48, 48);
    circle(t, 48, 16, 1.4, 'rgba(90,70,40,0.10)');
    circle(t, 16, 48, 1.4, 'rgba(90,70,40,0.10)');
  }],
  diamonds: [48, 48, (t) => {
    t.strokeStyle = 'rgba(90,70,40,0.10)'; t.lineWidth = 1.5;
    t.beginPath(); t.moveTo(0, 0); t.lineTo(48, 48); t.moveTo(48, 0); t.lineTo(0, 48); t.stroke();
    circle(t, 24, 24, 2, 'rgba(90,70,40,0.12)');
  }],
  tiles: [40, 40, (t) => {
    t.fillStyle = 'rgba(0,0,0,0.08)';
    t.fillRect(0, 0, 40, 2); t.fillRect(0, 0, 2, 40);
    t.fillStyle = 'rgba(255,255,255,0.40)';
    t.fillRect(3, 3, 34, 1); t.fillRect(3, 3, 1, 34);
  }],
  planks: [128, 80, (t) => {
    t.fillStyle = 'rgba(90,60,30,0.28)';
    t.fillRect(0, 0, 128, 2); t.fillRect(0, 40, 128, 2);
    t.fillRect(32, 0, 2, 40); t.fillRect(96, 40, 2, 40);
    t.strokeStyle = 'rgba(120,80,40,0.10)'; t.lineWidth = 1.2;
    for (const [y0, y1] of [[12, 16], [26, 22], [52, 56], [68, 64]]) {
      t.beginPath(); t.moveTo(0, y0); t.bezierCurveTo(40, y1, 88, y0, 128, y1); t.stroke();
    }
  }],
};

function getWallPattern(ctx, style, color) {
  const spec = WALL_TILES[style] === undefined ? WALL_TILES.dots : WALL_TILES[style];
  if (!spec) return null;
  const key = `${style}|${color}`;
  if (patternCache.has(key)) return patternCache.get(key);
  let pattern = null;
  try {
    const [tw, th, paint] = spec;
    const tile = makeTileCanvas(ctx, tw, th);
    if (tile) {
      const t = tile.getContext('2d');
      t.fillStyle = color; t.fillRect(0, 0, tw, th);
      paint(t, tw, th);
      pattern = ctx.createPattern(tile, 'repeat');
    }
  } catch { pattern = null; }
  patternCache.set(key, pattern);
  return pattern;
}

// ---------------------------------------------------------------------------
// Room background
// ---------------------------------------------------------------------------
export function drawRoomBackground(ctx, roomDef, time) {
  const wall = (roomDef && roomDef.wallColor) || PAL.wall;
  const style = (roomDef && roomDef.wallpaper) || 'plain';
  ctx.save();
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  const pat = getWallPattern(ctx, style, wall);
  if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, ROOM_W, FLOOR_Y); }

  // ceiling moulding
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(0, 0, ROOM_W, 6);
  ctx.fillStyle = 'rgba(90,70,40,0.22)'; ctx.fillRect(0, 6, ROOM_W, 2);

  // floor band + baseboard
  ctx.fillStyle = PAL.floor; ctx.fillRect(0, FLOOR_Y, ROOM_W, ROOM_H - FLOOR_Y);
  ctx.fillStyle = PAL.baseboard; ctx.fillRect(0, FLOOR_Y + 2, ROOM_W, 12);
  ctx.fillStyle = PAL.floorLine; ctx.fillRect(0, FLOOR_Y, ROOM_W, 2);
  ctx.fillStyle = PAL.floorHi; ctx.fillRect(0, FLOOR_Y + 14, ROOM_W, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = 64; x < ROOM_W; x += 128) ctx.fillRect(x, FLOOR_Y + 16, 1, ROOM_H - FLOOR_Y - 16);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Object drawers
// ---------------------------------------------------------------------------
const DRAW = {};

DRAW.table = (ctx, o) => {
  const { x, y, w, h } = o;
  box(ctx, x + 12, y + 14, 18, h - 14, PAL.oakLight);
  box(ctx, x + w - 30, y + 14, 18, h - 14, PAL.oakLight);
  box(ctx, x + 4, y + 14, w - 8, 10, PAL.oakDark);
  box(ctx, x, y, w, 14, PAL.oakLight);
  line(ctx, x + 4, y + 3.5, x + w - 4, y + 3.5, 'rgba(255,255,255,0.45)', 2);
};

DRAW.shelf = (ctx, o) => {
  const { x, y, w, h } = o;
  const seed = seedOf(o);
  box(ctx, x, y, w, h, PAL.cream);
  ctx.fillStyle = PAL.creamDark; ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
  const mid = y + h / 2;
  // top compartment: standing books + small pot
  drawBookRow(ctx, x + 14, y + 10, w * 0.5, mid - 4 - (y + 10), seed, o.variant);
  ellipse(ctx, x + w - 34, mid - 12, 12, 8, PAL.vase, PAL.outline, 1.5);
  box(ctx, x + w - 42, mid - 20, 16, 8, PAL.vase, PAL.outline, 1.5);
  // bottom compartment: lying stack + a box
  drawBookStack(ctx, x + w * 0.45, mid + 10, w * 0.4, h / 2 - 18, seed + 7, o.variant);
  box(ctx, x + 16, mid + 14, 40, h / 2 - 22, PAL.oakLight, PAL.outline, 1.5);
  box(ctx, x + 4, mid - 4, w - 8, 8, PAL.cream);
  box(ctx, x, y, w, h, null);
};

DRAW.cabinet = (ctx, o) => {
  const { x, y, w, h } = o;
  box(ctx, x, y, w, h, PAL.oakLight);
  box(ctx, x, y, w, 12, PAL.oakMid);
  rbox(ctx, x + 14, y + 24, w - 28, h - 40, 4, '#e3b878');
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 26, y + 36, w - 52, h - 64);
  circle(ctx, x + w - 32, y + h / 2, 5, PAL.brass, PAL.outline, 1.5);
  box(ctx, x, y, w, h, null);
};

DRAW.bookcase = (ctx, o) => {
  const { x, y, w, h } = o;
  const seed = seedOf(o);
  box(ctx, x, y, w, h, PAL.oakMid);
  ctx.fillStyle = PAL.oakDark; ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
  const n = Math.max(2, Math.round(h / 75));
  const rh = (h - 16) / n;
  const pals = ['warm', 'cool', 'green', 'mixed'];
  for (let i = 0; i < n; i++) {
    const ry = y + 8 + i * rh;
    drawBookRow(ctx, x + 12, ry + 4, w - 24, rh - 12, seed + i * 17, pals[i % pals.length]);
    box(ctx, x + 8, ry + rh - 6, w - 16, 6, PAL.oakMid, PAL.outline, 1.5);
  }
  box(ctx, x, y, w, h, null);
};

DRAW.filing = (ctx, o) => {
  const { x, y, w, h } = o;
  box(ctx, x, y, w, h, PAL.mint);
  const dh = (h - 20) / 3;
  for (let i = 0; i < 3; i++) {
    const dy = y + 10 + i * dh;
    rbox(ctx, x + 10, dy, w - 20, dh - 6, 3, '#c9e6cf');
    box(ctx, x + w / 2 - 14, dy + dh / 2 - 4, 28, 7, PAL.mintDark, PAL.outline, 1.5);
    box(ctx, x + w / 2 - 10, dy + 6, 20, 8, '#f7f7f7', 'rgba(0,0,0,0.3)', 1);
  }
};

DRAW.lamp = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2;
  box(ctx, cx - 10, y, 20, 6, '#5a5a5a', PAL.outline, 1.5);
  line(ctx, cx, y + 6, cx, y + 28, PAL.outline, 3);
  // glow
  const g = 0.14 + 0.03 * Math.sin(time * 2 + x);
  circle(ctx, cx, y + h - 26, 30, `rgba(255,220,120,${g})`);
  poly(ctx, [[cx - 14, y + 28], [cx + 14, y + 28], [x + w - 2, y + h - 30], [x + 2, y + h - 30]], '#f4e3b6');
  ellipse(ctx, cx, y + h - 30, w / 2 - 2, 6, '#e6d3a0', PAL.outline, 2);
  circle(ctx, cx, y + h - 22, 9, '#fff3b0', PAL.outline, 1.5);
};

DRAW['bracket-shelf'] = (ctx, o) => {
  const { x, y, w, h } = o;
  drawBookRow(ctx, x + 6, y, w - 12, h - 12, seedOf(o), 'green');
  box(ctx, x, y + h - 12, w, 12, PAL.oakLight);
  poly(ctx, [[x + 10, y + h], [x + 24, y + h], [x + 10, y + h + 12]], PAL.oakDark, PAL.outline, 1.5);
  poly(ctx, [[x + w - 24, y + h], [x + w - 10, y + h], [x + w - 10, y + h + 12]], PAL.oakDark, PAL.outline, 1.5);
};

DRAW.vase = (ctx, o) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 14, y + h);
  ctx.lineTo(cx + 14, y + h);
  ctx.lineTo(cx + 12, y + h - 8);
  ctx.bezierCurveTo(cx + w / 2 + 2, y + h * 0.6, cx + w / 2, y + h * 0.35, cx + 9, y + 18);
  ctx.lineTo(cx + 12, y + 2);
  ctx.lineTo(cx - 12, y + 2);
  ctx.lineTo(cx - 9, y + 18);
  ctx.bezierCurveTo(cx - w / 2, y + h * 0.35, cx - w / 2 - 2, y + h * 0.6, cx - 12, y + h - 8);
  ctx.closePath();
  ctx.fillStyle = PAL.vase; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = PAL.outline; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 8, y + 30); ctx.bezierCurveTo(cx - 20, y + h * 0.45, cx - 18, y + h * 0.65, cx - 10, y + h - 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.stroke();
  line(ctx, cx - 9, y + 20, cx + 9, y + 20, 'rgba(0,0,0,0.2)', 2);
};

DRAW.teddy = (ctx, o) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2;
  const fur = '#b07d4b', light = '#d9b48a';
  // legs
  ellipse(ctx, cx - w * 0.26, y + h * 0.86, w * 0.16, h * 0.12, fur, PAL.outline);
  ellipse(ctx, cx + w * 0.26, y + h * 0.86, w * 0.16, h * 0.12, fur, PAL.outline);
  // arms
  ellipse(ctx, cx - w * 0.36, y + h * 0.62, w * 0.11, h * 0.2, fur, PAL.outline);
  ellipse(ctx, cx + w * 0.36, y + h * 0.62, w * 0.11, h * 0.2, fur, PAL.outline);
  // body
  ellipse(ctx, cx, y + h * 0.66, w * 0.3, h * 0.3, fur, PAL.outline);
  ellipse(ctx, cx, y + h * 0.7, w * 0.17, h * 0.18, light);
  // ears + head
  circle(ctx, cx - h * 0.2, y + h * 0.14, h * 0.1, fur, PAL.outline);
  circle(ctx, cx + h * 0.2, y + h * 0.14, h * 0.1, fur, PAL.outline);
  circle(ctx, cx, y + h * 0.3, h * 0.25, fur, PAL.outline);
  circle(ctx, cx - h * 0.2, y + h * 0.14, h * 0.045, light);
  circle(ctx, cx + h * 0.2, y + h * 0.14, h * 0.045, light);
  ellipse(ctx, cx, y + h * 0.37, 9, 7, light);
  circle(ctx, cx, y + h * 0.34, 3, PAL.outline);
  circle(ctx, cx - 7, y + h * 0.26, 2.2, PAL.outline);
  circle(ctx, cx + 7, y + h * 0.26, 2.2, PAL.outline);
};

DRAW.books = (ctx, o) => {
  drawBookStack(ctx, o.x, o.y, o.w, o.h, seedOf(o), o.variant);
};

DRAW.fan = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const bodyH = h - 14;
  const cx = x + w / 2, cy = y + bodyH / 2;
  const r = Math.min(w, bodyH) / 2 - 8;
  box(ctx, x + 8, y + h - 14, w - 16, 14, '#3a3e42');
  rbox(ctx, x, y, w, bodyH, 6, '#4a4f55');
  circle(ctx, cx, cy, r, '#2e3237', '#9aa0a6', 2);
  const spin = o.spin != null ? o.spin : time * 14;
  ctx.strokeStyle = '#c7ccd1'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); ctx.stroke();
  }
  circle(ctx, cx, cy, r * 0.55, null, '#9aa0a6', 1.5);
  circle(ctx, cx, cy, 5, '#9aa0a6', PAL.outline, 1.5);
  // direction arrow on the base
  const d = o.dir === -1 ? -1 : 1;
  poly(ctx, [[cx - 6 * d, y + h - 9], [cx + 4 * d, y + h - 9], [cx + 4 * d, y + h - 12], [cx + 9 * d, y + h - 7], [cx + 4 * d, y + h - 2], [cx + 4 * d, y + h - 5], [cx - 6 * d, y + h - 5]], '#c7ccd1', null, 0);
};

DRAW.toaster = (ctx, o) => {
  const { x, y, w, h } = o;
  rbox(ctx, x, y + 8, w, h - 8, 6, '#cfd3d6');
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 6, y + 12, w - 12, 4);
  box(ctx, x + 12, y + 8, w - 24, 8, '#3a3a3a', PAL.outline, 1.5);
  ctx.fillStyle = '#cfd3d6'; ctx.fillRect(x + w / 2 - 3, y + 8, 6, 8);
  const lever = o.lever || 0;
  box(ctx, x + w - 10, y + 22 + (1 - lever) * 12, 6, 12, '#3a3a3a', PAL.outline, 1.5);
  circle(ctx, x + 16, y + h - 14, 6, PAL.red, PAL.outline, 1.5);
  box(ctx, x + 8, y + h - 3, 10, 3, '#3a3a3a', null, 0);
  box(ctx, x + w - 18, y + h - 3, 10, 3, '#3a3a3a', null, 0);
};

DRAW.fishbowl = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2, cy = y + h * 0.55, r = h * 0.45;
  ellipse(ctx, cx, y + h - 3, w * 0.28, 3, '#5a5a5a');
  circle(ctx, cx, cy, r, 'rgba(210,235,250,0.7)', '#6f8fa8', 2);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(100,170,230,0.5)'; ctx.fillRect(x, cy - r * 0.35, w, r * 2);
  const ph = o.fishPhase != null ? o.fishPhase : time * 2;
  if (!(o.fishOut > 0)) {
    const fx = cx + Math.sin(ph) * (r * 0.45), fy = cy + r * 0.3;
    const dir = Math.cos(ph) >= 0 ? 1 : -1;
    ellipse(ctx, fx, fy, 7, 4, '#f28c28', PAL.outline, 1);
    poly(ctx, [[fx - 6 * dir, fy], [fx - 11 * dir, fy - 4], [fx - 11 * dir, fy + 4]], '#f28c28', PAL.outline, 1);
    circle(ctx, fx + 3 * dir, fy - 1, 1, PAL.outline);
  }
  circle(ctx, cx - r * 0.3, cy - ((time * 20 + x) % (r * 1.2)) + r * 0.6, 2, 'rgba(255,255,255,0.7)');
  ctx.restore();
  ellipse(ctx, cx, cy - r + 2, r * 0.7, 5, 'rgba(220,240,255,0.8)', '#6f8fa8', 2);
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.1, r * 0.55, Math.PI * 1.05, Math.PI * 1.45);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.stroke();
};

// ---- decor -----------------------------------------------------------------
function drawArt(ctx, variant, ax, ay, aw, ah, seed) {
  ctx.save();
  ctx.beginPath(); ctx.rect(ax, ay, aw, ah); ctx.clip();
  const rand = rng(seed);
  switch (variant) {
    case 'landscape': {
      ctx.fillStyle = '#f6dcc0'; ctx.fillRect(ax, ay, aw, ah);
      ctx.fillStyle = '#f0c7a0'; ctx.fillRect(ax, ay + ah * 0.25, aw, ah * 0.2);
      circle(ctx, ax + aw * 0.78, ay + ah * 0.25, ah * 0.1, '#e8a06a');
      poly(ctx, [[ax - 10, ay + ah * 0.72], [ax + aw * 0.3, ay + ah * 0.2], [ax + aw * 0.62, ay + ah * 0.72]], '#8fa3b8', null, 0);
      poly(ctx, [[ax + aw * 0.4, ay + ah * 0.72], [ax + aw * 0.72, ay + ah * 0.34], [ax + aw + 10, ay + ah * 0.72]], '#6f8399', null, 0);
      poly(ctx, [[ax + aw * 0.3, ay + ah * 0.2], [ax + aw * 0.24, ay + ah * 0.3], [ax + aw * 0.36, ay + ah * 0.3]], '#ffffff', null, 0);
      ctx.fillStyle = '#a8c4d8'; ctx.fillRect(ax, ay + ah * 0.7, aw, ah * 0.3);
      ctx.beginPath(); ctx.arc(ax + aw * 0.5, ay + ah * 0.92, aw * 0.3, Math.PI, 0);
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 3; ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const tx = ax + aw * (0.1 + i * 0.26);
        poly(ctx, [[tx, ay + ah * 0.72], [tx + 6, ay + ah * 0.58], [tx + 12, ay + ah * 0.72]], '#4d7a5a', null, 0);
      }
      break;
    }
    case 'portrait': {
      ctx.fillStyle = '#f3e7cf'; ctx.fillRect(ax, ay, aw, ah);
      const cx = ax + aw / 2;
      poly(ctx, [[cx - aw * 0.2, ay + ah], [cx - aw * 0.35, ay + ah * 0.72], [cx + aw * 0.35, ay + ah * 0.72], [cx + aw * 0.2, ay + ah]], '#b23a48', PAL.outline, 1.5);
      poly(ctx, [[cx - aw * 0.12, ay + ah], [cx, ay + ah * 0.68], [cx + aw * 0.12, ay + ah]], '#f7e9d7', PAL.outline, 1.5);
      ellipse(ctx, cx, ay + ah * 0.42, aw * 0.16, ah * 0.24, '#f7e9d7', PAL.outline, 1.5);
      ellipse(ctx, cx, ay + ah * 0.25, aw * 0.2, ah * 0.14, '#1a1a1a');
      ellipse(ctx, cx, ay + ah * 0.16, aw * 0.1, ah * 0.08, '#1a1a1a');
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - 12, ay + ah * 0.42); ctx.lineTo(cx - 5, ay + ah * 0.42);
      ctx.moveTo(cx + 5, ay + ah * 0.42); ctx.lineTo(cx + 12, ay + ah * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 13, ay + ah * 0.36); ctx.lineTo(cx - 5, ay + ah * 0.35);
      ctx.moveTo(cx + 5, ay + ah * 0.35); ctx.lineTo(cx + 13, ay + ah * 0.36); ctx.stroke();
      ellipse(ctx, cx, ay + ah * 0.55, 4, 2.5, '#c0392b');
      line(ctx, cx + 4, ay + ah * 0.16, cx + aw * 0.3, ay + ah * 0.08, '#d9a15a', 2);
      break;
    }
    case 'boat': {
      ctx.fillStyle = '#cfe6f5'; ctx.fillRect(ax, ay, aw, ah);
      circle(ctx, ax + aw * 0.22, ay + ah * 0.28, ah * 0.12, '#f5c26b');
      ctx.fillStyle = '#3f7fb0'; ctx.fillRect(ax, ay + ah * 0.6, aw, ah * 0.4);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const wy = ay + ah * (0.7 + i * 0.1);
        ctx.beginPath(); ctx.moveTo(ax, wy);
        for (let sx = 0; sx <= aw; sx += 12) ctx.quadraticCurveTo(ax + sx + 6, wy - 4, ax + sx + 12, wy);
        ctx.stroke();
      }
      const bx = ax + aw * 0.6, by = ay + ah * 0.62;
      poly(ctx, [[bx - aw * 0.22, by - 6], [bx + aw * 0.22, by - 6], [bx + aw * 0.14, by + 10], [bx - aw * 0.14, by + 10]], '#5a3a2a', PAL.outline, 1.5);
      line(ctx, bx, by - 6, bx, by - ah * 0.45, PAL.outline, 2);
      poly(ctx, [[bx + 2, by - ah * 0.44], [bx + aw * 0.2, by - 10], [bx + 2, by - 10]], '#ffffff', PAL.outline, 1.5);
      poly(ctx, [[bx - 2, by - ah * 0.38], [bx - aw * 0.16, by - 10], [bx - 2, by - 10]], '#f2c14e', PAL.outline, 1.5);
      break;
    }
    case 'abstract': {
      ctx.fillStyle = '#f3f0e8'; ctx.fillRect(ax, ay, aw, ah);
      const cols = ['#e0524f', '#f2c14e', '#3b6ea5', '#f3f0e8', '#f3f0e8'];
      const vx = ax + aw * 0.38, hy = ay + ah * 0.6;
      ctx.fillStyle = cols[0]; ctx.fillRect(ax, ay, vx - ax, hy - ay);
      ctx.fillStyle = cols[1]; ctx.fillRect(vx, hy, ax + aw - vx, ay + ah - hy);
      ctx.fillStyle = cols[2]; ctx.fillRect(vx, ay, (ax + aw - vx) * 0.45, (hy - ay) * 0.5);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(vx - 2, ay, 4, ah); ctx.fillRect(ax, hy - 2, aw, 4);
      ctx.fillRect(vx + (ax + aw - vx) * 0.45 - 2, ay, 4, hy - ay);
      ctx.fillRect(vx, ay + (hy - ay) * 0.5 - 2, ax + aw - vx, 4);
      break;
    }
    case 'wave':
    default: {
      ctx.fillStyle = '#e6efe9'; ctx.fillRect(ax, ay, aw, ah);
      poly(ctx, [[ax + aw * 0.55, ay + ah * 0.62], [ax + aw * 0.72, ay + ah * 0.3], [ax + aw * 0.9, ay + ah * 0.62]], '#b9c6d6', null, 0);
      poly(ctx, [[ax + aw * 0.72, ay + ah * 0.3], [ax + aw * 0.67, ay + ah * 0.4], [ax + aw * 0.77, ay + ah * 0.4]], '#ffffff', null, 0);
      ctx.fillStyle = '#3f6fa8';
      ctx.beginPath();
      ctx.moveTo(ax, ay + ah);
      ctx.lineTo(ax, ay + ah * 0.7);
      ctx.bezierCurveTo(ax + aw * 0.1, ay + ah * 0.6, ax + aw * 0.15, ay + ah * 0.2, ax + aw * 0.42, ay + ah * 0.16);
      ctx.bezierCurveTo(ax + aw * 0.6, ay + ah * 0.14, ax + aw * 0.62, ay + ah * 0.3, ax + aw * 0.52, ay + ah * 0.34);
      ctx.bezierCurveTo(ax + aw * 0.58, ay + ah * 0.28, ax + aw * 0.5, ay + ah * 0.22, ax + aw * 0.44, ay + ah * 0.3);
      ctx.bezierCurveTo(ax + aw * 0.4, ay + ah * 0.5, ax + aw * 0.7, ay + ah * 0.6, ax + aw, ay + ah * 0.78);
      ctx.lineTo(ax + aw, ay + ah);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6f9fd0'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(ax + 4 + i * 6, ay + ah * (0.8 + i * 0.05));
        ctx.bezierCurveTo(ax + aw * 0.3, ay + ah * (0.6 + i * 0.06), ax + aw * 0.6, ay + ah * (0.75 + i * 0.05), ax + aw, ay + ah * (0.9 + i * 0.03));
        ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        circle(ctx, ax + aw * (0.2 + t * 0.35), ay + ah * (0.3 - Math.sin(t * Math.PI) * 0.12) + rand() * 6, 2 + rand() * 2, '#ffffff');
      }
      break;
    }
  }
  ctx.restore();
}

DRAW.picture = (ctx, o) => {
  const { x, y, w, h } = o;
  box(ctx, x, y, w, h, PAL.frame, PAL.frameDark, 2);
  ctx.fillStyle = PAL.mat; ctx.fillRect(x + 10, y + 10, w - 20, h - 20);
  drawArt(ctx, o.variant, x + 18, y + 18, w - 36, h - 36, seedOf(o));
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 18.5, y + 18.5, w - 37, h - 37);
};

DRAW.window = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const night = o.variant === 'night';
  const seed = seedOf(o);
  box(ctx, x, y, w, h, '#f7f3ea');
  const gx = x + 10, gy = y + 10, gw = w - 20, gh = h - 34;
  ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
  if (night) {
    ctx.fillStyle = '#2b3a5c'; ctx.fillRect(gx, gy, gw, gh);
    const rand = rng(seed);
    for (let i = 0; i < 18; i++) {
      const sx = gx + rand() * gw, sy = gy + rand() * gh * 0.7;
      const tw = 0.5 + 0.5 * Math.sin(time * 3 + i);
      circle(ctx, sx, sy, 1 + tw, `rgba(255,255,255,${0.5 + 0.5 * tw})`);
    }
    circle(ctx, gx + gw * 0.7, gy + gh * 0.28, gh * 0.11, '#f4f1d6');
    circle(ctx, gx + gw * 0.7 + gh * 0.06, gy + gh * 0.25, gh * 0.09, '#2b3a5c');
    ellipse(ctx, gx + gw * 0.3, gy + gh + 10, gw * 0.7, gh * 0.3, '#1b2740');
    ellipse(ctx, gx + gw * 0.9, gy + gh + 14, gw * 0.5, gh * 0.28, '#1b2740');
  } else {
    ctx.fillStyle = '#bfe0f5'; ctx.fillRect(gx, gy, gw, gh);
    circle(ctx, gx + gw * 0.25, gy + gh * 0.25, gh * 0.1, '#f5c26b');
    const cx = gx + gw * 0.6 + Math.sin(time * 0.3) * 6, cy = gy + gh * 0.3;
    circle(ctx, cx, cy, 12, '#ffffff'); circle(ctx, cx + 12, cy + 4, 10, '#ffffff'); circle(ctx, cx - 12, cy + 5, 9, '#ffffff');
    ellipse(ctx, gx + gw * 0.3, gy + gh + 8, gw * 0.7, gh * 0.3, '#9fcf88');
    ellipse(ctx, gx + gw * 0.9, gy + gh + 12, gw * 0.5, gh * 0.3, '#86b873');
  }
  ctx.restore();
  box(ctx, gx, gy, gw, gh, null, PAL.outline, 2);
  box(ctx, x + w / 2 - 5, gy, 10, gh, '#f7f3ea', PAL.outline, 1.5);
  box(ctx, gx, gy + gh / 2 - 5, gw, 10, '#f7f3ea', PAL.outline, 1.5);
  box(ctx, x, y + h - 20, w, 20, '#f7f3ea');
  box(ctx, x - 4, y + h - 20, w + 8, 8, '#efe9dc', PAL.outline, 1.5);
};

DRAW['clock-wall'] = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 2;
  circle(ctx, cx, cy, r, '#f7f7f7', PAL.outline, 2);
  circle(ctx, cx, cy, r - 5, null, 'rgba(0,0,0,0.12)', 1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    line(ctx, cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7), cx + Math.cos(a) * (r - 11), cy + Math.sin(a) * (r - 11), '#333', i % 3 ? 1 : 2);
  }
  const hm = time * (Math.PI * 2 / 600) - Math.PI / 2;
  const hh = time * (Math.PI * 2 / 7200) - Math.PI / 2 + 2.1;
  const hs = time * (Math.PI * 2 / 60) - Math.PI / 2;
  line(ctx, cx, cy, cx + Math.cos(hh) * r * 0.5, cy + Math.sin(hh) * r * 0.5, '#333', 3);
  line(ctx, cx, cy, cx + Math.cos(hm) * r * 0.72, cy + Math.sin(hm) * r * 0.72, '#333', 2);
  line(ctx, cx, cy, cx + Math.cos(hs) * r * 0.78, cy + Math.sin(hs) * r * 0.78, PAL.red, 1);
  circle(ctx, cx, cy, 2.5, '#333');
};

DRAW.switch = (ctx, o) => {
  const { x, y, w, h } = o;
  rbox(ctx, x, y, w, h, 3, '#f5f0e6', PAL.outline, 1.5);
  box(ctx, x + w / 2 - 4, y + 6, 8, h / 2 - 6, '#d9d2c4', PAL.outline, 1.5);
};

DRAW.outlet = (ctx, o) => {
  const { x, y, w, h } = o;
  rbox(ctx, x, y, w, h, 3, '#f5f0e6', PAL.outline, 1.5);
  ctx.fillStyle = '#333';
  ctx.fillRect(x + w * 0.3 - 1, y + h * 0.3, 2, 5); ctx.fillRect(x + w * 0.7 - 1, y + h * 0.3, 2, 5);
  circle(ctx, x + w / 2, y + h * 0.72, 2, '#333');
};

DRAW.rug = (ctx, o) => {
  const { x, y, w, h } = o;
  const col = RUG_COLORS[o.variant] || RUG_COLORS.red;
  rbox(ctx, x, y, w, h, 4, col, PAL.outline, 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 8, y + 6, w - 16, h - 12);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let dx = x + w / 2 - Math.floor(w / 4 / 40) * 40; dx < x + w / 2 + w / 4; dx += 40) {
    poly(ctx, [[dx, y + h / 2 - 5], [dx + 6, y + h / 2], [dx, y + h / 2 + 5], [dx - 6, y + h / 2]], 'rgba(255,255,255,0.3)', null, 0);
  }
  ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  for (let fy = y + 3; fy < y + h - 2; fy += 4) {
    ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x - 6, fy); ctx.moveTo(x + w, fy); ctx.lineTo(x + w + 6, fy); ctx.stroke();
  }
};

DRAW.trophy = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2;
  const glow = 0.12 + 0.08 * Math.sin(time * 3);
  circle(ctx, cx, y + h * 0.35, w * 0.7, `rgba(255,220,100,${glow})`);
  box(ctx, x + 8, y + h - 30, w - 16, 30, PAL.oakDark);
  box(ctx, x, y + h - 36, w, 8, PAL.oakLight);
  box(ctx, cx - 16, y + h - 48, 32, 12, PAL.gold);
  box(ctx, cx - 5, y + h - 68, 10, 22, PAL.gold, PAL.outline, 1.5);
  ctx.beginPath();
  ctx.moveTo(cx - 26, y + 8);
  ctx.bezierCurveTo(cx - 26, y + h * 0.45, cx - 10, y + h - 72, cx - 6, y + h - 68);
  ctx.lineTo(cx + 6, y + h - 68);
  ctx.bezierCurveTo(cx + 10, y + h - 72, cx + 26, y + h * 0.45, cx + 26, y + 8);
  ctx.closePath();
  ctx.fillStyle = PAL.gold; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = PAL.outline; ctx.stroke();
  ctx.strokeStyle = PAL.gold; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx - 30, y + 26, 10, Math.PI * 1.5, Math.PI * 0.5, true); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 30, y + 26, 10, Math.PI * 1.5, Math.PI * 0.5, false); ctx.stroke();
  ctx.strokeStyle = PAL.outline; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx - 30, y + 26, 10, Math.PI * 1.5, Math.PI * 0.5, true); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 30, y + 26, 10, Math.PI * 1.5, Math.PI * 0.5, false); ctx.stroke();
  box(ctx, cx - 24, y + 4, 48, 6, PAL.gold, PAL.outline, 1.5);
  line(ctx, cx - 16, y + 16, cx - 12, y + h * 0.5, 'rgba(255,255,255,0.6)', 3);
  // sparkle
  const sa = time * 2;
  const sx = cx + Math.cos(sa) * 30, sy = y + 30 + Math.sin(sa * 1.3) * 20;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.stroke();
};

DRAW.sign = (ctx, o) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2;
  line(ctx, cx, y, cx, y + 10, PAL.outline, 2);
  circle(ctx, cx, y + 2, 2.5, '#5a5a5a');
  rbox(ctx, x, y + 10, w, h - 10, 4, PAL.cream);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 5.5, y + 15.5, w - 11, h - 21);
  const text = String(o.text ?? '');
  if (text) {
    ctx.fillStyle = PAL.outline;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = Math.min(24, (h - 10) * 0.55);
    ctx.font = `bold ${size}px "Trebuchet MS", "Gill Sans", Arial, sans-serif`;
    if (typeof ctx.measureText === 'function') {
      const mw = ctx.measureText(text).width;
      if (mw > w - 20) {
        size = Math.max(10, size * (w - 20) / mw);
        ctx.font = `bold ${size}px "Trebuchet MS", "Gill Sans", Arial, sans-serif`;
      }
    }
    ctx.fillText(text, cx, y + 10 + (h - 10) / 2 + 1);
  }
};

// ---- fields ----------------------------------------------------------------
function drawGrille(ctx, x, y, w, h, fill, slit) {
  box(ctx, x, y, w, h, fill);
  ctx.strokeStyle = slit; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let sx = x + 8; sx < x + w - 6; sx += 8) { ctx.moveTo(sx, y + 3); ctx.lineTo(sx, y + h - 3); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 2, y + 2, w - 4, 1.5);
}
DRAW.vent = (ctx, o) => drawGrille(ctx, o.x, o.y, o.w, o.h, PAL.brass, PAL.brassDark);
DRAW.duct = (ctx, o) => {
  drawGrille(ctx, o.x, o.y, o.w, o.h, PAL.steel, PAL.steelDark);
  circle(ctx, o.x + 4, o.y + o.h / 2, 1.5, PAL.steelDark);
  circle(ctx, o.x + o.w - 4, o.y + o.h / 2, 1.5, PAL.steelDark);
};

// ---- hazards ---------------------------------------------------------------
function flame(ctx, cx, baseY, hgt, wid, phase, colorOuter, colorInner) {
  const sway = Math.sin(phase * 1.7) * 1.5;
  const scale = 1 + 0.12 * Math.sin(phase);
  const hh = hgt * scale, hw = wid * (2 - scale) * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.bezierCurveTo(cx - hw, baseY - hh * 0.35, cx - hw * 0.4, baseY - hh * 0.75, cx + sway, baseY - hh);
  ctx.bezierCurveTo(cx + hw * 0.4, baseY - hh * 0.75, cx + hw, baseY - hh * 0.35, cx, baseY);
  ctx.fillStyle = colorOuter; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.bezierCurveTo(cx - hw * 0.45, baseY - hh * 0.25, cx - hw * 0.2, baseY - hh * 0.45, cx + sway * 0.5, baseY - hh * 0.55);
  ctx.bezierCurveTo(cx + hw * 0.2, baseY - hh * 0.45, cx + hw * 0.45, baseY - hh * 0.25, cx, baseY);
  ctx.fillStyle = colorInner; ctx.fill();
}

DRAW.candle = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2;
  const ph = o.flicker != null ? o.flicker : time * 9;
  circle(ctx, cx, y + 14, 24, `rgba(255,200,80,${0.16 + 0.05 * Math.sin(ph)})`);
  box(ctx, x, y + h - 10, w, 10, PAL.brass);
  box(ctx, x + 4, y + 24, w - 8, h - 34, '#fbf4e6');
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + w - 10, y + 26, 4, h - 38);
  ellipse(ctx, x + 8, y + 34, 3, 6, '#ffffff', PAL.outline, 1);
  line(ctx, cx, y + 24, cx, y + 18, '#333', 2);
  flame(ctx, cx, y + 22, 20, 14, ph, '#f0a030', '#ffe680');
};

DRAW['balloon-spawner'] = (ctx, o) => {
  if (o.variant === 'hidden') return;
  const { x, y, w, h } = o;
  rbox(ctx, x + 4, y + 6, w - 8, h - 6, 4, '#c9a15a');
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let sx = x + 8; sx < x + w - 4; sx += 8) { ctx.moveTo(sx, y + 8); ctx.lineTo(sx + 6, y + h - 2); ctx.moveTo(sx + 6, y + 8); ctx.lineTo(sx, y + h - 2); }
  ctx.stroke();
  box(ctx, x + 4, y + 6, w - 8, 5, '#a8823f', PAL.outline, 1.5);
};

DRAW.balloon = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const col = BALLOON_COLORS[(o.colorIndex || 0) % BALLOON_COLORS.length];
  const cx = x + w / 2, by = y + h * 0.4;
  const t = o.t != null ? o.t : time;
  ctx.beginPath(); ctx.moveTo(cx, by + h * 0.4);
  ctx.quadraticCurveTo(cx + 5, by + h * 0.55, cx + 3 * Math.sin(t * 4), by + h * 0.75);
  ctx.quadraticCurveTo(cx - 4, by + h * 0.85, cx, y + h);
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();
  ellipse(ctx, cx, by, w / 2 - 1, h * 0.4, col, PAL.outline, 1.5);
  poly(ctx, [[cx - 4, by + h * 0.4], [cx + 4, by + h * 0.4], [cx, by + h * 0.34]], col, PAL.outline, 1.5);
  ellipse(ctx, cx - w * 0.16, by - h * 0.16, 4, 7, 'rgba(255,255,255,0.55)');
};

DRAW['copter-spawner'] = (ctx, o) => {
  const { x, y, w, h } = o;
  box(ctx, x, y, w, h, '#4a4a4a', PAL.outline, 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 4, y + h - 4, w - 8, 2);
};

DRAW.copter = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const cols = [PAL.red, PAL.yellow, PAL.blue];
  const col = cols[(o.colorIndex || 0) % cols.length];
  const bx = x + w * 0.4, by = y + h * 0.6;
  const rotor = o.rotor != null ? o.rotor : time * 30;
  line(ctx, bx + 10, by, x + w - 4, by - 6, PAL.outline, 5);
  line(ctx, bx + 10, by, x + w - 4, by - 6, col, 2.5);
  poly(ctx, [[x + w - 6, by - 14], [x + w - 1, by - 8], [x + w - 8, by - 4]], col, PAL.outline, 1.5);
  line(ctx, bx - 12, y + h - 2, bx + 12, y + h - 2, PAL.outline, 2);
  line(ctx, bx - 6, y + h - 2, bx - 6, by + 6, PAL.outline, 2);
  line(ctx, bx + 6, y + h - 2, bx + 6, by + 6, PAL.outline, 2);
  ellipse(ctx, bx, by, 16, 10, col, PAL.outline, 2);
  ctx.beginPath(); ctx.ellipse(bx + 6, by - 2, 7, 5, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = 'rgba(220,240,255,0.9)'; ctx.fill();
  line(ctx, bx, by - 10, bx, y + 6, PAL.outline, 3);
  const half = 4 + 24 * Math.abs(Math.cos(rotor));
  line(ctx, bx - half, y + 5, bx + half, y + 5, '#333', 3);
};

DRAW['dart-spawner'] = (ctx, o) => {
  const { x, y, w, h } = o;
  rbox(ctx, x, y, w, h, 3, '#2a2a2a', '#666', 2);
  rbox(ctx, x + 5, y + h / 2 - 4, w - 10, 8, 2, '#000', PAL.brass, 1.5);
};

DRAW.dart = (ctx, o) => {
  const { x, y, w, h } = o;
  const dir = o.dir === -1 ? -1 : 1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(dir, 1);
  const hw = w / 2, hh = h / 2;
  poly(ctx, [[hw, 0], [hw - 14, -2], [hw - 14, 2]], '#9aa0a6', PAL.outline, 1.2);
  rbox(ctx, -hw + 16, -3, w - 30, 6, 2, PAL.gold, PAL.outline, 1.2);
  poly(ctx, [[-hw + 16, 0], [-hw + 2, -hh], [-hw + 2, hh]], PAL.red, PAL.outline, 1.2);
  ctx.restore();
};

DRAW.toast = (ctx, o) => {
  const { x, y, w, h } = o;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(o.angle || 0);
  const hw = w / 2, hh = h / 2;
  ctx.beginPath();
  ctx.moveTo(-hw + 4, -hh + 10);
  ctx.arc(-hw / 2, -hh + 10, hw / 2 - 2, Math.PI, 0);
  ctx.arc(hw / 2, -hh + 10, hw / 2 - 2, Math.PI, 0);
  ctx.lineTo(hw, hh - 4); ctx.quadraticCurveTo(hw, hh, hw - 4, hh);
  ctx.lineTo(-hw + 4, hh); ctx.quadraticCurveTo(-hw, hh, -hw, hh - 4);
  ctx.closePath();
  ctx.fillStyle = '#d9a15a'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = PAL.oakDark; ctx.stroke();
  ctx.fillStyle = 'rgba(120,70,30,0.25)';
  ctx.fillRect(-hw + 7, -hh + 12, w - 14, h - 19);
  ctx.restore();
};

DRAW['drip-spawner'] = (ctx, o) => {
  const { x, y, w, h } = o;
  ellipse(ctx, x + w / 2, y + h * 0.4, w / 2, h * 0.6, 'rgba(120,130,140,0.35)');
  ellipse(ctx, x + w / 2, y + h * 0.4, w / 4, h * 0.35, 'rgba(100,110,125,0.35)');
};

DRAW.drip = (ctx, o) => {
  const { x, y, w, h } = o;
  const cx = x + w / 2;
  if (o.splash > 0) {
    const a = Math.max(0, o.splash / 0.3);
    const spread = (1 - a) * 12 + 4;
    ctx.strokeStyle = `rgba(90,160,220,${a})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - spread, y + h); ctx.lineTo(cx - spread - 3, y + h - 6 * a);
    ctx.moveTo(cx + spread, y + h); ctx.lineTo(cx + spread + 3, y + h - 6 * a);
    ctx.moveTo(cx, y + h - 2); ctx.lineTo(cx, y + h - 8 * a);
    ctx.stroke();
    ellipse(ctx, cx, y + h - 1, spread + 2, 2, `rgba(120,180,230,${a * 0.7})`);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.bezierCurveTo(cx + w * 0.6, y + h * 0.55, cx + w * 0.5, y + h, cx, y + h);
  ctx.bezierCurveTo(cx - w * 0.5, y + h, cx - w * 0.6, y + h * 0.55, cx, y);
  ctx.fillStyle = '#7fb6e6'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#3f7fb0'; ctx.stroke();
  circle(ctx, cx - 2, y + h * 0.65, 1.5, 'rgba(255,255,255,0.8)');
};

DRAW.fish = (ctx, o) => {
  const { x, y, w, h } = o;
  const dir = (o.vx || 1) >= 0 ? 1 : -1;
  const ang = Math.max(-0.9, Math.min(0.9, Math.atan2(o.vy || 0, Math.abs(o.vx || 40)) * 0.6));
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(dir, 1);
  ctx.rotate(ang);
  ellipse(ctx, 2, 0, w * 0.34, h * 0.42, '#f28c28', PAL.outline, 1.5);
  poly(ctx, [[-w * 0.28, 0], [-w * 0.5, -h * 0.45], [-w * 0.5, h * 0.45]], '#f28c28', PAL.outline, 1.5);
  circle(ctx, w * 0.2, -2, 1.6, PAL.outline);
  ctx.restore();
};

// ---- pickups ---------------------------------------------------------------
function starPath(ctx, cx, cy, ro, ri, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = rot + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

DRAW.star = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const bob = o.bob || 0;
  const cx = x + w / 2, cy = y + h / 2 + bob;
  const ph = o.phase != null ? o.phase : time * 3;
  const ro = w / 2 - 1, ri = ro * 0.45;
  starPath(ctx, cx, cy, ro, ri, -Math.PI / 2 + Math.sin(ph * 0.5) * 0.08);
  ctx.fillStyle = '#f5c542'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = PAL.goldDark; ctx.lineJoin = 'round'; ctx.stroke();
  starPath(ctx, cx - 1, cy + 1, ro * 0.5, ri * 0.5, -Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
  const tw = 0.5 + 0.5 * Math.sin(ph * 2);
  ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.6 * tw})`; ctx.lineWidth = 1.5;
  const sx = cx + ro * 0.7, sy = cy - ro * 0.7, sl = 3 + 3 * tw;
  ctx.beginPath(); ctx.moveTo(sx - sl, sy); ctx.lineTo(sx + sl, sy); ctx.moveTo(sx, sy - sl); ctx.lineTo(sx, sy + sl); ctx.stroke();
};

DRAW.clock = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const bob = o.bob || 0;
  const cx = x + w / 2, cy = y + h / 2 + 3 + bob;
  const r = w / 2 - 5;
  const ring = (time * 12) % 1 < 0.5 ? 0 : 1;
  circle(ctx, cx - r * 0.75 + ring, cy - r * 0.8, r * 0.3, PAL.red, PAL.outline, 1.5);
  circle(ctx, cx + r * 0.75 - ring, cy - r * 0.8, r * 0.3, PAL.red, PAL.outline, 1.5);
  box(ctx, cx - 3, cy - r - 8, 6, 5, '#555', PAL.outline, 1);
  line(ctx, cx - r * 0.5, cy + r - 1, cx - r * 0.8, cy + r + 6, PAL.outline, 2.5);
  line(ctx, cx + r * 0.5, cy + r - 1, cx + r * 0.8, cy + r + 6, PAL.outline, 2.5);
  circle(ctx, cx, cy, r + 3, PAL.red, PAL.outline, 2);
  circle(ctx, cx, cy, r - 2, '#f8f8f8', PAL.outline, 1.5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    line(ctx, cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5), cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8), '#333', 1.5);
  }
  const hm = time * 2 - Math.PI / 2, hh = time * 0.3 - Math.PI / 2 + 1;
  line(ctx, cx, cy, cx + Math.cos(hh) * r * 0.45, cy + Math.sin(hh) * r * 0.45, '#333', 2.5);
  line(ctx, cx, cy, cx + Math.cos(hm) * r * 0.65, cy + Math.sin(hm) * r * 0.65, '#333', 2);
  circle(ctx, cx, cy, 2, '#333');
};

/** Paper plane in local coords: centre origin, nose at +x, nominal 48x22, scaled by s. */
function paperPlane(ctx, s, fill = PAL.paper, shade = PAL.paperShade, outline = PAL.outline, fold = PAL.fold) {
  const nose = [24 * s, -1 * s], topBack = [-24 * s, -11 * s], midBack = [-16 * s, 3 * s], keelBack = [-20 * s, 11 * s];
  poly(ctx, [nose, midBack, keelBack], shade, outline, 1.5);
  poly(ctx, [nose, topBack, midBack], fill, outline, 1.5);
  ctx.strokeStyle = fold; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(nose[0], nose[1]); ctx.lineTo(midBack[0], midBack[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nose[0] - 4 * s, nose[1] - 1 * s); ctx.lineTo(-20 * s, -7 * s); ctx.stroke();
}

DRAW.life = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const bob = o.bob || 0;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2 + bob);
  ctx.rotate(0.08 + Math.sin((o.phase != null ? o.phase : time * 3) * 0.7) * 0.06);
  paperPlane(ctx, w / 48);
  ctx.restore();
};

DRAW.battery = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const bob = o.bob || 0;
  const cx = x + w / 2;
  const yy = y + bob;
  const pulse = 0.5 + 0.5 * Math.sin((o.phase != null ? o.phase : time * 3) * 1.5);
  circle(ctx, cx, yy + h / 2, w * 0.9, `rgba(245,197,66,${0.08 + 0.1 * pulse})`);
  box(ctx, cx - 6, yy, 12, 6, '#777', PAL.outline, 1.5);
  rbox(ctx, x, yy + 5, w, h - 5, 3, '#3a3a3a', '#1a1a1a', 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 4, yy + 9, w - 8, 6);
  poly(ctx, [[cx + 2, yy + 14], [cx - 6, yy + 30], [cx - 1, yy + 30], [cx - 3, yy + h - 6], [cx + 6, yy + 24], [cx + 1, yy + 24]], '#f5c542', PAL.goldDark, 1.2);
};

DRAW.helium = (ctx, o, time) => {
  const { x, y, w, h } = o;
  const bob = o.bob || 0;
  const cx = x + w / 2, yy = y + bob;
  const knot = [cx, yy + h - 16];
  const balls = [[cx - 11, yy + 13, '#f7a8c4'], [cx + 11, yy + 11, '#a8d8f7'], [cx, yy + 24, '#f7e3a8']];
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.2;
  for (const [bx, by] of balls) { ctx.beginPath(); ctx.moveTo(bx, by + 10); ctx.lineTo(knot[0], knot[1]); ctx.stroke(); }
  for (const [bx, by, col] of balls) {
    ellipse(ctx, bx, by, 9, 11, col, PAL.outline, 1.5);
    ellipse(ctx, bx - 3, by - 4, 2, 3.5, 'rgba(255,255,255,0.7)');
  }
  rbox(ctx, cx - 8, yy + h - 16, 16, 16, 3, '#9aa0a6', PAL.outline, 1.5);
  ctx.fillStyle = '#333'; ctx.font = 'bold 8px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('He', cx, yy + h - 8);
};

function drawUnknown(ctx, o) {
  box(ctx, o.x, o.y, o.w, o.h, 'rgba(255,0,255,0.6)', '#800080', 2);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(o.type), o.x + o.w / 2, o.y + o.h / 2);
}

export function drawObject(ctx, inst, time) {
  if (!inst || inst.dead) return;
  const fn = DRAW[inst.type];
  ctx.save();
  try {
    if (fn) fn(ctx, inst, time || 0); else drawUnknown(ctx, inst);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Glider
// ---------------------------------------------------------------------------
export function drawGlider(ctx, g, time) {
  if (!g) return;
  const t = time || 0;
  const w = g.w ?? GLIDER_W, h = g.h ?? GLIDER_H;
  const cx = g.x + w / 2, cy = g.y + h / 2;
  const facing = g.facing === -1 ? -1 : 1;
  const st = g.stateTime || 0;
  const state = g.state || 'flying';

  if (state === 'spawning' && Math.floor(t * 8) % 2 !== 0) return;

  ctx.save();
  if (state === 'crashing') {
    const alpha = Math.max(0, 1 - st / 0.9);
    if (alpha <= 0) { ctx.restore(); return; }
    ctx.globalAlpha = alpha;
    // scraps flying off
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4;
      const d = 6 + st * 90;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d + st * st * 120);
      ctx.rotate(st * 7 + i);
      box(ctx, -4, -3, 8, 6, PAL.paper, PAL.outline, 1);
      ctx.restore();
    }
    ctx.translate(cx, cy);
    ctx.scale(facing, 1);
    ctx.rotate(0.1 + st * 9);
    const s = Math.max(0.3, 1 - st * 0.8);
    paperPlane(ctx, s * (w / GLIDER_W));
    ctx.restore();
    return;
  }

  if (state === 'burning') {
    const alpha = Math.max(0, 1 - Math.max(0, st - 0.5) / 0.6);
    if (alpha <= 0) { ctx.restore(); return; }
    // smoke
    for (let i = 0; i < 3; i++) {
      const p = (st * 1.5 + i * 0.33) % 1;
      circle(ctx, cx + Math.sin(t * 5 + i) * 6, cy - 10 - p * 40, 4 + p * 8, `rgba(90,90,90,${(1 - p) * 0.35 * alpha})`);
    }
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(facing, 1);
    ctx.rotate(0.1 + st * 4);
    const k = Math.min(1, st / 0.8);
    const mix = (a, b) => Math.round(a + (b - a) * k);
    const fill = `rgb(${mix(255, 70)},${mix(255, 45)},${mix(255, 30)})`;
    const shade = `rgb(${mix(239, 50)},${mix(239, 30)},${mix(239, 20)})`;
    paperPlane(ctx, w / GLIDER_W, fill, shade, PAL.outline, `rgba(120,80,60,${1 - k})`);
    for (let i = 0; i < 3; i++) {
      flame(ctx, -12 + i * 12, 2 - i * 2, 12 + 4 * Math.sin(t * 20 + i), 8, t * 9 + i * 2, 'rgba(240,120,40,0.9)', 'rgba(255,230,120,0.9)');
    }
    ctx.restore();
    return;
  }

  // flying / spawning
  if (g.helium > 0) {
    const blink = g.helium < 1.5 && Math.floor(t * 6) % 2 === 1;
    const sway = Math.sin(t * 3) * 3;
    ctx.globalAlpha = blink ? 0.4 : 1;
    line(ctx, cx, g.y - 1, cx + sway, g.y - 16, '#555', 1.2);
    ellipse(ctx, cx + sway, g.y - 22, 6, 7, '#f7a8c4', PAL.outline, 1.2);
    ellipse(ctx, cx + sway - 2, g.y - 25, 1.5, 2.5, 'rgba(255,255,255,0.7)');
    ctx.globalAlpha = 1;
  }
  ctx.translate(cx, cy);
  ctx.scale(facing, 1);
  if (g.boostActive) {
    ctx.lineCap = 'round';
    const off = (t * 60) % 10;
    for (let i = 0; i < 3; i++) {
      const yy = -6 + i * 6;
      const len = 12 + (i === 1 ? 8 : 0);
      ctx.strokeStyle = `rgba(150,205,255,${0.55 - i * 0.12})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-26 - off * 0.3, yy); ctx.lineTo(-26 - off * 0.3 - len, yy); ctx.stroke();
    }
  }
  ctx.rotate(0.1 + Math.sin(t * 2.5) * 0.02);
  paperPlane(ctx, w / GLIDER_W);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Field hints
// ---------------------------------------------------------------------------
export function drawFieldHint(ctx, field, time) {
  if (!field) return;
  const { x, y, w, h } = field;
  const fx = field.fx || 0, fy = field.fy || 0;
  if ((!fx && !fy) || w <= 0 || h <= 0) return;
  const t = time || 0;
  const mag = Math.hypot(fx, fy);
  const alpha = 0.10 + 0.10 * Math.min(1, mag / 140);
  const spacing = 36;
  const speed = Math.min(160, mag);
  const off = (t * speed) % spacing;

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (fy !== 0) {
    const dir = fy < 0 ? -1 : 1;
    ctx.strokeStyle = fy < 0 ? `rgba(120,170,230,${alpha})` : `rgba(110,130,160,${alpha})`;
    const cols = Math.max(1, Math.floor(w / 28));
    const cw = w / cols;
    ctx.beginPath();
    for (let c = 0; c < cols; c++) {
      const cx = x + cw * (c + 0.5);
      const stagger = (c % 2) * (spacing / 2);
      for (let yy = y - spacing; yy < y + h + spacing; yy += spacing) {
        const py = yy + stagger + dir * off;
        ctx.moveTo(cx - 8, py - dir * 6); ctx.lineTo(cx, py); ctx.lineTo(cx + 8, py - dir * 6);
      }
    }
    ctx.stroke();
  }
  if (fx !== 0) {
    const dir = fx < 0 ? -1 : 1;
    ctx.strokeStyle = `rgba(140,170,200,${alpha})`;
    const rows = Math.max(1, Math.floor(h / 28));
    const rh = h / rows;
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      const cy = y + rh * (r + 0.5);
      const stagger = (r % 2) * (spacing / 2);
      for (let xx = x - spacing; xx < x + w + spacing; xx += spacing) {
        const px = xx + stagger + dir * off;
        ctx.moveTo(px - dir * 6, cy - 8); ctx.lineTo(px, cy); ctx.lineTo(px - dir * 6, cy + 8);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
