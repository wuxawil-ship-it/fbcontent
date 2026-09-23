import fs from 'node:fs/promises';
import path from 'node:path';
import { cfg, need } from './config.js';

const api = p => `https://graph.facebook.com/${cfg.fb.version}/${p}`;

async function gql(url, init) {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    const err = new Error(`Facebook ${res.status} ${e.type || ''} (${e.code ?? '?'}): ${e.message || 'unknown'}`);
    /* 190 = token expire/invalid, 200 = app ko ijazat nahi.
       Ye khud theek nahi hote — insaan ko dobara authorize karna parta hai. */
    err.authProblem = [190, 200, 102].includes(e.code);
    throw err;
  }
  return json;
}

/** Card image + caption ko Page par publish karta hai */
export async function publishPhoto({ imagePath, caption, pageId = cfg.fb.pageId, token = cfg.fb.token }) {
  need(pageId, 'FB_PAGE_ID');
  need(token, 'FB_PAGE_TOKEN');

  const form = new FormData();
  form.set('caption', caption ?? '');
  form.set('access_token', token);
  form.set('source', new Blob([await fs.readFile(imagePath)], { type: 'image/jpeg' }), path.basename(imagePath));

  const out = await gql(api(`${pageId}/photos`), { method: 'POST', body: form });
  return { id: out.post_id || out.id, url: `https://facebook.com/${out.post_id || out.id}` };
}

/** Token sahi hai ya nahi, aur kis page ka hai — setup ke waqt check karo */
export async function whoami({ pageId = cfg.fb.pageId, token = cfg.fb.token } = {}) {
  const me = await gql(api(`${need(pageId, 'FB_PAGE_ID')}?fields=name,id&access_token=${need(token, 'FB_PAGE_TOKEN')}`));
  const perms = await gql(api(`debug_token?input_token=${token}&access_token=${token}`)).catch(() => null);
  return { page: me, scopes: perms?.data?.scopes, expiresAt: perms?.data?.expires_at };
}
