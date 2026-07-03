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

// CSS vh/vw units resolve against the **browser viewport** at capture time, NOT
// the full document. Older captures stored `viewport` as the full page size;
// prefer `browserViewport` when present, fall back to `viewport` for back-compat.
const vUnitViewport = payload.browserViewport || payload.viewport;

// --- helpers ---------------------------------------------------------------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convert viewport-relative length units in a CSS value (gradient stop, etc.)
// to absolute px against the capture's captured browser viewport (NOT the
// full document — `100vh` means 100% of the visible browser window, not 100%
// of the document height). Without this, a captured
// `radial-gradient(circle, ... 20vh 40vh 60vh)` resolves against the full page
// height and the stops land outside the element, painting the 0% color only.
// We only rewrite inside a single CSS *declaration value* (e.g. background-image),
// which is always safe — never touching selectors.
function resolveViewportUnits(value) {
  if (!value || value === 'none') return value;
  if (!/vh|vw|vmin|vmax/.test(value)) return value;
  const vh = vUnitViewport && vUnitViewport.height || 1;
  const vw = vUnitViewport && vUnitViewport.width  || 1;
  return value
    .replace(/(\d*\.?\d+)vh\b/g,  (_, n) => (parseFloat(n) * vh / 100).toFixed(3) + 'px')
    .replace(/(\d*\.?\d+)vw\b/g,  (_, n) => (parseFloat(n) * vw / 100).toFixed(3) + 'px')
    .replace(/(\d*\.?\d+)vmin\b/g,(_, n) => (parseFloat(n) * Math.min(vh, vw) / 100).toFixed(3) + 'px')
    .replace(/(\d*\.?\d+)vmax\b/g,(_, n) => (parseFloat(n) * Math.max(vh, vw) / 100).toFixed(3) + 'px');
}

