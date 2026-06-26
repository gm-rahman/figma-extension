import { CaptureNode, CapturePayload, ElementStyle } from './types';

// Depth is driven by the real DOM tree — this is only a stack-overflow safety net,
// effectively unlimited for any real page/SPA.
const MAX_DEPTH = 1000;
const MAX_NODES = 12000;
const MIN_SIZE  = 2;

const MAX_RASTER = 30;   // cap to keep screenshot time bounded

let capturedCount = 0;
let nodeCounter   = 0;

// Elements flagged for rasterization (document coords) — consumed by the
// extension background worker / the test harness to screenshot each one.
export interface RasterTarget { id: string; x: number; y: number; width: number; height: number; reason: string; }
let rasterTargets: RasterTarget[] = [];
export function getRasterTargets(): RasterTarget[] { return rasterTargets; }

// ── Style extraction ───────────────────────────────────────────────────────

// Find the first raster URL inside a (possibly multi-layered, image-set wrapped)
// background-image declaration. Handles:
//   linear-gradient(...), url("foo?bar=1")
//   image-set(url("foo.png") 1x, url("foo@2x.png") 2x)
//   url('foo.png') no-repeat
function extractBgImageUrl(bgImage: string): string | undefined {
  if (!bgImage || bgImage === 'none') return undefined;
  // Greedy match every url(...) in the declaration, skip data URIs that are too small to matter.
  const re = /url\(\s*(['"]?)((?:[^'")\\]|\\.)+?)\1\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bgImage)) !== null) {
    const url = m[2].trim();
    if (url) return url;
  }
  return undefined;
}

function getStyleFromComputed(s: CSSStyleDeclaration): ElementStyle {
  const bgImage = s.backgroundImage;
  return {
    backgroundColor:    s.backgroundColor,
    backgroundImage:    bgImage,
    backgroundImageUrl: extractBgImageUrl(bgImage),
    color:              s.color,
    fontSize:           s.fontSize,
    fontFamily:         s.fontFamily,
    fontWeight:         s.fontWeight,
    textAlign:          s.textAlign,
    lineHeight:         s.lineHeight,
    letterSpacing:      s.letterSpacing,
    borderRadius:            s.borderRadius,
    borderTopLeftRadius:     s.borderTopLeftRadius,
    borderTopRightRadius:    s.borderTopRightRadius,
    borderBottomRightRadius: s.borderBottomRightRadius,
    borderBottomLeftRadius:  s.borderBottomLeftRadius,
    borderColor:        s.borderColor,
    borderWidth:        s.borderWidth,
    borderStyle:        s.borderStyle,
    paddingTop:         s.paddingTop,
    paddingRight:       s.paddingRight,
    paddingBottom:      s.paddingBottom,
    paddingLeft:        s.paddingLeft,
    marginTop:          s.marginTop,
    marginRight:        s.marginRight,
    marginBottom:       s.marginBottom,
    marginLeft:         s.marginLeft,
    boxShadow:          s.boxShadow,
    opacity:            s.opacity,
    display:            s.display,
    position:           s.position,
    flexDirection:      s.flexDirection,
    justifyContent:     s.justifyContent,
    alignItems:         s.alignItems,
    alignContent:       s.alignContent,
    flexWrap:           s.flexWrap,
    flexGrow:           s.flexGrow,
    flexShrink:         s.flexShrink,
    flexBasis:          s.flexBasis,
    gap:                s.gap,
    rowGap:             s.rowGap,
    columnGap:          s.columnGap,
    gridTemplateColumns: s.gridTemplateColumns,
    gridTemplateRows:   s.gridTemplateRows,
    overflowX:          s.overflowX,
    overflowY:          s.overflowY,
    backdropFilter:     (s as any).backdropFilter || (s as any).webkitBackdropFilter || 'none',
    transform:          s.transform || 'none',
    transformOrigin:    s.transformOrigin || '50% 50%',
    zIndex:             s.zIndex || 'auto',
  };
}

function getStyle(el: Element): ElementStyle {
  return getStyleFromComputed(window.getComputedStyle(el));
}

// For synthesized text children (button labels, input values), strip the
// parent's BOX decoration (bg / border / shadow / radius) so the child doesn't
// repaint the parent's pill behind itself — which causes a visible "double layer".
// We KEEP the text-related properties (color, font, alignment, line-height).
function stripBoxDecoration(s: ElementStyle): ElementStyle {
  return {
    ...s,
    backgroundColor:         'rgba(0, 0, 0, 0)',
    backgroundImage:         'none',
    backgroundImageUrl:      undefined,
    borderStyle:             'none',
    borderWidth:             '0px',
    borderColor:             'rgb(0, 0, 0)',
    boxShadow:               'none',
    backdropFilter:          'none',
    borderRadius:            '0px',
    borderTopLeftRadius:     '0px',
    borderTopRightRadius:    '0px',
    borderBottomLeftRadius:  '0px',
    borderBottomRightRadius: '0px',
    transform:               'none',
  };
}

// Semantic display names — mirrors HTML to Design's naming style
function getNodeName(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const aria = el.getAttribute('aria-label');
  const id   = el.id;
  const cls  = el.classList[0] ?? '';

  const tagLabel: Record<string, string> = {
    h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
    h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6',
    p: 'Paragraph', span: 'Span', a: 'Link', strong: 'Bold', em: 'Italic',
    button: 'Button', input: 'Input', select: 'Select', textarea: 'Textarea',
    label: 'Label', form: 'Form',
    nav: 'Navigation', header: 'Header', footer: 'Footer',
    main: 'Main Content', section: 'Section', article: 'Article', aside: 'Sidebar',
    ul: 'List', ol: 'Ordered List', li: 'List Item',
    img: 'Image', svg: 'Icon', figure: 'Figure', figcaption: 'Caption',
    table: 'Table', tr: 'Row', td: 'Cell', th: 'Header Cell',
  };

  let name = tagLabel[tag] ?? 'Container';
  if (aria)    name += ` - ${aria}`;
  else if (id) name += ` #${id}`;
  else if (cls) name += `:${cls}`;
  return name;
}

// ── Form-control detection ──────────────────────────────────────────────────
// Native AND custom (ARIA) dropdowns must render a single value, not their
// full option list. This is the key to matching real-world component libraries.

const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'submit', 'button', 'image', 'reset',
]);

