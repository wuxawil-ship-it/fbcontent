import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, cfg } from './config.js';
import { renderCard, closeBrowser } from './render.js';
import { buildPosts } from './ai.js';
import { fetchImageSet } from './image.js';
import { pickSource, fetchArticleMeta } from './sources.js';
import { publishPhoto, whoami } from './facebook.js';
import { isSeen, markSeen, lastPostedAt, postsToday, cleanup } from './store.js';
import { readQueue, pushQueue, shiftQueue, requeue } from './queue.js';

const args = process.argv.slice(2);
const cmd = args[0] || 'demo';
const flag = n => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };

const slug = s => (s || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------- demo */
async function demo() {
  const data = {
    headline: [
      { t: 'US prepares to sanction the', c: 'white' },
      { t: 'International Criminal Court', c: 'accent' },
      { t: 'over its arrest warrant for Israeli PM Netanyahu.', c: 'white' },
    ],
    images: [path.join(ROOT, 'assets/demo-a.jpg')],
    inset: { image: path.join(ROOT, 'assets/demo-b.jpg'), ring: 'white' },
    focus: 'center', accent: cfg.card.accent, texture: cfg.card.texture,
    kicker: 'World', brand: cfg.card.brand || '@safucrypto', footer: 'Source: Reuters',
  };
  for (const template of ['classic', 'overlay', 'band']) {
    const out = path.join(cfg.dirs.out, `demo-${template}.jpg`);
    const r = await renderCard({ ...data, template }, out);
    console.log(`  ✓ ${template.padEnd(8)} ${r.file}  (font ${r.fontSize}px)`);
  }
}

/* ------------------------------------------------- queue bharna */
/* Ek Gemini request mein kai khabrein — free tier par 20 req/din/model hai,
   is liye har khabar ke liye alag request bhejna kaam nahi karta. */
async function refill(need) {
  const items = await pickSource(opt('source'))();
  console.log(`  ${items.length} items mile`);

  const unseen = items.filter(i => !isSeen(i));
  if (cfg.post.priority.length) {
    const score = i => {
      const hay = `${i.title} ${i.text}`.toLowerCase();
      return cfg.post.priority.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0);
    };
    unseen.sort((a, b) => score(b) - score(a));
  }

  const picked = unseen.slice(0, need);
  if (!picked.length) return console.log('  koi nayi khabar nahi');

  /* article text pehle — caption is ke bagair khokhli aati hai */
  for (const item of picked) {
    const art = await fetchArticleMeta(item.link);
    if (art.text.length > item.text.length) item.text = `${item.title}\n\n${art.text}`;
    if (art.image) item.images = [...item.images, art.image];
  }

  console.log(`  ${picked.length} khabrein ek hi Gemini request mein bhej rahe hain...`);
  const results = await buildPosts(picked);

  const ready = [];
  results.forEach((ai, i) => {
    const item = picked[i];
    if (!ai) return console.log(`    ${i}: Gemini ne chhor diya — ${item.title.slice(0, 40)}`);
    if (!ai.usable) {
      console.log(`    ${i}: skip (${ai.reason || 'usable=false'})`);
      return markSeen(item, { skipped: ai.reason || 'unusable' });
    }
    ready.push({
      id: item.id, title: item.title, link: item.link, source: item.source,
      images: item.images, headline: ai.headline, punchline: ai.punchline,
      caption: ai.caption, kicker: ai.kicker, focus: ai.focus,
    });
    markSeen(item, { queued: true });
  });

  if (ready.length) console.log(`  ✓ ${pushQueue(ready)} posts qatar mein tayyar`);
}

/* ------------------------------------------------- qatar se post */
async function publishOne(entry, { post }) {
  console.log(`\n  → ${entry.title}`);

  const want = cfg.card.inset ? 2 : 1;
  const pics = await fetchImageSet(entry.images, { max: want });
  if (!pics.length) { console.log('    koi chalne wali image nahi — chhor rahe hain'); return null; }
  const [pic, second] = pics;
  console.log(`    image: ${pic.w}x${pic.h}`);

  const file = path.join(cfg.dirs.out, `${stamp()}-${slug(entry.title)}.jpg`);
  const card = await renderCard({
    template: opt('template', cfg.card.template),
    headline: entry.headline, punchline: entry.punchline, images: [pic.file],
    inset: second ? { image: second.file, ring: 'white' } : null,
    focus: entry.focus, accent: cfg.card.accent, texture: cfg.card.texture,
    kicker: entry.kicker, brand: cfg.card.brand,
    footer: entry.source ? `Source: ${entry.source}` : '',
  }, file);

  const caption = [entry.caption, entry.link && `\nSource: ${entry.link}`].filter(Boolean).join('\n');

  if (!post) {
    const txt = card.file.replace(/\.jpg$/, '.txt');
    await fs.writeFile(txt, caption, 'utf8');
    console.log(`    card: ${path.basename(card.file)}  +  ${path.basename(txt)}`);
    return { image: card.file, caption: txt, title: entry.title };
  }

  const res = await publishPhoto({ imagePath: card.file, caption });
  console.log(`    ✓ posted: ${res.url}`);
  markSeen(entry, { posted: res.id });
  return { posted: res.id };
}

