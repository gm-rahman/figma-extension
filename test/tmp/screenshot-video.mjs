import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///C:/Users/Mahfuz/newProject/test/preview.html');
await page.waitForTimeout(500);

// Find the video raster img
const found = await page.evaluate(() => {
  const el = [...document.querySelectorAll('img[src^="data:image/png"]')][0];
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  return true;
});
await page.waitForTimeout(300);

const rect = await page.evaluate(() => {
  const el = [...document.querySelectorAll('img[src^="data:image/png"]')][0];
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
});
console.log('video rect:', rect);

if (rect) {
  await page.screenshot({ path: 'test/tmp/video-area.png', clip: { x: Math.max(0, rect.x - 50), y: Math.max(0, rect.y - 50), width: rect.width + 100, height: rect.height + 100 } });
  console.log('saved video-area.png');

  // Also probe the image itself
  const stats = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img[src^="data:image/png"]')][0];
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nonWhite = 0, dark = 0, white = 0, other = 0, total = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      if (r < 240 || g < 240 || b < 240) nonWhite++;
      if (r < 60 && g < 60 && b < 60) dark++;
      else if (r > 240 && g > 240 && b > 240) white++;
      else other++;
    }
    return { w: c.width, h: c.height, total, nonWhite, pctNonWhite: +(nonWhite/total*100).toFixed(2), dark, white, other };
  });
  console.log('video image stats:', stats);
}

await browser.close();