/// <reference types="@figma/plugin-typings" />

import { CaptureNode, CapturePayload, ElementStyle, FontSubstitution, FrameImport, UIToPlugin } from './types';

figma.showUI(__html__, { width: 320, height: 480, title: 'HTML to Figma' });

let importing = false;

figma.ui.onmessage = async (msg: UIToPlugin) => {
  if (msg.type === 'CREATE_NODES') {
    if (importing) return;
    importing = true;
    try {
      const imageBytes: Record<string, Uint8Array> = {};
      for (const [url, arr] of Object.entries(msg.imageMap ?? {})) {
        imageBytes[url] = new Uint8Array(arr);
      }
      const wrapper = await buildFigmaNodes(msg.payload, imageBytes);
      figma.viewport.scrollAndZoomIntoView([wrapper]);
      figma.ui.postMessage({
        type: 'IMPORT_DONE',
        name: msg.payload.title,
        substitutions: fontSubstitutions.length ? [...fontSubstitutions] : undefined,
      });
    } catch (err) {
      figma.ui.postMessage({ type: 'ERROR', message: String(err) });
    } finally {
      importing = false;
    }
  }

  if (msg.type === 'CREATE_NODES_MULTI') {
    if (importing) return;
    importing = true;
    try {
      const name = await buildMultiViewport(msg.frames);
      figma.ui.postMessage({
        type: 'IMPORT_DONE',
        name: `${msg.frames.length} viewports (${name})`,
        substitutions: fontSubstitutions.length ? [...fontSubstitutions] : undefined,
      });
    } catch (err) {
      figma.ui.postMessage({ type: 'ERROR', message: String(err) });
    } finally {
      importing = false;
    }
  }
};

// ── SVG image helpers ───────────────────────────────────────────────────────
// figma.createImage decodes PNG/JPG/GIF only — NOT SVG. SVGs that arrive as an
// image source (e.g. `background:url(glow.svg)`) must be rendered as native
// vectors via createNodeFromSvg instead, or they fail and fall back to a flat box.

function decodeUtf8(bytes: Uint8Array): string {
  // Figma's plugin runtime may not expose TextDecoder; decode UTF-8 manually.
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      const c = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    }
  }
  return out;
}

// Returns SVG markup if the bytes are an SVG, else null. Raster magic numbers are
// rejected up front so we never decode a large PNG/JPEG just to sniff it.
function svgMarkupFromBytes(bytes: Uint8Array | undefined): string | null {
  if (!bytes || bytes.length < 4) return null;
  const [a, b, c] = bytes;
  if (a === 0x89 && b === 0x50) return null;                 // PNG
  if (a === 0xff && b === 0xd8) return null;                 // JPEG
  if (a === 0x47 && b === 0x49 && c === 0x46) return null;   // GIF
  if (a === 0x52 && b === 0x49 && c === 0x46) return null;   // RIFF (WEBP)
  const text = decodeUtf8(bytes);
  return /<svg[\s>]/i.test(text) ? text : null;
}

