// Audit which CSS props actually differ from spec defaults on fresha.com,
// and compare to the ElementStyle surface in extension/src/types.ts.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// CSS spec default values from W3C / MDN (only the common ones — for layout fidelity).
const DEFAULTS = new Map([
  ['display', 'block'],
  ['visibility', 'visible'],
  ['opacity', '1'],
  ['position', 'static'],
  ['top', 'auto'], ['right', 'auto'], ['bottom', 'auto'], ['left', 'auto'],
  ['z-index', 'auto'],
  ['float', 'none'], ['clear', 'none'],
  ['overflow', 'visible'], ['overflow-x', 'visible'], ['overflow-y', 'visible'],
  ['overflow-wrap', 'normal'], ['word-break', 'normal'], ['word-spacing', 'normal'],
  ['hyphens', 'manual'],
  ['direction', 'ltr'],
  ['writing-mode', 'horizontal-tb'],
  ['unicode-bidi', 'normal'],
  ['color', 'rgb(0, 0, 0)'],
  ['font-size', '16px'],
  ['font-weight', '400'],
  ['font-style', 'normal'],
  ['font-family', 'serif'],
  ['line-height', 'normal'],
  ['letter-spacing', 'normal'],
  ['text-align', 'start'],
  ['text-align-last', 'auto'],
  ['text-decoration', 'none'],
  ['text-decoration-line', 'none'],
  ['text-decoration-style', 'solid'],
  ['text-decoration-color', 'currentcolor'],
  ['text-transform', 'none'],
  ['vertical-align', 'baseline'],
  ['white-space', 'normal'],
  ['text-indent', '0px'],
  ['background-color', 'rgba(0, 0, 0, 0)'],
  ['background-image', 'none'],
  ['background-repeat', 'repeat'],
  ['background-attachment', 'scroll'],
  ['background-position', '0% 0%'],
  ['background-position-x', '0%'],
  ['background-position-y', '0%'],
  ['background-clip', 'border-box'],
  ['background-origin', 'padding-box'],
  ['background-size', 'auto auto'],
  ['background-blend-mode', 'normal'],
  ['border-top-style', 'none'], ['border-right-style', 'none'], ['border-bottom-style', 'none'], ['border-left-style', 'none'],
  ['border-style', 'none'],
  ['border-top-width', '0px'], ['border-right-width', '0px'], ['border-bottom-width', '0px'], ['border-left-width', '0px'],
  ['border-top-color', 'rgb(0, 0, 0)'], ['border-right-color', 'rgb(0, 0, 0)'], ['border-bottom-color', 'rgb(0, 0, 0)'], ['border-left-color', 'rgb(0, 0, 0)'],
  ['border-radius', '0px'],
  ['border-collapse', 'separate'],
  ['border-spacing', '0px'],
  ['border-image-source', 'none'],
  ['border-image-slice', '100%'],
  ['border-image-width', '1'],
  ['border-image-outset', '0'],
  ['border-image-repeat', 'stretch'],
  ['outline-style', 'none'],
  ['outline-width', '0px'],
  ['outline-color', 'invert'],
  ['outline-offset', '0px'],
  ['margin', '0px'], ['margin-top', '0px'], ['margin-right', '0px'], ['margin-bottom', '0px'], ['margin-left', '0px'],
  ['padding', '0px'], ['padding-top', '0px'], ['padding-right', '0px'], ['padding-bottom', '0px'], ['padding-left', '0px'],
  ['width', 'auto'], ['min-width', 'auto'], ['max-width', 'none'],
  ['height', 'auto'], ['min-height', 'auto'], ['max-height', 'none'],
  ['flex', '0 1 auto'],
  ['flex-grow', '0'], ['flex-shrink', '1'], ['flex-basis', 'auto'],
  ['flex-direction', 'row'], ['flex-wrap', 'nowrap'],
  ['justify-content', 'normal'], ['align-items', 'normal'], ['align-content', 'normal'],
  ['align-self', 'auto'],
  ['order', '0'],
  ['gap', 'normal'], ['row-gap', 'normal'], ['column-gap', 'normal'],
  ['grid', 'none'], ['grid-template-columns', 'none'], ['grid-template-rows', 'none'],
  ['grid-auto-columns', 'auto'], ['grid-auto-rows', 'auto'],
  ['grid-auto-flow', 'row'],
  ['grid-column', 'auto'], ['grid-row', 'auto'],
  ['box-sizing', 'content-box'],
  ['box-shadow', 'none'],
  ['box-decoration-break', 'slice'],
  ['filter', 'none'],
  ['backdrop-filter', 'none'],
  ['mix-blend-mode', 'normal'],
  ['isolation', 'auto'],
  ['transform', 'none'],
  ['transform-origin', '0px 0px'],
  ['transform-style', 'flat'],
  ['object-fit', 'fill'], ['object-position', '50% 50%'],
  ['aspect-ratio', 'auto'],
  ['cursor', 'auto'],
  ['pointer-events', 'auto'],
  ['content', 'normal'],
  ['caption-side', 'top'],
  ['empty-cells', 'show'],
  ['table-layout', 'auto'],
  ['list-style', 'none'], ['list-style-type', 'disc'], ['list-style-position', 'outside'], ['list-style-image', 'none'],
  ['column-count', 'auto'], ['column-width', 'auto'], ['column-gap', 'normal'], ['column-rule-style', 'none'], ['column-rule-width', '0px'], ['column-rule-color', 'rgb(0, 0, 0)'],
  ['column-span', 'none'], ['column-fill', 'balance'],
  ['break-after', 'auto'], ['break-before', 'auto'], ['break-inside', 'auto'],
  ['orphans', '2'], ['widows', '2'],
  ['page-break-after', 'auto'], ['page-break-before', 'auto'], ['page-break-inside', 'auto'],
  ['resize', 'none'],
  ['scroll-behavior', 'auto'],
  ['speak', 'normal'],
  ['tab-size', '8'],
  ['text-size-adjust', 'auto'],
  ['-webkit-text-fill-color', 'rgb(0, 0, 0)'],
  ['-webkit-text-stroke', '0px rgb(0, 0, 0)'],
  ['-webkit-text-stroke-color', 'rgb(0, 0, 0)'],
  ['-webkit-text-stroke-width', '0px'],
  ['-webkit-line-clamp', 'none'],
  ['-webkit-box-orient', 'horizontal'],
  ['will-change', 'auto'],
  ['contain', 'none'],
  ['contain-intrinsic-width', 'auto'], ['contain-intrinsic-height', 'auto'],
  ['inset', 'auto'],
  ['aspect-ratio', 'auto'],
  ['overscroll-behavior', 'auto'],
  ['field-sizing', 'fixed'],
  ['margin-trim', 'none'],
  ['text-emphasis-style', 'none'], ['text-emphasis-color', 'currentcolor'],
  ['text-shadow', 'none'],
  ['mask-image', 'none'], ['mask-mode', 'match-source'],
]);

