// Bakes CSS color filters (grayscale / sepia / saturate / hue-rotate / invert /
// brightness / contrast) into captured colours, so a filtered element built from
// CSS colours (no images in its subtree) imports as EDITABLE Figma layers with the
// right colours — instead of a flat screenshot. Figma has no per-layer colour
// adjustment, so we apply the transform ourselves at capture time.
//
// Math follows the CSS Filter Effects spec (SVG feColorMatrix equivalents).

import { ElementStyle } from './types';

type RGB = [number, number, number];
type Xform = (rgb: RGB) => RGB;

const COLOR_FNS = new Set(['grayscale', 'sepia', 'saturate', 'hue-rotate', 'invert', 'brightness', 'contrast', 'opacity']);
const clamp = (v: number) => Math.max(0, Math.min(255, v));

// A CSS filter is "colour-only" when every function is a colour adjustment we can
// bake (no blur / drop-shadow / url).
export function filterIsColorOnly(filter: string): boolean {
  if (!filter || filter === 'none') return false;
  const fns = filter.match(/([a-z-]+)\(/gi);
  if (!fns) return false;
  return fns.every(fn => COLOR_FNS.has(fn.slice(0, -1).toLowerCase()));
}

function parseAmount(raw: string, dflt: number): number {
  const v = raw.trim();
  if (!v) return dflt;
  if (v.endsWith('%')) return parseFloat(v) / 100;
  if (v.endsWith('deg')) return parseFloat(v);
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
}

// saturate(s) matrix (grayscale(a) == saturate(1-a)).
function saturate(s: number): Xform {
  return ([r, g, b]) => [
    clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
    clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
    clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
  ];
}
function sepia(a: number): Xform {
  const i = 1 - a;
  return ([r, g, b]) => [
    clamp((0.393 + 0.607 * i) * r + (0.769 - 0.769 * i) * g + (0.189 - 0.189 * i) * b),
    clamp((0.349 - 0.349 * i) * r + (0.686 + 0.314 * i) * g + (0.168 - 0.168 * i) * b),
    clamp((0.272 - 0.272 * i) * r + (0.534 - 0.534 * i) * g + (0.131 + 0.869 * i) * b),
  ];
}
function hueRotate(deg: number): Xform {
  const rad = deg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  return ([r, g, b]) => [
    clamp(m[0] * r + m[1] * g + m[2] * b),
    clamp(m[3] * r + m[4] * g + m[5] * b),
    clamp(m[6] * r + m[7] * g + m[8] * b),
  ];
}
function invert(a: number): Xform { return ([r, g, b]) => [clamp(r + a * (255 - 2 * r)), clamp(g + a * (255 - 2 * g)), clamp(b + a * (255 - 2 * b))]; }
function brightness(a: number): Xform { return ([r, g, b]) => [clamp(r * a), clamp(g * a), clamp(b * a)]; }
function contrast(a: number): Xform { return ([r, g, b]) => [clamp((r - 127.5) * a + 127.5), clamp((g - 127.5) * a + 127.5), clamp((b - 127.5) * a + 127.5)]; }

// Compose all colour functions in the filter, left→right.
export function buildColorXform(filter: string): Xform | null {
  const steps: Xform[] = [];
  const re = /([a-z-]+)\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter)) !== null) {
    const fn = m[1].toLowerCase();
    const arg = m[2];
    switch (fn) {
      case 'grayscale': steps.push(saturate(1 - parseAmount(arg, 1))); break;
      case 'saturate':  steps.push(saturate(parseAmount(arg, 1))); break;
      case 'sepia':     steps.push(sepia(Math.min(1, parseAmount(arg, 1)))); break;
      case 'hue-rotate':steps.push(hueRotate(parseAmount(arg, 0))); break;
      case 'invert':    steps.push(invert(Math.min(1, parseAmount(arg, 1)))); break;
      case 'brightness':steps.push(brightness(parseAmount(arg, 1))); break;
      case 'contrast':  steps.push(contrast(parseAmount(arg, 1))); break;
      case 'opacity':   break; // handled by node opacity, not a colour change
    }
  }
  if (!steps.length) return null;
  return (rgb) => steps.reduce((acc, f) => f(acc), rgb);
}

export function composeXform(a: Xform | null, b: Xform | null): Xform | null {
  if (!a) return b;
  if (!b) return a;
  return (rgb) => b(a(rgb));
}

// Parse a CSS colour to [r,g,b,a]; null if not a recognisable colour.
function parseColor(css: string): [number, number, number, number] | null {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? parseFloat(m[4]) : 1];
  const h = css.match(/^#([0-9a-fA-F]{3,8})$/);
  if (h) {
    let x = h[1];
    if (x.length === 3) x = x.split('').map(c => c + c).join('');
    const a = x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1;
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), a];
  }
  return null;
}

// Apply the transform to every colour token in a CSS string (solid or gradient).
function transformColorsInString(css: string, xform: Xform): string {
  if (!css) return css;
  return css.replace(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g, (tok) => {
    const c = parseColor(tok);
    if (!c) return tok;
    const [r, g, b] = xform([c[0], c[1], c[2]]);
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${c[3]})`;
  });
}

// Rewrite all colour-bearing fields of a captured style in place.
export function applyXformToStyle(style: ElementStyle, xform: Xform): void {
  style.backgroundColor = transformColorsInString(style.backgroundColor, xform);
  style.color           = transformColorsInString(style.color, xform);
  style.borderColor     = transformColorsInString(style.borderColor, xform);
  if (style.boxShadow && style.boxShadow !== 'none') style.boxShadow = transformColorsInString(style.boxShadow, xform);
  if (style.backgroundImage && style.backgroundImage.includes('gradient'))
    style.backgroundImage = transformColorsInString(style.backgroundImage, xform);
}