const CUSTOM_SELECT_ROLES = new Set(['combobox', 'listbox', 'select']);

function isNativeFormControl(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'select' || tag === 'input' || tag === 'textarea';
}

// A custom dropdown: a div/button with role=combobox/listbox, or an element
// whose direct children are option-like (role=option). These dump their whole
// option list as text unless we collapse them.
function isCustomSelect(el: Element): boolean {
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (CUSTOM_SELECT_ROLES.has(role)) return true;
  // A container whose children are mostly role=option
  const kids = Array.from(el.children);
  if (kids.length >= 2) {
    const optionLike = kids.filter(k => (k.getAttribute('role') || '').toLowerCase() === 'option');
    if (optionLike.length >= 2 && optionLike.length === kids.length) return true;
  }
  return false;
}

function getControlText(el: Element): { text: string; color: string } | null {
  const tag = el.tagName.toLowerCase();

  if (tag === 'select') {
    const sel = el as HTMLSelectElement;
    const opt = sel.options[sel.selectedIndex] || sel.options[0];
    const txt = opt?.text?.trim();
    if (txt) return { text: txt, color: window.getComputedStyle(el).color };
    return null;
  }

  if (tag === 'input' || tag === 'textarea') {
    const input = el as HTMLInputElement;
    const type  = (input.type || '').toLowerCase();
    if (NON_TEXT_INPUT_TYPES.has(type)) return null;

    const val = input.value?.trim();
    if (val) return { text: val, color: window.getComputedStyle(el).color };

    const ph = input.placeholder?.trim();
    if (ph) {
      let color = window.getComputedStyle(el).color;
      try {
        const phColor = window.getComputedStyle(el, '::placeholder').color;
        if (phColor) color = phColor;
      } catch { /* not supported */ }
      return { text: ph, color };
    }
    return null;
  }

  // Custom dropdown — prefer aria-selected option, else the visible text of the
  // first option, else the element's own short label.
  if (isCustomSelect(el)) {
    const selected = el.querySelector('[role="option"][aria-selected="true"]') as HTMLElement | null;
    if (selected?.innerText?.trim()) {
      return { text: selected.innerText.trim(), color: window.getComputedStyle(el).color };
    }
    const firstOpt = el.querySelector('[role="option"]') as HTMLElement | null;
    if (firstOpt?.innerText?.trim()) {
      return { text: firstOpt.innerText.trim(), color: window.getComputedStyle(el).color };
    }
  }
  return null;
}

