import fs from 'node:fs/promises';
import { cfg, need } from './config.js';

const COLORS = ['white', 'accent', 'red'];
const FOCUS = ['left', 'center', 'right', 'top', 'bottom'];

/* Gemini ka Schema ek protobuf hai — type ke naam UPPERCASE enum names hain,
   lowercase bhejne par request reject ho sakti hai. */
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    usable:   { type: 'BOOLEAN' },
    reason:   { type: 'STRING' },
    kicker:   { type: 'STRING' },
    headline: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          t: { type: 'STRING' },
          c: { type: 'STRING', format: 'enum', enum: COLORS },
        },
        required: ['t', 'c'],
        propertyOrdering: ['t', 'c'],
      },
    },
    /* array is liye ke model \n\n daalna bhool jata hai — wall of text ban jati thi */
    caption:  { type: 'ARRAY', items: { type: 'STRING' } },
    /* khaali string bhi theek — har khabar mein punchline nahi hoti */
    punchline: { type: 'STRING' },
    focus:    { type: 'STRING', format: 'enum', enum: FOCUS },
  },
  required: ['usable', 'headline', 'caption', 'kicker', 'focus', 'punchline'],
  propertyOrdering: ['usable', 'reason', 'kicker', 'headline', 'punchline', 'caption', 'focus'],
};

const LANG = cfg.post.language;

const SYSTEM = `Tum ek news page ke editor ho. Tumhe raw news diya jayega; tumhara kaam:

1. FACTS lo, alfaaz nahi. Headline aur caption BILKUL apne words mein likho — source ka
   wording copy mat karo. Sirf woh dawe likho jo source mein maujood hain; kuch add mat karo.
2. headline: 9-15 words, UPPERCASE mein render hoga (tum normal case bhejo). Poori khabar
   ek saans mein. Clickbait nahi, sensational nahi.
3. headline ko segments mein todo. RANG BOHAT KAM istemal karo — poori headline
   rangeen nahi honi chahiye, warna sasti lagti hai:
   - "white"  = DEFAULT. headline ka kam se kam 70% white hona chahiye.
   - "accent" = sirf EK sab se ahem phrase (2-4 words). Yeh brand color hai.
   - "red"    = sirf tab jab khabar waqai sangeen ho (jang, maut, hamla, pabandi,
                warrant, ban). Aam khabar mein red bilkul mat lagao.
   Poore headline mein ZYADA SE ZYADA 2 colored segments — aksar sirf 1 kaafi hai.
   Segments jodne par exactly original headline banni chahiye.
4. kicker: 1-2 word category, e.g. "World", "Pakistan", "Markets", "Tech".
5. focus: tasveer mein asal subject (banda/cheez) kahan hai — left/center/right/top/bottom.
   Card tasveer ko crop karta hai, is liye yeh theek batao warna chehra kat jata hai.
6. punchline: card par red box mein ek chhoti teekhi line (zyada se zyada 8 words).
   SIRF tab likho jab khabar mein koi asli tazad ya munafiqat ho jo FACTS se sabit ho —
   jaise "Rules for thee, but not for me." Har khabar mein aisi baat nahi hoti;
   na ho to khaali string "" bhejo. Jhoothi ya bina saboot wali baat kabhi nahi.

7. caption: paragraphs ka ARRAY — har element ek paragraph. 3 se 5 elements.
   Har paragraph 2-4 jumlon ka. Ek hi lamba element MAT bhejo.
   - para 1 = kya hua (facts, numbers, naam)
   - para 2 = background / context — pehle kya hua tha, yeh ahem kyun hai
   - para 3 = dono taraf ka moaqif, agar hai
   - aakhri para = is ka matlab kya hai (sober analysis, hawa mein baat nahi)
   Neutral tone — facts sansani-khez nahi banao.
   - Aakhri paragraph ke aakhir mein **ek sawal** jo log comments mein jawab dena chahen.
     Sawal khabar se juda ho, bharti ka na ho.
   - 1-3 emoji tak istemal kar sakte ho jahan waqai fit hon (🚨 breaking, 📉 giravat,
     ⚖️ adalat, 🌍 duniya). Har paragraph par emoji MAT lagao, sasta lagta hai.
   - Max 3 hashtags aakhir mein.
   Agar source text chhota hai to bhi context apni maloomat se bharo, lekin
   koi aisa FACT mat likho jo source mein nahi hai — general background theek hai.
8. usable=false karo agar: khabar clear nahi, ya sirf opinion/rumour hai, ya headline
   banane ke liye kaafi facts nahi. Tab reason bhi likho.

OUTPUT LANGUAGE — sab se ahem:
Ye hidayaat Roman Urdu mein hain, LEKIN tumhara output us zubaan mein NAHI hona.
kicker, headline aur caption teeno **${LANG}** mein likho. Hidayaat ki zubaan
output mein bilkul nahi aani chahiye.

Sirf JSON return karo.`;


