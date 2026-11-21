// Generates the PWA icons as PNG (no dependencies) plus an SVG favicon.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#c2531f');
const PLATE = hex('#fbf6ef');
const RIM = hex('#ead9c3');
const HAND = hex('#6b2a10');
const LEAF = hex('#4f8f5f');

// Signed distance helpers (negative = inside)
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
function segment(x, y, ax, ay, bx, by, w) {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h) - w / 2;
}
function roundRect(x, y, r) {
  const qx = Math.abs(x - 0.5) - (0.5 - r), qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function ellipse(x, y, cx, cy, rx, ry, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = x - cx, dy = y - cy;
  const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
  return (Math.hypot(u, v) - 1) * Math.min(rx, ry);
}

const STEM = [0.66, 0.31, 0.84, 0.12];
function sprigLeaves() {
  const [ax, ay, bx, by] = STEM;
  const len = Math.hypot(bx - ax, by - ay);
  const [dx, dy] = [(bx - ax) / len, (by - ay) / len];
  const stemAngle = Math.atan2(dy, dx);
  const leaves = [];
  [0.3, 0.55, 0.8].forEach((t, i) => {
    for (const side of [-1, 1]) {
      const off = 0.038;
      leaves.push([ax + (bx - ax) * t - dy * side * off, ay + (by - ay) * t + dx * side * off, stemAngle - side * 0.7, 0.034 - i * 0.004]);
    }
  });
  leaves.push([bx + dx * 0.02, by + dy * 0.02, stemAngle, 0.03]);
  return leaves;
}

/** Layers painted in order: [sdf(x,y), rgb]. Coordinates are 0..1. */
function scene({ maskable = false, badge = false }) {
  const k = maskable ? 0.78 : 1; // keep inside the maskable safe zone
  const T = (fn) => (x, y) => fn(0.5 + (x - 0.5) / k, 0.5 + (y - 0.5) / k) * k;
  const layers = [];
  if (!badge) layers.push([maskable ? () => -1 : (x, y) => roundRect(x, y, 0.22), BG]);
  const fg = badge ? [255, 255, 255] : null;
  if (badge) {
    layers.push([T((x, y) => Math.abs(circle(x, y, 0.5, 0.5, 0.36)) - 0.05), fg]);
  } else {
    layers.push([T((x, y) => circle(x, y, 0.5, 0.54, 0.31)), PLATE]);
    layers.push([T((x, y) => Math.abs(circle(x, y, 0.5, 0.54, 0.25)) - 0.008), RIM]);
  }
  const cy = badge ? 0.5 : 0.54;
  layers.push([T((x, y) => segment(x, y, 0.5, cy, 0.5, cy - 0.17, 0.045)), fg ?? HAND]);
  layers.push([T((x, y) => segment(x, y, 0.5, cy, 0.61, cy + 0.07, 0.045)), fg ?? HAND]);
  layers.push([T((x, y) => circle(x, y, 0.5, cy, 0.035)), fg ?? HAND]);
  if (!badge) {
    // A little thyme sprig on the rim
    layers.push([T((x, y) => segment(x, y, ...STEM, 0.018)), LEAF]);
    const leaves = sprigLeaves();
    for (const [cx, cy2, a, rx] of leaves) {
      layers.push([T((x, y) => ellipse(x, y, cx, cy2, rx, 0.016, a)), LEAF]);
    }
  }
  return layers;
}

function render(size, opts) {
  const layers = scene(opts);
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          let cr = 0, cg = 0, cb = 0, ca = 0;
          for (const [sdf, col] of layers) {
            if (sdf(x, y) <= 0) { [cr, cg, cb] = col; ca = 1; }
          }
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      const n = SS * SS;
      buf[i] = a ? Math.round(r / a) : 0;
      buf[i + 1] = a ? Math.round(g / a) : 0;
      buf[i + 2] = a ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, buf);
}

writeFileSync(`${OUT}/icon-192.png`, render(192, {}));
writeFileSync(`${OUT}/icon-512.png`, render(512, {}));
writeFileSync(`${OUT}/maskable-512.png`, render(512, { maskable: true }));
writeFileSync(`${OUT}/apple-touch-icon.png`, render(180, { maskable: true }));
writeFileSync(`${OUT}/badge-96.png`, render(96, { badge: true }));
writeFileSync(
  `${OUT}/icon.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#c2531f"/>
  <circle cx="50" cy="54" r="31" fill="#fbf6ef"/>
  <circle cx="50" cy="54" r="25" fill="none" stroke="#ead9c3" stroke-width="1.6"/>
  <g stroke="#6b2a10" stroke-width="4.5" stroke-linecap="round"><line x1="50" y1="54" x2="50" y2="37"/><line x1="50" y1="54" x2="61" y2="61"/></g>
  <circle cx="50" cy="54" r="3.5" fill="#6b2a10"/>
  <line x1="66" y1="31" x2="84" y2="12" stroke="#4f8f5f" stroke-width="1.8"/>
  <g fill="#4f8f5f">${sprigLeaves()
    .map(([cx, cy, ang, rx]) => {
      const f = (n) => +(n * 100).toFixed(2);
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="1.6" transform="rotate(${+((ang * 180) / Math.PI).toFixed(1)} ${f(cx)} ${f(cy)})"/>`;
    })
    .join('')}</g>
</svg>
`,
);
console.log('icons written');
