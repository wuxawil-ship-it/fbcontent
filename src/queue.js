import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';

const FILE = path.join(cfg.dirs.data, 'queue.json');

export function readQueue() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}

function write(q) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(q, null, 2));
}

export function pushQueue(entries) {
  const q = readQueue().concat(entries);
  write(q);
  return q.length;
}

/** Sab se purani tayyar post nikalo (FIFO — khabar basi na ho jaye) */
export function shiftQueue() {
  const q = readQueue();
  const item = q.shift();
  write(q);
  return item;
}

/** Nakaam post wapas qatar ke aakhir mein — taake agli khabar rok na de */
export function requeue(entry) {
  const q = readQueue();
  entry.tries = (entry.tries || 0) + 1;
  if (entry.tries <= 3) { q.push(entry); write(q); return true; }
  write(q);
  return false;    /* 3 koshishon ke baad chhor do */
}
