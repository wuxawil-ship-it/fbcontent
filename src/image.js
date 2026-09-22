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

/* Ek hi tasveer ke kai size aksar sirf query string mein farq rakhte hain
   (Guardian: ?width=700 / 460 / 140). Signature se unhe ek hi picture mana jata hai. */
function signature(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.replace(/\d+/g, '#');
  } catch { return url; }
}

/* Card ke liye tasveer kaam ki hai ya nahi */
function qualityCheck({ w, h }, minWidth) {
  const ratio = w / h;
  if (w < minWidth) return `chhoti (${w}px)`;
  if (w * h < 300_000) return `kam pixels (${w}x${h})`;
  if (ratio > 2.6) return `banner jaisi (${ratio.toFixed(1)}:1)`;   /* website banners */
  if (ratio < 0.45) return `bohat lambi (${ratio.toFixed(2)}:1)`;
  return null;
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', referer: new URL(url).origin },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const size = imageSize(buf);
  if (!size) throw new Error('image parse nahi hui');

  const ext = buf.readUInt32BE(0) === 0x89504e47 ? 'png'
            : buf.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : 'jpg';
  const file = path.join(cfg.dirs.tmp, `${crypto.randomUUID()}.${ext}`);
  await fs.writeFile(file, buf);
  return { file, url, bytes: buf.length, ...size };
}

/**
 * Candidates se ALAG-ALAG tasveerein nikalta hai (ek hi photo ke sizes ko ek hi mana jata hai),
 * har group mein sab se bari/behtar wali chunta hai.
 * @returns {Promise<Array<{file,url,w,h,bytes}>>}
 */
export async function fetchImageSet(candidates, { max = 1, minWidth = 640 } = {}) {
  const groups = new Map();
  for (const url of (candidates || []).filter(Boolean)) {
    const k = signature(url);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(url);
  }

  const picked = [];
  for (const urls of [...groups.values()].slice(0, 4)) {
    if (picked.length >= max) break;
    let fallback = null;

    for (const url of urls.slice(0, 4)) {
      try {
        const img = await download(url);
        const bad = qualityCheck(img, minWidth);
        if (!bad) { picked.push(img); fallback = null; break; }
        if (!fallback || img.w > fallback.w) fallback = img;
        console.warn(`    image ${bad}: ${url.slice(0, 60)}`);
      } catch (e) {
        console.warn(`    image fail (${e.message}): ${url.slice(0, 60)}`);
      }
    }
    /* group mein koi bhi standard par poora na utra to sab se bari wali hi le lo */
    if (fallback && picked.length < max) picked.push(fallback);
  }
  return picked;
}

/** Ek behtareen tasveer — purane call sites ke liye */
export async function fetchBestImage(candidates, opts = {}) {
  return (await fetchImageSet(candidates, { ...opts, max: 1 }))[0] ?? null;
}
