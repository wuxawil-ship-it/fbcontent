import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, cfg } from './config.js';
import { renderCard, closeBrowser } from './render.js';
import { buildPost } from './ai.js';
import { fetchImageSet } from './image.js';
import { pickSource, fetchArticleMeta } from './sources.js';
import { publishPhoto, whoami } from './facebook.js';
import { isSeen, markSeen, lastPostedAt, postsToday, cleanup } from './store.js';

const args = process.argv.slice(2);
const cmd = args[0] || 'demo';
const flag = n => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };

const slug = s => (s || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

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
    focus: 'center', accent: cfg.card.accent,
    kicker: 'World', brand: cfg.card.brand || '@safucrypto', footer: 'Source: Reuters',
  };
  for (const template of ['classic', 'overlay', 'band']) {
    const out = path.join(cfg.dirs.out, `demo-${template}.jpg`);
    const r = await renderCard({ ...data, template }, out);
    console.log(`  ✓ ${template.padEnd(8)} ${r.file}  (font ${r.fontSize}px)`);
  }
}

/* ---------------------------------------------------------- one pass */
async function runOnce({ post, open }) {
  const made = [];

  const wiped = cleanup();
  if (wiped) console.log(`  ${wiped} purani files saaf kin`);

  /* Din bhar mein POSTS_PER_DAY posts, barabar phaili hui.
     Check har 30 min hota hai lekin post tab hi jab pace ijazat de. */
  if (post) {
    const target = cfg.post.perDay;
    const done = postsToday();
    if (done >= target) {
      console.log(`  aaj ki ${target} posts poori ho chukin — kal phir`);
      return;
    }

    const now = new Date();
    const endOfDay = new Date(now).setHours(23, 59, 59, 999);
    const minsLeft = Math.max(1, (endOfDay - now) / 60_000);
    const pace = Math.max(cfg.post.minGapMinutes, minsLeft / (target - done));
    const since = (Date.now() - lastPostedAt()) / 60_000;

    if (since < pace) {
      console.log(`  aaj ${done}/${target} — agli post ${Math.round(pace - since)} min baad ` +
                  `(har ~${Math.round(pace)} min ka pace)`);
      return;
    }
    console.log(`  aaj ${done}/${target} posts — pace theek hai, aage barhte hain`);
  }
  const items = await pickSource(opt('source'))();
  console.log(`  ${items.length} items mile`);

  /* Kuch mauzu zyada chalte hain (Trump/US politics). Jin khabron mein ye
     keywords hon unhe pehle uthao — baqi phir bhi qatar mein rehti hain. */
  const score = i => {
    const hay = `${i.title} ${i.text}`.toLowerCase();
    return cfg.post.priority.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0);
  };

  const unseen = items.filter(i => !isSeen(i));
  if (cfg.post.priority.length) unseen.sort((a, b) => score(b) - score(a));

  const fresh = unseen.slice(0, Number(opt('max', cfg.maxPerRun)));
  if (fresh.length && cfg.post.priority.length) {
    const s0 = score(fresh[0]);
    if (s0) console.log(`  priority match (${s0} keyword) — ye khabar pehle`);
  }
  if (!fresh.length) return console.log('  kuch naya nahi.');

  for (const item of fresh) {
    console.log(`\n  → ${item.title}`);
    try {
      /* article pehle: us se poora text bhi milta hai aur og:image bhi */
      const art = await fetchArticleMeta(item.link);
      if (art.text) console.log(`    article: ${art.text.length} chars`);

      /* Feed ki image pehle: og:image par aksar publisher ka logo baked hota hai
         (Guardian ka "The Guardian" box), jo hamare card par bura lagta hai.
         og:image sirf tab jab feed koi image de hi na (jaise DW). */
      const want = cfg.card.inset ? 2 : 1;
      let pics = await fetchImageSet(item.images, { max: want });
      if (!pics.length && art.image) {
        console.log('    feed mein image nahi — article ki og:image use ho rahi hai');
        pics = await fetchImageSet([art.image], { max: want });
      }
      if (!pics.length) { console.log('    skip: koi chalne wali image nahi mili'); continue; }
      const [pic, second] = pics;
      console.log(`    image: ${pic.w}x${pic.h}${second ? ` (+inset ${second.w}x${second.h})` : ''}`);

      const text = art.text.length > item.text.length ? `${item.title}\n\n${art.text}` : item.text;

      const ai = await buildPost({ text, imagePath: pic.file });
      if (!ai.usable) { console.log(`    skip: ${ai.reason}`); markSeen(item, { skipped: ai.reason }); continue; }

      const file = path.join(cfg.dirs.out, `${stamp()}-${slug(item.title)}.jpg`);
      const card = await renderCard({
        template: opt('template', cfg.card.template),
        headline: ai.headline, punchline: ai.punchline, images: [pic.file],
        inset: second ? { image: second.file, ring: 'white' } : null,
        focus: ai.focus, accent: cfg.card.accent,
        kicker: ai.kicker, brand: cfg.card.brand,
        footer: item.source ? `Source: ${item.source}` : '',
      }, file);
      console.log(`    card: ${card.file}`);

      const caption = [ai.caption, item.link && `\nSource: ${item.link}`].filter(Boolean).join('\n');

      if (!post) {
        /* caption ko card ke saath .txt mein likho — manual posting ke liye copy karna asaan */
        const txt = card.file.replace(/\.jpg$/, '.txt');
        await fs.writeFile(txt, caption, 'utf8');
        console.log(`    caption: ${path.basename(txt)}`);
        console.log(caption.split('\n').map(l => '    │ ' + l).join('\n'));
        made.push({ image: card.file, caption: txt, title: item.title });
        continue; /* dry-run mein seen mark nahi karte, taake dobara try ho sake */
      }

      const res = await publishPhoto({ imagePath: card.file, caption });
      console.log(`    ✓ posted: ${res.url}`);
      markSeen(item, { posted: res.id });
    } catch (e) {
      console.error(`    ✗ ${e.message}`);
    }
  }

  if (made.length && !post) {
    console.log(`\n  ${made.length} post tayyar — ${cfg.dirs.out}`);
    made.forEach((m, i) => console.log(`    ${i + 1}. ${path.basename(m.image)}`));
    if (open) spawn('open', [cfg.dirs.out], { stdio: 'ignore', detached: true }).unref();
  }
}

/* ---------------------------------------------------------- main */
const commands = {
  demo,
  run:    () => runOnce({ post: flag('post'), open: flag('open') }),
  review: () => runOnce({ post: false, open: true }),
  check: async () => console.log(JSON.stringify(await whoami(), null, 2)),
  watch: async () => {
    const mins = Number(opt('every', 20));
    console.log(`watch mode — har ${mins} min. Ctrl+C se band karo.`);
    for (;;) {
      await runOnce({ post: flag('post'), open: false }).catch(e => console.error('run fail:', e.message));
      await new Promise(r => setTimeout(r, mins * 60_000));
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