// Figma's createNodeFromSvg cannot render SVG <filter> (feGaussianBlur) — it
// throws, dropping the whole layer. Strip every `filter="url(#…)"` reference so
// the underlying shapes render, and convert the feGaussianBlur stdDeviation into
// a Figma LAYER_BLUR radius (scaled from the SVG viewBox to the target width).
function stripSvgBlur(markup: string, targetW: number): { markup: string; blur: number } {
  if (!/filter\s*=\s*"url\(/i.test(markup)) return { markup, blur: 0 };
  const std   = markup.match(/feGaussianBlur[^>]*stdDeviation\s*=\s*"?([\d.]+)/i);
  const vb     = markup.match(/viewBox\s*=\s*"[\d.]+ [\d.]+ ([\d.]+)/i);
  const vbW    = vb ? parseFloat(vb[1]) : targetW;
  const scale  = vbW > 0 ? targetW / vbW : 1;
  const blur   = std ? parseFloat(std[1]) * scale : 0;
  const clean  = markup.replace(/\s*filter\s*=\s*"url\([^)]*\)"/gi, '');
  return { markup: clean, blur: Math.min(blur, 100) }; // Figma caps blur radius at 100
}

// ── Color helpers ─────────────────────────────────────────────────────────

interface ParsedColor { color: RGB; opacity: number; }

function parseCssColor(css: string): ParsedColor | null {
  if (!css || css === 'transparent') return null;
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (m) {
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a === 0) return null;
    return { color: { r: +m[1]/255, g: +m[2]/255, b: +m[3]/255 }, opacity: a };
  }
  const hex = css.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map(c => c+c).join('');
    const a = h.length === 8 ? parseInt(h.slice(6,8), 16)/255 : 1;
    if (a === 0) return null;
    return {
      color: { r: parseInt(h.slice(0,2),16)/255, g: parseInt(h.slice(2,4),16)/255, b: parseInt(h.slice(4,6),16)/255 },
      opacity: a,
    };
  }
  return null;
}

// ── Gradient helpers ──────────────────────────────────────────────────────

// Convert viewport-relative length units (vh/vw/vmin/vmax) inside a gradient
// stop position into the [0,1] range CSS uses for gradient stop positions.
//
// Why we need this:
//   CSS gradient stops can be either percentages (`50%`) OR absolute lengths
//   (`120px`, `30vh`). Figma's gradient stops only accept [0, 1] positions.
//   Without normalising vh to the captured viewport, a Fresha-style
//   `radial-gradient(circle, red 20vh, blue 60vh)` lands all stops at evenly-
//   spaced positions and renders as a flat first-colour block.
//
// The "right" denominator is the gradient extent (radius for radial, line
// length for linear). We don't know it here, but for vh/vw stops the captured
// viewport is a close approximation: a FreshaInNumbers section in a 1440x900
// browser viewport paints `20vh` at roughly 20% of its radius. We treat the
// viewport itself as the reference frame, then clamp to [0, 1].
function resolveStopPosition(pos: string, vw: number, vh: number): number | null {
  if (!pos) return null;
  const t = pos.trim();
  if (t.endsWith('%')) return parseFloat(t) / 100;
  const v = parseFloat(t);
  if (!Number.isFinite(v)) return null;
  if (t.endsWith('vh'))  return v / 100;          // treat 20vh ≈ 20% of gradient extent
  if (t.endsWith('vw'))  return v / 100;
  if (t.endsWith('vmin'))return v / 100;
  if (t.endsWith('vmax'))return v / 100;
  return null;                                    // px / no-unit → keep undefined, evenly space
}

// Holds the captured viewport so gradient parsing can normalise vh/vw stops.
//   module-scoped because every gradient parses against the same payload.
let _vw = 0;
let _vh = 0;
export function setViewportForGradients(w: number, h: number) { _vw = w; _vh = h; }

function parseGradientStops(css: string): ColorStop[] {
  const stops: ColorStop[] = [];
  // Accept percentage OR absolute length (px, vh, vw, vmin, vmax) as the stop
  // position. The previous regex only knew about `%`, which dropped every
  // length-based stop (returning all positions as `undefined`).
  const pattern = /(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})(\s+[\d.]+(?:%|px|vh|vw|vmin|vmax)\b)?/g;
  let m: RegExpExecArray | null;
  const raw: Array<{color: string; pos?: number}> = [];
  while ((m = pattern.exec(css)) !== null) {
    const resolvedPos = m[2] ? resolveStopPosition(m[2].trim(), _vw, _vh) : undefined;
    raw.push({ color: m[1], pos: resolvedPos == null ? undefined : resolvedPos });
  }
  if (raw.length < 2) return [];
  // For any undefined positions, fall back to evenly spacing them across the
  // range of the defined siblings (keeps `red, blue 50%` from collapsing).
  let firstDefined = raw.findIndex(s => s.pos !== undefined);
  let lastDefined  = -1;
  for (let i = raw.length - 1; i >= 0; i--) if (raw[i].pos !== undefined) { lastDefined = i; break; }
  if (firstDefined < 0 || lastDefined < 0) {
    raw.forEach((s, i) => { s.pos = i / (raw.length - 1); });
  } else {
    raw.forEach((s, i) => {
      if (s.pos === undefined) {
        s.pos = (firstDefined + (i - firstDefined) * (lastDefined - firstDefined) / Math.max(1, raw.length - 1 - firstDefined)) / Math.max(1, lastDefined);
      }
    });
  }
  for (const s of raw) {
    const p = parseCssColor(s.color);
    if (p) stops.push({ position: clamp01(s.pos!), color: { r: p.color.r, g: p.color.g, b: p.color.b, a: p.opacity } });
  }
  return stops;
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

function linearGradientFill(css: string): GradientPaint | null {
  const stops = parseGradientStops(css);
  if (stops.length < 2) return null;

  let deg = 180;
  const degM = css.match(/(\d+(?:\.\d+)?)deg/);
  if (degM) deg = parseFloat(degM[1]);
  const toM = css.match(/to\s+(top|bottom|left|right)/);
  if (toM) deg = ({ top: 0, right: 90, bottom: 180, left: 270 } as Record<string, number>)[toM[1]] ?? 180;

  const rad = deg * Math.PI / 180;
  const dx  =  Math.sin(rad);
  const dy  = -Math.cos(rad);
  const P0x = 0.5 - dx * 0.5;
  const P0y = 0.5 - dy * 0.5;

  const gradientTransform: [[number, number, number], [number, number, number]] = [
    [ dx, -dy, P0x],
    [ dy,  dx, P0y],
  ];

  return { type: 'GRADIENT_LINEAR', gradientTransform, gradientStops: stops };
}

// Radial / conic / repeating gradients → Figma GRADIENT_RADIAL with a centered
// transform. Not pixel-exact (CSS radial sizing/position is richer than Figma's),
// but renders the real multi-stop gradient instead of a flat first-color block —
// which is what produced the giant "pink rectangle" when a rasterized section
// fell back to resolveFills (e.g. multi-viewport, where rasterization is skipped).
function radialGradientFill(css: string): GradientPaint | null {
  const stops = parseGradientStops(css);
  if (stops.length < 2) return null;
  // Centered ellipse covering the box: maps gradient space to the element centre.
  const gradientTransform: [[number, number, number], [number, number, number]] = [
    [0.5, 0, 0.25],
    [0, 0.5, 0.25],
  ];
  return { type: 'GRADIENT_RADIAL', gradientTransform, gradientStops: stops };
}

function resolveFills(style: ElementStyle, isTextNode = false): Paint[] {
  const bg = style.backgroundImage;

  // `background-clip: text` on a NON-text element (e.g. a section wrapper like
  // Fresha's `FreshaInNumbers_self`) hides its own background — the gradient
  // only paints on the TEXT GLYPHS of transparent-fill descendants. Figma has
  // no equivalent of this CSS-only cascade, but we *can* model the cascade
  // explicitly: buildNode threads the cascade-source gradient down to text
  // descendants. For the wrapper itself we return [] so Figma doesn't paint a
  // non-existent section-wide block.
  // (For a TEXT node, bgClip:text is the leaf case: apply the gradient as its
  // text fill — that's handled in the `case 'text':` branch, not here.)
  const bgClip = style.backgroundClip || style.webkitBackgroundClip;
  if (bg && bg !== 'none' && !bg.includes('url(')) {
    if (bgClip === 'text' && !isTextNode) return [];
  }

  // Check gradient BEFORE solid — gradient shorthand sets backgroundColor to transparent
  if (bg && bg !== 'none' && !bg.includes('url(')) {
    if (bg.includes('linear-gradient')) {
      const g = linearGradientFill(bg);
      if (g) return [g];
    }
    // radial / conic / repeating → native radial gradient (NOT a solid first-colour).
    if (bg.includes('radial-gradient') || bg.includes('conic-gradient')) {
      const g = radialGradientFill(bg);
      if (g) return [g];
    }
    // Any other gradient form we don't model → still build a gradient from its
    // stops rather than collapsing to one solid colour.
    if (bg.includes('gradient')) {
      const g = linearGradientFill(bg) || radialGradientFill(bg);
      if (g) return [g];
    }
  }

  const solid = parseCssColor(style.backgroundColor);
  if (solid) return [{ type: 'SOLID', color: solid.color, opacity: solid.opacity }];

  return [];
}

function parsePx(v: string): number { return parseFloat(v) || 0; }

// Stable sort by z-index so decorative pseudos with negative z-index land BEHIND
// content (Figma paints earlier children behind later ones — same as DOM).
// 'auto' counts as 0. Modern Array.sort is stable, so equal-z keeps DOM order.
function sortByZIndex(children: CaptureNode[]): CaptureNode[] {
  const z = (n: CaptureNode) => {
    const v = n.style?.zIndex;
    if (!v || v === 'auto') return 0;
    const n2 = parseInt(v, 10);
    return Number.isFinite(n2) ? n2 : 0;
  };
  return children.slice().sort((a, b) => z(a) - z(b));
}

// Parse a CSS 2D transform into matrix coefficients [a,b,c,d,e,f], or null.
function parseMatrix(transform: string | undefined): [number,number,number,number,number,number] | null {
  if (!transform || transform === 'none') return null;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return null;                              // matrix3d / unsupported → skip
  const p = m[1].split(',').map(v => parseFloat(v.trim()));
  if (p.length < 6 || p.some(v => !Number.isFinite(v))) return null;
  return [p[0], p[1], p[2], p[3], p[4], p[5]];
}

function isIdentity(mx: [number,number,number,number,number,number]): boolean {
  const [a,b,c,d,e,f] = mx;
  return Math.abs(a-1)<1e-4 && Math.abs(b)<1e-4 && Math.abs(c)<1e-4 &&
         Math.abs(d-1)<1e-4 && Math.abs(e)<0.5 && Math.abs(f)<0.5;
}

// Apply a CSS transform (rotation, skew, scale — full affine) to a Figma node via
// relativeTransform. CSS applies the matrix about transform-origin; Figma's matrix
// is about the node's own (0,0). We translate to the origin, apply, translate back,
// then fold in the node's page position (x,y).
// Figma relativeTransform = [[a, c, tx],[b, d, ty]].
function applyTransform(
  node: SceneNode & { relativeTransform: Transform },
  style: ElementStyle,
  x: number, y: number,
): void {
  const mx = parseMatrix(style.transform);
  if (!mx || isIdentity(mx)) { node.x = x; node.y = y; return; }
  const [a, b, c, d, e, f] = mx;

  // transform-origin relative to the node's top-left (px, with % resolved to size).
  const [oxRaw, oyRaw] = (style.transformOrigin || '50% 50%').split(/\s+/);
  const ox = oxRaw?.endsWith('%') ? (parseFloat(oxRaw)/100) * node.width  : parseFloat(oxRaw) || 0;
  const oy = oyRaw?.endsWith('%') ? (parseFloat(oyRaw)/100) * node.height : parseFloat(oyRaw) || 0;

  // Net translation so the transform pivots about the origin, plus page offset + CSS translate (e,f).
  const tx = x + e + ox - (a * ox + c * oy);
  const ty = y + f + oy - (b * ox + d * oy);

  try {
    node.relativeTransform = [[a, c, tx], [b, d, ty]];
  } catch {
    node.x = x; node.y = y;   // fallback if the node type rejects the matrix
  }
}

// Apply CSS per-corner radius. If all four corners are equal we use the shorthand,
// otherwise set each individually. CSS allows elliptical corners ("10px / 4px");
// Figma supports only circular — we take the horizontal radius.
// Accepts any node with corner-radius props (FrameNode, RectangleNode, ...).
type CornerNode = Pick<RectangleNode,
  'cornerRadius' | 'topLeftRadius' | 'topRightRadius' | 'bottomRightRadius' | 'bottomLeftRadius'>;
function applyCornerRadii(frame: CornerNode, style: ElementStyle): void {
  const oneOf = (v: string) => parsePx((v || '').split('/')[0].trim());
  const tl = oneOf(style.borderTopLeftRadius);
  const tr = oneOf(style.borderTopRightRadius);
  const br = oneOf(style.borderBottomRightRadius);
  const bl = oneOf(style.borderBottomLeftRadius);
  if (tl === tr && tr === br && br === bl) {
    frame.cornerRadius = tl;
    return;
  }
  frame.topLeftRadius     = tl;
  frame.topRightRadius    = tr;
  frame.bottomRightRadius = br;
  frame.bottomLeftRadius  = bl;
}

// ── Border / outline stroke helper ─────────────────────────────────────────
//
// Applies CSS borders + outline to ANY node that supports strokes (FrameNode,
// RectangleNode — both expose `strokes`/`strokeWeight`/`strokeTopWeight`/...).
// Previously only the frame branch applied borders; rasterized elements (the
// <video> in DownloadApp etc.) were missing their 2px black rings even though
// capture.json had them.
//
// CSS allows per-side border-width / -colour / -style; Figma has only one
// uniform stroke. We collapse to uniform when all four sides agree, and
// when they differ we fall back to per-side weights + colours via Figma's
// `strokeTopWeight`/`Color` API (supported on FrameNode + RectangleNode as of
// 2024+). CSS outline (focus rings) → OUTSIDE stroke, only when no border
// stroke exists (Figma has one stroke set).
type StrokeNode = Pick<RectangleNode,
  | 'strokes' | 'strokeWeight' | 'strokeAlign'
  | 'strokeTopWeight' | 'strokeBottomWeight' | 'strokeLeftWeight' | 'strokeRightWeight'>;
function applyBorderStroke(node: StrokeNode, style: ElementStyle): void {
  const sideStyle = (s?: string) => (s && s !== 'none' ? s : null);
  const sideWidth = (s?: string) => parsePx(s || '0px');
  const topS = sideStyle(style.borderTopStyle),    rightS = sideStyle(style.borderRightStyle);
  const botS = sideStyle(style.borderBottomStyle), leftS = sideStyle(style.borderLeftStyle);
  const topW = sideWidth(style.borderTopWidth),    rightW = sideWidth(style.borderRightWidth);
  const botW = sideWidth(style.borderBottomWidth), leftW = sideWidth(style.borderLeftWidth);
  const sides = [
    ['top',    topS,    topW,    style.borderTopColor],
    ['right',  rightS,  rightW,  style.borderRightColor],
    ['bottom', botS,    botW,    style.borderBottomColor],
    ['left',   leftS,   leftW,   style.borderLeftColor],
  ] as const;
  const anySideBorder = sides.some(([, s, w]) => s && w > 0);
  if (anySideBorder) {
    // Uniform check: same style + same width + same colour on all four sides.
    const allSame = sides.every(([, s, w, c]) =>
      s === topS && w === topW && c === sides[0][3]
    );
    if (allSame && topS && topW > 0) {
      const bc = parseCssColor(sides[0][3] || style.borderColor);
      if (bc) {
        node.strokes      = [{ type: 'SOLID', color: bc.color, opacity: bc.opacity }];
        node.strokeWeight = topW;
        node.strokeAlign  = 'INSIDE';
        return;
      }
    }
    // Non-uniform: per-side weights + colours via Figma API. Per-side colours
    // (strokeTopColor etc.) exist on FrameNode but not RectangleNode; we cast
    // through `any` so the same helper serves both, mirroring the original
    // pattern from the frame branch.
    for (const [side, s, w, c] of sides) {
      if (!s || w <= 0) continue;
      const col = parseCssColor(c || style.borderColor);
      if (!col) continue;
      const paint: SolidPaint = { type: 'SOLID', color: col.color, opacity: col.opacity };
      try {
        if      (side === 'top')    { node.strokeTopWeight = w;    (node as any).strokeTopColor = paint; }
        else if (side === 'right')  { node.strokeRightWeight = w;  (node as any).strokeRightColor = paint; }
        else if (side === 'bottom') { node.strokeBottomWeight = w; (node as any).strokeBottomColor = paint; }
        else if (side === 'left')   { node.strokeLeftWeight = w;   (node as any).strokeLeftColor = paint; }
      } catch { /* older runtime: fall through */ }
    }
    // CSS borders default to INSIDE; emulate by setting the overall align.
    node.strokeAlign = 'INSIDE';
    return;
  }
  // CSS outline (rings, focus outlines) → OUTSIDE stroke; only when no
  // border stroke exists (Figma has one stroke set) and colour is opaque.
  if (style.outlineStyle && style.outlineStyle !== 'none') {
    const oc = parseCssColor(style.outlineColor);
    const ow = parsePx(style.outlineWidth);
    if (oc && ow > 0) {
      node.strokes      = [{ type: 'SOLID', color: oc.color, opacity: oc.opacity }];
      node.strokeWeight = ow;
      node.strokeAlign  = 'OUTSIDE';
    }
  }
}

const CLIP_VALUES = new Set(['hidden', 'scroll', 'auto', 'clip']);
function shouldClip(n: CaptureNode) {
  return CLIP_VALUES.has(n.style.overflowX) || CLIP_VALUES.has(n.style.overflowY);
}

// CSS `align-self` → Figma `layoutAlign` (cross-axis override on a flex/grid item).
// 'auto' means "inherit from parent" — we leave Figma's default alone in that case.
function mapAlignSelf(v: string | undefined): 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | null {
  if (!v || v === 'auto') return null;
  if (v === 'center')      return 'CENTER';
  if (v === 'flex-start' || v === 'start' || v === 'self-start') return 'MIN';
  if (v === 'flex-end'  || v === 'end'   || v === 'self-end')   return 'MAX';
  if (v === 'stretch' || v === 'normal') return 'STRETCH';
  if (v === 'baseline') return null;   // Figma has no baseline-align; closest is MIN
  return null;
}

// CSS `object-fit` → Figma `scaleMode` for an image fill.
function mapObjectFit(v: string | undefined): 'FILL' | 'FIT' | 'CROP' | 'TILE' {
  if (v === 'cover')             return 'FILL';   // Figma's FILL is the cover-equivalent
  if (v === 'none' || v === 'scale-down') return 'CROP'; // preserve intrinsic size, no fit
  return 'FIT';   // contain (default), and unknown values → FIT (contain)
}

// CSS `mix-blend-mode` → Figma `BlendMode`. Only the modes Figma actually exposes.
function mapBlendMode(v: string | undefined): BlendMode | null {
  if (!v || v === 'normal') return null;
  const m = v.toUpperCase().replace(/-/g, '_');
  const ok: BlendMode[] = [
    'PASS_THROUGH', 'MULTIPLY', 'SCREEN', 'OVERLAY', 'DARKEN', 'LIGHTEN',
    'COLOR_DODGE', 'COLOR_BURN', 'HARD_LIGHT', 'SOFT_LIGHT', 'DIFFERENCE',
    'EXCLUSION', 'HUE', 'SATURATION', 'COLOR', 'LUMINOSITY',
  ];
  return (ok as string[]).includes(m) ? (m as BlendMode) : null;
}

// CSS `writing-mode` (vertical-rl / vertical-lr) → Figma text rotation in degrees.
// Figma text supports 0/90/180/270 only, so we round to the nearest cardinal.
function writingModeRotation(v: string | undefined): 0 | 90 | 180 | 270 {
  if (!v) return 0;
  if (v === 'vertical-rl')     return 90;
  if (v === 'vertical-lr')     return -90 as unknown as 90;   // Figma lacks -90; use 270
  if (v === 'sideways-rl')     return 90;
  if (v === 'sideways-lr')     return 270;
  if (v === 'horizontal-tb')   return 0;
  return 0;
}

// Apply per-child extras that need to run after `parent.appendChild` and
// `layoutPositioning = 'ABSOLUTE'`: alignSelf → layoutAlign, mixBlendMode →
// blendMode, writingMode → rotation. Centralised so all four buildNode branches
// behave identically.
function applyPerChildExtras(
  node: SceneNode & { blendMode: BlendMode; rotation?: number; layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT' },
  style: ElementStyle,
): void {
  const a = mapAlignSelf(style.alignSelf);
  if (a) { try { node.layoutAlign = a; } catch { /* not a layout child */ } }
  const b = mapBlendMode(style.mixBlendMode);
  if (b) { try { node.blendMode = b; } catch { /* non-paintable */ } }
}

// Position-offset parser. Returns the X/Y adjustment (in px) that should be
// ADDED to the captured (x, y) when the element is positioned. Only triggers
// for `position: absolute | fixed | relative` (NOT `static`/`sticky` — sticky
// is dynamic and not currently modelled). When the parent uses auto-layout
// and the child is ABSOLUTE, Figma positions by x/y directly, so we apply
// the CSS offset to honour the design intent.
function positionOffset(style: ElementStyle, nodeW: number, nodeH: number): { dx: number; dy: number } {
  const pos = style.position;
  if (pos !== 'absolute' && pos !== 'fixed' && pos !== 'relative') return { dx: 0, dy: 0 };
  const readSide = (v?: string) => v && v !== 'auto' ? parsePx(v) : null;
  // CSS inset shorthand: "auto", "1px", "1px 2px", "1px 2px 3px 4px" (top right bottom left)
  let top: number | null = readSide(style.top);
  let right: number | null = readSide(style.right);
  let bottom: number | null = readSide(style.bottom);
  let left: number | null = readSide(style.left);
  const inset = (style.inset || '').trim();
  if (inset && inset !== 'auto') {
    const parts = inset.split(/\s+/).map(parsePx);
    if (parts.length === 1) { top = right = bottom = left = parts[0]; }
    else if (parts.length === 2) { top = bottom = parts[0]; left = right = parts[1]; }
    else if (parts.length === 3) { top = parts[0]; left = right = parts[1]; bottom = parts[2]; }
    else if (parts.length === 4) { top = parts[0]; right = parts[1]; bottom = parts[2]; left = parts[3]; }
  }
  let dx = 0, dy = 0;
  if (left !== null)  dx += left;
  else if (right !== null) dx -= right + nodeW;
  if (top !== null)   dy += top;
  else if (bottom !== null) dy -= bottom + nodeH;
  return { dx, dy };
}

// ── Shadow helper ─────────────────────────────────────────────────────────

// Parses CSS `backdrop-filter: blur(20px) saturate(180%)` into a Figma
// BACKGROUND_BLUR effect (Figma only supports the blur term).
function parseBackdropBlur(css: string): Effect | null {
  if (!css || css === 'none') return null;
  const m = css.match(/blur\(\s*([\d.]+)\s*px\s*\)/i);
  if (!m) return null;
  const radius = parseFloat(m[1]);
  if (!Number.isFinite(radius) || radius <= 0) return null;
  // `blurType: 'NORMAL'` is required by current Figma typings; older runtimes
  // ignore the extra field. Cast keeps us compatible with both.
  return {
    type: 'BACKGROUND_BLUR',
    blurType: 'NORMAL',
    radius,
    visible: true,
  } as unknown as Effect;
}

// Split a top-level comma-separated CSS list, respecting nested parens
// (so "rgba(0,0,0,.5) 2px 4px 6px, 0 1px 2px rgba(0,0,0,.3)" splits into 2).
function splitTopLevelCommas(css: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css.charCodeAt(i);
    if (ch === 40)        depth++;           // '('
    else if (ch === 41)   depth--;           // ')'
    else if (ch === 44 && depth === 0) {     // ','
      out.push(css.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(css.slice(start).trim());
  return out.filter(Boolean);
}

function parseSingleShadow(css: string): Effect | null {
  if (!css || css === 'none') return null;
  const c = css.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/);
  const nums = css.match(/-?\d+(?:\.\d+)?px/g);
  if (!c || !nums || nums.length < 2) return null;
  const parsed = parseCssColor(c[0]);
  if (!parsed) return null;
  const inset = /\binset\b/i.test(css);
  return {
    type: inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
    color: { ...parsed.color, a: parsed.opacity },
    offset: { x: parsePx(nums[0]), y: parsePx(nums[1]) },
    radius: nums[2] ? parsePx(nums[2]) : 0,
    spread: nums[3] ? parsePx(nums[3]) : 0,
    visible: true,
    blendMode: 'NORMAL',
  };
}

// CSS `filter:` → Figma effects (the user's "map CSS to Figma effect" insight):
//   blur(Npx)        → LAYER_BLUR (blurs the element itself)
//   drop-shadow(...) → DROP_SHADOW
// Other filter functions are handled by rasterization upstream, so they won't
// reach here.
function parseFilterEffects(css: string): Effect[] {
  if (!css || css === 'none') return [];
  const out: Effect[] = [];
  const blur = css.match(/blur\(\s*([\d.]+)px\s*\)/i);
  if (blur) {
    const radius = parseFloat(blur[1]);
    if (radius > 0) out.push({ type: 'LAYER_BLUR', blurType: 'NORMAL', radius, visible: true } as unknown as Effect);
  }
  const ds = css.match(/drop-shadow\(([^)]+)\)/i);
  if (ds) { const e = parseSingleShadow(ds[1]); if (e) out.push(e); }
  return out;
}

function parseShadows(css: string): Effect[] {
  if (!css || css === 'none') return [];
  return splitTopLevelCommas(css).map(parseSingleShadow).filter((e): e is Effect => !!e);
}

// Back-compat for callers that just wanted one.
function parseShadow(css: string): Effect | null {
  const list = parseShadows(css);
  return list[0] || null;
}

// ── Auto Layout helper ────────────────────────────────────────────────────
// Strategy: mark flex containers with layoutMode (semantic) but position ALL
// children with ABSOLUTE so their exact captured coordinates are used.
// This gives pixel-perfect visual accuracy while preserving the flex annotation.

function applyAutoLayout(frame: FrameNode, style: ElementStyle): void {
  const display = style.display;
  const isFlex = display === 'flex' || display === 'inline-flex';
  if (!isFlex) return;

  const isColumn = (style.flexDirection || 'row').startsWith('column');
  frame.layoutMode = isColumn ? 'VERTICAL' : 'HORIZONTAL';

  // FIXED sizing: keep the frame at its captured size (Figma defaults to HUG after layoutMode is set)
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';

  // Alignment annotations — visual hint for designers even though children are absolute
  const jc = style.justifyContent || 'flex-start';
  frame.primaryAxisAlignItems =
    jc === 'center' ? 'CENTER' :
    (jc === 'flex-end' || jc === 'end' || jc === 'right') ? 'MAX' :
    jc === 'space-between' ? 'SPACE_BETWEEN' :
    'MIN';

  const ai = style.alignItems || 'stretch';
  frame.counterAxisAlignItems =
    ai === 'center' ? 'CENTER' :
    (ai === 'flex-end' || ai === 'end') ? 'MAX' :
    'MIN';
}

// ── Font helpers ──────────────────────────────────────────────────────────
// Goal: match the page's actual font as closely as possible, falling back
// through the CSS family stack BEFORE landing on Inter. Report substitutions
// so the user knows what was swapped.

const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
]);

