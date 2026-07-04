// Phase 3 sub-probe S1 — for Container:ForBusiness_self__l5EtV on fresha.com.
// Question: does any descendant of ForBusiness_self carry `display: none`,
// `visibility: hidden`, or `opacity: 0` such that the walker would prune it?
//
// Method: load fresha.com, locate the ForBusiness_self element by its
// `data-h2f-id` or React hashed class fingerprint, walk descendants and report
// visibility state per node. We DO NOT trigger the force-reveal pass — we read
// the page state as the walker sees it.
//
// Run:  cd test && node probe-s1.mjs [url]
// Output: stdout table of (depth, tag, class, display, visibility, opacity,
//         isCaptureDropped) for every descendant that the walker would drop.

import { chromium } from 'playwright';

const url = process.argv[2] || 'https://www.fresha.com/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
} catch (e) {
  console.error('✗ failed to load:', e.message);
  await browser.close();
  process.exit(1);
}

// Scroll to load lazy content (mirrors run-capture.mjs).
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = Math.round(window.innerHeight * 0.8);
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    window.scrollTo(0, y); await sleep(120);
  }
  window.scrollTo(0, 0); await sleep(200);
});

await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
await page.waitForTimeout(500);

// 1. Locate ForBusiness_self in the live DOM.
// Live className is "ForBusiness_self__l5EtV" (no "Container:" prefix —
// that is added at capture-time by capture-core's serializer).
const result = await page.evaluate(() => {
  const root = Array.from(document.querySelectorAll('div')).find((el) =>
    /ForBusiness_self__l5EtV/.test(el.className) || el.getAttribute('data-h2f-name') === 'ForBusiness_self__l5EtV'
  );
  if (!root) return { found: false, classNameCandidates: Array.from(document.querySelectorAll('div')).map(el => el.className).filter(c => /ForBusiness/.test(c)).slice(0, 5) };

  const rows = [];
  let totalDescendants = 0;

  // Walk the descendant subtree, computing depth by tracking parent-child transitions.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let el = walker.currentNode;
  let prevEl = null;
  while (el) {
    // Depth: count ancestors up to root.
    let d = 0;
    let a = el.parentElement;
    while (a && a !== root) { d++; a = a.parentElement; }
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const text = (el.textContent || '').trim().slice(0, 60);

    // The walker has these guards (mirror them locally for reporting):
    const walkerDropsDisplay     = cs.display === 'none';
    const walkerDropsVisibility  = cs.visibility === 'hidden';
    const walkerDropsOpacity0    = parseFloat(cs.opacity) === 0;
    // Size filter (capture-core.ts:1315+):
    const collapsedWidth  = rect.width  < 1;
    const collapsedHeight = rect.height < 1;
    // isClippedAway would consider ancestor clip windows — measure those too.
    let clippedBy = null;
    let p = el.parentElement;
    for (let g = 0; p && g < 100; g++, p = p.parentElement) {
      const cs2 = getComputedStyle(p);
      if ((cs2.overflowX && cs2.overflowX !== 'visible') || (cs2.overflowY && cs2.overflowY !== 'visible')) {
        const b = p.getBoundingClientRect();
        if (rect.right  < b.left - 8 || rect.left > b.right + 8 || rect.bottom < b.top - 8 || rect.top > b.bottom + 8) {
          clippedBy = `${p.tagName.toLowerCase()}.${(p.className||'').slice(0,40)} [${b.left.toFixed(0)},${b.top.toFixed(0)},${b.right.toFixed(0)},${b.bottom.toFixed(0)}]`;
          break;
        }
      }
    }

    // Capture walker drop decision:
    let dropReason = null;
    if (walkerDropsDisplay) dropReason = 'display:none';
    else if (walkerDropsVisibility) dropReason = 'visibility:hidden';
    else if (walkerDropsOpacity0) dropReason = 'opacity:0';
    else if (collapsedWidth || collapsedHeight) dropReason = 'collapsed';

    rows.push({
      depth: d,
      tag:   el.tagName.toLowerCase(),
      cls:   (typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '').slice(0, 50),
      id:    el.id || '',
      rect:  `${rect.left.toFixed(0)},${rect.top.toFixed(0)} ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`,
      dvo:   `${cs.display}/${cs.visibility}/${cs.opacity}`,
      text,
      clippedBy,
      dropReason,
      collapsed: collapsedWidth || collapsedHeight,
    });
    totalDescendants++;
    prevEl = el;
    el = walker.nextNode();
  }

  return {
    found: true,
    rootTag: root.tagName.toLowerCase(),
    rootRect: (() => { const r = root.getBoundingClientRect(); return `${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`; })(),
    rootHTMLChildCount: root.children.length,
    totalDescendants,
    rows,
  };
});

if (!result.found) {
  console.error('✗ Container:ForBusiness_self__l5EtV not found on page.');
  console.error('  Page may not contain this element or React hashed class differs at this viewport.');
  await browser.close();
  process.exit(2);
}

console.log(`✓ ForBusiness_self found: ${result.rootTag} @ ${result.rootRect}`);
console.log(`  direct children: ${result.rootHTMLChildCount}, total descendants walked: ${result.totalDescendants}`);
console.log('');
console.log('Per-element walker verdict (BEFORE force-reveal pass):');
console.log('─────────────────────────────────────────────────────────────────────────────────────────');
console.log('D TAG    CLASS                                RECT                 DISPLAY/VIS/OP         DROP');
console.log('─────────────────────────────────────────────────────────────────────────────────────────');

for (const r of result.rows) {
  const indent = '  '.repeat(r.depth);
  const dropMark = r.dropReason ? `⚠ ${r.dropReason}` : '✓ keep';
  console.log(`${String(r.depth).padStart(1)} ${indent}${r.tag.padEnd(7)} ${(r.cls||'').padEnd(36)} ${r.rect.padEnd(20)} ${r.dvo.padEnd(24)} ${dropMark}`);
  if (r.text) console.log(`${'   '.padStart(4)}└ text: "${r.text}"`);
}

// Count summary
const dropped = result.rows.filter(r => r.dropReason && r.dropReason.startsWith('DROP')).length;
const clipped = result.rows.filter(r => r.clippedBy && r.dropReason === null).length;
const collapsed = result.rows.filter(r => r.dropReason === 'collapsed').length;
const withText = result.rows.filter(r => r.text && r.text.length > 0).length;
const zeroSized = result.rows.filter(r => r.rect && /\b0x\d+|\d+x0\b/.test(r.rect)).length;

console.log('');
console.log(`Summary: total ${result.rows.length} descendants`);
console.log(`  ${withText} contain visible text in the live DOM`);
console.log(`  ${dropped} are explicitly dropped (display:none / visibility:hidden / opacity:0)`);
console.log(`  ${clipped} are clipped out of an ancestor's overflow:hidden window (would be dropped by isClippedAway)`);
console.log(`  ${collapsed} have collapsed rect (width<1 or height<1)`);
console.log(`  ${zeroSized} have a zero-width or zero-height rect (size filter candidate)`);

await browser.close();
