// Renders capture.json back into an HTML preview.
// Open preview.html in your browser next to the original page — you'll see
// exactly what the capture produced, with no Figma round-trip.
//
//   node visual-diff.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const payload   = JSON.parse(readFileSync(resolve(__dirname, 'capture.json'), 'utf8'));
const images    = payload.images || {};
const outPath   = resolve(__dirname, 'preview.html');

// --- helpers ---------------------------------------------------------------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styleFromNode(n) {
  const s   = n.style || {};
  const css = [];

  // For single-line text mirror Figma's WIDTH_AND_HEIGHT auto-resize:
  //  • Box width = textWidth (never less, so no font-substitution clipping).
  //  • For center/right alignment within a wider captured box, shift x to keep
  //    the visual position correct.
  let visualX = n.x;
  let visualW = n.width;
  if (n.type === 'text' && n.lines === 1) {
    const tw = n.textWidth || n.width;
    visualW = Math.max(tw, n.width || tw);
    if (tw < n.width) {
      const slack = n.width - tw;
      if      (s.textAlign === 'center') { visualX = n.x + slack / 2; visualW = tw; }
      else if (s.textAlign === 'right')  { visualX = n.x + slack;     visualW = tw; }
      else                                visualW = tw; // left-aligned: box hugs text
    }
  }

  css.push('position:absolute');
  css.push(`left:${visualX}px`);
  css.push(`top:${n.y}px`);
  // Text: width:auto (hug content) so baked '\n' breaks render exactly and
  // nothing clips; centering is anchored by visualX. Non-text uses captured width.
  if (n.type === 'text') {
    css.push(`height:${n.height}px`);
  } else {
    css.push(`width:${visualW}px`);
    css.push(`height:${n.height}px`);
  }
  if (s.opacity && s.opacity !== '1') css.push(`opacity:${s.opacity}`);
  // box
  if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)')
    css.push(`background-color:${s.backgroundColor}`);
  if (s.backgroundImage && s.backgroundImage !== 'none')
    css.push(`background-image:${s.backgroundImage}`);
  if (s.borderRadius && s.borderRadius !== '0px')
    css.push(`border-radius:${s.borderRadius}`);
  if (s.borderStyle && s.borderStyle !== 'none' && parseFloat(s.borderWidth) > 0)
    css.push(`border:${s.borderWidth} ${s.borderStyle} ${s.borderColor}`);
  if (s.boxShadow && s.boxShadow !== 'none')
    css.push(`box-shadow:${s.boxShadow}`);
  if (s.backdropFilter && s.backdropFilter !== 'none')
    css.push(`backdrop-filter:${s.backdropFilter}`);
  // CSS transform — the preview can render the full matrix (skew, rotate, scale).
  // (Figma can only honour rotation; skewed elements stay upright in the plugin.)
  if (s.transform && s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
    css.push(`transform:${s.transform}`);
    css.push(`transform-origin:${s.transformOrigin || '50% 50%'}`);
  }
  // text
  if (n.type === 'text') {
    if (s.color)         css.push(`color:${s.color}`);
    if (s.fontFamily)    css.push(`font-family:${s.fontFamily}`);
    if (s.fontSize)      css.push(`font-size:${s.fontSize}`);
    if (s.fontWeight)    css.push(`font-weight:${s.fontWeight}`);
    if (s.lineHeight)    css.push(`line-height:${s.lineHeight}`);
    if (s.letterSpacing) css.push(`letter-spacing:${s.letterSpacing}`);
    if (s.textAlign)     css.push(`text-align:${s.textAlign}`);
    // Both single- and multi-line mirror Figma WIDTH_AND_HEIGHT now: the capture
    // baked hard '\n' breaks into multi-line text, so we honour them with pre and
    // never auto-wrap. Size to content so nothing clips.
    css.push('white-space:pre');
    css.push('overflow:visible');
  }
  return css.join(';');
}

