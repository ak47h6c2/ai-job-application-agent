// Renders the toolbar icon (teal rounded square with form lines and a check) to PNG without dependencies.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

function render(size) {
  const ss = 4;
  const pixels = Buffer.alloc(size * size * 4);
  const inRounded = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const distToSegment = (px, py, ax, ay, bx, by) => {
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bg = 0, white = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          if (!inRounded(u, v, 0.04, 0.04, 0.96, 0.96, 0.22)) continue;
          bg += 1;
          const bar = (y0, x1) => inRounded(u, v, 0.22, y0, x1, y0 + 0.1, 0.05);
          const check = distToSegment(u, v, 0.52, 0.66, 0.62, 0.76) < 0.055 || distToSegment(u, v, 0.62, 0.76, 0.8, 0.54) < 0.055;
          if (bar(0.22, 0.78) || bar(0.42, 0.62) || bar(0.62, 0.42) || check) white += 1;
        }
      }
      const total = ss * ss;
      const index = (y * size + x) * 4;
      const w = white / Math.max(bg, 1);
      pixels[index] = Math.round(15 + (255 - 15) * w);
      pixels[index + 1] = Math.round(118 + (255 - 118) * w);
      pixels[index + 2] = Math.round(110 + (255 - 110) * w);
      pixels[index + 3] = Math.round((255 * bg) / total);
    }
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`../static/icons/${size}.png`, import.meta.url), render(size));
console.log("icons written");
