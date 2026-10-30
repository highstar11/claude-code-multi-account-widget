// Draws the app and tray icons (two activity-style rings) as PNGs, with no image dependencies.
// Run with `node scripts/make-icons.mjs`; the outputs are committed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Coverage (0..1) of an arc ring of radius r and stroke w that sweeps `sweep` of the circle from 12 o'clock. */
function ring(px, py, cx, cy, r, w, sweep) {
  const SS = 4;
  let hit = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) / SS - cx;
      const y = py + (sy + 0.5) / SS - cy;
      const d = Math.hypot(x, y);
      let a = Math.atan2(x, -y) / (2 * Math.PI);
      if (a < 0) a += 1;
      const inBand = Math.abs(d - r) <= w / 2;
      // Round caps at both ends of the arc.
      const cap = (t) => Math.hypot(x - r * Math.sin(t * 2 * Math.PI), y + r * Math.cos(t * 2 * Math.PI)) <= w / 2;
      if ((inBand && a <= sweep) || cap(0) || cap(sweep)) hit++;
    }
  }
  return hit / (SS * SS);
}

function roundedSquare(px, py, size, radius) {
  const SS = 4;
  let hit = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) / SS;
      const y = py + (sy + 0.5) / SS;
      const qx = Math.max(radius - x, x - (size - radius), 0);
      const qy = Math.max(radius - y, y - (size - radius), 0);
      if (Math.hypot(qx, qy) <= radius) hit++;
    }
  }
  return hit / (SS * SS);
}

function over(dst, src, a) {
  return [0, 1, 2].map((i) => dst[i] * (1 - a) + src[i] * a);
}

function appIcon(size) {
  const s = size / 1024;
  const pad = 100 * s;
  const inner = size - pad * 2;
  return png(size, (x, y) => {
    const mask = roundedSquare(x - pad, y - pad, inner, 185 * s);
    if (mask === 0) return [0, 0, 0, 0];
    const t = (y - pad) / inner;
    let c = [28 - 10 * t, 28 - 10 * t, 32 - 10 * t];
    const cx = size / 2;
    const cy = size / 2;
    const tracks = [
      { r: 270 * s, w: 92 * s, sweep: 0.72, col: [10, 132, 255] },
      { r: 165 * s, w: 92 * s, sweep: 0.46, col: [48, 209, 88] },
    ];
    for (const tr of tracks) {
      c = over(c, tr.col.map((v) => v * 0.22), ring(x, y, cx, cy, tr.r, tr.w, 1));
      c = over(c, tr.col, ring(x, y, cx, cy, tr.r, tr.w, tr.sweep));
    }
    return [...c.map(Math.round), Math.round(mask * 255)];
  });
}

/** Monochrome tray icon; on macOS used as a template image. */
function trayIcon(size, color) {
  const s = size / 16;
  return png(size, (x, y) => {
    const a = Math.max(
      ring(x, y, size / 2, size / 2, 6 * s, 2.2 * s, 0.75),
      ring(x, y, size / 2, size / 2, 2.6 * s, 2.2 * s, 0.5),
    );
    return [...color, Math.round(a * 255)];
  });
}

const assets = path.join(root, 'assets');
const build = path.join(root, 'build');
fs.mkdirSync(assets, { recursive: true });
fs.mkdirSync(build, { recursive: true });
fs.writeFileSync(path.join(build, 'icon.png'), appIcon(1024));
fs.writeFileSync(path.join(assets, 'icon.png'), appIcon(256));
fs.writeFileSync(path.join(assets, 'trayTemplate.png'), trayIcon(16, [0, 0, 0]));
fs.writeFileSync(path.join(assets, 'trayTemplate@2x.png'), trayIcon(32, [0, 0, 0]));
fs.writeFileSync(path.join(assets, 'tray.png'), trayIcon(16, [255, 255, 255]));
fs.writeFileSync(path.join(assets, 'tray@2x.png'), trayIcon(32, [255, 255, 255]));
console.log('icons written');
