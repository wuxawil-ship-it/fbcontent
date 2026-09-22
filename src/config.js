import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Chhota .env loader — koi dependency nahi */
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k, d = '') => (process.env[k] ?? d).trim();
const num = (k, d) => Number(env(k, String(d))) || d;

export const cfg = {
  gemini:   { key: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL', 'gemini-3.6-flash') },
  rss:      { feeds: env('RSS_FEEDS').split(',').map(s => s.trim()).filter(Boolean) },
  apify:    { token: env('APIFY_TOKEN'), actor: env('APIFY_ACTOR', 'apify~facebook-posts-scraper'),
              pageUrl: env('APIFY_PAGE_URL') },
  fb:       { pageId: env('FB_PAGE_ID'), token: env('FB_PAGE_TOKEN'), version: env('FB_API_VERSION', 'v23.0') },
  card:     { template: env('CARD_TEMPLATE', 'classic'), width: num('CARD_WIDTH', 1080),
              height: num('CARD_HEIGHT', 1350), brand: env('BRAND_HANDLE', ''),
              accent: env('BRAND_ACCENT', '#31D6E8'), inset: env('CARD_INSET', '1') !== '0' },
  post:     { language: env('POST_LANGUAGE', 'English') },
  maxPerRun: num('MAX_PER_RUN', 1),
  dirs: { out: path.join(ROOT, 'out'), tmp: path.join(ROOT, 'tmp'), data: path.join(ROOT, 'data') },
};

for (const d of Object.values(cfg.dirs)) fs.mkdirSync(d, { recursive: true });

export function need(value, name) {
  if (!value) throw new Error(`Missing config: ${name} — .env mein set karo (dekho .env.example)`);
  return value;
}
