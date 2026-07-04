// audit-css.mjs — walk fresha.com, list every CSS property actually set on
// real elements, then compare against what ElementStyle already captures.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Parse ElementStyle interface from types.ts — pull every identifier
//    in the body (including inline `a?: string; b?: string;` lines).
const typesSrc = readFileSync(resolve(__dirname, '../extension/src/types.ts'), 'utf8');
const captured = new Set();
const ifaceRe = /interface\s+ElementStyle\s*\{([\s\S]*?)\n\}/m;
const ifaceBody = typesSrc.match(ifaceRe)?.[1] ?? '';
for (const m of ifaceBody.matchAll(/\b([a-zA-Z][a-zA-Z0-9_-]*)\s*\??:/g)) {
  captured.add(m[1]);
}

function toCamel(k) {
  return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('https://www.fresha.com', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

const props = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('body *')).filter(el => {
    const t = el.tagName.toLowerCase();
    if (t === 'svg') return false;
    if (el.closest('svg')) return false;
    return true;
  });
  const seen = new Map();
  for (const el of all) {
    const cs = window.getComputedStyle(el);
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      if (p.startsWith('--')) continue;
      seen.set(p, (seen.get(p) || 0) + 1);
    }
  }
  return [...seen.entries()];
});
await browser.close();

const now = props.filter(([_, c]) => c >= 1);
const capturedCount = now.filter(([p]) => captured.has(toCamel(p))).length;
const stillGap = now.filter(([p]) => !captured.has(toCamel(p)));

console.log(`ElementStyle fields parsed: ${captured.size}`);
console.log(`Distinct CSS props seen on fresha: ${now.length}`);
console.log(`Now captured by ElementStyle: ${capturedCount}`);
console.log(`Still not captured: ${stillGap.length}`);
console.log('---');
const sorted = stillGap.sort((a, b) => b[1] - a[1]);
for (const [p, c] of sorted) {
  const camel = toCamel(p);
  console.log(`${String(c).padStart(5)}  ${p.padEnd(40)} → ${camel}${captured.has(camel) ? ' [MAP MISMATCH]' : ''}`);
}
