// Take a screenshot of the DownloadApp section in preview.html using Playwright.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = 'file://' + resolve(__dirname, 'preview.html').replace(/\\/g, '/');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(file);
await page.waitForTimeout(500);

// Scroll to DownloadApp section
const y = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('[data-name]')).find(e => e.getAttribute('data-name')?.includes('DownloadApp_self'));
  return el ? el.getBoundingClientRect().top + window.scrollY : 0;
});
console.log('DownloadApp top:', y);

await page.evaluate((scrollY) => window.scrollTo(0, scrollY - 20), y);
await page.waitForTimeout(300);

await page.screenshot({
  path: resolve(__dirname, 'tmp/preview-downloadapp.png'),
  clip: { x: 0, y: 0, width: 1440, height: 850 },
});
console.log('screenshot saved');
await browser.close();