/* ---------------------------------------------------------- run */
async function runOnce({ post, open }) {
  const wiped = cleanup();
  if (wiped) console.log(`  ${wiped} purani files saaf kin`);

  let want = args.includes('--max') ? Number(opt('max')) : cfg.maxPerRun;

  if (post) {
    const target = cfg.post.perDay;
    const done = postsToday();
    if (done >= target) return console.log(`  aaj ki ${target} posts poori — kal phir`);

    const now = new Date();
    const minsLeft = Math.max(1, (new Date(now).setHours(23, 59, 59, 999) - now) / 60_000);
    const pace = Math.max(cfg.post.minGapMinutes, minsLeft / (target - done));
    const since = (Date.now() - lastPostedAt()) / 60_000;
    if (since < pace) {
      return console.log(`  aaj ${done}/${target} — agli post ${Math.round(pace - since)} min baad`);
    }

    /* GitHub cron ticks girata hai, is liye pichra hua kaam bhi pakro */
    const expected = Math.floor(target * ((1440 - minsLeft) / 1440));
    want = Math.min(cfg.post.catchupMax, 1 + Math.max(0, expected - done), target - done);
    console.log(`  aaj ${done}/${target} (ab tak ${expected} hone chahiye the) — is run mein ${want}`);
  }

  /* qatar khaali ho rahi ho to ek batch call se bhar lo */
  const queued = readQueue().length;
  console.log(`  qatar mein ${queued} tayyar`);
  if (queued < want + cfg.post.queueFloor) {
    try { await refill(cfg.post.batchSize); }
    catch (e) { console.error(`  refill fail: ${e.message.split('\n')[0]}`); }
  }

  const made = [];
  for (let n = 0; n < want; n++) {
    const entry = shiftQueue();
    if (!entry) { console.log('\n  qatar khaali'); break; }
    try {
      const r = await publishOne(entry, { post });
      if (!r) continue;
      made.push(r);
      if (post && n < want - 1 && cfg.post.spacingSeconds) {
        console.log(`    ${cfg.post.spacingSeconds}s ruk rahe hain`);
        await sleep(cfg.post.spacingSeconds * 1000);
      }
    } catch (e) {
      console.error(`    ✗ ${e.message.split('\n')[0]}`);
      if (requeue(entry)) console.log('    wapas qatar mein — baad mein dobara');
    }
  }

  if (made.length && !post) {
    console.log(`\n  ${made.length} tayyar — ${cfg.dirs.out}`);
    if (open) spawn('open', [cfg.dirs.out], { stdio: 'ignore', detached: true }).unref();
  }
}

/* --------------------------------------------------------- main */
const commands = {
  demo,
  run:    () => runOnce({ post: flag('post'), open: flag('open') }),
  review: () => runOnce({ post: false, open: true }),
  check:  async () => {
    console.log(JSON.stringify(await whoami(), null, 2));
    console.log(`qatar mein ${readQueue().length} posts tayyar, aaj ${postsToday()} ja chukin`);
  },
  watch: async () => {
    const mins = Number(opt('every', 20));
    console.log(`watch mode — har ${mins} min. Ctrl+C se band karo.`);
    for (;;) {
      await runOnce({ post: flag('post'), open: false }).catch(e => console.error('run fail:', e.message));
      await sleep(mins * 60_000);
    }
  },
};

const fn = commands[cmd];
if (!fn) {
  console.log('usage: node src/run.js <demo|run|review|watch|check> [--post] [--source rss|apify] [--template classic|overlay|band] [--max N] [--every MINUTES]');
  process.exit(1);
}

console.log(`\n▶ ${cmd}${flag('post') ? ' (LIVE — Facebook par post hoga)' : ' (dry-run)'}\n`);
try { await fn(); } finally { await closeBrowser(); }
console.log('\n done.\n');
