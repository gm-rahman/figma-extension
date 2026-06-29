// Reads capture.json and reports structure + likely rendering problems,
// replicating the decisions plugin.ts makes — so we can find bugs WITHOUT Figma.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(readFileSync(resolve(__dirname, 'capture.json'), 'utf8'));

const px = (v) => parseFloat(v) || 0;
const problems = [];   // real rendering issues
const notes    = [];   // informational — source-HTML limitations, not bugs

// Replicate plugin.ts text sizing decision (now driven by captured node.lines).
function textSizing(node) {
  const fontSize = px(node.style.fontSize) || 14;
  const lhPx = px(node.style.lineHeight) || fontSize * 1.2;
  const lineCount = node.lines ?? Math.max(1, Math.round(node.height / lhPx));
  return { fontSize, lhPx, lineCount, mode: lineCount <= 1 ? 'WIDTH_AND_HEIGHT' : 'HEIGHT' };
}

// Rough text-width estimate (avg glyph ~0.52em for sans).
function estWidth(text, fontSize) {
  const line = text.split('\n')[0];
  return line.length * fontSize * 0.52;
}

function flexInfo(node) {
  const d = node.style.display;
  if (d === 'flex' || d === 'inline-flex')
    return `flex/${node.style.flexDirection} gap:${node.style.gap}`;
  if (d === 'grid' || d === 'inline-grid')
    return `grid cols:[${node.style.gridTemplateColumns}] gap:${node.style.gap}`;
  return '';
}

// Detect gradients on a node's bg and report stop count.
function gradientInfo(node) {
  const bg = node.style?.backgroundImage || '';
  if (!bg || bg === 'none' || !bg.includes('gradient')) return '';
  // Rough stop count: rgb/rgba/hex matches
  const stops = bg.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g) || [];
  const degM  = bg.match(/(\d+(?:\.\d+)?)deg/);
  const toM   = bg.match(/to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?/);
  const dir   = degM ? `${degM[1]}deg` : toM ? `to ${toM[1]}${toM[2] ? ' '+toM[2] : ''}` : 'default';
  return `GRADIENT ${dir} stops:${stops.length}`;
}

let line = 0;
const counts = { svg: 0, svgWithMarkup: 0, img: 0, imgWithSrc: 0, gradients: 0, pseudos: 0 };
const fontFamilies = new Map();          // family → use count
const backdropNodes = [];                // nodes with non-trivial backdrop-filter
const inputsWithSiblings = [];           // form fields where icon siblings should survive (Phase 4 check)
const bgImageMissed = [];                // backgroundImage present but no extracted URL (Phase 6 check)
const transformedNodes = [];             // nodes with non-identity transform (Phase 7 — not applied)
const rasterNodes = [];                  // nodes flagged for rasterization (Gap #3)