// ── Rasterization detection ─────────────────────────────────────────────────
// Returns a reason string when the element uses CSS Figma can't reproduce as
// native nodes (so we screenshot it instead), or '' when it's natively drawable.
function rasterizeReason(el: Element, s: CSSStyleDeclaration): string {
  const tag = el.tagName.toLowerCase();

  // Explicit opt-in / opt-out via data attribute.
  const attr = (el.getAttribute('data-h2f-raster') || '').toLowerCase();
  if (attr === 'off') return '';
  if (attr === 'on')  return 'data-h2f-raster=on';

  if (tag === 'canvas') return '<canvas> element';
  if (tag === 'video')  return '<video> element';

  if (s.clipPath && s.clipPath !== 'none')             return `clip-path: ${s.clipPath}`;
  const mask = s.mask || (s as any).webkitMask;
  if (mask && mask !== 'none' && !/^none\b/.test(mask)) return `mask: ${mask}`;
  if (s.filter && s.filter !== 'none')                 return `filter: ${s.filter}`;
  // Blend modes are per-layer (comma-separated). Only flag if ANY layer is non-normal.
  const anyNonNormal = (v: string) => v.split(',').some(x => x.trim() && x.trim() !== 'normal');
  if (s.mixBlendMode && anyNonNormal(s.mixBlendMode))         return `mix-blend-mode: ${s.mixBlendMode}`;
  if (s.backgroundBlendMode && anyNonNormal(s.backgroundBlendMode))
                                                       return `background-blend-mode: ${s.backgroundBlendMode}`;
  if ((s as any).backgroundClip === 'text' || (s as any).webkitBackgroundClip === 'text')
                                                       return 'background-clip: text';

  const bg = s.backgroundImage || '';
  if (bg.includes('conic-gradient'))                   return 'conic-gradient';
  if (bg.includes('repeating-linear-gradient') || bg.includes('repeating-radial-gradient'))
                                                       return 'repeating-gradient';

  if (/matrix3d\(|perspective\(/.test(s.transform || '')) return '3D transform';

  return '';
}

// Apply the size guard: can't reliably screenshot something larger than the
// viewport in one shot (v1). Such elements fall back to native capture.
function rasterizable(rect: DOMRect): boolean {
  return rect.width  > 0 && rect.height > 0 &&
         rect.width  <= window.innerWidth &&
         rect.height <= window.innerHeight;
}

// True for anything we should collapse to a single value box.
function isCollapsibleControl(el: Element): boolean {
  return isNativeFormControl(el) || isCustomSelect(el);
}

// ── Classification ───────────────────────────────────────────────────────────

// Counts the ACTUAL rendered lines AND measures the visible text width of an
// element. Line count = distinct top edges among the client rects. For width we
// must sum the per-LINE width, NOT take the widest fragment — text containing
// inline <a>/<span> children produces one rect PER fragment, so the widest
// fragment badly under-measures the line ("...Terms and Privacy Policy" measured
// as just its first clause). We group rects by line and take the widest line.
// textWidth drives single-line sizing + center offset, so it must be the true
// rendered width or text clips / mis-centers.
function measureText(el: Element): { lines: number; textWidth: number } {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = range.getClientRects();
    // Group fragment rects into lines by their top edge; line width = right-most
    // edge minus left-most edge across all fragments sharing that line.
    const lineBounds = new Map<number, { left: number; right: number }>();
    for (const r of rects) {
      if (r.width <= 0 || r.height <= 0) continue;
      const key = Math.round(r.top);
      const b = lineBounds.get(key);
      if (b) { b.left = Math.min(b.left, r.left); b.right = Math.max(b.right, r.right); }
      else   { lineBounds.set(key, { left: r.left, right: r.right }); }
    }
    let maxLineW = 0;
    for (const b of lineBounds.values()) maxLineW = Math.max(maxLineW, b.right - b.left);
    // Fallback to the range bounding box if rects were empty.
    if (maxLineW === 0) maxLineW = range.getBoundingClientRect().width;
    return { lines: Math.max(1, lineBounds.size), textWidth: Math.ceil(maxLineW) };
  } catch {
    return { lines: 1, textWidth: 0 };
  }
}

// Back-compat shim: callers that only want line count.
function countLines(el: Element): number { return measureText(el).lines; }

// Records EXACTLY where the browser wrapped the text and bakes hard line breaks
// in, so Figma reproduces the same line structure instead of re-wrapping with a
// (slightly different) font. This is the core trick that makes headings/paragraphs
// match the original — and it keeps the text fully editable (no rasterization).
//
// Walks character-by-character; when a character's top edge jumps to a new line,
// we emit '\n'. Only called for multi-line nodes, so the per-char cost is bounded.
function getWrappedText(el: Element, maxChars = 2000): string {
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const range = document.createRange();
    let out = '';
    let lastTop: number | null = null;
    let count = 0;
    let tn: Node | null;
    while ((tn = walker.nextNode())) {
      const text = tn.nodeValue ?? '';
      for (let i = 0; i < text.length; i++) {
        if (count++ > maxChars) return out.trim();
        const ch = text[i];
        range.setStart(tn, i);
        range.setEnd(tn, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) { out += ch; continue; }
        const top = Math.round(r.top);
        if (lastTop !== null && top > lastTop + 3) {
          // New visual line — turn the wrapping whitespace into a hard break.
          out = out.replace(/[ \t]+$/, '');
          if (!out.endsWith('\n')) out += '\n';
          if (ch === ' ' || ch === '\t') continue; // drop the leading space of the new line
        }
        lastTop = top;
        out += ch;
      }
    }
    return out.replace(/\n{2,}/g, '\n').trim();
  } catch {
    return (el as HTMLElement).innerText?.trim() ?? '';
  }
}