/* Free tier par har model ka apna kota hai: 20 requests/din/model.
   Is liye:
   - 429 (kota khatam) par usi model ko dobara try karna bekaar hai — agle model par jao
   - 503/500 (server par load) par thori der baad usi model ko dobara try karo
   Models ki list GEMINI_MODELS se aati hai. */
const OVERLOADED = new Set([408, 500, 502, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tryModel(model, body, tries) {
  let last;
  for (let i = 1; i <= tries; i++) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.gemini.key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      last = new Error(`network: ${e.message}`);
      if (i === tries) break;
      await sleep(2000 * i);
      continue;
    }

    if (res.ok) return { ok: true, json: await res.json() };

    const text = (await res.text()).slice(0, 200);
    last = new Error(`${res.status} ${text.replace(/\s+/g, ' ').slice(0, 90)}`);

    if (res.status === 429) return { ok: false, quota: true, error: last };
    if (!OVERLOADED.has(res.status) || i === tries) break;

    const wait = 2000 * 2 ** (i - 1) + Math.random() * 500;
    console.warn(`    ${model}: ${res.status}, ${Math.round(wait / 1000)}s baad dobara`);
    await sleep(wait);
  }
  return { ok: false, error: last };
}

async function callGemini(body) {
  let last;
  for (const model of cfg.gemini.models) {
    const r = await tryModel(model, body, 2);
    if (r.ok) return r.json;
    last = r.error;
    console.warn(`    ${model}: ${r.quota ? 'kota khatam' : 'nahi chala'} — agla model`);
  }
  throw new Error(`koi Gemini model nahi chala. Aakhri: ${last?.message}`);
}

export async function buildPost({ text, imagePath, imageUrl }) {
  need(cfg.gemini.key, 'GEMINI_API_KEY');

  const parts = [{ text: `SOURCE NEWS:\n\n${text || '(no text — image se parho)'}` }];

  /* Agar image hai to Gemini usay padh bhi lega (OCR) aur context bhi samjhega */
  if (imagePath || imageUrl) {
    const buf = imagePath
      ? await fs.readFile(imagePath)
      : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } });
    parts.push({ text: 'Image mein jo text hai woh bhi padho, lekin us ka wording copy mat karna.' });
  }

  const json = await callGemini({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.6, responseMimeType: 'application/json', responseSchema: SCHEMA },
  });
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Gemini ne khaali jawab diya: ' + JSON.stringify(json).slice(0, 300));

  const out = JSON.parse(raw);
  out.headline = (out.headline || [])
    .filter(s => s?.t?.trim())
    .map(s => ({ t: s.t.trim(), c: COLORS.includes(s.c) ? s.c : 'white' }));

  /* Model kabhi kabhi rule bhool jata hai — yahan zabardasti 2 tak limit karo */
  let colored = 0;
  out.headline = out.headline.map(seg =>
    seg.c !== 'white' && ++colored > 2 ? { ...seg, c: 'white' } : seg);

  out.focus = FOCUS.includes(out.focus) ? out.focus : 'center';
  out.punchline = String(out.punchline || '').trim().slice(0, 70);

  /* array -> text. Model kabhi string bhi bhej deta hai, dono handle karo. */
  const paras = Array.isArray(out.caption) ? out.caption : String(out.caption || '').split(/\n{2,}/);
  out.caption = paras.map(p => String(p).trim()).filter(Boolean).join('\n\n');
  return out;
}