// Read the ElementStyle surface so we can label whether we capture each prop.
const typesSrc = readFileSync(resolve(__dirname, '../extension/src/types.ts'), 'utf8');
const captured = new Set();
for (const m of typesSrc.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9_-]*)\??:\s*(?:string|number)/gm)) {
  captured.add(m[1]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('https://www.fresha.com', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

const stats = await page.evaluate((DEFAULTS_TABLE) => {
  const totalSeen = new Map();
  const nonDefaultCount = new Map();
  const sample = new Map();
  const all = Array.from(document.querySelectorAll('body *')).filter(el => {
    const t = el.tagName.toLowerCase();
    if (t === 'svg') return false;
    if (el.closest('svg')) return false;
    return true;
  });
  const cap = 2000;
  let n = 0;
  for (const el of all) {
    if (++n > cap) break;
    const cs = window.getComputedStyle(el);
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      const v = cs.getPropertyValue(p).trim();
      if (p.startsWith('--')) continue;
      if (p.startsWith('-webkit-')) {
        if (!p.startsWith('-webkit-text')) continue;
      }
      totalSeen.set(p, (totalSeen.get(p) || 0) + 1);
      if (!sample.has(p)) sample.set(p, v);
      const def = DEFAULTS_TABLE[p];
      let isNonDefault;
      if (def === undefined) {
        isNonDefault = !/^(none|auto|normal|0s|replace|visible|running|fill|linearrgb|srgb|baseline|0px|0|2|1|inherit|unset|initial|revert|ease|new|alternate|forwards|backwards|both|isolated|additive|accumulate|discrete|each-box|all)$/.test(v);
      } else {
        isNonDefault = (v !== def) && !v.startsWith(def + ' ');
      }
      if (isNonDefault) nonDefaultCount.set(p, (nonDefaultCount.get(p) || 0) + 1);
    }
  }
  return {
    rows: [...totalSeen.entries()].map(([p, count]) => ({
      p, count, sample: sample.get(p),
      nonDefault: nonDefaultCount.get(p) || 0,
    })),
  };
}, Object.fromEntries(DEFAULTS));

// Filter: only include props where at least one element had a non-default value.
const gaps = [];
const supported = [];
for (const { p, count, sample: sampleV, nonDefault } of stats.rows) {
  if (nonDefault === 0) continue;          // never differs from spec default
  const def = DEFAULTS.get(p);
  if (captured.has(toCamel(p))) supported.push({ p, count, nonDefault, sample: sampleV });
  else gaps.push({ p, count, nonDefault, sample: sampleV });
}

function toCamel(k) {
  return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^webkit/i, 'webkit');
}

// Sort gaps by count desc.
gaps.sort((a, b) => b.count - a.count);
supported.sort((a, b) => b.count - a.count);

console.log('=== CSS props ACTUALLY CUSTOMIZED and captured by ElementStyle ===');
for (const { p, count, nonDefault, sample } of supported.slice(0, 40)) {
  console.log(`  ${p.padEnd(36)} ${String(nonDefault).padStart(4)}/${String(count).padEnd(4)}  e.g. ${sample.slice(0, 60)}`);
}
console.log('');
console.log('=== CSS props ACTUALLY CUSTOMIZED but NOT captured (TOP GAPS) ===');
for (const { p, count, nonDefault, sample } of gaps.slice(0, 60)) {
  console.log(`  ${p.padEnd(36)} ${String(nonDefault).padStart(4)}/${String(count).padEnd(4)}  e.g. ${sample.slice(0, 60)}`);
}

await browser.close();