const TRANSPARENT = /^rgba?\(0,\s*0,\s*0,\s*0\)$|transparent/;

// Does this element draw a visible box (bg/border/radius)? Used to decide whether
// a leaf-with-text should become a styled frame (button/pill/badge) vs plain text.
function hasVisibleBox(s: CSSStyleDeclaration): boolean {
  const hasBg     = !!s.backgroundColor && !TRANSPARENT.test(s.backgroundColor.replace(/\s/g, ''));
  const hasGrad   = s.backgroundImage && s.backgroundImage !== 'none';
  const hasBorder = s.borderStyle !== 'none' && parseFloat(s.borderWidth) > 0;
  const hasRadius = parseFloat(s.borderRadius) > 0;
  return hasBg || !!hasGrad || hasBorder || hasRadius;
}

const INLINE_TAGS = new Set([
  'a', 'span', 'strong', 'em', 'b', 'i', 'u', 'code', 'small', 'sub', 'sup',
  'mark', 'abbr', 'time', 'cite', 'q', 's', 'label', 'br', 'wbr',
]);

// An element like <p>text <a>link</a> more text</p> — child elements are all
// inline runs (no styled chips, no images). Capture as ONE rich text node so the
// surrounding text fragments aren't dropped. (Flex/grid containers are excluded —
// their children are real layout items, not text runs.)
function isInlineTextContainer(el: Element, s: CSSStyleDeclaration): boolean {
  if (el.children.length === 0) return false;
  if (!(el as HTMLElement).innerText?.trim()) return false;
  const d = s.display;
  if (d === 'flex' || d === 'inline-flex' || d === 'grid' || d === 'inline-grid') return false;

  for (const c of Array.from(el.children)) {
    const tag = c.tagName.toLowerCase();
    if (tag === 'img' || tag === 'svg') return false;
    const cs = window.getComputedStyle(c);
    const isInline = cs.display.startsWith('inline') || INLINE_TAGS.has(tag);
    if (!isInline) return false;
    if (hasVisibleBox(cs)) return false; // styled chip → keep as its own box
  }
  return true;
}

function classifyElement(el: Element): CaptureNode['type'] {
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return 'image';
  if (tag === 'svg' || el.closest('svg')) return 'image';

  const s = window.getComputedStyle(el);
  if (s.backgroundImage !== 'none' && s.backgroundImage.includes('url(')) return 'image';

  // Leaf with text: if it draws a box (button/pill/badge), keep it a FRAME so the
  // box styling survives — a centered text child is added during serialization.
  // Otherwise it's a plain text node.
  if (el.children.length === 0) {
    const text = (el as HTMLElement).innerText?.trim();
    if (text && text.length > 0) {
      return hasVisibleBox(s) ? 'frame' : 'text';
    }
  }

  // Mixed inline content (text interleaved with inline links/spans) → one text node.
  if (isInlineTextContainer(el, s)) return 'text';

  return 'frame';
}

// ── DOM serialization ──────────────────────────────────────────────────────

