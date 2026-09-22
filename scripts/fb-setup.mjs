/**
 * Page token setup — ek dafa chalao, phir bhoolo.
 *
 * Graph API Explorer ka token 1-2 ghante ka hota hai. Ye script usay
 * long-lived user token mein badalti hai, phir us se page token nikalti hai.
 * Page token jo long-lived user token se bane wo EXPIRE NAHI HOTA —
 * yani har 60 din baad ye sab dobara nahi karna parega.
 *
 * .env mein ye teen cheezein daal kar chalao:
 *   FB_APP_ID=        (App dashboard -> Settings -> Basic)
 *   FB_APP_SECRET=    (wahi jagah, "Show" dabao)
 *   FB_USER_TOKEN=    (Graph API Explorer ka User Token)
 *
 * chalao:  node scripts/fb-setup.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, need } from '../src/config.js';

const V = cfg.fb.version;
const api = p => `https://graph.facebook.com/${V}/${p}`;

async function get(url, what) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`${what} — Facebook: ${json.error?.message || res.status}`);
  }
  return json;
}

const appId     = need(process.env.FB_APP_ID, 'FB_APP_ID');
const appSecret = need(process.env.FB_APP_SECRET, 'FB_APP_SECRET');
const userToken = need(process.env.FB_USER_TOKEN, 'FB_USER_TOKEN');

console.log('\n1/3  short-lived token ko long-lived bana rahe hain...');
const long = await get(api('oauth/access_token') +
  `?grant_type=fb_exchange_token&client_id=${appId}` +
  `&client_secret=${encodeURIComponent(appSecret)}` +
  `&fb_exchange_token=${encodeURIComponent(userToken)}`, 'token exchange');
console.log('     ho gaya');

console.log('2/3  aapke pages dhoond rahe hain...');
const longUserToken = long.access_token;

let { data: pages = [] } = await get(
  api('me/accounts') + `?fields=id,name,access_token&access_token=${encodeURIComponent(longUserToken)}`,
  'pages list');

/* Business portfolio ke owned pages aksar me/accounts mein nahi aate, lekin
   page se seedha access_token maangne par mil jata hai. */
if (!pages.length && cfg.fb.pageId) {
  console.log('     me/accounts khaali — page se seedha token maang rahe hain...');
  const direct = await get(
    api(cfg.fb.pageId) + `?fields=id,name,access_token&access_token=${encodeURIComponent(longUserToken)}`,
    'page token').catch(e => { console.error(`     ${e.message}`); return null; });
  if (direct?.access_token) pages = [direct];
}

if (!pages.length) {
  console.error('\n  Koi page nahi mila.');
  console.error('  - .env mein FB_PAGE_ID sahi hai? (abhi: ' + (cfg.fb.pageId || 'khaali') + ')');
  console.error('  - Graph API Explorer mein token banate waqt page tick kiya tha?');
  console.error('  - Aap us page ke admin hain?\n');
  process.exit(1);
}

/* page chuno: naam se, warna pehla */
const want = (process.argv[2] || process.env.FB_PAGE_NAME || '').toLowerCase();
const page = want ? pages.find(p => p.name.toLowerCase().includes(want)) : pages[0];

if (!page) {
  console.error(`\n  "${process.argv[2]}" naam ka page nahi mila. Jo mile:`);
  pages.forEach(p => console.error(`    - ${p.name}`));
  process.exit(1);
}

if (pages.length > 1 && !want) {
  console.log(`     ${pages.length} pages mile, pehla chun liya. Kisi aur ke liye:`);
  console.log(`     node scripts/fb-setup.mjs "<page ka naam>"`);
  pages.forEach(p => console.log(`       - ${p.name}`));
}

console.log(`3/3  .env mein likh rahe hain — page: ${page.name} (${page.id})`);

/* .env update — sirf ye do lines, baqi file waise hi rehti hai */
const envPath = path.join(ROOT, '.env');
fs.copyFileSync(envPath, envPath + '.bak');

let env = fs.readFileSync(envPath, 'utf8');
for (const [k, v] of [['FB_PAGE_ID', page.id], ['FB_PAGE_TOKEN', page.access_token]]) {
  env = new RegExp(`^${k}=.*$`, 'm').test(env)
    ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`)
    : env + `\n${k}=${v}\n`;
}
fs.writeFileSync(envPath, env, { mode: 0o600 });

/* page token expire hota hai ya nahi, ye tasdeeq karo */
const info = await get(api('debug_token') +
  `?input_token=${encodeURIComponent(page.access_token)}&access_token=${appId}|${appSecret}`,
  'token check').catch(() => null);
const exp = info?.data?.expires_at;

console.log(`\n  ✓ .env update ho gaya (purani copy .env.bak mein)`);
console.log(`  ✓ page   : ${page.name}`);
console.log(`  ✓ scopes : ${info?.data?.scopes?.join(', ') || 'unknown'}`);
console.log(`  ✓ expiry : ${!exp ? 'kabhi nahi — dobara setup nahi karna parega' : new Date(exp * 1000).toDateString()}`);
console.log(`\n  Ab FB_USER_TOKEN, FB_APP_SECRET .env se hata sakte ho — ab zaroorat nahi.\n`);