const WEIGHT_KEYWORD: Record<string, string> = {
  bold: '700', normal: '400', lighter: '300', bolder: '700', '': '400',
};
const WEIGHT_TO_STYLE: Record<string, string> = {
  '100': 'Thin', '200': 'ExtraLight', '300': 'Light',
  '400': 'Regular', '500': 'Medium', '600': 'SemiBold',
  '700': 'Bold', '800': 'ExtraBold', '900': 'Black',
};
// When the exact style is missing, try these in order (closest weight first).
const STYLE_FALLBACK: Record<string, string[]> = {
  Thin:       ['ExtraLight', 'Light', 'Regular'],
  ExtraLight: ['Light', 'Thin', 'Regular'],
  Light:      ['ExtraLight', 'Regular', 'Thin'],
  Regular:    ['Medium', 'Book', 'Light'],
  Medium:     ['Regular', 'SemiBold', 'Book'],
  SemiBold:   ['Medium', 'Bold', 'Regular'],
  Bold:       ['SemiBold', 'ExtraBold', 'Medium'],
  ExtraBold:  ['Bold', 'Black', 'SemiBold'],
  Black:      ['ExtraBold', 'Bold', 'SemiBold'],
};

function parseFontStack(ff: string): string[] {
  return ff.split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(s => s && !GENERIC_FAMILIES.has(s.toLowerCase()));
}

