/* Card renderer — same file browser preview aur Puppeteer dono use karte hain.
   Puppeteer: await page.evaluate(d => window.renderCard(d), data)  */
(function () {
  const COLORS = ['white', 'accent', 'red', 'lime', 'amber'];
  const ALIAS = { cyan: 'accent', brand: 'accent', blue: 'accent' };   /* purana data bhi chale */

  function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  /* headline segments -> colored inline spans */
  function headlineHTML(segments) {
    return segments.map((seg, i) => {
      const c = COLORS.includes(ALIAS[seg.c] || seg.c) ? (ALIAS[seg.c] || seg.c) : 'white';
      const sp = i < segments.length - 1 ? ' ' : '';
      return `<span class="c-${c}">${esc(seg.t).trim()}${sp}</span>`;
    }).join('');
  }

  /* Binary-search the biggest font-size jo box ke andar fit ho jaye */
  function autofit(el, box, { min = 28, max = 200 } = {}) {
    const fits = () => el.scrollHeight <= box.clientHeight + 1 && el.scrollWidth <= box.clientWidth + 1;
    let lo = min, hi = max, best = min;
    el.style.fontSize = max + 'px';
    if (fits()) return max;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      el.style.fontSize = mid + 'px';
      if (fits()) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    el.style.fontSize = best + 'px';
    return best;
  }

  /* focus = subject tasveer mein kahan hai; crop usay kaate nahi */
  const FOCUS = { left: '25% 40%', center: '50% 40%', right: '75% 40%', top: '50% 18%', bottom: '50% 80%' };

  function photoHTML(images, focus) {
    const list = (images || []).slice(0, 2).filter(Boolean);
    if (!list.length) return '<div class="photo"></div>';
    const pos = FOCUS[focus] || FOCUS.center;
    return `<div class="photo">${list
      .map(src => `<img src="${esc(src)}" style="object-position:${pos}" alt="">`).join('')}</div>`;
  }

  /* Reference post wala gol inset — peeche ki main tasveer ke upar */
  function insetHTML(inset) {
    if (!inset?.image) return '';
    const ring = ['red', 'accent', 'white'].includes(inset.ring) ? inset.ring : 'white';
    return `<div class="inset ring-${ring}"><img src="${esc(inset.image)}" alt=""></div>`;
  }

  function layout(d) {
    const punch = d.punchline
      ? `<div class="punch" id="pl">${esc(String(d.punchline).trim())}</div>` : '';
    const head = `<div class="headbox"><div class="headline" id="hl">${headlineHTML(d.headline)}</div></div>`
      + punch;
    const foot = d.footer === false ? '' :
      `<div class="footer"><span class="handle">${esc(d.brand || '')}</span><span>${esc(d.footer || '')}</span></div>`;
    const kick = d.kicker ? `<div><span class="kicker">${esc(d.kicker)}</span></div>` : '';

    const photo = photoHTML(d.images, d.focus);
    const inset = insetHTML(d.inset);

    switch (d.template) {
      case 'overlay':
        return photo + `<div class="scrim"></div>` + inset +
          `<div class="content">${kick}${head}${foot}</div>`;
      case 'band':
        return photo + inset +
          `<div class="content"><div class="rule"></div><div class="right">${kick}${head}${foot}</div></div>`;
      default: /* classic */
        return photo + inset + head + foot;
    }
  }

  async function renderCard(data) {
    const d = Object.assign({ template: 'classic', width: 1080, height: 1350, headline: [], images: [] }, data);
    const card = document.getElementById('card');

    card.className = d.template + (d.texture ? ` tex-${d.texture}` : '');
    card.style.width = d.width + 'px';
    card.style.height = d.height + 'px';
    if (d.accent) document.documentElement.style.setProperty('--accent', d.accent);
    if (d.textureUri) document.documentElement.style.setProperty('--tex', `url("${d.textureUri}")`);
    card.innerHTML = layout(d);

    /* fonts + images dono ready hone ka intezar — warna screenshot adhoori aati hai */
    await document.fonts.ready;
    await Promise.all([...card.querySelectorAll('img')].map(img =>
      img.complete ? img.decode().catch(() => {}) :
        new Promise(res => { img.onload = img.onerror = res; }).then(() => img.decode().catch(() => {}))
    ));

    /* punchline pehle fit karo — wo headline ki jagah kaat leta hai */
    const pl = card.querySelector('#pl');
    if (pl) {
      pl.style.fontSize = Math.round(d.width * 0.042) + 'px';
      while (pl.scrollWidth > pl.clientWidth + 1 && parseInt(pl.style.fontSize) > 22)
        pl.style.fontSize = (parseInt(pl.style.fontSize) - 1) + 'px';
    }

    const hl = card.querySelector('#hl');
    const box = hl.parentElement;
    const size = autofit(hl, box, { min: d.minFont || 30, max: d.maxFont || Math.round(d.width * 0.135) });

    document.body.dataset.ready = '1';
    return { fontSize: size };
  }

  window.renderCard = renderCard;
  document.addEventListener('DOMContentLoaded', () => {
    if (window.CARD_DATA) renderCard(window.CARD_DATA);
  });
})();
