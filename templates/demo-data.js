/* Sirf standalone preview ke liye. Puppeteer isay override kar deta hai. */
window.CARD_DATA = {
  template: window.CARD_TEMPLATE || 'classic',
  width: 1080, height: 1350,
  headline: [
    { t: 'US prepares',              c: 'lime'  },
    { t: 'to sanction the',          c: 'white' },
    { t: 'International Criminal Court', c: 'cyan' },
    { t: 'following',                c: 'white' },
    { t: 'previously',               c: 'lime'  },
    { t: 'issued',                   c: 'white' },
    { t: 'arrest warrant',           c: 'red'   },
    { t: 'for Israeli PM Netanyahu.',c: 'white' }
  ],
  images: ['../assets/demo-a.jpg', '../assets/demo-b.jpg'],
  kicker: 'World',
  brand: '@razasamo',
  footer: 'Source: Reuters'
};
