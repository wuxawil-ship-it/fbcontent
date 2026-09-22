/* Sirf ye batata hai ke post ka waqt hua ya nahi. Koi dependency nahi,
   koi network nahi — taake na-zaroori runs sasti rahein. */
import fs from 'node:fs';

const target = Number(process.env.POSTS_PER_DAY || 18);
const floor  = Number(process.env.MIN_GAP_MINUTES || 20);

let db = {};
try { db = JSON.parse(fs.readFileSync('data/seen.json', 'utf8')); } catch {}

const posted = Object.values(db).filter(v => v.posted);
const today  = new Date().toDateString();
const done   = posted.filter(v => new Date(v.at).toDateString() === today).length;
const last   = Math.max(0, ...posted.map(v => Date.parse(v.at)).filter(Number.isFinite));

const now      = new Date();
const minsLeft = Math.max(1, (new Date(now).setHours(23, 59, 59, 999) - now) / 60_000);
const pace     = done >= target ? Infinity : Math.max(floor, minsLeft / (target - done));
const since    = (Date.now() - last) / 60_000;
const go       = done < target && since >= pace;

console.log(`go=${go}`);
console.error(`aaj ${done}/${target} · aakhri post ${Math.round(since)} min pehle · pace ~${Math.round(pace)} min`);
