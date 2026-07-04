// Probe live page for the carousel prev/next buttons (node-97, node-207).
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://www.fresha.com/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const probe = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('[id^="button-carousel-spotlight"]').forEach(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push({
      id: el.id,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      pos: cs.position,
      left: cs.left,
      top: cs.top,
      transform: cs.transform,
      transformOrigin: cs.transformOrigin,
    });
  });
  return out;
});

console.log(JSON.stringify(probe, null, 2));
await browser.close();