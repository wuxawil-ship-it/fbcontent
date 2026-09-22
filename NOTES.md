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

**2026-09-22 — Project `~/fbcontent`, GitHub par private repo.**
Repo: https://github.com/wuxawil-ship-it/fbcontent (private)
`.env` gitignored hai, push se pehle secret scan bhi kiya — kuch leak nahi hua.
Aage `gh` CLI `~/.local/bin/gh` par hai, Node `~/.local/node/bin` par (dono `~/.zshrc` mein).

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

**2026-09-22 — Poori chain live chal gayi (dry-run).**
RSS → article fetch → Gemini rewrite → card render → caption. Post abhi nahi kiya.

---

## 2026-09-22 ke live test se jo mila

**Gemini 2.5-flash retire ho chuka hai.** API ne 404 diya:
"no longer available to new users". Ab `gemini-3.6-flash` use ho raha hai.
Model naam `GEMINI_MODEL` se badal sakte ho — retire hone par yahi error dobara aayega.

**Prompt ki zubaan output mein leak ho gayi thi.** System prompt Roman Urdu mein likha tha,
to Gemini ne caption bhi Roman Urdu mein likh diya. Ab prompt ke aakhir mein saaf likha hai
ke output `POST_LANGUAGE` (default English) mein ho. Sabaq: hidayaat ki zubaan aur output ki
zubaan alag ho to explicitly batana parta hai.

**Gemini par 503 aam hai.** "high demand" — ek test mein lagataar 3 dafa aaya. Ab
`src/ai.js` mein exponential backoff ke saath 4 tries hain (`Retry-After` header bhi maanta hai).
Iske bagair ek spike poora run zaaya kar deta.

**RSS ka summary caption ke liye kaafi nahi.** Sky ka description sirf 190 chars ka tha aur
caption khokhli aa rahi thi ("stakeholders continue to monitor..."). Ab article page se poora
text uthta hai (4000 chars cap) — caption mein asli numbers aane lage.

**Sky News article pages 403 dete hain** (automated access block). Isay bypass NAHI kiya —
un par RSS summary hi use hoti hai, caption thori chhoti aati hai. Guardian aur DW se poora
article milta hai. Jis feed se achi caption chahiye, Guardian behtar hai.

**Card par `FEEDS.SKYNEWS.COM` likha aa raha tha.** Ab hostname → asli naam ka map hai
(`outletName` in `src/sources.js`) — "Sky News", "The Guardian" waghera.

**2026-09-22 — Page ka masla: pehle nahi tha, phir mil gaya.**

Shuru mein `me/accounts` khaali aaya aur OAuth dialog page picker screen skip kar gaya —
is se maine ghalat nateeja nikala ke Safu Crypto Page nahi, sirf professional-mode profile hai.

**Ye ghalat tha.** User ne page ko professional se **business** mode mein switch kiya,
us ke baad wohi dialog page picker dikhane laga:

    Safu Crypto — 1009046445621078

Sabaq: `me/accounts` khaali hona ya picker screen ka skip hona sirf itna batata hai ke
**us waqt** account par koi eligible Page nahi tha — ye sabit nahi karta ke Page ho hi nahi sakta.
Aisi soorat mein page ki mode/settings check karni chahiye, nateeja nahi nikalna chahiye.

**Page token kaise mila (ahem):** teeno scopes granted hone ke bawajood `me/accounts`
hamesha `{"data":[]}` deta raha. Lekin page seedha padhi ja sakti thi
(`GET /1009046445621078` -> Safu Crypto, Education, published). Ye Business portfolio ke
owned pages ka maloom tareeqa hai — wo `me/accounts` mein nahi aate.

**Hal:** page se seedha token maango —

    GET /{page-id}?fields=access_token   (user token ke saath)

Yahi 256-char page token deta hai. `scripts/fb-setup.mjs` mein ab ye fallback maujood hai:
pehle `me/accounts`, khaali aaye to direct page call. `me/businesses` ke liye
`business_management` scope chahiye hota hai jo humne nahi liya — zaroorat bhi nahi pari.

**Doosra masla jo yahan pakra gaya:** dobara authorize karte waqt `pages_manage_posts`
permissions list se gir gaya tha. Review screen par sirf "Read content" aur "Show a list of
Pages" thin. Aise token se padha to ja sakta hai lekin post nahi hoti — aur error posting ke
waqt aata, setup ke waqt nahi. **Review screen par hamesha tasdeeq karo ke post/manage wali
permission bhi list mein hai.**


