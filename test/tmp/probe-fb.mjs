// Probe: open the live fresha.com page in Playwright and read the bounding
// rect + computed style of the forBusiness image. This is the source of
// truth — it shows what a real browser sees for this element.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://www.fresha.com/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const probe = await page.evaluate(() => {
  const out = [];
  // Walk all <picture> elements
  document.querySelectorAll('picture').forEach(pic => {
    const r = pic.getBoundingClientRect();
    if (r.width < 500) return; // skip tiny icons
    const cs = getComputedStyle(pic);
    out.push({
      tag: pic.tagName,
      dataName: pic.getAttribute('data-name') || '',
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      pos: cs.position,
      left: cs.left,
      top: cs.top,
      right: cs.right,
      bottom: cs.bottom,
      transform: cs.transform,
      aspectRatio: cs.aspectRatio,
      inlineSize: cs.inlineSize,
      blockSize: cs.blockSize,
      parent: (() => {
        const pa = pic.parentElement;
        if (!pa) return null;
        const pr = pa.getBoundingClientRect();
        const ps = getComputedStyle(pa);
        return {
          tag: pa.tagName,
          dataName: pa.getAttribute('data-name') || '',
          rect: { x: pr.x, y: pr.y, w: pr.width, h: pr.height },
          pos: ps.position,
          overflow: ps.overflow,
          transform: ps.transform,
        };
      })(),
    });
  });
  return out;
});

console.log(JSON.stringify(probe, null, 2));
await browser.close();