function makeValueTextNode(el: Element, rect: DOMRect, s: CSSStyleDeclaration,
                           ctrl: { text: string; color: string }): CaptureNode {
  const padL = parseFloat(s.paddingLeft) || 0;
  const padT = parseFloat(s.paddingTop)  || 0;
  const padR = parseFloat(s.paddingRight) || 0;
  const lh   = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2 || 16;
  const fs   = parseFloat(s.fontSize) || 14;
  const style = stripBoxDecoration(getStyle(el));
  style.color = ctrl.color;
  // Approximate the value's rendered width (no DOM node to measure). 0.55em average.
  const textWidth = Math.ceil(ctrl.text.length * fs * 0.55);
  return {
    id: `node-${++nodeCounter}`,
    tagName: '#text',
    type: 'text',
    name: 'Value',
    x: Math.round(padL),
    y: Math.round(Math.max(padT, (rect.height - lh) / 2)),
    width:  Math.round(Math.max(rect.width - padL - padR, 1)),
    height: Math.round(lh),
    style,
    text: ctrl.text,
    lines: 1,
    textWidth,
    children: [],
  };
}

// Walks a raw Text-node child of an element (between sibling elements) and turns
// it into a CaptureNode. Example: <button><span>G</span> Continue with Google</button>
// — "Continue with Google" is a Text node, NOT an Element, so el.children skips it.
// Without this, mixed-content buttons lose their visible text.
function makeTextNodeChild(
  tn: Text,
  parentRect: DOMRect,
  parentStyle: CSSStyleDeclaration,
  parentDocX: number,
  parentDocY: number,
): CaptureNode | null {
  const text = tn.textContent?.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const range = document.createRange();
  range.selectNodeContents(tn);
  const rects = range.getClientRects();
  if (!rects.length) return null;

  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const tops = new Set<number>();
  let maxLineW = 0;
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    left   = Math.min(left,   r.left);
    top    = Math.min(top,    r.top);
    right  = Math.max(right,  r.right);
    bottom = Math.max(bottom, r.bottom);
    tops.add(Math.round(r.top));
    if (r.width > maxLineW) maxLineW = r.width;
  }
  if (left === Infinity) return null;

  const w = right - left;
  const h = bottom - top;
  if (w < MIN_SIZE || h < MIN_SIZE) return null;

  const docX = left + window.scrollX;
  const docY = top  + window.scrollY;
  capturedCount++;
  return {
    id:        `node-${++nodeCounter}`,
    tagName:   '#text',
    type:      'text',
    name:      'Text',
    x:         Math.round(docX - parentDocX),
    y:         Math.round(docY - parentDocY),
    width:     Math.round(w),
    height:    Math.round(h),
    style:     stripBoxDecoration(getStyleFromComputed(parentStyle)),
    text,
    lines:     Math.max(1, tops.size),
    textWidth: Math.ceil(maxLineW),
    children:  [],
  };
}

// Native <select> elements draw a browser-rendered chevron we can't capture.
// Synthesize one so dropdowns look like dropdowns in Figma.
// Size scales with the control's font-size (≈1.25em, clamped) so it matches the
// visual weight of the original on any site — not a fixed 12px.
function makeChevronNode(rect: DOMRect, s: CSSStyleDeclaration): CaptureNode {
  const padR = parseFloat(s.paddingRight) || 12;
  const fs   = parseFloat(s.fontSize) || 16;
  const size = Math.round(Math.min(Math.max(fs * 1.25, 14), 24));
  const x = Math.max(0, rect.width - padR - size);
  const y = Math.max(0, (rect.height - size) / 2);
  const color = s.color || 'rgb(80, 80, 80)';
  // viewBox is normalized to 24 so stroke-width stays proportional at any size.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const style = stripBoxDecoration(getStyleFromComputed(s));
  capturedCount++;
  return {
    id:        `node-${++nodeCounter}`,
    tagName:   'svg',
    type:      'image',
    name:      'Chevron',
    x:         Math.round(x),
    y:         Math.round(y),
    width:     size,
    height:    size,
    style,
    svgMarkup: svg,
    children:  [],
  };
}