---

## Image quality ke faisle

**Feed ki image pehle, og:image baad mein.** og:image bari hoti hai (Guardian 1200x630 vs
feed 700x560) LEKIN us par aksar publisher ka logo baked hota hai — Guardian ka "The Guardian"
box seedha hamare card par aa gaya tha. Doosre ka logo apne brand ke card par bura lagta hai,
is liye chhoti magar saaf image behtar hai.

**Guardian se 700px se bari nahi mil sakti.** URL mein `width=700` ko 1200 karne par **401** —
signature width ko bhi cover karti hai.

**DW ke feed mein tasveer hoti hi nahi** — us ke liye og:image hi waahid rasta hai
(940x529). Us par DW ki branding ho sakti hai.

---

## Setup mukammal (2026-09-22)

| cheez | halat |
|---|---|
| Gemini | ✓ `gemini-3.6-flash` |
| Page | ✓ Safu Crypto `1009046445621078` |
| Page token | ✓ PAGE type, `pages_manage_posts`, expiry 0 (kabhi nahi) |
| App secret / user token | hata diye — sirf `fb-setup` ke input the, `src/` unhe padhta hi nahi |

Dobara `fb-setup` chalana pare (token revoke ho jaye, nayi permission chahiye) to App Secret
dashboard se dobara mil jata hai: App → Settings → Basic → Show.

---

## Raza Samo se seekhi hui cheezein (2026-09-22)

**Dimensions:** uski asli images check kin — **1080x1350, ratio 0.800**. Hamara card
bilkul wahi hai. Koi tabdeeli nahi chahiye.

**Red box punchline:** wo kabhi kabhi headline ke neeche laal border wale box mein ek
teekhi line daalta hai ("RULES FOR THEE, BUT NOT FOR ME"). Ab `punchline` field support
karti hai — AI sirf tab bhejta hai jab khabar mein asli tazad ho jo facts se sabit ho,
warna khaali. Style: laal border, lime text.

**Emoji + sawal:** caption mein 1-3 emoji aur aakhir mein ek sawal (comments ke liye).

**Trump focus:** `PRIORITY_KEYWORDS` — jin khabron mein ye alfaaz hon wo qatar mein
pehle aati hain. Guardian US politics aur NPR politics feeds add kiye.

**Jo NAHI ho sakta:** wo CNN ke logo par laal cross, ya kisi khaas cheez par circle
lagata hai. Ye har post ke liye alag manual graphic design hai — kaun se logo par,
kahan, kyun. Isay generalize karna mumkin nahi. Aise post haath se banane parenge.

---

## Feeds ka tajurba (2026-09-22)

| feed | images | article text | note |
|---|---|---|---|
| Sky News World | 1920x1080 | ✗ 403 | tasveerein best, caption chhoti |
| Guardian World | 700x560 | ✓ 4000 | caption best |
| Guardian US politics | 700x560 | ✓ 4000 | Trump coverage |
| NPR politics | 1400x787 | ✓ 4000 | dono achay — behtareen combo |
| DW World | 940x529 (og) | ✓ 4000 | feed mein image nahi hoti |
| Politico | 2000x1333 | ✗ 403 | **chhor diya** — RSS sirf 29 chars deta hai |

**Ek aur bug mila:** `<article>` ka regex non-greedy tha, to pehle chhote teaser block
par ruk jata tha aur asal khabar chhoot jati thi. NPR par 0 chars aa rahe the. Ab saare
`<article>`/`<main>` blocks dekh kar wo chunte hain jisme sab se zyada paragraphs hon —
NPR 0 se 4000 par aa gaya.

---

## Abhi pending

- [ ] **Pehla live post** — token tayyar hai (Safu Crypto, `pages_manage_posts`, kabhi expire nahi hota). `publishPhoto()` abhi tak chala nahi, user ki ijazat ka intezar
- [ ] Guardian ki images 700px par atki hain (card 968 chahta hai) — thori soft rehti hain
- [ ] Token ~60 din baad refresh karna hota hai — reminder chahiye
- [ ] `data/seen.json` deploy par persist karna zaroori hai warna duplicate post honge

---

## Ideas (abhi nahi banaye)

- Gemini vision se image ko score karna — "yeh photo card ke liye kitni achi hai"
- Apify se aane wali multi-photo posts par inset apne aap bharna
- Post karne se pehle telegram/whatsapp par approval bhejna
