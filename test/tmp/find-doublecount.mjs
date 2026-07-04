// Walk the entire capture tree and find elements where the bounding-rect
// x/y doesn't match the style.top/left (i.e., the element is "double-counted"
// by the Figma plugin — would render at the wrong position).
import { readFileSync } from 'fs';
const cap = JSON.parse(readFileSync('./capture.json', 'utf8'));

function* walk(n) {
  yield n;
  for (const c of (n.children || [])) yield* walk(c);
}

const total = { abs: 0, withTransform: 0, identity: 0, mismatched: 0, mismatches: [] };

for (const n of walk(cap.nodes[0])) {
  const s = n.style;
  if (!s) continue;
  if (s.position !== 'absolute' && s.position !== 'fixed') continue;
  total.abs++;
  // Skip elements with no explicit top/left
  if (!s.top || s.top === 'auto' || !s.left || s.left === 'auto') continue;
  const cssTop = parseFloat(s.top);
  const cssLeft = parseFloat(s.left);
  const t = (s.transform || 'none').trim();
  if (t !== 'none') { total.withTransform++; continue; }
  total.identity++;
  // The walker's documented contract: bbox.x = docX - parentDocX (post-transform).
  // If the captured x/y matches the un-transformed CSS inset, it's a clue that the
  // transform was "none" in the live page too — so x/y is the un-transformed box.
  // If x/y differs from CSS inset, the live transform must have been a translation
  // that the walker stripped.
  const dx = n.x - cssLeft;
  const dy = n.y - cssTop;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    total.mismatched++;
    total.mismatches.push({ id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, cssLeft, cssTop, dx, dy, w: n.width, h: n.height });
  }
}

console.log(`Total absolute/fixed nodes:          ${total.abs}`);
console.log(`  with non-auto top+left:            ${total.identity + total.withTransform}`);
console.log(`    with transform != 'none':        ${total.withTransform}`);
console.log(`    with transform == 'none' (potential issue): ${total.identity}`);
console.log(`      where bbox x/y != css left/top: ${total.mismatched}`);
console.log('\nMismatch details:');
for (const m of total.mismatches.slice(0, 30)) {
  console.log(`  ${m.id} (${m.type}, "${m.name}"): bbox=(${m.x},${m.y}) cssLeft/Top=(${m.cssLeft},${m.cssTop}) dx=${m.dx} dy=${m.dy} size=${m.w}x${m.h}`);
}
