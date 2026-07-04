// Probe live page for the carousel prev/next buttons.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await page.goto('https://www.fresha.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const probe = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[id^="button-carousel-spotlight"]').forEach(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push({ id: el.id, x: r.x, y: r.y, w: r.width, h: r.height, pos: cs.position, left: cs.left, top: cs.top, transform: cs.transform, transformOrigin: cs.transformOrigin });
    });
    return out;
  });
  writeFileSync('tmp/probe-carousel.json', JSON.stringify(probe, null, 2));
} catch (e) {
  writeFileSync('tmp/probe-carousel.json', JSON.stringify({ error: String(e) }));
} finally {
  await browser.close();
}