// Native <input type=checkbox|radio> draw themselves — their computed style has
// no background/border, so we'd capture an invisible box. Synthesize a visible
// control box. Checked state gets the accent color fill; unchecked gets a border.
function styleNativeToggle(node: CaptureNode, el: Element, s: CSSStyleDeclaration): void {
  const input = el as HTMLInputElement;
  const type  = (input.type || '').toLowerCase();
  const isRadio = type === 'radio';
  const checked = !!input.checked;

  // Prefer the page's accent-color if set, else a sensible blue.
  const accentRaw = (s as any).accentColor && (s as any).accentColor !== 'auto'
    ? (s as any).accentColor : 'rgb(99, 91, 255)';
  const borderColor = s.borderColor && s.borderColor !== 'rgb(0, 0, 0)'
    ? s.borderColor : 'rgb(148, 163, 184)';

  const radius = isRadio ? Math.round(Math.max(node.width, node.height)) : 4;
  node.style.borderRadius            = `${radius}px`;
  node.style.borderTopLeftRadius     = `${radius}px`;
  node.style.borderTopRightRadius    = `${radius}px`;
  node.style.borderBottomLeftRadius  = `${radius}px`;
  node.style.borderBottomRightRadius = `${radius}px`;

  if (checked) {
    node.style.backgroundColor = accentRaw;
    node.style.borderStyle = 'none';
    node.style.borderWidth = '0px';
  } else {
    node.style.backgroundColor = 'rgb(255, 255, 255)';
    node.style.borderStyle = 'solid';
    node.style.borderWidth = '1.5px';
    node.style.borderColor = borderColor;
  }
}

// Centered text child for a leaf-with-box (button/pill). The parent frame keeps
// the bg/border; this child carries the label, centered both axes by default.
function makeLeafTextChild(el: Element, rect: DOMRect, s: CSSStyleDeclaration): CaptureNode {
  const padL  = parseFloat(s.paddingLeft) || 0;
  const padR  = parseFloat(s.paddingRight) || 0;
  const lh    = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2 || 16;
  const m     = measureText(el);
  const textH = m.lines * lh;
  const style = stripBoxDecoration(getStyle(el));
  if (s.textAlign === 'start' || s.textAlign === 'left') style.textAlign = 'center';
  return {
    id: `node-${++nodeCounter}`,
    tagName: '#text',
    type: 'text',
    name: 'Label',
    x: Math.round(padL),
    y: Math.round(Math.max(0, (rect.height - textH) / 2)),
    width:  Math.round(Math.max(rect.width - padL - padR, 1)),
    height: Math.round(textH),
    style,
    text: m.lines > 1 ? getWrappedText(el) : ((el as HTMLElement).innerText?.trim().slice(0, 1000) ?? ''),
    lines: m.lines,
    textWidth: m.textWidth,
    children: [],
  };
}

// ── Pseudo-element capture ─────────────────────────────────────────────────
// Many modern UIs (Aether's orb glow, decorative gradients, focus rings, css icons)
// live in ::before / ::after. They're not real DOM, so we synthesize child nodes.

