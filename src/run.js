import path from 'node:path';
import { ROOT, cfg } from './config.js';
import { renderCard, closeBrowser } from './render.js';
import { buildPost } from './ai.js';
import { fetchBestImage } from './image.js';
import { pickSource } from './sources.js';
import { publishPhoto, whoami } from './facebook.js';
import { isSeen, markSeen } from './store.js';

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
      { t: 'US prepares', c: 'lime' }, { t: 'to sanction the', c: 'white' },
      { t: 'International Criminal Court', c: 'cyan' }, { t: 'following', c: 'white' },
      { t: 'previously', c: 'lime' }, { t: 'issued', c: 'white' },
      { t: 'arrest warrant', c: 'red' }, { t: 'for Israeli PM Netanyahu.', c: 'white' },
    ],
    images: [path.join(ROOT, 'assets/demo-a.jpg'), path.join(ROOT, 'assets/demo-b.jpg')],
    kicker: 'World', brand: cfg.card.brand || '@yourpage', footer: 'Source: Reuters',
  };
  for (const template of ['classic', 'overlay', 'band']) {
    const out = path.join(cfg.dirs.out, `demo-${template}.jpg`);
    const r = await renderCard({ ...data, template }, out);
    console.log(`  ✓ ${template.padEnd(8)} ${r.file}  (font ${r.fontSize}px)`);
  }
}

/* ---------------------------------------------------------- one pass */
async function runOnce({ post }) {
  const items = await pickSource(opt('source'))();
  console.log(`  ${items.length} items mile`);

  const fresh = items.filter(i => !isSeen(i)).slice(0, Number(opt('max', cfg.maxPerRun)));
  if (!fresh.length) return console.log('  kuch naya nahi.');

  for (const item of fresh) {
    console.log(`\n  → ${item.title}`);
    try {
      const pic = await fetchBestImage(item.images);
      if (!pic) { console.log('    skip: koi chalne wali image nahi mili'); continue; }
      console.log(`    image: ${pic.w}x${pic.h}`);

      const ai = await buildPost({ text: item.text, imagePath: pic.file });
      if (!ai.usable) { console.log(`    skip: ${ai.reason}`); markSeen(item, { skipped: ai.reason }); continue; }

      const file = path.join(cfg.dirs.out, `${stamp()}-${slug(item.title)}.jpg`);
      const card = await renderCard({
        template: opt('template', cfg.card.template),
        headline: ai.headline, images: [pic.file],
        kicker: ai.kicker, brand: cfg.card.brand,
        footer: item.source ? `Source: ${item.source}` : '',
      }, file);
      console.log(`    card: ${card.file}`);

      const caption = [ai.caption, item.link && `\nSource: ${item.link}`].filter(Boolean).join('\n');

      if (!post) {
        console.log(`    [dry-run] post nahi kiya. Caption:\n${caption.split('\n').map(l => '    │ ' + l).join('\n')}`);
        continue; /* dry-run mein seen mark nahi karte, taake dobara try ho sake */
      }

      const res = await publishPhoto({ imagePath: card.file, caption });
      console.log(`    ✓ posted: ${res.url}`);
      markSeen(item, { posted: res.id });
    } catch (e) {
      console.error(`    ✗ ${e.message}`);
    }
  }
}

/* ---------------------------------------------------------- main */
const commands = {
  demo,
  run:   () => runOnce({ post: flag('post') }),
  check: async () => console.log(JSON.stringify(await whoami(), null, 2)),
  watch: async () => {
    const mins = Number(opt('every', 20));
    console.log(`watch mode — har ${mins} min. Ctrl+C se band karo.`);
    for (;;) {
      await runOnce({ post: flag('post') }).catch(e => console.error('run fail:', e.message));
      await new Promise(r => setTimeout(r, mins * 60_000));
    }
  },
};

const fn = commands[cmd];
if (!fn) {
  console.log('usage: node src/run.js <demo|run|watch|check> [--post] [--source rss|apify] [--template classic|overlay|band] [--max N] [--every MINUTES]');
  process.exit(1);
}

console.log(`\n▶ ${cmd}${flag('post') ? ' (LIVE — Facebook par post hoga)' : ' (dry-run)'}\n`);
try { await fn(); } finally { await closeBrowser(); }
console.log('\n done.\n');