function weightToStyle(w: string): string {
  const num = WEIGHT_KEYWORD[w] || w;
  return WEIGHT_TO_STYLE[num] || 'Regular';
}

const fontResolutionCache = new Map<string, FontName>();   // "headFamily|weight" → resolved FontName
const fontSubstitutions: FontSubstitution[] = [];

function resolveFont(
  installedByFamily: Map<string, Set<string>>,
  stack: string[],
  weight: string
): FontName {
  const wantedStyle = weightToStyle(weight);
  const styleChain  = [wantedStyle, ...(STYLE_FALLBACK[wantedStyle] || [])];
  const families    = [...stack, 'Inter'];
  for (const family of families) {
    const installedStyles = installedByFamily.get(family);
    if (!installedStyles) continue;
    for (const style of styleChain) {
      if (installedStyles.has(style)) return { family, style };
    }
    // Family installed but no compatible style — any style is better than wrong family
    const fallbackStyle = installedStyles.has('Regular') ? 'Regular' : [...installedStyles][0];
    if (fallbackStyle) return { family, style: fallbackStyle };
  }
  return { family: 'Inter', style: 'Regular' };
}

async function preloadFonts(nodes: CaptureNode[]) {
  fontResolutionCache.clear();
  fontSubstitutions.length = 0;

  // Index every installed font by family → set of styles.
  const fonts = await figma.listAvailableFontsAsync().catch(() => [] as Array<{ fontName: FontName }>);
  const installedByFamily = new Map<string, Set<string>>();
  for (const f of fonts) {
    if (!installedByFamily.has(f.fontName.family)) installedByFamily.set(f.fontName.family, new Set());
    installedByFamily.get(f.fontName.family)!.add(f.fontName.style);
  }

  // Walk the tree, resolve every distinct (head-family, weight) request.
  const toLoad = new Map<string, FontName>();   // "family|style" → FontName
  const seenSubst = new Set<string>();

  const visit = (n: CaptureNode) => {
    if (n.type === 'text') {
      const stack    = parseFontStack(n.style.fontFamily);
      const head     = stack[0] || 'Inter';
      const weight   = n.style.fontWeight || '400';
      const key      = `${head}|${weight}`;
      if (!fontResolutionCache.has(key)) {
        const resolved = resolveFont(installedByFamily, stack, weight);
        fontResolutionCache.set(key, resolved);

        const requested = `${head} ${weightToStyle(weight)}`;
        const loaded    = `${resolved.family} ${resolved.style}`;
        if (requested !== loaded && !seenSubst.has(`${requested}→${loaded}`)) {
          seenSubst.add(`${requested}→${loaded}`);
          fontSubstitutions.push({ requested, loaded });
        }
        toLoad.set(`${resolved.family}|${resolved.style}`, resolved);
      }
    }
    n.children.forEach(visit);
  };
  nodes.forEach(visit);

  // Always need Inter Regular as universal fallback
  toLoad.set('Inter|Regular', { family: 'Inter', style: 'Regular' });

  // Load all required fonts in parallel.
  await Promise.all([...toLoad.values()].map(fn =>
    figma.loadFontAsync(fn).catch(() => { /* silent — the resolver picked an installed one, shouldn't fail */ })
  ));
}