function parsePxOrNaN(v: string): number {
  if (!v || v === 'auto') return NaN;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

// Parses CSS `content` value into a literal string (or '' if not a text pseudo).
// Skips `url(...)`, `counter(...)`, `attr(...)`, gradients, etc.
function parseContentText(content: string): string {
  if (!content || content === 'none' || content === 'normal') return '';
  // Strip optional /alt suffix CSS Content Module Level 3 allows
  const main = content.split('/')[0].trim();
  const m = main.match(/^["'](.*)["']$/);
  return m ? m[1] : '';
}

function capturePseudo(
  parentEl: Element,
  parentRect: DOMRect,
  which: 'before' | 'after'
): CaptureNode | null {
  let s: CSSStyleDeclaration;
  try { s = window.getComputedStyle(parentEl, `::${which}`); }
  catch { return null; }
  if (!s) return null;

  const content = s.content;
  if (!content || content === 'none' || content === 'normal') return null;

  const text    = parseContentText(content);
  const visible = hasVisibleBox(s) || !!text;
  if (!visible) return null;

  // Compute box.
  // Start from explicit width/height; then refine from position+inset.
  let x = 0, y = 0;
  let w = parsePxOrNaN(s.width);
  let h = parsePxOrNaN(s.height);
  if (!Number.isFinite(w)) w = parentRect.width;
  if (!Number.isFinite(h)) h = parentRect.height;

  const position = s.position;
  if (position === 'absolute' || position === 'fixed') {
    const left   = parsePxOrNaN(s.left);
    const top    = parsePxOrNaN(s.top);
    const right  = parsePxOrNaN(s.right);
    const bottom = parsePxOrNaN(s.bottom);

    // When both insets on an axis are set AND width/height weren't explicit, fill the gap.
    if (Number.isFinite(left) && Number.isFinite(right) && !Number.isFinite(parsePxOrNaN(s.width))) {
      w = Math.max(0, parentRect.width - left - right);
    }
    if (Number.isFinite(top) && Number.isFinite(bottom) && !Number.isFinite(parsePxOrNaN(s.height))) {
      h = Math.max(0, parentRect.height - top - bottom);
    }

    if (Number.isFinite(left))       x = left;
    else if (Number.isFinite(right)) x = parentRect.width - right - w;

    if (Number.isFinite(top))         y = top;
    else if (Number.isFinite(bottom)) y = parentRect.height - bottom - h;
  }
  // For static / relative pseudos, leave at (0,0) — best-effort.
  // Most decorative pseudos (orb backgrounds, glow rings) use absolute.

  if (w < MIN_SIZE || h < MIN_SIZE) return null;

  capturedCount++;
  const isText = !!text;
  const fs = parseFloat(s.fontSize) || 14;
  return {
    id:        `node-${++nodeCounter}`,
    tagName:   `#${which}`,
    type:      isText ? 'text' : 'frame',
    name:      `::${which}`,
    pseudo:    which,
    x:         Math.round(x),
    y:         Math.round(y),
    width:     Math.round(w),
    height:    Math.round(h),
    style:     getStyleFromComputed(s),
    text:      isText ? text : undefined,
    lines:     isText ? 1 : undefined,
    textWidth: isText ? Math.ceil(text.length * fs * 0.55) : undefined,
    children:  [],
  };
}

function attachPseudos(parentEl: Element, parentRect: DOMRect, node: CaptureNode) {
  if (capturedCount >= MAX_NODES) return;
  const before = capturePseudo(parentEl, parentRect, 'before');
  if (before) node.children.unshift(before);   // renders behind real children
  if (capturedCount >= MAX_NODES) return;
  const after  = capturePseudo(parentEl, parentRect, 'after');
  if (after)  node.children.push(after);       // renders in front
}

function serializeElement(
  el: Element,
  parentDocX: number,
  parentDocY: number,
  depth = 0
): CaptureNode | null {
  if (depth > MAX_DEPTH || capturedCount >= MAX_NODES) return null;

  const rect   = el.getBoundingClientRect();
  const docX   = rect.left + window.scrollX;
  const docY   = rect.top  + window.scrollY;

  const s = window.getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return null;

  // Size filter:
  //  • Totally invisible (< 1px in either axis) → always skip
  //  • Tiny in one axis BUT has a visible box (bg/border/radius) → KEEP
  //    (this covers 1px divider lines, decorative dots, etc.)
  //  • Tiny + no decoration → skip (whitespace, layout artifacts)
  if (rect.width < 1 || rect.height < 1) return null;
  const tooSmall = rect.width < MIN_SIZE || rect.height < MIN_SIZE;
  if (tooSmall && !hasVisibleBox(s)) return null;

  capturedCount++;
  const type = classifyElement(el);
  const id   = `node-${++nodeCounter}`;

  const node: CaptureNode = {
    id,
    tagName: el.tagName.toLowerCase(),
    type,
    name: getNodeName(el),
    x: Math.round(docX - parentDocX),
    y: Math.round(docY - parentDocY),
    width:  Math.round(rect.width),
    height: Math.round(rect.height),
    style:  getStyle(el),
    children: [],
  };

  // Rasterization: if this element uses Figma-impossible CSS, flag it as an image
  // and DON'T recurse — the screenshot will contain its whole subtree.
  const reason = rasterizeReason(el, s);
  if (reason && rasterTargets.length < MAX_RASTER && rasterizable(rect)) {
    node.rasterize    = true;
    node.rasterReason = reason;
    node.rasterId     = `raster-${id}`;
    // Tag the element so the screenshot pipeline (harness via Playwright locator,
    // extension via querySelector) can find this exact element to capture.
    try { (el as HTMLElement).setAttribute('data-h2f-rid', node.rasterId); } catch { /* read-only DOM */ }
    rasterTargets.push({ id: node.rasterId, x: docX, y: docY, width: Math.round(rect.width), height: Math.round(rect.height), reason });
    return node;   // no children, no further style-specific work
  }

  // Native checkbox/radio render with no capturable bg/border — synthesize one.
  if (el.tagName.toLowerCase() === 'input') {
    const t = ((el as HTMLInputElement).type || '').toLowerCase();
    if (t === 'checkbox' || t === 'radio') styleNativeToggle(node, el, s);
  }

  if (type === 'text') {
    const m = measureText(el);
    // Multi-line → bake in the exact wrap points so Figma won't re-flow the text.
    node.text      = m.lines > 1
      ? getWrappedText(el)
      : ((el as HTMLElement).innerText?.trim().slice(0, 1000) ?? '');
    node.lines     = m.lines;
    node.textWidth = m.textWidth;
  }

  if (type === 'image') {
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') {
      const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
      if (src) node.src = src;
    } else if (tag === 'svg') {
      // Serialize the SVG root so the plugin can build NATIVE Figma vector layers
      // (editable shapes) via figma.createNodeFromSvgAsync.
      try {
        const clone = el.cloneNode(true) as SVGElement;
        if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        // Ensure viewBox so it scales correctly even if author omitted it
        if (!clone.getAttribute('viewBox') && rect.width > 0 && rect.height > 0) {
          clone.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
        }
        // Resolve `currentColor` in stroke/fill to the element's actual color —
        // Figma's SVG parser doesn't know what `currentColor` means.
        let markup = new XMLSerializer().serializeToString(clone);
        if (markup.includes('currentColor')) {
          const color = window.getComputedStyle(el).color || '#000';
          markup = markup.split('currentColor').join(color);
        }
        node.svgMarkup = markup;
      } catch { /* leave undefined → plugin renders grey placeholder */ }
    }
    // Note: nested svg children are not re-serialized — the root svg owns them all.
  }

  if (type === 'frame') {
    // Native form controls AND custom dropdowns: keep the box but inject ONE
    // synthetic value text — never recurse into option markup. For dropdowns
    // (select / custom listbox) also add a chevron icon on the right.
    if (isCollapsibleControl(el)) {
      const ctrl = getControlText(el);
      if (ctrl) node.children.push(makeValueTextNode(el, rect, s, ctrl));
      const tag = el.tagName.toLowerCase();
      if (tag === 'select' || isCustomSelect(el)) {
        node.children.push(makeChevronNode(rect, s));
      }
    } else if (el.children.length === 0 && (el as HTMLElement).innerText?.trim()) {
      // Leaf-with-box (button / pill / badge): box stays a frame, add a centered text child.
      node.children.push(makeLeafTextChild(el, rect, s));
    } else {
      // Walk childNodes (not children) so raw Text nodes between elements survive —
      // e.g. <button><span>G</span> Continue with Google</button>
      for (const child of Array.from(el.childNodes)) {
        if (capturedCount >= MAX_NODES) break;
        if (child.nodeType === 1 /* ELEMENT */) {
          const cn = serializeElement(child as Element, docX, docY, depth + 1);
          if (cn) node.children.push(cn);
        } else if (child.nodeType === 3 /* TEXT */) {
          const cn = makeTextNodeChild(child as Text, rect, s, docX, docY);
          if (cn) node.children.push(cn);
        }
      }
      // Frame with no captured children but its own text → demote to text
      if (node.children.length === 0) {
        const txt = (el as HTMLElement).innerText?.trim().slice(0, 1000) ?? '';
        if (txt) {
          const m = measureText(el);
          node.type = 'text';
          node.text = m.lines > 1 ? getWrappedText(el) : txt;
          node.lines = m.lines; node.textWidth = m.textWidth;
        }
      }
    }

    // Probe for pseudo-elements LAST so any real children are already in place.
    // Skip if we ended up demoting to text above (no children container).
    if (node.type === 'frame') attachPseudos(el, rect, node);
  }

  return node;
}

export function buildPayload(root: Element, mode: CapturePayload['mode']): CapturePayload {
  nodeCounter   = 0;
  capturedCount = 0;
  rasterTargets = [];

  const pageW = document.documentElement.scrollWidth;
  const pageH = document.documentElement.scrollHeight;
  const nodes: CaptureNode[] = [];

  if (mode === 'full-page') {
    for (const child of Array.from(document.body.children)) {
      if (capturedCount >= MAX_NODES) break;
      const n = serializeElement(child, 0, 0);
      if (n) nodes.push(n);
    }
  } else {
    const rect = root.getBoundingClientRect();
    const n = serializeElement(root, rect.left + window.scrollX, rect.top + window.scrollY);
    if (n) nodes.push(n);
  }

  return {
    url:      location.href,
    title:    document.title,
    mode,
    viewport: { width: pageW, height: pageH },
    nodes,
  };
}