// Stable sort by z-index — 'auto' counts as 0. Pseudos with z-index:-1 paint first → behind.
function sortByZIndex(children) {
  const z = (n) => {
    const v = n.style?.zIndex;
    if (!v || v === 'auto') return 0;
    const n2 = parseInt(v, 10);
    return Number.isFinite(n2) ? n2 : 0;
  };
  return children.slice().sort((a, b) => z(a) - z(b));
}

function renderNode(n) {
  // Rasterized element → render the captured PNG (real browser pixels).
  if (n.rasterize) {
    const src = n.rasterId && images[n.rasterId];
    if (src) return `<img src="${src}" style="${styleFromNode(n)}" alt="${esc(n.name)}" data-name="${esc(n.name)} (raster)" title="${esc(n.name)} — ${esc(n.rasterReason || 'raster')}" />`;
    return `<div style="${styleFromNode(n)};background:repeating-linear-gradient(45deg,#fdd,#fdd 8px,#fbb 8px,#fbb 16px);display:flex;align-items:center;justify-content:center;color:#900;font:11px/1 sans-serif" title="${esc(n.rasterReason||'')}">raster?</div>`;
  }
  if (n.type === 'image' && n.svgMarkup) {
    return `<div style="${styleFromNode(n)}" data-name="${esc(n.name)}">${n.svgMarkup}</div>`;
  }
  if (n.type === 'image' && n.src) {
    return `<img src="${esc(n.src)}" style="${styleFromNode(n)};object-fit:contain" alt="${esc(n.name)}" data-name="${esc(n.name)}" />`;
  }
  if (n.type === 'image') {
    // placeholder for missing image
    return `<div style="${styleFromNode(n)};background:repeating-linear-gradient(45deg,#eee,#eee 8px,#ddd 8px,#ddd 16px);display:flex;align-items:center;justify-content:center;color:#999;font:11px/1 sans-serif" data-name="${esc(n.name)}">image?</div>`;
  }
  if (n.type === 'text') {
    return `<div style="${styleFromNode(n)}" data-name="${esc(n.name)}" title="${esc(n.name)}">${esc(n.text)}</div>`;
  }
  // frame
  const kids = sortByZIndex(n.children || []).map(renderNode).join('');
  return `<div style="${styleFromNode(n)}" data-name="${esc(n.name)}" title="${esc(n.name)}">${kids}</div>`;
}

// --- write preview ---------------------------------------------------------

const inner = sortByZIndex(payload.nodes || []).map(renderNode).join('\n');
const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Capture preview — ${esc(payload.title || payload.url || '')}</title>
<style>
  html, body { margin: 0; padding: 0; background: #1a1a1a; }
  body { font-family: -apple-system, system-ui, sans-serif; }
  .meta { color: #aaa; padding: 12px 16px; font: 13px/1.4 sans-serif; border-bottom: 1px solid #333; }
  .meta a { color: #7c5cfc; }
  .canvas-wrap {
    background: #2a2a2a;
    padding: 20px;
    overflow: auto;
  }
  .canvas {
    position: relative;
    background: #fff;
    margin: 0 auto;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  }
  .canvas * { box-sizing: border-box; }
  /* hover any node to see its name */
  .canvas [title]:hover { outline: 2px dashed #7c5cfc; outline-offset: -1px; }
</style>
</head><body>
<div class="meta">
  Capture preview of <strong>${esc(payload.url || '')}</strong>
  &nbsp;·&nbsp; ${payload.viewport.width}×${payload.viewport.height}px
  &nbsp;·&nbsp; ${(payload.nodes || []).length} top-level nodes
  &nbsp;·&nbsp; <em>Hover any element to see its captured name.</em>
</div>
<div class="canvas-wrap">
  <div class="canvas" style="width:${payload.viewport.width}px; height:${payload.viewport.height}px">
    ${inner}
  </div>
</div>
</body></html>`;

writeFileSync(outPath, html);
console.log(`✓ preview written: ${outPath}`);
console.log(`  open this in your browser next to the original page.`);
