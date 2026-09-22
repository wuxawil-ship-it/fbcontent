/* Sirf standalone preview ke liye. Puppeteer isay override kar deta hai. */
window.CARD_DATA = {
  template: window.CARD_TEMPLATE || 'classic',
  width: 1080, height: 1350,
  headline: [
    { t: 'US prepares to sanction the', c: 'white'  },
    { t: 'International Criminal Court', c: 'accent' },
    { t: 'over its arrest warrant for Israeli PM Netanyahu.', c: 'white' }
  ],
  images: ['../assets/demo-a.jpg'],
  inset: { image: '../assets/demo-b.jpg', ring: 'white' },
  focus: 'center',
  kicker: 'World',
  brand: '@safucrypto',
  footer: 'Source: Reuters'
};
