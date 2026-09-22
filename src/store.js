import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cfg } from './config.js';

const FILE = path.join(cfg.dirs.data, 'seen.json');
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } };

const key = item => crypto.createHash('sha1')
  .update(String(item.id || item.link || item.title)).digest('hex').slice(0, 16);

export function isSeen(item) { return key(item) in load(); }

/** aakhri KAMYAB post ka waqt — rate limit ke liye */
export function lastPostedAt() {
  const times = Object.values(load())
    .filter(v => v.posted)
    .map(v => Date.parse(v.at))
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : 0;
}

/** ab tak kul kitni posts — look ki bari-bari (rotation) isi se chalti hai */
export function totalPosted() {
  return Object.values(load()).filter(v => v.posted).length;
}

/** aaj (local date) kitni posts ja chuki hain */
export function postsToday() {
  const today = new Date().toDateString();
  return Object.values(load())
    .filter(v => v.posted && new Date(v.at).toDateString() === today).length;
}

/** out/ aur tmp/ ko saaf rakho warna disk bharti rehti hai */
export function cleanup({ keepDays = cfg.post.keepDays } = {}) {
  const cutoff = Date.now() - keepDays * 86_400_000;
  let removed = 0;

  for (const [dir, maxAge] of [[cfg.dirs.out, cutoff], [cfg.dirs.tmp, Date.now() - 3_600_000]]) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const name of files) {
      if (name.startsWith('demo-')) continue;            /* demo cards rehne do */
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).mtimeMs < maxAge) { fs.unlinkSync(file); removed++; }
      } catch { /* pehle hi hat gayi */ }
    }
  }
  return removed;
}

export function markSeen(item, extra = {}) {
  const db = load();
  db[key(item)] = { title: item.title?.slice(0, 120), at: new Date().toISOString(), ...extra };
  /* sirf aakhri 500 entries rakho */
  const trimmed = Object.fromEntries(Object.entries(db).slice(-500));
  fs.writeFileSync(FILE, JSON.stringify(trimmed, null, 2));
}
