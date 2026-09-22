import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cfg } from './config.js';

const FILE = path.join(cfg.dirs.data, 'seen.json');
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } };

const key = item => crypto.createHash('sha1')
  .update(String(item.id || item.link || item.title)).digest('hex').slice(0, 16);

export function isSeen(item) { return key(item) in load(); }

export function markSeen(item, extra = {}) {
  const db = load();
  db[key(item)] = { title: item.title?.slice(0, 120), at: new Date().toISOString(), ...extra };
  /* sirf aakhri 500 entries rakho */
  const trimmed = Object.fromEntries(Object.entries(db).slice(-500));
  fs.writeFileSync(FILE, JSON.stringify(trimmed, null, 2));
}
