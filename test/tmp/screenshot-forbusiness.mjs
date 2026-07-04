// Screenshot the ForBusiness section from preview.html using Playwright.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 5000 } });
await page.goto('file:///C:/Users/Mahfuz/newProject/test/preview.html');
await page.waitForTimeout(500);
await page.evaluate(() => window.scrollTo(0, 0));

// The ForBusiness Section sits at top:4008, height:728 in the captured page.
// In the rendered preview, it's the .canvas div which is sized to the captured viewport height.
const box = await page.evaluate(() => {
  const el = document.querySelector('[data-name="Container:Section_self__25TmV"][title="Container:Section_self__25TmV"]');
  // Get the right one — the second section is the ForBusiness one (around y=4008)
  const all = document.querySelectorAll('[data-name="Container:Section_self__25TmV"]');
  let target = null;
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (r.top >= 3800 && r.top <= 4200) { target = e; break; }
  }
  if (!target) return null;
  const r = target.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
console.log('ForBusiness Section_self box:', JSON.stringify(box));

if (box) {
  await page.screenshot({
    path: 'C:\\Users\\Mahfuz\\newProject\\test\\tmp\\forbusiness-section.png',
    clip: { x: box.x, y: box.y, width: box.width, height: box.height }
  });
  console.log('Saved forbusiness-section.png');
}

// Also screenshot the dashboard image itself.
const imgInfo = await page.evaluate(() => {
  const img = document.querySelector('img[src*="forBusinessLarge"]');
  if (!img) return null;
  const r = img.getBoundingClientRect();
  const cs = getComputedStyle(img);
  return {
    src: img.src,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    style: { left: cs.left, top: cs.top, width: cs.width, height: cs.height,
             position: cs.position, overflow: cs.overflow, objectFit: cs.objectFit }
  };
});
console.log('Dashboard img:', JSON.stringify(imgInfo, null, 2));

await browser.close();