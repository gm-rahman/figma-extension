// Sample pixels from each PNG via base64 data URL in Playwright.
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  for (const name of ['phone0', 'phone1', 'billion']) {
    const b64 = fs.readFileSync(`test/tmp/${name}.png`).toString('base64');
    const pg = await browser.newPage();
    await pg.setContent(`<body style="margin:0"><img id="i" src="data:image/png;base64,${b64}" /></body>`);
    await pg.waitForFunction(() => {
      const i = document.getElementById('i');
      return i && i.complete && i.naturalWidth > 0;
    }, { timeout: 10000 });
    await pg.waitForTimeout(100);
    const stats = await pg.evaluate(() => {
      const img = document.getElementById('i');
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let nonWhite = 0, total = d.length / 4;
      const buckets = { pink: 0, dark: 0, white: 0, other: 0 };
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        if (r < 240 || g < 240 || b < 240) nonWhite++;
        if (r > 180 && b > 180 && g < 180) buckets.pink++;
        else if (r < 60 && g < 60 && b < 60) buckets.dark++;
        else if (r > 240 && g > 240 && b > 240) buckets.white++;
        else buckets.other++;
      }
      return { w: c.width, h: c.height, total, nonWhite, pctNonWhite: +(nonWhite / total * 100).toFixed(2), buckets };
    });
    console.log(`${name}:`, stats);
    await pg.close();
  }
  await browser.close();
})();