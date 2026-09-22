/* fonts/*.ttf ko base64 CSS mein badalta hai taake Puppeteer offline bhi
   bilkul same font render kare (file:// se font load Chrome block kar deta hai). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACES = [[800, 'Montserrat-ExtraBold.ttf'], [900, 'Montserrat-Black.ttf']];

const css = FACES.map(([weight, file]) => {
  const b64 = fs.readFileSync(path.join(ROOT, 'fonts', file)).toString('base64');
  return `@font-face{font-family:'Mont';font-style:normal;font-weight:${weight};font-display:block;` +
         `src:url(data:font/ttf;base64,${b64}) format('truetype')}`;
}).join('\n');

const out = path.join(ROOT, 'templates', 'fonts.css');
fs.writeFileSync(out, `/* auto-generated: node scripts/build-fonts.mjs */\n${css}`);
console.log(`fonts.css → ${Math.round(fs.statSync(out).size / 1024)} KB`);
