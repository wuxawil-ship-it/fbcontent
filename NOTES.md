# NOTES — fbcontent

Is project ke ahem points aur faisle. Har session ke baad yahan add hota rahega.
Zaroori nahi har entry lambi ho — sirf title bhi kaafi hai.

---

## Maqsad

Khabar khud-ba-khud uthao → apne style mein likho → news card banao → Facebook page par post karo.
Poora kaam code mein. Koi n8n / Make / Zapier / Bannerbear nahi.

---

## Brand

| cheez | value |
|---|---|
| handle | `@safucrypto` |
| accent color | `#31D6E8` (light blue) — `BRAND_ACCENT` se badal sakte ho |
| card size | 1080 × 1350 (FB feed ke liye best) |
| font | Montserrat ExtraBold / Black |

---

## Faisle

**2026-09-21 — Bannerbear/Placid nahi, Puppeteer.**
Woh log andar Chrome hi chala rahe hain aur $29/mo le rahe hain. Card ek HTML page hai,
Puppeteer sirf `#card` ka screenshot leta hai. Design badalna = CSS badalna.

**2026-09-21 — Source: RSS, Facebook scraping nahi.**
Kisi aur ka FB page scrape karna unke ToS ke khilaf hai, Apify actors tootte rehte hain,
aur us banday se hamesha 1 step peeche raho ge. Reuters/Sky/Guardian ke RSS se wohi khabar
pehle milti hai. `--source apify` code mein maujood hai agar kabhi chahiye.

**2026-09-21 — Copy nahi, rewrite.**
News ke *facts* par copyright nahi, *alfaaz* par hota hai. Prompt Gemini ko force karta hai
ke sirf facts le aur wording khud likhe.

**2026-09-22 — Rang bohat kam. (user feedback)**
Raza Samo wala har-lafz-rangeen look nahi chahiye — sasta lagta hai. Naya rule:
- headline ka **kam se kam 70% white**
- **sirf 1** phrase accent (`#31D6E8`) — yeh brand color hai
- red **sirf** waqai sangeen khabar par (jang, maut, hamla, pabandi, warrant)
- zyada se zyada **2** colored segments — code bhi zabardasti limit karta hai (`src/ai.js`)
- lime/amber CSS mein maujood hain lekin AI ko diye hi nahi jate

**2026-09-22 — Gol inset circle. (user feedback)**
Reference: The London Economic ka post — peeche banday ki bari tasveer, upar-left ek gol
chhoti tasveer (related incident) ring ke saath. Ab `inset: { image, ring }` support hai,
teeno templates par. Ring: `white` / `red` / `accent`.

**2026-09-22 — Project `~/fbcontent` mein, git init ho chuka.**
GitHub par push abhi nahi hua — user se poochna hai (private vs public).

---

## Testing se jo pata chala

**Feeds ka haal (khud test kiya):**

| feed | halat |
|---|---|
| Sky News World | ✅ 1920×1080 — best |
| Guardian World | ✅ 700×560 |
| DW World | ✅ chalta hai |
| BBC World | ⚠️ text theek, `ichef.bbci.co.uk` images 404 |
| Al Jazeera | ❌ feed connect hi nahi hoti |

**3 bugs jo live test mein pakde gaye:**

1. Feeds ek hi tasveer ke kai size dete hain (Guardian: 140/460/700px). Pehli wali uthana
   = 140px ki blurry image. Ab sab se bari chunti hai.
2. Feeds URLs mein `&` ko `&amp;` likhte hain. Decode na karo to Guardian ke signed URLs **401**.
3. Ek hi photo ke alag size alag URL hote hain — inhe "alag tasveer" samajh kar inset mein
   wohi photo dobara lag jati thi. Ab signature se group hote hain.

**Image quality gate** (`src/image.js`): 640px se chhoti, 300k pixels se kam,
2.6:1 se zyada chaudi (banner), ya 0.45:1 se lambi image reject. Koi image na mile to khabar skip.

**Gemini schema:** `responseSchema` protobuf hai — type names **UPPERCASE** (`"OBJECT"`, `"STRING"`),
lowercase bhejne par reject ho sakta hai.

**npm 11+:** postinstall scripts block karta hai, is liye Chromium alag se —
`npx puppeteer browsers install chrome`.

---

## Abhi pending

- [ ] **Gemini API key** — poori chain live test nahi hui (rewrite + caption + focus)
- [ ] **FB page token** — user khud banayega, post karna live test nahi hua
- [ ] GitHub push — private ya public, user ka faisla
- [ ] Token ~60 din baad refresh karna hota hai — reminder chahiye
- [ ] `data/seen.json` deploy par persist karna zaroori hai warna duplicate post honge

---

## Ideas (abhi nahi banaye)

- Gemini vision se image ko score karna — "yeh photo card ke liye kitni achi hai"
- Apify se aane wali multi-photo posts par inset apne aap bharna
- Post karne se pehle telegram/whatsapp par approval bhejna
