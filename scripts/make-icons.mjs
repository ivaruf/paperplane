#!/usr/bin/env node
// scripts/make-icons.mjs — rasterise the Glider PWA icons to PNG.
//
// No dependencies: a tiny PNG encoder (hand-written chunks + CRC32, zlib deflate
// from node:zlib) and a scanline polygon filler with 4x vertical supersampling
// and exact horizontal coverage for anti-aliasing.
//
// Geometry mirrors icons/icon.svg: blue rounded background, white paper airplane
// (three polygons) with a light grey fold line, rotated 18° nose-up.
//
// Usage: node scripts/make-icons.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

/* ------------------------------------------------------------ PNG writer -- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------- rasteriser -- */

const SUBSAMPLES = 4; // vertical sub-scanlines per pixel row

class Image {
  constructor(size) {
    this.w = size;
    this.h = size;
    this.data = new Float32Array(size * size * 4); // straight (non-premultiplied) RGBA, 0..1
  }

  /** "over" composite `color` ([r,g,b,a] in 0..1) with per-pixel coverage onto the image. */
  composite(coverage, colorAt) {
    const { data, w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cov = coverage[y * w + x];
        if (cov <= 0) continue;
        const [r, g, b, a0 = 1] = colorAt(x, y);
        const a = Math.min(1, a0 * cov);
        const i = (y * w + x) * 4;
        const da = data[i + 3];
        const outA = a + da * (1 - a);
        if (outA <= 0) continue;
        for (let c = 0; c < 3; c++) {
          data[i + c] = ([r, g, b][c] * a + data[i + c] * da * (1 - a)) / outA;
        }
        data[i + 3] = outA;
      }
    }
  }

  toRGBA8() {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < out.length; i += 4) {
      const a = this.data[i + 3];
      out[i + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
      for (let c = 0; c < 3; c++) {
        out[i + c] = a > 0 ? Math.round(Math.min(1, Math.max(0, this.data[i + c])) * 255) : 0;
      }
    }
    return out;
  }
}

/**
 * Scanline fill (even-odd) of a polygon into a coverage buffer.
 * `coverage` accumulates with max() so overlapping polygons form a union.
 */
function fillPolygon(coverage, w, h, points) {
  const n = points.length;
  const xs = [];
  for (let py = 0; py < h; py++) {
    for (let s = 0; s < SUBSAMPLES; s++) {
      const y = py + (s + 0.5) / SUBSAMPLES;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % n];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.max(0, xs[i]);
        const xb = Math.min(w, xs[i + 1]);
        if (xb <= xa) continue;
        for (let px = Math.floor(xa); px < Math.ceil(xb); px++) {
          const left = Math.max(xa, px);
          const right = Math.min(xb, px + 1);
          if (right > left) {
            const idx = py * w + px;
            coverage[idx] = Math.min(1, coverage[idx] + (right - left) / SUBSAMPLES);
          }
        }
      }
    }
  }
}

function newCoverage(size) {
  return new Float32Array(size * size);
}

function unionCoverage(size, polygons) {
  // Rasterise each polygon separately and take the per-pixel max → true union,
  // so a translucent shadow does not double up where the pieces overlap.
  const out = newCoverage(size);
  for (const poly of polygons) {
    const cov = newCoverage(size);
    fillPolygon(cov, size, size, poly);
    for (let i = 0; i < out.length; i++) if (cov[i] > out[i]) out[i] = cov[i];
  }
  return out;
}

