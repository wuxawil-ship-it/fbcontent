# newscard

News card banata hai (Puppeteer se), Gemini se khabar apne style mein rewrite karta hai,
aur Facebook Page par khud post kar deta hai. Sab kuch code mein — koi n8n / Make /
Bannerbear ki zaroorat nahi.

```
source (RSS ya Apify)  →  Gemini (rewrite + headline + caption)  →  Puppeteer (card JPG)  →  Graph API (post)
```

---

## 1. Approach — kyun aise

**Design ke liye Bannerbear/Placid ki zaroorat nahi.** Woh log andar Chrome hi chala rahe hain
aur uska $29/mo le rahe hain. Card ek HTML page hai, headline `flex` box mein hai, aur ek chhota
binary-search **autofit** font size adjust karta hai taake 3-word headline aur 25-word headline
dono perfect fit hon. Puppeteer sirf `#card` element ka screenshot le leta hai.

**Source ke liye RSS >> Facebook scraping.** Kisi aur ka FB page scrape karna unke ToS ke
khilaf hai, Apify actors har do mahine tootte hain, aur tum hamesha us banday se 1 step peeche
rehte ho. Wohi khabrein Reuters/BBC/Al Jazeera ke RSS se **pehle** milti hain, free hain, aur
kabhi nahi toot-tin. `--source apify` phir bhi maujood hai agar tumhe chahiye.

**Copy nahi, rewrite.** News ke *facts* par kisi ka copyright nahi hota, lekin us ke *alfaaz*
par hota hai. Prompt Gemini ko force karta hai ke sirf facts le aur wording khud likhe.

---

## 2. Install

Node v24 pehle se `~/.local/node` mein install hai (`~/.zshrc` mein PATH add ho chuka hai).
Nayi machine par yahi dobara karna ho to: nodejs.org se darwin-arm64 tarball, checksum verify,
`~/.local/node` mein extract.

```bash
npm install
npx puppeteer browsers install chrome   # npm 11+ postinstall block kar deta hai, is liye alag
cp .env.example .env
```

## 3. `.env` bharo

| key | kahan se milega |
|---|---|
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `RSS_FEEDS` | apni pasand ke feeds, comma se alag |
| `FB_PAGE_ID` | Page → About → Page ID |
| `FB_PAGE_TOKEN` | neeche dekho |
| `BRAND_HANDLE` | `@safucrypto` — card ke neeche chhapta hai |
| `BRAND_ACCENT` | highlight color, default `#31D6E8` |

**Page token (ek dafa ka kaam):**

1. developers.facebook.com → naya app → type **Business**
2. Graph API Explorer → apna app + Page chuno
3. Permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
4. "Generate Access Token" → short-lived token milega
5. Access Token Tool → **Extend Access Token** → ab ~60 din chalega
6. `node src/run.js check` — page ka naam aur scopes confirm kar lo

> Sirf apne page par post karne ke liye App Review ki zaroorat nahi, bas tumhara app-role aur
> page-role hona chahiye. Token ~60 din baad refresh karna hoga.

## 4. Chalao

```bash
node src/run.js demo                      # teeno template out/ mein render kar ke dekho
node src/run.js run                       # dry-run: card + caption banata hai, post NAHI karta
node src/run.js run --post                # asli post
node src/run.js run --template overlay    # template badlo
node src/run.js watch --every 20 --post   # har 20 min check kare
node src/run.js check                     # FB token/page verify
```

`run` **default dry-run hai**. Pehle kuch din `run` chala ke `out/` ke cards khud dekho,
tab `--post` lagao.

## 5. Templates

| naam | look |
|---|---|
| `classic` | rounded photo upar, centered multi-color headline neeche (reference wala style) |
| `overlay` | full-bleed photo, gradient, headline photo ke upar |
| `band` | edge-to-edge photo, neeche newsroom band + accent bar |

Teeno par **gol inset circle** lag sakta hai — peeche main tasveer, upar chhoti gol tasveer
(related incident) ring ke saath, jaise The London Economic ke posts mein hota hai:

```js
inset: { image: '/path/to/pic.jpg', ring: 'white' }   // ring: white | red | accent
```

Yeh tab lagta hai jab khabar mein **do alag** tasveerein milen. Ek hi photo ke alag size
inset mein dobara nahi lagte — `src/image.js` unhe pehchan leta hai. `CARD_INSET=0` se band.

Design badalna ho to **sirf `templates/card.css`** kholo. Upar `:root` mein colors, padding
aur radius ke tokens hain — baaki sab wahan se derive hota hai.

Headline ke rang Gemini chunta hai, lekin **jaan boojh kar bohat kam**: kam se kam 70% white,
sirf **ek** phrase accent (brand color), aur red sirf waqai sangeen khabar par. Zyada se zyada
2 colored segments — `src/ai.js` code mein bhi yeh limit lagi hui hai, sirf prompt par bharosa nahi.

Font badalna ho: naya `.ttf` `fonts/` mein daalo, `scripts/build-fonts.mjs` mein naam badlo,
`npm run build:fonts` chalao. (Fonts base64 ho kar CSS mein jaate hain kyunki Chrome
`file://` se font load block kar deta hai.)

Design preview bina Node ke:

```bash
python3 -m http.server 8777
```
phir `http://127.0.0.1:8777/templates/classic.html` kholo.

## 6. Deploy

- **Mac par:** `node src/run.js watch --every 20 --post` (ya launchd/cron)
- **GitHub Actions:** har 30 min cron, secrets mein keys. Runner par Chrome pehle se hai —
  `PUPPETEER_SKIP_DOWNLOAD` mat lagana.
- **Apify actor:** tumhara existing repo. `src/` idhar copy karo, Apify image mein Chrome maujood hai.

`data/seen.json` duplicate posts rokti hai — deploy ke waqt isay persist karna zaroori hai.

Project ke faisle aur testing findings [NOTES.md](NOTES.md) mein hain.

## 7. Files

```
templates/   card.css (poora design) · card.js (autofit+layout) · 3 html
src/         run.js (CLI) · sources.js · image.js · ai.js · render.js · facebook.js · store.js · config.js
fonts/       Montserrat ExtraBold + Black
```

---

## 8. Feeds ke baare mein (test kiye hue)

Card ko 968px chaudi image chahiye. Har feed itni bari image nahi deta — is liye
`src/image.js` har candidate ko download kar ke uska asli size parhta hai aur sab se
behtar wali chunta hai. Chhoti/tooti image wali khabar apne aap skip ho jati hai.

| feed | halat |
|---|---|
| Sky News | ✅ 1920x1080 — best |
| Guardian World | ✅ 700x560 — theek |
| DW World | ✅ chalta hai |
| BBC World | ⚠️ text aata hai lekin `ichef.bbci.co.uk` images 404 deti hain |
| Al Jazeera | ❌ feed connect hi nahi hoti |

Do cheezein jo test mein pakri gayin aur fix hui hain:

- Feeds ek hi tasveer ke kai size dete hain (Guardian: 140/460/700px). Pehli wali uthana
  matlab 140px ki blurry image — ab sab se bari chunti hai.
- Feeds URLs mein `&` ko `&amp;` likhte hain. Decode na karo to Guardian jaise signed
  URLs **401** dete hain.
