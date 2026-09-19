// Generates assets/icon.png (512x512) without any dependency: a rounded dark tile with a bolt.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const W = 512;
const H = 512;
const px = new Uint8Array(W * H * 4);

function inRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), W - r);
  const cy = Math.min(Math.max(y, r), H - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
// bolt polygon (normalized 0..1)
const bolt = [
  [0.58, 0.12],
  [0.3, 0.55],
  [0.48, 0.55],
  [0.4, 0.88],
  [0.7, 0.42],
  [0.52, 0.42],
];
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!inRoundedRect(x, y, 110)) continue;
    const t = (x + y) / (W + H);
    let r = Math.round(28 + 40 * t);
    let g = Math.round(24 + 30 * t);
    let b = Math.round(48 + 90 * t);
    if (inPoly(x / W, y / H, bolt)) {
      r = 255;
      g = 214;
      b = 92;
    }
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  }
}
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
}
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
mkdirSync("assets", { recursive: true });
writeFileSync("assets/icon.png", png);
console.log("wrote assets/icon.png", png.length, "bytes");
