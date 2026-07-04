// Measure picture and video elements live in fresha.com
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('https://www.fresha.com', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

const measure = await page.evaluate(() => {
  function findByName(root, name) {
    if (root.querySelector(`[data-name="${name}"]`)) return root.querySelector(`[data-name="${name}"]`);
    // Find parent via class name pattern
    const candidates = root.querySelectorAll('[class*="center-images"], [class*="DownloadApp"]');
    return null;
  }
  // Find the DownloadApp center-images element
  const all = document.querySelectorAll('div');
  let centerImages = null;
  for (const el of all) {
    const cls = el.className || '';
    if (typeof cls === 'string' && /center-images/i.test(cls)) { centerImages = el; break; }
  }
  if (!centerImages) {
    console.log('center-images not found');
    return { error: 'not found' };
  }
  const ciRect = centerImages.getBoundingClientRect();
  const out = {
    centerImages: { x: ciRect.left, y: ciRect.top, w: ciRect.width, h: ciRect.height, display: getComputedStyle(centerImages).display, justifyContent: getComputedStyle(centerImages).justifyContent, alignItems: getComputedStyle(centerImages).alignItems, flexDirection: getComputedStyle(centerImages).flexDirection },
    children: []
  };
  for (const ch of centerImages.children) {
    const r = ch.getBoundingClientRect();
    out.children.push({
      tag: ch.tagName,
      cls: typeof ch.className === 'string' ? ch.className.slice(0,80) : '',
      x: Math.round(r.left - ciRect.left),
      y: Math.round(r.top - ciRect.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
      src: (ch.currentSrc || ch.src || '').slice(0, 80)
    });
  }
  return out;
});

console.log(JSON.stringify(measure, null, 2));
await browser.close();