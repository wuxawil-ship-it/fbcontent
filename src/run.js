import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, cfg } from './config.js';
import { renderCard, closeBrowser } from './render.js';
import { buildPosts } from './ai.js';
import { fetchImageSet } from './image.js';
import { pickSource, fetchArticleMeta, ageHours } from './sources.js';
import { publishPhoto, whoami } from './facebook.js';
import { isSeen, markSeen, lastPostedAt, postsToday, totalPosted, cleanup } from './store.js';
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
    kicker: 'World',
    brand: cfg.card.footer ? (cfg.card.brand || '@safucrypto') : '',
    footer: cfg.card.footer ? 'Source: Reuters' : false,
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

  /* Taza khabar sab se ahem hai — purani khabar achi bhi ho to bekaar hai. */
  const fresh = items.filter(i => !isSeen(i) && ageHours(i.publishedAt) <= cfg.post.maxAgeHours);
  console.log(`  ${fresh.length} taza (${cfg.post.maxAgeHours}h se nayi)`);

  /* Rank: nayi pehle, magar mauzu match har keyword par ~1.5 ghante ki chhoot deta hai */
  const rank = i => {
    const hay = `${i.title} ${i.text}`.toLowerCase();
    const hits = cfg.post.priority.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0);
    return hits * 1.5 - ageHours(i.publishedAt);
  };
  fresh.sort((a, b) => rank(b) - rank(a));

  const picked = fresh.slice(0, need);
  if (!picked.length) return console.log('  koi nayi taza khabar nahi');
  console.log(`  sab se nayi: ${ageHours(picked[0].publishedAt).toFixed(1)}h purani`);

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
      publishedAt: item.publishedAt,
      images: item.images, headline: ai.headline, punchline: ai.punchline,
      caption: ai.caption, kicker: ai.kicker, focus: ai.focus,
    });
    markSeen(item, { queued: true });
  });

  if (ready.length) console.log(`  ✓ ${pushQueue(ready)} posts qatar mein tayyar`);
}

/* Har post ek jaisi na lage — bari bari se shakal badalti hai.
   punch = laal box wali line, inset = upar gol tasveer. */
const LOOKS = [
  { template: 'classic', punch: false, inset: false },
  { template: 'classic', punch: true,  inset: false },
  { template: 'overlay', punch: false, inset: true  },
  { template: 'classic', punch: false, inset: true  },
  { template: 'band',    punch: false, inset: false },
  { template: 'overlay', punch: true,  inset: false },
];

/* ------------------------------------------------- qatar se post */
async function publishOne(entry, { post }) {
  const age = ageHours(entry.publishedAt);
  if (post && age > cfg.post.maxAgeHours) {
    console.log(`\n  ⊘ basi (${age.toFixed(1)}h) — chhor rahe hain: ${entry.title.slice(0, 50)}`);
    markSeen(entry, { stale: true });
    return null;
  }
  console.log(`\n  → ${entry.title}  (${age.toFixed(1)}h purani)`);

  /* is post ki shakl — pichli posts se alag */
  const look = LOOKS[totalPosted() % LOOKS.length];
  const useInset = look.inset && cfg.card.inset;
  console.log(`    look: ${look.template}${look.punch ? ' + box' : ''}${useInset ? ' + circle' : ''}`);

  const pics = await fetchImageSet(entry.images, { max: useInset ? 2 : 1 });
  if (!pics.length) { console.log('    koi chalne wali image nahi — chhor rahe hain'); return null; }
  const [pic, second] = pics;
  console.log(`    image: ${pic.w}x${pic.h}`);

  const file = path.join(cfg.dirs.out, `${stamp()}-${slug(entry.title)}.jpg`);
  const card = await renderCard({
    template: opt('template', look.template),
    headline: entry.headline,
    punchline: look.punch ? entry.punchline : '',
    images: [pic.file],
    inset: (useInset && second) ? { image: second.file, ring: 'white' } : null,
    focus: entry.focus, accent: cfg.card.accent, texture: cfg.card.texture,
    kicker: entry.kicker,
    brand: cfg.card.footer ? cfg.card.brand : '',
    footer: cfg.card.footer ? (entry.source ? `Source: ${entry.source}` : '') : false,
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
    /* POSTS_PER_DAY ab hadaf nahi, sirf oopri had hai. Number poora karne ke liye
       purani khabar post karna faida nahi deta — jitni taza khabrein hon utni hi. */
    const cap = cfg.post.perDay;
    const done = postsToday();
    if (done >= cap) return console.log(`  aaj ki had (${cap}) poori — kal phir`);

    const since = (Date.now() - lastPostedAt()) / 60_000;
    if (since < cfg.post.minGapMinutes) {
      return console.log(`  aakhri post ${Math.round(since)} min pehle — ` +
                         `${Math.round(cfg.post.minGapMinutes - since)} min aur`);
    }
    want = Math.min(cfg.maxPerRun, cap - done);
    console.log(`  aaj ${done}/${cap} (had) — is run mein ${want} tak`);
  }

  /* qatar khaali ho rahi ho to ek batch call se bhar lo */
  const queued = readQueue().length;
  console.log(`  qatar mein ${queued} tayyar`);
  if (queued < want + cfg.post.queueFloor) {
    try { await refill(cfg.post.batchSize); }
    catch (e) { console.error(`  refill fail: ${e.message.split('\n')[0]}`); }
  }

  /* Breaking news ka jhund aa jaye to ek run mein zyada — lekin sirf bohat taza par */
  if (post && want === 1) {
    const hot = readQueue().filter(e => ageHours(e.publishedAt) <= cfg.post.burstHours).length;
    if (hot > 1) {
      want = Math.min(cfg.post.catchupMax, hot);
      console.log(`  ${hot} bohat taza khabrein qatar mein — is run mein ${want}`);
    }
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
