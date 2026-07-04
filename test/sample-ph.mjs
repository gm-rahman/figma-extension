// Find all data-name attributes in preview to identify phone elements.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = 'file://' + resolve(__dirname, 'preview.html').replace(/\\/g, '/');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(file);
await page.waitForTimeout(800);

// Find all <img> elements with their src preview, position, and size.
const imgs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img')).map(img => {
    const r = img.getBoundingClientRect();
    return {
      src: (img.src || '').slice(0, 80),
      alt: img.alt || '',
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
    };
  });
});
for (const i of imgs) console.log(JSON.stringify(i));
await browser.close();