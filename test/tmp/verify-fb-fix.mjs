// Screenshot the fresha-fb preview to verify the walker fix renders correctly.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 800 } });
await page.goto('file:///C:/Users/Mahfuz/newProject/test/preview.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(300);

const info = await page.evaluate(() => {
  const img = document.querySelector('img');
  const section = document.querySelector('[data-name="Container:section"], [data-name="Container:Section_self__25TmV"]');
  if (!img) return { err: 'no img' };
  const ir = img.getBoundingClientRect();
  const out = {
    img: { x: ir.x, y: ir.y, w: ir.width, h: ir.height },
    imgComputed: {
      left: getComputedStyle(img).left,
      top: getComputedStyle(img).top,
      transform: getComputedStyle(img).transform,
    },
  };
  if (section) {
    const sr = section.getBoundingClientRect();
    out.section = { x: sr.x, y: sr.y, w: sr.width, h: sr.height };
    out.sectionOverflow = getComputedStyle(section).overflow;
  }
  return out;
});
console.log('preview info:', JSON.stringify(info, null, 2));

const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector('.canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
console.log('canvas rect:', JSON.stringify(canvasInfo));

await page.screenshot({ path: 'C:\\Users\\Mahfuz\\newProject\\test\\tmp\\fb-after-fix.png', fullPage: true });
console.log('screenshot saved to test/tmp/fb-after-fix.png');

await browser.close();