function roundedRectPolygon(x, y, w, h, r, segments = 24) {
  const pts = [];
  const corners = [
    [x + w - r, y + r, -Math.PI / 2, 0],          // top-right
    [x + w - r, y + h - r, 0, Math.PI / 2],       // bottom-right
    [x + r, y + h - r, Math.PI / 2, Math.PI],     // bottom-left
    [x + r, y + r, Math.PI, 1.5 * Math.PI],       // top-left
  ];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= segments; i++) {
      const a = a0 + ((a1 - a0) * i) / segments;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

/* ---------------------------------------------------------- the artwork -- */

const hex = (s) => {
  const v = parseInt(s.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1];
};

const BG_TOP = hex('#3a7be0');
const BG_BOTTOM = hex('#2559bd');
const WING_TOP = hex('#ffffff');
const WING_BOTTOM = hex('#e9edf4');
const KEEL = hex('#cfd6e2');
const FOLD = hex('#b9c2d0');
const SHADOW = [0, 0, 0, 0.22];

// Unit-space airplane (0..1, nose pointing right). Same numbers as icon.svg.
const N = [0.96, 0.5];  // nose
const A = [0.06, 0.24]; // upper wing tip
const T = [0.3, 0.5];   // tail notch
const B = [0.06, 0.76]; // lower wing tip
const K = [0.36, 0.7];  // keel
const PLANE_PARTS = [
  { pts: [N, T, B], color: WING_BOTTOM },
  { pts: [N, A, T], color: WING_TOP },
  { pts: [N, T, K], color: KEEL },
];
const FOLD_LINE = { from: [0.93, 0.5], to: [0.31, 0.5], width: 0.018 };
const SHADOW_OFFSET = [0.02, 0.03];
const ROTATION_DEG = -18;

/** Map a unit-space point to pixel space: offset, rotate about the unit centre, scale, translate. */
function mapPoint([ux, uy], size, scale, offset = [0, 0]) {
  const a = (ROTATION_DEG * Math.PI) / 180;
  const dx = ux + offset[0] - 0.5;
  const dy = uy + offset[1] - 0.5;
  const rx = dx * Math.cos(a) - dy * Math.sin(a) + 0.5;
  const ry = dx * Math.sin(a) + dy * Math.cos(a) + 0.5;
  const s = size * scale;
  const t = (size - s) / 2;
  return [t + rx * s, t + ry * s];
}

/** A thick line segment as a quad (with round-ish end caps via short extension). */
function strokeQuad(from, to, width) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  return [
    [from[0] + nx, from[1] + ny],
    [to[0] + nx, to[1] + ny],
    [to[0] - nx, to[1] - ny],
    [from[0] - nx, from[1] - ny],
  ];
}

function lerpColor(c0, c1, t) {
  return c0.map((v, i) => v + (c1[i] - v) * t);
}

/**
 * Render one icon.
 * @param {number} size       output size in px
 * @param {object} opts       { rounded: boolean, planeScale: number }
 */
function renderIcon(size, { rounded = true, planeScale = 0.78 } = {}) {
  const img = new Image(size);

  // background
  const bg = newCoverage(size);
  if (rounded) {
    fillPolygon(bg, size, size, roundedRectPolygon(0, 0, size, size, size * 0.22));
  } else {
    bg.fill(1);
  }
  img.composite(bg, (_x, y) => lerpColor(BG_TOP, BG_BOTTOM, y / (size - 1)));

  // soft drop shadow (union of the three parts, offset in plane space)
  const shadowPolys = PLANE_PARTS.map(({ pts }) => pts.map((p) => mapPoint(p, size, planeScale, SHADOW_OFFSET)));
  img.composite(unionCoverage(size, shadowPolys), () => SHADOW);

  // plane
  for (const { pts, color } of PLANE_PARTS) {
    const cov = newCoverage(size);
    fillPolygon(cov, size, size, pts.map((p) => mapPoint(p, size, planeScale)));
    img.composite(cov, () => color);
  }

  // fold line
  const fold = newCoverage(size);
  fillPolygon(
    fold, size, size,
    strokeQuad(
      mapPoint(FOLD_LINE.from, size, planeScale),
      mapPoint(FOLD_LINE.to, size, planeScale),
      FOLD_LINE.width * size * planeScale,
    ),
  );
  img.composite(fold, () => FOLD);

  return encodePNG(size, size, img.toRGBA8());
}

/* --------------------------------------------------------------- main -- */

const OUTPUTS = [
  { file: 'icon-192.png', size: 192, rounded: true, planeScale: 0.78 },
  { file: 'icon-512.png', size: 512, rounded: true, planeScale: 0.78 },
  // maskable: full-bleed background, artwork kept inside the 80% safe zone
  { file: 'icon-maskable-512.png', size: 512, rounded: false, planeScale: 0.56 },
  // iOS applies its own mask; supply an opaque square
  { file: 'apple-touch-icon.png', size: 180, rounded: false, planeScale: 0.78 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, rounded, planeScale } of OUTPUTS) {
  const png = renderIcon(size, { rounded, planeScale });
  const path = resolve(OUT_DIR, file);
  writeFileSync(path, png);
  console.log(`wrote ${file} (${size}x${size}, ${png.length} bytes)`);
}
