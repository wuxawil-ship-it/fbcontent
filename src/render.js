import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { ROOT, cfg } from './config.js';
import { fetchBestImage } from './image.js';

const TEMPLATES = ['classic', 'overlay', 'band'];
let browserPromise = null;

function browser() {
  browserPromise ??= puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--force-color-profile=srgb'],
  });
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) { (await browserPromise).close(); browserPromise = null; }
}

/* Local path, file:// ya http(s) — sab ko local file path bana deta hai */
async function resolveImage(src) {
  if (!src) return null;
  if (src.startsWith('file://')) return fileURLToPath(src);
  if (!/^https?:/i.test(src)) return src;
  return (await fetchBestImage([src], { minWidth: 0 }))?.file ?? null;
}

/**
 * @param {object} data  { template, headline:[{t,c}], images:[path|url], kicker, brand, footer, accent }
 * @param {string} outPath
 */
export async function renderCard(data, outPath) {
  const template = TEMPLATES.includes(data.template) ? data.template : 'classic';
  const width = data.width || cfg.card.width;
  const height = data.height || cfg.card.height;

  const images = [];
  for (const src of (data.images || []).slice(0, 2)) {
    try { const f = await resolveImage(src); if (f) images.push(pathToFileURL(f).href); }
    catch (e) { console.warn('  ! image skip:', e.message); }
  }

  const page = await (await browser()).newPage();
  try {
    await page.setViewport({ width: width + 48, height: height + 48, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(ROOT, 'templates', `${template}.html`)).href, { waitUntil: 'load' });
    const info = await page.evaluate(d => window.renderCard(d), { ...data, template, width, height, images });
    await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 15000 });

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await (await page.$('#card')).screenshot({ path: outPath, type: 'jpeg', quality: 92 });
    return { file: outPath, template, fontSize: info.fontSize };
  } finally {
    await page.close();
  }
}