function lookupFont(style: ElementStyle): FontName {
  const stack = parseFontStack(style.fontFamily);
  const head  = stack[0] || 'Inter';
  const key   = `${head}|${style.fontWeight || '400'}`;
  return fontResolutionCache.get(key) || { family: 'Inter', style: 'Regular' };
}

// ── Node building ─────────────────────────────────────────────────────────
// Coordinates in `capture` are ALREADY parent-relative (subtracted in content.ts).
// DO NOT add any extra offset — just use capture.x / capture.y directly.

async function buildNode(
  capture: CaptureNode,
  parent: FrameNode | PageNode,
  imageBytes: Record<string, Uint8Array>,
  cascadeGradient?: string | null,
): Promise<void> {
  // Children's x/y are relative to their direct parent's top-left — no extra subtraction.
  const x = capture.x;
  const y = capture.y;
  const w = Math.max(capture.width,  1);
  const h = Math.max(capture.height, 1);
  const opacity = Math.min(1, Math.max(0, parseFloat(capture.style.opacity) || 1));

  // Does the parent frame use Auto Layout? (children need ABSOLUTE positioning to keep exact coords)
  const parentFrame = parent as FrameNode;
  const parentIsAutoLayout =
    typeof parentFrame.layoutMode === 'string' && parentFrame.layoutMode !== 'NONE';

  // Rasterized element (Figma-impossible CSS) → render the captured PNG as an
  // image fill. Takes precedence over the type switch; no children (the shot
  // already contains the whole subtree).
  if (capture.rasterize && capture.rasterId && imageBytes[capture.rasterId]) {
    const rect = figma.createRectangle();
    rect.name = `raster: ${capture.name}`;
    rect.opacity = opacity;
    applyCornerRadii(rect, capture.style);
    // CSS border / outline — rasterized elements (video, clip-path, mask, ...)
    // can carry visible rings that the screenshot does NOT bake in. Apply them
    // as Figma strokes so the rendered frame matches the source.
    applyBorderStroke(rect, capture.style);
    try {
      const img = figma.createImage(imageBytes[capture.rasterId]);
      rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
    } catch {
      rect.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.92 } }];
    }
    // Resize before append so the auto-layout pass sees the correct size.
    rect.resize(w, h);
    parent.appendChild(rect);
    if (parentIsAutoLayout) { try { rect.layoutPositioning = 'ABSOLUTE'; } catch {} }
    // Re-apply size after auto-layout + ABSOLUTE as a safety net against any
    // size quirks in flex containers (mirrors the same pattern in the 'image'
    // branch below for non-rasterized pictures).
    try { rect.resizeWithoutConstraints(w, h); } catch { rect.resize(w, h); }
    // NOTE: no applyTransform here — the screenshot already has the element's
    // transform/filter/clip baked into its pixels, and x/y/w/h is its rendered
    // bounding box. Re-applying the transform would double it.
    const { dx, dy } = positionOffset(capture.style, w, h);
    rect.x = x + dx;
    rect.y = y + dy;
    applyPerChildExtras(rect as any, capture.style);
    return;
  }

  switch (capture.type) {

    case 'frame':
    case 'rectangle': {
      const frame = figma.createFrame();
      frame.name         = capture.name;
      frame.resize(w, h);
      frame.opacity      = opacity;
      applyCornerRadii(frame, capture.style);
      frame.clipsContent = shouldClip(capture);

      // Background image fill (embedded image via URL)
      const bgUrl   = capture.style.backgroundImageUrl;
      const bgSvg   = bgUrl ? svgMarkupFromBytes(imageBytes[bgUrl]) : null;
      if (bgSvg) {
        // SVG background → vector layer behind the frame's content (createImage
        // can't decode SVG). Inserted as the first child so it paints underneath.
        frame.fills = [];
        try {
          // SVG <filter> (feGaussianBlur) is unsupported by createNodeFromSvg and
          // makes it throw → the whole layer vanishes (Fresha's soft lavender
          // "AnimatedSpotlight" glow). Strip the filter so the solid shape renders,
          // then reapply the blur as a native Figma LAYER_BLUR.
          const { markup: cleanSvg, blur } = stripSvgBlur(bgSvg, w);
          const svgBg = figma.createNodeFromSvg(cleanSvg);
          svgBg.name = 'bg-svg';
          svgBg.resize(w, h);
          if (blur > 0) svgBg.effects = [{ type: 'LAYER_BLUR', blurType: 'NORMAL', radius: blur, visible: true } as unknown as Effect];
          frame.insertChild(0, svgBg);
          svgBg.x = 0; svgBg.y = 0;
          try { (svgBg as any).layoutPositioning = 'ABSOLUTE'; } catch {}
        } catch { frame.fills = resolveFills(capture.style, false); }
      } else if (bgUrl && imageBytes[bgUrl]) {
        try {
          const img = figma.createImage(imageBytes[bgUrl]);
          const imagePaint: Paint = { type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' };
          // CSS multi-layer background (gradient overlay + url image): render BOTH.
          // Our extractor takes the first url(); a gradient declared before it sits
          // ON TOP in CSS — Figma paints last-fill-on-top, so image first, gradient last.
          const bg = capture.style.backgroundImage || '';
          const overlay = bg.includes('gradient')
            ? (linearGradientFill(bg) || radialGradientFill(bg))
            : null;
          frame.fills = overlay ? [imagePaint, overlay] : [imagePaint];
        } catch { frame.fills = resolveFills(capture.style, false); }
      } else {
        frame.fills = resolveFills(capture.style, false);
      }

      // Stroke — borders + outlines (CSS).
      // Centralised helper so the raster branch can apply the same logic.
      applyBorderStroke(frame, capture.style);

      // Effects: every shadow + backdrop blur + element filter (all additive).
      const effects: Effect[] = [...parseShadows(capture.style.boxShadow)];
      const bblur = parseBackdropBlur(capture.style.backdropFilter);
      if (bblur) effects.push(bblur);
      effects.push(...parseFilterEffects(capture.style.filter));
      if (effects.length) frame.effects = effects;

      // Apply Auto Layout to this frame if it is a flex container
      applyAutoLayout(frame, capture.style);

      parent.appendChild(frame);

      // Always position with exact captured coordinates.
      // Inside an Auto Layout parent we mark the node ABSOLUTE so Figma
      // honours x/y instead of recalculating from gap/padding rules.
      if (parentIsAutoLayout) {
        try { frame.layoutPositioning = 'ABSOLUTE'; } catch {}
      }
      const fOff = positionOffset(capture.style, w, h);
      applyTransform(frame, capture.style, x + fOff.dx, y + fOff.dy);
      applyPerChildExtras(frame as any, capture.style);

      // Build children (they are already relative to this frame's origin)
      // Fresha's gradient-text cascade: a non-text frame with `bgClip:text` and
      // its own background-image becomes the cascade source for descendants.
      // The wrapper itself doesn't paint (the gradient is hidden by bgClip:text
      // + opaque text-fill — same reason resolveFills returns []), but any
      // descendant text node with `-webkit-text-fill-color: transparent` will
      // render its glyphs in this gradient on the live page.
      const ownBg     = capture.style.backgroundImage;
      const ownBgClip = capture.style.backgroundClip || capture.style.webkitBackgroundClip;
      const childCascade = (ownBg && ownBg !== 'none' && ownBgClip === 'text')
        ? ownBg
        : (cascadeGradient ?? null);
      for (const child of sortByZIndex(capture.children))
        await buildNode(child, frame, imageBytes, childCascade);
      break;
    }

    case 'text': {
      // Font already resolved + loaded in preloadFonts.
      let fontName = lookupFont(capture.style);
      try { await figma.loadFontAsync(fontName); }
      catch { fontName = { family: 'Inter', style: 'Regular' }; await figma.loadFontAsync(fontName); }

      const text = figma.createText();
      text.name           = capture.name;
      text.opacity        = opacity;
      text.fontName       = fontName;
      const fontSize = Math.max(1, parsePx(capture.style.fontSize) || 14);
      text.fontSize       = fontSize;

      // Line height — CSS gives a computed px value like "24px"
      const lhPx = parsePx(capture.style.lineHeight) || fontSize * 1.2;
      if (parsePx(capture.style.lineHeight) > 0) {
        text.lineHeight = { value: lhPx, unit: 'PIXELS' };
      }

      // Letter spacing
      const ls = parsePx(capture.style.letterSpacing);
      if (ls !== 0) {
        text.letterSpacing = { value: ls, unit: 'PIXELS' };
      }

      const align = capture.style.textAlign;
      if (align === 'center')       text.textAlignHorizontal = 'CENTER';
      else if (align === 'right')   text.textAlignHorizontal = 'RIGHT';
      else if (align === 'justify') text.textAlignHorizontal = 'JUSTIFIED';

      // Fresha cascade: a text node with `-webkit-text-fill-color: transparent` AND
      // a `cascadeGradient` from an ancestor with `bgClip:text + gradient` should
      // render its glyphs in that cascade gradient (not in solid `color`).
      const isTransparentFill = (capture.style.webkitTextFillColor === 'rgba(0, 0, 0, 0)');
      if (isTransparentFill && cascadeGradient) {
        const cascadeFill = linearGradientFill(cascadeGradient) || radialGradientFill(cascadeGradient);
        text.fills = cascadeFill ? [cascadeFill] : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      } else if (isTransparentFill && capture.style.backgroundImage && (capture.style.backgroundClip === 'text' || capture.style.webkitBackgroundClip === 'text')) {
        // Own-gradient + own-transparent-fill text leaf (no cascade needed):
        // apply own gradient directly to the glyphs.
        const ownFill = linearGradientFill(capture.style.backgroundImage) || radialGradientFill(capture.style.backgroundImage);
        text.fills = ownFill ? [ownFill] : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      } else {
        const fg = parseCssColor(capture.style.color);
        text.fills = fg
          ? [{ type: 'SOLID', color: fg.color, opacity: fg.opacity }]
          : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      }

      text.characters = capture.text ?? '';

      // CSS writing-mode (vertical-rl / vertical-lr / sideways-rl / sideways-lr)
      // → Figma text rotation. Only cardinal angles are representable, so
      // vertical-lr maps to 270°. Skip horizontal-tb (the default).
      const wmRot = writingModeRotation(capture.style.writingMode);
      if (wmRot !== 0) {
        try { text.rotation = wmRot; } catch { /* older runtime */ }
      }

      // Sizing strategy. The capture bakes hard '\n' line breaks into multi-line
      // text, so we ALWAYS use WIDTH_AND_HEIGHT: Figma honours the explicit breaks
      // and hugs the content, never re-wrapping with its own font. This is the key
      // to matching the original line structure regardless of font-metric drift.
      //   • Centre/right text in a wider captured box → shift x so it stays put.
      const lineCount = capture.lines ?? Math.max(1, Math.round(h / lhPx));
      let xOffset = 0;
      if (capture.truncate) {
        // CSS text-overflow:ellipsis → clip at the captured box width with a native
        // Figma ellipsis, exactly like the browser (fixes card-address overlap).
        text.resize(Math.max(w, 1), Math.max(h, 1));
        text.textAutoResize = 'NONE';
        try { (text as any).textTruncation = 'ENDING'; } catch { /* older runtime */ }
        parent.appendChild(text);
        if (parentIsAutoLayout) { try { text.layoutPositioning = 'ABSOLUTE'; } catch {} }
        const tOff = positionOffset(capture.style, w, h);
        applyTransform(text, capture.style, x + tOff.dx, y + tOff.dy);
        applyPerChildExtras(text as any, capture.style);
        break;
      }
      text.textAutoResize = 'WIDTH_AND_HEIGHT';
      if (capture.textWidth && capture.textWidth < w) {
        const slack = w - capture.textWidth;
        if      (align === 'center') xOffset = slack / 2;
        else if (align === 'right')  xOffset = slack;
      }
      void lineCount;

      parent.appendChild(text);

      if (parentIsAutoLayout) {
        try { text.layoutPositioning = 'ABSOLUTE'; } catch {}
      }
      const tOff2 = positionOffset(capture.style, w, h);
      applyTransform(text, capture.style, x + xOffset + tOff2.dx, y + tOff2.dy);
      applyPerChildExtras(text as any, capture.style);
      break;
    }

    case 'image': {
      // SVG → NATIVE Figma vector layers (editable shapes). Falls back to a frame
      // if the markup fails to parse. This covers BOTH inline <svg> (svgMarkup) and
      // SVG delivered as an image source (e.g. CSS background:url(glow.svg)), which
      // figma.createImage can't decode.
      const imgKey   = capture.src ?? capture.style.backgroundImageUrl;
      const svgVector = capture.svgMarkup
        ?? (imgKey ? svgMarkupFromBytes(imageBytes[imgKey]) : null);
      if (svgVector) {
        try {
          const svgNode = figma.createNodeFromSvg(svgVector);
          svgNode.name    = capture.name;
          svgNode.resize(w, h);
          svgNode.opacity = opacity;
          parent.appendChild(svgNode);
          if (parentIsAutoLayout) {
            try { (svgNode as any).layoutPositioning = 'ABSOLUTE'; } catch {}
          }
          const svgOff = positionOffset(capture.style, w, h);
          applyTransform(svgNode as any, capture.style, x + svgOff.dx, y + svgOff.dy);
          applyPerChildExtras(svgNode as any, capture.style);
          break;
        } catch { /* fall through to raster/placeholder frame */ }
      }

      const frame = figma.createFrame();
      const imgSrc = capture.src ?? capture.style.backgroundImageUrl;
      frame.name         = imgSrc ? `img: ${imgSrc.split('/').pop()?.slice(0, 40)}` : capture.name;
      frame.opacity      = opacity;
      applyCornerRadii(frame, capture.style);
      frame.clipsContent = true;

      if (imgSrc && imageBytes[imgSrc]) {
        try {
          const img = figma.createImage(imageBytes[imgSrc]);
          frame.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: mapObjectFit(capture.style.objectFit) }];
        } catch { frame.fills = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.92 } }]; }
      } else {
        frame.fills = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.92 } }];
      }

      // Resize BEFORE append so the auto-layout pass sees the correct size
      // for a non-absolute child (the brief moment before we mark it ABSOLUTE).
      frame.resize(w, h);

      parent.appendChild(frame);

      if (parentIsAutoLayout) {
        try { frame.layoutPositioning = 'ABSOLUTE'; } catch {}
      }

      // Belt-and-suspenders: re-apply size after auto-layout + ABSOLUTE so
      // any quirk that shrinks the frame (e.g. image-fill auto-sizing on
      // appendChild in some Figma versions) is overridden by the captured
      // exact dimensions. Without this, an image frame inside a HORIZONTAL
      // auto-layout with justifyContent:flex-end has been observed to
      // collapse to a thin vertical slice on the parent's right edge.
      try { frame.resizeWithoutConstraints(w, h); } catch { frame.resize(w, h); }

      const imgOff = positionOffset(capture.style, w, h);
      applyTransform(frame, capture.style, x + imgOff.dx, y + imgOff.dy);
      applyPerChildExtras(frame as any, capture.style);

      for (const child of sortByZIndex(capture.children))
        await buildNode(child, frame, imageBytes, cascadeGradient ?? null);
      break;
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────