function firstFamily(ff) {
  return (ff || '').split(',')[0].trim().replace(/^["']|["']$/g, '') || '';
}

function printNode(node, depth, parent) {
  line++;
  const pad = '  '.repeat(depth);
  const pos = `(${node.x},${node.y} ${node.width}x${node.height})`;
  let extra = '';

  // Collect font usage on every node that has a font (text + frames that propagate)
  const fam = firstFamily(node.style?.fontFamily);
  if (fam && node.type === 'text') fontFamilies.set(fam, (fontFamilies.get(fam) || 0) + 1);

  // Backdrop-filter detection (Phase 5 will capture; today flagged for visibility)
  const bf = node.style?.backdropFilter;
  if (bf && bf !== 'none') backdropNodes.push({ name: node.name, value: bf });

  // Background-image present but no extractable URL (Phase 6)
  const bgImg = node.style?.backgroundImage;
  if (bgImg && bgImg !== 'none' && bgImg.includes('url(') && !node.style?.backgroundImageUrl)
    bgImageMissed.push(node.name);

  // Pseudo-element flag (Phase 1)
  if (node.pseudo) counts.pseudos++;

  // Rasterization flag (Gap #3)
  if (node.rasterize) rasterNodes.push({ name: node.name, reason: node.rasterReason, w: node.width, h: node.height });

  // Transform diagnostic (Phase 7) — captured but not applied to Figma nodes
  const tr = node.style?.transform;
  if (tr && tr !== 'none' && tr !== 'matrix(1, 0, 0, 1, 0, 0)')
    transformedNodes.push({ name: node.name, value: tr });

  // Input-with-icon pattern check (Phase 4):
  // form-control parents whose only child is a "Value" text → no icon siblings preserved.
  if (parent && (node.tagName === 'input' || node.tagName === 'select' || node.tagName === 'textarea')) {
    inputsWithSiblings.push({ name: node.name, siblings: (parent.children || []).length });
  }

  if (node.type === 'text') {
    const t = textSizing(node);
    const txt = JSON.stringify((node.text || '').slice(0, 50));
    extra = ` "${txt.slice(1, -1)}" fs:${t.fontSize} lh:${t.lhPx} lines:${t.lineCount}→${t.mode}`;
    if (node.textWidth != null) extra += ` tw:${node.textWidth}`;
    if (node.pseudo)            extra += ` ::${node.pseudo}`;

    // Option-dump only matters for collapsed form-control values — multi-line
    // body text legitimately contains baked '\n' line breaks now.
    if (node.name === 'Value' && (node.text || '').includes('\n')) {
      const lines = node.text.split('\n').filter(Boolean).length;
      if (lines >= 2)
        problems.push(`OPTION-DUMP? "${node.name}" text has ${lines} lines: ${JSON.stringify(node.text.slice(0,60))}`);
    }
    // (No wrap-risk check needed: multi-line text now carries baked '\n' breaks
    //  and renders with WIDTH_AND_HEIGHT, so Figma hugs the content — never wraps
    //  or clips regardless of font-metric drift.)
    // Informational note (not a bug): single character in a square-ish small box —
    // the source HTML used text where a real page would use an <svg> icon.
    const ch = (node.text || '').trim();
    if (ch.length === 1 && node.width <= 32 && node.height <= 32 &&
        Math.abs(node.width - node.height) < 12) {
      notes.push(`"${node.name}" renders "${ch}" as text in a ${node.width}×${node.height} box — if the source used an <svg>, it'd import as a real icon.`);
    }
  } else if (node.type === 'image') {
    if (node.rasterize) {
      // Rasterized elements carry their PNG in the images map keyed by rasterId,
      // not via src/bgUrl — not a missing image.
      extra = ` RASTER ${node.rasterReason || ''}`;
    } else if (node.tagName === 'svg') {
      counts.svg++;
      if (node.svgMarkup) {
        counts.svgWithMarkup++;
        extra = ` SVG ✓ markup ${node.svgMarkup.length}b`;
      } else {
        extra = ` SVG ✗ NO MARKUP`;
        problems.push(`SVG-NO-MARKUP "${node.name}" will render as grey placeholder`);
      }
    } else {
      counts.img++;
      // <img> uses node.src; CSS background-image lives on style.backgroundImageUrl.
      const url = node.src || node.style?.backgroundImageUrl;
      if (url) {
        counts.imgWithSrc++;
        const short = url.length > 60 ? url.slice(0,57)+'…' : url;
        const where = node.src ? 'src' : 'bg-image';
        extra = ` IMG ✓ ${where}=${short}`;
      } else {
        extra = ` IMG ✗ NO SRC`;
        problems.push(`IMG-NO-SRC "${node.name}" will render as grey placeholder`);
      }
    }
  } else {
    const fi = flexInfo(node);
    const gi = gradientInfo(node);
    if (gi) { counts.gradients++; extra += ` ${gi}`; }
    if (fi) extra += ` [${fi}]`;
  }

  if (node.rasterize) extra += ` 🖼 RASTER(${node.rasterReason})`;
  const flag = node.rasterize ? '▦' : node.type === 'frame' ? '▢' : node.type === 'text' ? 'T' : node.type === 'image' ? '▣' : '?';
  console.log(`${pad}${flag} ${node.name} ${pos}${extra}`);

  for (const c of node.children || []) printNode(c, depth + 1, node);
}

console.log('═══ CAPTURE TREE ═══');
for (const n of payload.nodes) printNode(n, 0, null);

console.log('\n═══ ASSET COVERAGE ═══');
console.log(`  SVG icons:       captured=${counts.svg}  withMarkup=${counts.svgWithMarkup}`);
console.log(`  Images:          captured=${counts.img}  withSrc=${counts.imgWithSrc}`);
console.log(`  Gradients:       ${counts.gradients}`);
console.log(`  Pseudo-elements: ${counts.pseudos}  (Phase 1 captures these)`);
console.log(`  Backdrop-filter: ${backdropNodes.length}  (Phase 5 applies as BACKGROUND_BLUR)`);
console.log(`  bg-image missed: ${bgImageMissed.length}  (Phase 6 hardens URL extraction)`);
console.log(`  transforms:      ${transformedNodes.length}  (full affine — rotation + skew + scale — applied via relativeTransform)`);
console.log(`  rasterized:      ${rasterNodes.length}  (Figma-impossible CSS → captured as image)`);
rasterNodes.slice(0, 8).forEach(n => console.log(`    · ${n.name} (${n.w}×${n.h}) — ${n.reason}`));
backdropNodes.slice(0, 3).forEach(n => console.log(`    · ${n.name}: ${n.value}`));
bgImageMissed.slice(0, 3).forEach(n => console.log(`    · ${n} — bg present, no URL extracted`));
transformedNodes.slice(0, 3).forEach(n => console.log(`    · ${n.name}: ${n.value}`));

console.log('\n═══ FONT USAGE ═══');
const sorted = [...fontFamilies.entries()].sort((a, b) => b[1] - a[1]);
if (!sorted.length) console.log('  (no text captured)');
else sorted.forEach(([f, n]) => console.log(`  ${f.padEnd(28)} ×${n}`));
console.log('  → Phase 2: verify each family is installed in Figma OR mapped to a fallback.');

console.log('\n═══ INPUT WRAPPERS ═══');
if (!inputsWithSiblings.length) console.log('  (no form controls captured)');
else inputsWithSiblings.forEach(i =>
  console.log(`  ${i.name}: parent has ${i.siblings} siblings ${i.siblings > 1 ? '✓ icon may survive' : '⚠ standalone'}`));

console.log('\n═══ PROBLEMS (' + problems.length + ') ═══');
if (problems.length === 0) console.log('  none detected by heuristics');
else problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

console.log('\n═══ NOTES (' + notes.length + ') ═══  (informational — source-HTML choices, not capture bugs)');
if (notes.length === 0) console.log('  none');
else notes.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
