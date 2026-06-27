// Offline capture harness.
//
//   node run-capture.mjs                              # fixture/stripe.html  → snapshot/stripe.json
//   node run-capture.mjs --live                       # http://localhost:5173 → snapshot/live.json
//   node run-capture.mjs --url=https://stripe.com     # arbitrary URL          → snapshot/<host>.json
//   node run-capture.mjs --file=C:\path\to\index.html # static HTML (no server) → snapshot/<basename>.json
//   node run-capture.mjs --name=aether                # override snapshot name
//   node run-capture.mjs --viewport=1440x1024
//   node run-capture.mjs --update-snapshot            # commit the latest capture as the snapshot
//
// On every run, the harness diffs the latest capture against snapshot/<name>.json
// and prints a summary of added / removed / mutated nodes. That's the regression net.

import { chromium } from 'playwright';
import esbuild from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

// ── diff config (declared early to avoid TDZ when referenced by diff helpers) ──
const COMPARE_FIELDS = [
  'type', 'tagName', 'name', 'x', 'y', 'width', 'height', 'text', 'lines', 'textWidth', 'src', 'pseudo',
];
const COMPARE_STYLE_FIELDS = [
  'backgroundColor', 'backgroundImage', 'color', 'fontSize', 'fontFamily', 'fontWeight',
  'textAlign', 'lineHeight', 'borderRadius', 'borderWidth', 'borderColor',
  'paddingTop', 'paddingLeft', 'display', 'flexDirection', 'justifyContent',
  'alignItems', 'gap', 'opacity', 'position', 'backdropFilter',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreEntry = resolve(__dirname, '../extension/src/capture-core.ts');

// ── arg parsing ─────────────────────────────────────────────────────────────

function arg(key, fallback = undefined) {
  const eq = process.argv.find(a => a.startsWith(`--${key}=`));
  if (eq) return eq.slice(key.length + 3);
  if (process.argv.includes(`--${key}`)) return true;
  return fallback;
}

const live           = !!arg('live', false);
const updateSnapshot = !!arg('update-snapshot', false);
const explicitUrl    = arg('url');
const filePathArg    = arg('file');   // local HTML file (no server needed)
const nameOverride   = arg('name');
const viewportArg    = arg('viewport', '1280x900');
const [vwStr, vhStr] = String(viewportArg).split('x');
const viewportW      = Number(vwStr) || 1280;
const viewportH      = Number(vhStr) || 900;

const target =
  explicitUrl   ? explicitUrl
  : filePathArg ? pathToFileURL(resolve(String(filePathArg))).href
  : live        ? 'http://localhost:5173'
  : pathToFileURL(resolve(__dirname, 'fixture/stripe.html')).href;

function deriveName() {
  if (nameOverride) return String(nameOverride);
  if (live) return 'live';
  if (filePathArg) {
    const base = String(filePathArg).replace(/\\/g, '/').split('/').pop() || 'capture';
    return base.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-') || 'capture';
  }
  if (explicitUrl) {
    try { return new URL(target).hostname.replace(/[^a-z0-9]+/gi, '-'); }
    catch { return 'capture'; }
  }
  return 'stripe';
}
const snapshotName = deriveName();
const snapshotDir  = resolve(__dirname, 'snapshot');
if (!existsSync(snapshotDir)) mkdirSync(snapshotDir, { recursive: true });
const snapshotPath = resolve(snapshotDir, `${snapshotName}.json`);

// ── bundle capture-core ──────────────────────────────────────────────────────

const built = await esbuild.build({
  entryPoints: [coreEntry],
  bundle: true,
  format: 'iife',
  globalName: '__CaptureCore',
  write: false,
  logLevel: 'error',
});
const coreSource = built.outputFiles[0].text
  + '\n;window.__buildPayload = __CaptureCore.buildPayload;'
  + '\n;window.__getRasterTargets = __CaptureCore.getRasterTargets;';

// ── launch + load ────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: viewportW, height: viewportH } });

const consoleErrors = [];
page.on('console',   (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  // `networkidle` never settles on many marketing sites (analytics / long-poll),
  // so we wait for the DOM + load event, then BEST-EFFORT for idle without failing.
  // This makes captures deterministic instead of settling at a random load point.
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
} catch (err) {
  await browser.close();
  if (live && /ECONNREFUSED|net::ERR_CONNECTION_REFUSED/.test(String(err))) {
    console.error(`✗ Could not reach ${target}`);
    console.error(`  Is your dev server running?  e.g.  cd your-project && npm run dev`);
  } else {
    console.error(`✗ Failed to load ${target}\n  ${err.message}`);
  }
  process.exit(1);
}

// Lazy-loaded images & below-the-fold sections only render once scrolled into
// view. Step down the whole page, then return to top, so the capture is complete
// and reproducible regardless of viewport.
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = Math.round(window.innerHeight * 0.8);
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await sleep(120);
  }
  window.scrollTo(0, 0);
  await sleep(200);
});

// Force scroll-reveal content visible. Many sites fade elements in via an
// IntersectionObserver-added class with an opacity transition; fast programmatic
// scrolling can miss the observer threshold, leaving product imagery stuck at
// opacity:0 (which the capture correctly treats as invisible and drops). Reveal
// any element still transparent that is wired to transition its opacity.
await page.evaluate(() => {
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) === 0 && /opacity|all/.test(cs.transitionProperty)) {
      el.style.setProperty('opacity', '1', 'important');
    }
  }
});