function styleFromNode(n, inheritedGradient) {
  const s   = n.style || {};
  const css = [];

  // Cascade resolution for Fresha's "gradient text" pattern:
  //   .section { background: radial-gradient(...); background-clip: text;
  //              -webkit-text-fill-color: <opaque> }   ← gradient only paints
  //                                                       on text glyphs of
  //                                                       transparent-fill
  //                                                       descendants.
  //   .child   { background-clip: text;
  //              -webkit-text-fill-color: transparent } ← empty wrapper, no
  //                                                       own paint.
  //   p.text   { (default opaque) }                     ← BUT if THIS p has
  //                                                       fill: transparent
  //                                                       the browser paints
  //                                                       the cascade-source
  //                                                       gradient on its
  //                                                       glyphs.
  //
  // In the live DOM, the cascade source is the nearest ancestor with
  // `bgClip:text + own background-image`. We walk down: any non-text container
  // with `bgClip:text` and a gradient becomes the inherited gradient for its
  // children. A text node with `-webkit-text-fill-color: rgba(0,0,0,0)` AND
  // `background-clip: text` then renders in that inherited gradient color.
  //
  // The `FreshaInNumbers_self` section wrapper itself has `bgClip:text` and
  // opaque fill — so its gradient must NOT paint as a section-wide solid
  // background; the gradient stays invisible on this box and only shows on the
  // descendant transparent-fill text. (Earlier we forced bgClip:text →
  // border-box on the wrapper, which produced a giant pink-purple block that
  // doesn't exist on the live page.)
  let cascadeGradient = inheritedGradient;
  const ownBgImage = (s.backgroundImage && s.backgroundImage !== 'none') ? s.backgroundImage : null;
  const ownBgClip  = s.backgroundClip || s.webkitBackgroundClip || 'border-box';
  if (ownBgImage && ownBgClip === 'text') {
    // A non-text wrapper with bgClip:text + its own gradient becomes the new
    // cascade source for descendants. (Text nodes with own gradient are leaf
    // cases — they apply the gradient to themselves, no further cascade.)
    if (n.type !== 'text') cascadeGradient = ownBgImage;
  }

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
  if (n.type === 'text' && !n.truncate) {
    css.push(`height:${n.height}px`);
  } else {
    css.push(`width:${visualW}px`);
    css.push(`height:${n.height}px`);
  }
  if (s.opacity && s.opacity !== '1') css.push(`opacity:${s.opacity}`);
  // overflow clipping — the captured overflowX/Y on this element MUST flow into
  // the rendered preview so child images/transforms don't bleed past parent
  // bounds (e.g. forBusiness dashboard at -105,-49 2082x776 clipped by parent
  // `Container:d_block ov:hidden/hidden`). Without this every overflow:hidden
  // wrapper in the page would render with overflow:visible.
  const ovX = s.overflowX || 'visible';
  const ovY = s.overflowY || 'visible';
  if (ovX !== 'visible' || ovY !== 'visible') {
    css.push(`overflow:${ovX === ovY ? ovX : ovX + ' ' + ovY}`);
  }
  // box
  if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)')
    css.push(`background-color:${s.backgroundColor}`);
  // The element's own background paint. Honour bgClip:text — it really does
  // mean "only show on text glyphs". A non-text element with `bgClip:text` and
  // an opaque text-fill renders NOTHING for its own bg; we simply omit the
  // `background-image` declaration so the gradient is not painted as a
  // section-wide block (the visual-diff previously forced border-box here,
  // which produced a giant coloured block that doesn't exist on the live
  // page — see FreshaInNumbers_self).
  //
  // A text element with `bgClip:text` (own gradient + own transparent fill) is
  // a leaf — the gradient is applied to its glyphs, no cascade.
  const hasOwnFillTransparent = s.webkitTextFillColor === 'rgba(0, 0, 0, 0)';
  if (ownBgImage) {
    const leafGradient = (ownBgClip === 'text');
    const isTextLeaf   = (n.type === 'text') && leafGradient;
    if (isTextLeaf || (leafGradient && (n.type === 'text'))) {
      css.push(`background-image:${resolveViewportUnits(ownBgImage)}`);
      css.push('background-clip:text');
      css.push('-webkit-background-clip:text');
      css.push('-webkit-text-fill-color:transparent');
      css.push('color:transparent');
    } else if (leafGradient) {
      // Non-text wrapper with bgClip:text + own gradient: it's a CASCADE
      // SOURCE, not a paint target. Skip emitting background-image on this
      // box (its own glyphs are opaque so bgClip:text would hide the
      // gradient anyway, and forcing border-box paints a non-existent
      // section block). The gradient is exposed to descendants via
      // `cascadeGradient` (computed above).
    } else {
      // Normal bg (border-box / padding-box / content-box) — paint as-is.
      css.push(`background-image:${resolveViewportUnits(ownBgImage)}`);
      css.push(`background-clip:${ownBgClip}`);
      css.push(`-webkit-background-clip:${ownBgClip}`);
    }
  }
  if (s.borderRadius && s.borderRadius !== '0px')
    css.push(`border-radius:${s.borderRadius}`);
  if (s.borderStyle && s.borderStyle !== 'none' && parseFloat(s.borderWidth) > 0)
    css.push(`border:${s.borderWidth} ${s.borderStyle} ${s.borderColor}`);
  if (s.boxShadow && s.boxShadow !== 'none')
    css.push(`box-shadow:${s.boxShadow}`);
  if (s.backdropFilter && s.backdropFilter !== 'none')
    css.push(`backdrop-filter:${s.backdropFilter}`);
  if (s.filter && s.filter !== 'none')
    css.push(`filter:${s.filter}`);
  // CSS transform — the preview can render the full matrix (skew, rotate, scale).
  // (Figma can only honour rotation; skewed elements stay upright in the plugin.)
  if (s.transform && s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
    css.push(`transform:${s.transform}`);
    css.push(`transform-origin:${s.transformOrigin || '50% 50%'}`);
  }
  // text
  if (n.type === 'text') {
    // Fresha cascade trick: a text node whose parent has `bgClip:text +
    // gradient` AND this node has `-webkit-text-fill-color: transparent` will
    // render its glyphs in the parent's gradient on the live page. We
    // simulate that here by giving THIS text node its own copy of the
    // cascade gradient + bgClip:text + transparent fill. (Centers and stops
    // resolve against the same viewport, so the visual result matches.)
    const isTransparentFill = (s.webkitTextFillColor === 'rgba(0, 0, 0, 0)');
    if (isTransparentFill && cascadeGradient) {
      css.push(`background-image:${resolveViewportUnits(cascadeGradient)}`);
      css.push('background-clip:text');
      css.push('-webkit-background-clip:text');
      css.push('-webkit-text-fill-color:transparent');
      css.push('color:transparent');
    } else {
      // If the element has -webkit-text-fill-color set (e.g. Fresha's gradient
      // text trick: parent gradient + bgClip:text + transparent text-fill),
      // use that. The text glyph colour is fully determined by it; CSS `color`
      // is ignored when text-fill-color is non-transparent.
      if (s.webkitTextFillColor) css.push(`-webkit-text-fill-color:${s.webkitTextFillColor}`);
      if (s.color) css.push(`color:${s.color}`);
    }
    if (s.fontFamily)    css.push(`font-family:${s.fontFamily}`);
    if (s.fontSize)      css.push(`font-size:${s.fontSize}`);
    if (s.fontWeight)    css.push(`font-weight:${s.fontWeight}`);
    if (s.lineHeight)    css.push(`line-height:${s.lineHeight}`);
    if (s.letterSpacing) css.push(`letter-spacing:${s.letterSpacing}`);
    if (s.textAlign)     css.push(`text-align:${s.textAlign}`);
    if (n.truncate) {
      // CSS ellipsis text: clip at the captured width like the browser/Figma.
      css.push('white-space:nowrap');
      css.push('overflow:hidden');
      css.push('text-overflow:ellipsis');
    } else {
      // Both single- and multi-line mirror Figma WIDTH_AND_HEIGHT: baked '\n'
      // breaks are honoured with pre, never auto-wrap, size to content.
      css.push('white-space:pre');
      css.push('overflow:visible');
    }
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

function renderNode(n, inheritedGradient) {
  // Rasterized element → render the captured PNG (real browser pixels). Use a
  // MINIMAL style: the PNG already contains bg/gradient/filter/clip/transform, and
  // transparent areas must NOT reveal the element's CSS background behind them.
  if (n.rasterize) {
    const s = n.style || {};
    const radius = (s.borderRadius && s.borderRadius !== '0px') ? `;border-radius:${s.borderRadius}` : '';
    const minStyle = `position:absolute;left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px${radius}`;
    const src = n.rasterId && images[n.rasterId];
    if (src) return `<img src="${src}" style="${minStyle}" alt="${esc(n.name)}" data-name="${esc(n.name)} (raster)" title="${esc(n.name)} — ${esc(n.rasterReason || 'raster')}" />`;
    return `<div style="${minStyle};background:repeating-linear-gradient(45deg,#fdd,#fdd 8px,#fbb 8px,#fbb 16px);display:flex;align-items:center;justify-content:center;color:#900;font:11px/1 sans-serif" title="${esc(n.rasterReason||'')}">raster?</div>`;
  }
  if (n.type === 'image' && n.svgMarkup) {
    return `<div style="${styleFromNode(n, inheritedGradient)}" data-name="${esc(n.name)}">${n.svgMarkup}</div>`;
  }
  if (n.type === 'image' && n.src) {
    return `<img src="${esc(n.src)}" style="${styleFromNode(n, inheritedGradient)};object-fit:contain" alt="${esc(n.name)}" data-name="${esc(n.name)}" />`;
  }
  if (n.type === 'image') {
    // CSS background-image element (a div used as an image, e.g. spotlight glow):
    // no <img>/<svg>, but the URL/gradient lives in the style. styleFromNode
    // already emits background-image, so render the box directly (matches how the
    // plugin applies it as an IMAGE fill).
    const s = n.style || {};
    if (s.backgroundImageUrl || (s.backgroundImage && s.backgroundImage !== 'none')) {
      return `<div style="${styleFromNode(n, inheritedGradient)};background-size:cover;background-position:center;background-repeat:no-repeat" data-name="${esc(n.name)}"></div>`;
    }
    // placeholder for missing image
    return `<div style="${styleFromNode(n, inheritedGradient)};background:repeating-linear-gradient(45deg,#eee,#eee 8px,#ddd 8px,#ddd 16px);display:flex;align-items:center;justify-content:center;color:#999;font:11px/1 sans-serif" data-name="${esc(n.name)}">image?</div>`;
  }
  if (n.type === 'text') {
    return `<div style="${styleFromNode(n, inheritedGradient)}" data-name="${esc(n.name)}" title="${esc(n.name)}">${esc(n.text)}</div>`;
  }
  // frame — recompute cascade source for this frame, then thread to children.
  const s = n.style || {};
  const ownBgImage = (s.backgroundImage && s.backgroundImage !== 'none') ? s.backgroundImage : null;
  const ownBgClip  = s.backgroundClip || s.webkitBackgroundClip || 'border-box';
  const childCascade = (ownBgImage && ownBgClip === 'text') ? ownBgImage : inheritedGradient;
  const kids = sortByZIndex(n.children || []).map(c => renderNode(c, childCascade)).join('');
  return `<div style="${styleFromNode(n, inheritedGradient)}" data-name="${esc(n.name)}" title="${esc(n.name)}">${kids}</div>`;
}

// --- write preview ---------------------------------------------------------

const inner = sortByZIndex(payload.nodes || []).map(n => renderNode(n, null)).join('\n');
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
