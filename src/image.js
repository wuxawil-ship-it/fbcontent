import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { cfg } from './config.js';

/** Buffer se image ke dimensions nikalta hai — bina kisi dependency ke (JPEG/PNG/WebP/GIF) */
export function imageSize(buf) {
  if (buf.length < 24) return null;

  /* PNG */
  if (buf.readUInt32BE(0) === 0x89504e47)
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };

  /* GIF */
  if (buf.toString('ascii', 0, 3) === 'GIF')
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };

  /* WebP */
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }

  /* JPEG — SOF marker dhoondo */
  if (buf.readUInt16BE(0) === 0xffd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m))
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * Candidates ko bari-bari try karta hai aur pehli aisi image leta hai jo minWidth poori kare.
 * Koi bhi poori na kare to jo sab se bari mili wohi de deta hai.
 */
export async function fetchBestImage(candidates, { minWidth = 640 } = {}) {
  let best = null;

  for (const url of [...new Set((candidates || []).filter(Boolean))].slice(0, 6)) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', referer: new URL(url).origin },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { console.warn(`    image ${res.status}: ${url.slice(0, 70)}`); continue; }

      const buf = Buffer.from(await res.arrayBuffer());
      const size = imageSize(buf);
      if (!size) { console.warn(`    image unreadable: ${url.slice(0, 70)}`); continue; }

      const ext = buf.readUInt32BE(0) === 0x89504e47 ? 'png' : buf.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : 'jpg';
      const file = path.join(cfg.dirs.tmp, `${crypto.randomUUID()}.${ext}`);
      await fs.writeFile(file, buf);

      const found = { file, ...size, url };
      if (size.w >= minWidth) return found;
      if (!best || size.w > best.w) best = found;
      console.warn(`    image chhoti (${size.w}px): ${url.slice(0, 60)}`);
    } catch (e) {
      console.warn(`    image fail: ${e.message}`);
    }
  }
  return best;
}
