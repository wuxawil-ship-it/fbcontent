import fs from 'node:fs/promises';
import { cfg, need } from './config.js';

const COLORS = ['white', 'lime', 'cyan', 'red', 'amber'];

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
    caption:  { type: 'STRING' },
  },
  required: ['usable', 'headline', 'caption', 'kicker'],
  propertyOrdering: ['usable', 'reason', 'kicker', 'headline', 'caption'],
};

const SYSTEM = `Tum ek news page ke editor ho. Tumhe raw news diya jayega; tumhara kaam:

1. FACTS lo, alfaaz nahi. Headline aur caption BILKUL apne words mein likho — source ka
   wording copy mat karo. Sirf woh dawe likho jo source mein maujood hain; kuch add mat karo.
2. headline: 9-15 words, UPPERCASE mein render hoga (tum normal case bhejo). Poori khabar
   ek saans mein. Clickbait nahi, sensational nahi.
3. headline ko segments mein todo. Har segment ka color:
   - "white" = normal text (kam se kam 55% segments white hone chahiye)
   - "lime"  = action / main verb phrase
   - "cyan"  = institution, country ya proper noun
   - "red"   = sirf serious/negative cheez (warrant, sanction, strike, ban, death)
   - "amber" = numbers, dates, amounts
   Segments ko jodne par exactly original headline banni chahiye, aur 2-4 se zyada
   colored segments mat banao.
4. kicker: 1-2 word category, e.g. "World", "Pakistan", "Markets", "Tech".
5. caption: Facebook post ka text. 3-5 chhote paragraphs. Pehla para = kya hua.
   Doosra = zaroori background/context. Aakhri = is ka matlab kya hai (analysis).
   Neutral, sober tone. Koi hashtag spam nahi, max 3 hashtags aakhir mein.
   Agar dono taraf ka moaqif hai to dono likho.
6. usable=false karo agar: khabar clear nahi, ya sirf opinion/rumour hai, ya headline
   banane ke liye kaafi facts nahi. Tab reason bhi likho.

Sirf JSON return karo.`;

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.gemini.model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.gemini.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.6, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Gemini ne khaali jawab diya: ' + JSON.stringify(json).slice(0, 300));

  const out = JSON.parse(raw);
  out.headline = (out.headline || [])
    .filter(s => s?.t?.trim())
    .map(s => ({ t: s.t.trim(), c: COLORS.includes(s.c) ? s.c : 'white' }));
  return out;
}
