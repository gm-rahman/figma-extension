// Probe-helper: list all elements on fresha.com whose className or data attribute
// hints at ForBusiness. Just to find the live selector we need.

import { chromium } from 'playwright';

const url = process.argv[2] || 'https://www.fresha.com/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// Wipe CSP fingerprints that mask class names.
await page.route('**/*', (route) => route.continue());

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});

// Scroll.
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = Math.round(window.innerHeight * 0.8);
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    window.scrollTo(0, y); await sleep(120);
  }
  window.scrollTo(0, 0); await sleep(300);
});
await page.waitForTimeout(500);

const found = await page.evaluate(() => {
  const out = [];
  // 1. className fingerprint on any descendant
  for (const el of document.querySelectorAll('div')) {
    const cls = (typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '');
    if (/ForBusiness/i.test(cls) || /ForBusinesses/i.test(cls)) {
      out.push({
        how: 'className',
        cls,
        rect: (() => { const r = el.getBoundingClientRect(); return `${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`; })(),
        text: (el.textContent || '').trim().slice(0, 80),
      });
    }
  }
  // 2. data-testid
  for (const el of document.querySelectorAll('[data-testid]')) {
    if (/forbusiness|for-business/i.test(el.getAttribute('data-testid') || '')) {
      out.push({
        how: 'data-testid',
        cls: el.getAttribute('data-testid'),
        rect: (() => { const r = el.getBoundingClientRect(); return `${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`; })(),
      });
    }
  }
  // 3. any element whose text contains "Built for everyone" or "Find a beauty salon"
  for (const el of document.querySelectorAll('h1,h2,h3,h4,div,section,p')) {
    const t = (el.textContent || '').trim();
    if (/Built for everyone|Find a beauty salon|For businesses/.test(t) && t.length < 200) {
      out.push({
        how: 'textContent',
        cls: (typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '').slice(0, 60),
        text: t.slice(0, 100),
        rect: (() => { const r = el.getBoundingClientRect(); return `${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`; })(),
      });
    }
  }
  return out;
});

console.log(JSON.stringify(found, null, 2));
console.log(`\n${found.length} candidate element(s) matched.`);

await browser.close();