// Wait for web fonts + any images triggered by the scroll to finish.
await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
await page.evaluate(async () => {
  const imgs = Array.from(document.images).filter((i) => !i.complete);
  await Promise.all(imgs.map((i) => new Promise((res) => {
    i.addEventListener('load', res, { once: true });
    i.addEventListener('error', res, { once: true });
    setTimeout(res, 3000);
  })));
});
await page.waitForTimeout(500);

await page.addScriptTag({ content: coreSource });

const payload = await page.evaluate(() => window.__buildPayload(document.body, 'full-page'));

// ── Rasterize flagged elements (real Chromium pixels via element screenshot) ──
// Mirrors the extension pipeline: each Figma-impossible element is captured as a
// PNG and stored in payload.images keyed by rasterId. Proves the data contract.
const rasterTargets = await page.evaluate(() => window.__getRasterTargets());
let rasterOk = 0, rasterFail = 0;
if (rasterTargets.length) {
  payload.images = payload.images || {};
  for (const t of rasterTargets) {
    try {
      const buf = await page.locator(`[data-h2f-rid="${t.id}"]`).first()
        .screenshot({ timeout: 5000, animations: 'disabled' });
      payload.images[t.id] = `data:image/png;base64,${buf.toString('base64')}`;
      rasterOk++;
    } catch (e) {
      rasterFail++;
      console.log(`  ⚠ raster failed for ${t.id} (${t.reason}): ${e.message.split('\n')[0]}`);
    }
  }
}

await browser.close();

// ── write capture.json + summary ─────────────────────────────────────────────

const outPath = resolve(__dirname, 'capture.json');
writeFileSync(outPath, JSON.stringify(payload, null, 2));

let total = 0;
const walk = (n) => { total++; (n.children || []).forEach(walk); };
payload.nodes.forEach(walk);

console.log(`✓ Captured ${target}`);
console.log(`  viewport: ${viewportW}x${viewportH}   page: ${payload.viewport.width}x${payload.viewport.height}`);
console.log(`  top-level: ${payload.nodes.length}    total: ${total} nodes`);
if (rasterTargets.length) console.log(`  rasterized: ${rasterOk} ok${rasterFail ? `, ${rasterFail} failed` : ''}`);
console.log(`  written:   ${outPath}`);
if (consoleErrors.length) console.log(`  ⚠ page errors: ${consoleErrors.length}`);

// ── snapshot diff ────────────────────────────────────────────────────────────

if (updateSnapshot) {
  // Snapshot tracks node structure, not image bytes — strip images to stay lean.
  const { images: _omit, ...lean } = payload;
  writeFileSync(snapshotPath, JSON.stringify(lean, null, 2));
  console.log(`  💾 snapshot updated: ${snapshotPath}`);
} else if (existsSync(snapshotPath)) {
  const prev = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const diff = diffPayloads(prev, payload);
  console.log(`\n══ SNAPSHOT DIFF vs ${snapshotName}.json ══`);
  console.log(`  added:    ${diff.added}`);
  console.log(`  removed:  ${diff.removed}`);
  console.log(`  mutated:  ${diff.mutated}  (${diff.mutationDetail.length} field-level)`);
  if (diff.added || diff.removed || diff.mutated) {
    console.log(`  ▸ first 10 changes:`);
    diff.changes.slice(0, 10).forEach(c => console.log(`    · ${c}`));
    console.log(`  (use --update-snapshot to accept these as the new baseline)`);
  } else {
    console.log(`  ✓ no changes`);
  }
} else {
  console.log(`  (no snapshot yet — run with --update-snapshot to create one)`);
}

// ── diff helpers ─────────────────────────────────────────────────────────────

function diffPayloads(a, b) {
  const out = { added: 0, removed: 0, mutated: 0, mutationDetail: [], changes: [] };
  diffNodeList(a.nodes || [], b.nodes || [], 'root', out);
  return out;
}

function diffNodeList(prev, curr, path, out) {
  const len = Math.max(prev.length, curr.length);
  for (let i = 0; i < len; i++) {
    const p = prev[i], c = curr[i];
    const here = `${path}[${i}]`;
    if (!p && c)        { out.added++;   out.changes.push(`+ ${here}  ${c.name || c.type}`); recursiveCount(c, 'added', out); }
    else if (p && !c)   { out.removed++; out.changes.push(`- ${here}  ${p.name || p.type}`); recursiveCount(p, 'removed', out); }
    else if (p && c)    {
      const mutations = [];
      for (const f of COMPARE_FIELDS)        if (p[f] !== c[f] && !(p[f] == null && c[f] == null)) mutations.push(`${f}: ${json(p[f])} → ${json(c[f])}`);
      for (const f of COMPARE_STYLE_FIELDS)  if (p.style?.[f] !== c.style?.[f]) mutations.push(`style.${f}: ${json(p.style?.[f])} → ${json(c.style?.[f])}`);
      if (mutations.length) {
        out.mutated++;
        out.mutationDetail.push(...mutations);
        out.changes.push(`~ ${here}  ${c.name || c.type}  (${mutations.slice(0,2).join('; ')}${mutations.length>2?`; +${mutations.length-2} more`:''})`);
      }
      diffNodeList(p.children || [], c.children || [], `${here}.children`, out);
    }
  }
}
function recursiveCount(node, kind, out) {
  for (const c of node.children || []) { out[kind]++; recursiveCount(c, kind, out); }
}
function json(v) { const s = JSON.stringify(v); return s && s.length > 30 ? s.slice(0,27)+'…' : s; }
