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


/* Feed hostname ko parhne laiq naam banao — "FEEDS.SKYNEWS.COM" card par bura lagta hai */
const OUTLETS = {
  'feeds.skynews.com': 'Sky News', 'news.sky.com': 'Sky News',
  'theguardian.com': 'The Guardian', 'rss.dw.com': 'DW',
  'feeds.bbci.co.uk': 'BBC News', 'bbc.co.uk': 'BBC News', 'bbc.com': 'BBC News',
  'reuters.com': 'Reuters', 'apnews.com': 'AP', 'aljazeera.com': 'Al Jazeera',
  'cnn.com': 'CNN', 'nytimes.com': 'The New York Times', 'ft.com': 'Financial Times',
};

export function outletName(host) {
  const h = String(host || '').replace(/^(www|feeds|rss|feed)\./, '');
  if (OUTLETS[host]) return OUTLETS[host];
  if (OUTLETS[h]) return OUTLETS[h];
  return h.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* RSS sirf 1-2 line deta hai aur kuch feeds (DW) tasveer deti hi nahi.
   Article page se poora text AUR og:image dono uthate hain — og:image aksar
   feed ki thumbnail se bari hoti hai. */
export async function fetchArticleMeta(url, { max = 4000 } = {}) {
  const empty = { text: '', image: '' };
  if (!url) return empty;

  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      /* kuch publishers (jaise Sky News) article pages par automated access block karte hain.
         Unhe bypass nahi karte — RSS summary par guzara hota hai. */
      console.warn(`    article ${res.status} (${new URL(url).hostname}) — RSS summary use hogi`);
      return empty;
    }

    let html = await res.text();

    const meta = prop => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
      const t = html.match(re)?.[0] || '';
      return attr(t, /content=["']([^"']+)["']/i);
    };
    const image = meta('og:image') || meta('twitter:image') || '';

    html = html.replace(/<(script|style|nav|footer|aside|form|figure)[\s\S]*?<\/\1>/gi, ' ');

    const paragraphs = block => [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => strip(m[1]))
      .filter(t => t.length > 60);          /* nav/caption/boilerplate chhoti hoti hain */

    /* <article>/<main> ka regex non-greedy hai, to pehla chhota teaser block match
       ho jata tha aur asal khabar chhoot jati thi. Isliye saare candidates dekh kar
       wo chunte hain jisme sab se zyada paragraphs hon. */
    const blocks = [
      ...html.matchAll(/<article[\s\S]*?<\/article>/gi),
      ...html.matchAll(/<main[\s\S]*?<\/main>/gi),
    ].map(m => m[0]);
    blocks.push(html);

    const best = blocks
      .map(b => paragraphs(b))
      .reduce((a, b) => (b.length > a.length ? b : a), []);

    return { text: best.join('\n\n').slice(0, max), image };
  } catch { return empty; }
}

/** purane call sites ke liye */
export const fetchArticleText = async (url, opts) => (await fetchArticleMeta(url, opts)).text;

/** RSS / Atom feeds — sab se stable source, koi ToS masla nahi */
export async function fromRss(feeds = cfg.rss.feeds) {
  need(feeds.length, 'RSS_FEEDS');
  const items = [];
  for (const feed of feeds) {
    try {
      const xml = await (await fetch(feed, { headers: { 'user-agent': 'newscard/1.0' } })).text();
      /* (?=[\s>]) zaroori hai: RDF feeds (DW) ke channel mein <items> hota hai,
         jo warna <item> samajh liya jata tha aur har khabar ka title "DW" aa raha tha */
      const blocks = xml.match(/<(item|entry)(?=[\s>])[\s\S]*?<\/\1>/gi) || [];
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
          source: outletName(new URL(feed).hostname),
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