async function buildFigmaNodes(
  payload: CapturePayload,
  imageBytes: Record<string, Uint8Array>,
  originX = 0,
  name?: string,
): Promise<FrameNode> {
  const page = figma.currentPage;
  const { width: vw, height: vh } = payload.viewport;
  // CSS vh/vw units resolve against the browser viewport at capture time, NOT
  // the full document. Older payloads fall back to `viewport` (which is full-page).
  const vwForUnits = (payload as any).browserViewport?.width  ?? vw;
  const vhForUnits = (payload as any).browserViewport?.height ?? vh;
  setViewportForGradients(vwForUnits, vhForUnits);
  const first = payload.nodes[0];

  const wrapperW = payload.mode === 'selected-element' ? Math.max(first?.width ?? vw, 1) : vw;
  const wrapperH = payload.mode === 'selected-element' ? Math.max(first?.height ?? vh, 1) : vh;

  const wrapper = figma.createFrame();
  wrapper.name         = name || payload.title || payload.url;
  wrapper.resize(Math.max(wrapperW, 1), Math.max(wrapperH, 1));
  wrapper.x            = originX;
  wrapper.y            = 0;
  wrapper.fills        = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  wrapper.clipsContent = true; // clip overflow (carousels, wide images) like the real page
  page.appendChild(wrapper);

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await preloadFonts(payload.nodes);

  for (const node of sortByZIndex(payload.nodes))
    await buildNode(node, wrapper, imageBytes, null);

  return wrapper;
}

// Multi-viewport: lay each frame out left→right with a label above it.
async function buildMultiViewport(frames: FrameImport[]): Promise<string> {
  const GAP = 120;
  let originX = 0;
  const built: SceneNode[] = [];
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  for (const frame of frames) {
    const imageBytes: Record<string, Uint8Array> = {};
    for (const [url, arr] of Object.entries(frame.imageMap ?? {})) imageBytes[url] = new Uint8Array(arr);

    const wrapper = await buildFigmaNodes(frame.payload, imageBytes, originX, `${frame.label} · ${frame.width}px`);

    const label = figma.createText();
    label.fontName = { family: 'Inter', style: 'Medium' };
    label.characters = `${frame.label} — ${frame.width}px`;
    label.fontSize = 18;
    label.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.65 } }];
    label.x = originX;
    label.y = -36;
    figma.currentPage.appendChild(label);

    built.push(wrapper, label);
    originX += wrapper.width + GAP;
  }

  if (built.length) figma.viewport.scrollAndZoomIntoView(built);
  return frames.map(f => f.label).join(', ');
}

