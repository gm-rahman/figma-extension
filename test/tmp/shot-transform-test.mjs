// Screenshot the test fixture page directly (browser truth) and the preview.html
// (plugin truth) so we can compare positions.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
const page = await ctx.newPage();

// 1) The fixture itself (browser truth)
await page.goto('file:///C:/Users/Mahfuz/newProject/test/fixture/transform-fix-test.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(300);
await page.screenshot({ path: 'tmp/fixture-truth.png', fullPage: true });

const probe = await page.evaluate(() => {
  const cases = ['case-a', 'case-b', 'case-c', 'case-d'];
  const out = {};
  for (const cls of cases) {
    const el = document.querySelector('.' + cls + ' .child, .' + cls + ' picture, .' + cls + ' > .parent > picture');
    if (!el) { out[cls] = null; continue; }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out[cls] = { x: r.x, y: r.y, w: r.width, h: r.height, transform: cs.transform, left: cs.left, top: cs.top };
  }
  return out;
});
writeFileSync('tmp/fixture-truth.json', JSON.stringify(probe, null, 2));

// 2) The preview.html (what the capture+preview produces)
const preview = await ctx.newPage();
await preview.goto('file:///C:/Users/Mahfuz/newProject/test/preview.html', { waitUntil: 'domcontentloaded' });
await preview.waitForTimeout(500);
// Hide the meta bar
await preview.evaluate(() => {
  const meta = document.querySelector('.meta'); if (meta) meta.style.display = 'none';
});
await preview.screenshot({ path: 'tmp/preview-truth.png', fullPage: true });

await browser.close();