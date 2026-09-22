import { cfg, need } from './config.js';

const decode = s => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

const strip = s => decode(String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : '';
};

/* decode zaroori hai: feeds URLs mein &amp; likhte hain, jis se signed URLs toot jate hain */
const attr = (xml, re) => { const m = xml.match(re); return m ? decode(m[1]) : ''; };

/* Feeds aksar ek hi tasveer ke kai sizes dete hain (Guardian: 140/460/700px).
   Sab jama karke width ke hisaab se bari se chhoti sort karo. */
function imageCandidates(block) {
  const found = [];
  const push = (url, w) => { if (url && /^https?:/.test(url)) found.push({ url, w: Number(w) || 0 }); };

  for (const m of block.matchAll(/<media:(?:content|thumbnail)[^>]*>/gi)) {
    push(attr(m[0], /url="([^"]+)"/i), attr(m[0], /width="(\d+)"/i));
  }
  for (const m of block.matchAll(/<enclosure[^>]*>/gi)) {
    const t = attr(m[0], /type="([^"]*)"/i);
    if (!t || t.startsWith('image/')) push(attr(m[0], /url="([^"]+)"/i), 0);
  }
  for (const m of block.matchAll(/<img[^>]*>/gi)) {
    push(attr(m[0], /src="([^"]+)"/i), attr(m[0], /width="(\d+)"/i));
  }

  return [...new Map(found.sort((a, b) => b.w - a.w).map(i => [i.url, i])).values()].map(i => i.url);
}

/** RSS / Atom feeds — sab se stable source, koi ToS masla nahi */
export async function fromRss(feeds = cfg.rss.feeds) {
  need(feeds.length, 'RSS_FEEDS');
  const items = [];
  for (const feed of feeds) {
    try {
      const xml = await (await fetch(feed, { headers: { 'user-agent': 'newscard/1.0' } })).text();
      const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) || [];
      for (const b of blocks.slice(0, 12)) {
        const link = tag(b, 'link') || attr(b, /<link[^>]*href="([^"]+)"/i);
        items.push({
          id: tag(b, 'guid') || link,
          title: tag(b, 'title'),
          text: [tag(b, 'title'), tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')]
            .filter(Boolean).join('\n\n'),
          link,
          images: imageCandidates(b),
          publishedAt: tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published'),
          source: new URL(feed).hostname.replace(/^www\./, ''),
        });
      }
    } catch (e) { console.warn(`  ! feed fail ${feed}: ${e.message}`); }
  }
  return items.filter(i => i.id && i.title);
}

/** Apify actor — tumhare existing scraper ke liye */
export async function fromApify({ actor = cfg.apify.actor, token = cfg.apify.token, input } = {}) {
  need(token, 'APIFY_TOKEN');
  const body = input ?? { startUrls: [{ url: need(cfg.apify.pageUrl, 'APIFY_PAGE_URL') }], resultsLimit: 5 };
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);

  return (await res.json()).map(p => ({
    id: p.postId || p.id || p.url,
    title: (p.text || '').split('\n')[0].slice(0, 160),
    text: p.text || p.message || '',
    link: p.url || p.postUrl || '',
    images: [p.media?.[0]?.photo_image?.uri || p.imageUrl || p.thumbnailUrl].filter(Boolean),
    publishedAt: p.time || p.timestamp || '',
    source: 'facebook',
  })).filter(i => i.id && i.text);
}

export function pickSource(name) {
  if (name === 'apify') return fromApify;
  if (name === 'rss') return fromRss;
  return cfg.apify.token && cfg.apify.pageUrl ? fromApify : fromRss;
}
