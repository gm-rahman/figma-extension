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

function parseGradientStops(css: string): ColorStop[] {
  const stops: ColorStop[] = [];
  const pattern = /(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})(\s+[\d.]+%)?/g;
  let m: RegExpExecArray | null;
  const raw: Array<{color: string; pos?: number}> = [];
  while ((m = pattern.exec(css)) !== null) {
    raw.push({ color: m[1], pos: m[2] ? parseFloat(m[2])/100 : undefined });
  }
  if (raw.length < 2) return [];
  raw.forEach((s, i) => { if (s.pos === undefined) s.pos = i / (raw.length - 1); });
  for (const s of raw) {
    const p = parseCssColor(s.color);
    if (p) stops.push({ position: s.pos!, color: { r: p.color.r, g: p.color.g, b: p.color.b, a: p.opacity } });
  }
  return stops;
}

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

function resolveFills(style: ElementStyle): Paint[] {
  const bg = style.backgroundImage;

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

const CLIP_VALUES = new Set(['hidden', 'scroll', 'auto', 'clip']);
function shouldClip(n: CaptureNode) {
  return CLIP_VALUES.has(n.style.overflowX) || CLIP_VALUES.has(n.style.overflowY);
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
  imageBytes: Record<string, Uint8Array>
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
    rect.resize(w, h);
    rect.opacity = opacity;
    applyCornerRadii(rect, capture.style);
    try {
      const img = figma.createImage(imageBytes[capture.rasterId]);
      rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
    } catch {
      rect.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.92 } }];
    }
    parent.appendChild(rect);
    if (parentIsAutoLayout) { try { rect.layoutPositioning = 'ABSOLUTE'; } catch {} }
    // NOTE: no applyTransform here — the screenshot already has the element's
    // transform/filter/clip baked into its pixels, and x/y/w/h is its rendered
    // bounding box. Re-applying the transform would double it.
    rect.x = x;
    rect.y = y;
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
          const svgBg = figma.createNodeFromSvg(bgSvg);
          svgBg.name = 'bg-svg';
          svgBg.resize(w, h);
          frame.insertChild(0, svgBg);
          svgBg.x = 0; svgBg.y = 0;
          try { (svgBg as any).layoutPositioning = 'ABSOLUTE'; } catch {}
        } catch { frame.fills = resolveFills(capture.style); }
      } else if (bgUrl && imageBytes[bgUrl]) {
        try {
          const img = figma.createImage(imageBytes[bgUrl]);
          frame.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
        } catch { frame.fills = resolveFills(capture.style); }
      } else {
        frame.fills = resolveFills(capture.style);
      }

      // Stroke
      if (capture.style.borderStyle !== 'none') {
        const bc = parseCssColor(capture.style.borderColor);
        const bw = parsePx(capture.style.borderWidth);
        if (bc && bw > 0) {
          frame.strokes      = [{ type: 'SOLID', color: bc.color, opacity: bc.opacity }];
          frame.strokeWeight = bw;
          frame.strokeAlign  = 'INSIDE';
        }
      }

      // Effects: every shadow + backdrop blur (additive)
      const effects: Effect[] = [...parseShadows(capture.style.boxShadow)];
      const bblur = parseBackdropBlur(capture.style.backdropFilter);
      if (bblur) effects.push(bblur);
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
      applyTransform(frame, capture.style, x, y);

      // Build children (they are already relative to this frame's origin)
      for (const child of sortByZIndex(capture.children))
        await buildNode(child, frame, imageBytes);
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

      const fg = parseCssColor(capture.style.color);
      text.fills = fg
        ? [{ type: 'SOLID', color: fg.color, opacity: fg.opacity }]
        : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];

      text.characters = capture.text ?? '';

      // Sizing strategy. The capture bakes hard '\n' line breaks into multi-line
      // text, so we ALWAYS use WIDTH_AND_HEIGHT: Figma honours the explicit breaks
      // and hugs the content, never re-wrapping with its own font. This is the key
      // to matching the original line structure regardless of font-metric drift.
      //   • Centre/right text in a wider captured box → shift x so it stays put.
      const lineCount = capture.lines ?? Math.max(1, Math.round(h / lhPx));
      let xOffset = 0;
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
      applyTransform(text, capture.style, x + xOffset, y);
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
          applyTransform(svgNode as any, capture.style, x, y);
          break;
        } catch { /* fall through to raster/placeholder frame */ }
      }

      const frame = figma.createFrame();
      const imgSrc = capture.src ?? capture.style.backgroundImageUrl;
      frame.name         = imgSrc ? `img: ${imgSrc.split('/').pop()?.slice(0, 40)}` : capture.name;
      frame.resize(w, h);
      frame.opacity      = opacity;
      applyCornerRadii(frame, capture.style);
      frame.clipsContent = true;

      if (imgSrc && imageBytes[imgSrc]) {
        try {
          const img = figma.createImage(imageBytes[imgSrc]);
          frame.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FIT' }];
        } catch { frame.fills = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.92 } }]; }
      } else {
        frame.fills = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.92 } }];
      }

      parent.appendChild(frame);

      if (parentIsAutoLayout) {
        try { frame.layoutPositioning = 'ABSOLUTE'; } catch {}
      }
      applyTransform(frame, capture.style, x, y);

      for (const child of sortByZIndex(capture.children))
        await buildNode(child, frame, imageBytes);
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
    await buildNode(node, wrapper, imageBytes);

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
