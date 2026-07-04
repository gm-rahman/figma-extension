// Simulate the walker fix on the existing capture.json. Shows what
// node-587 (and the other 7 mismatches) would have looked like if the walker
// had the fix in place.
import { readFileSync } from 'fs';
const cap = JSON.parse(readFileSync('./capture.json', 'utf8'));

function* walk(n) {
  yield n;
  for (const c of (n.children || [])) yield* walk(c);
}

const mismatches = [];
for (const n of walk(cap.nodes[0])) {
  const s = n.style;
  if (!s) continue;
  if (s.position !== 'absolute' && s.position !== 'fixed') continue;
  if (!s.top || s.top === 'auto' || !s.left || s.left === 'auto') continue;
  // The capture has style.transform already stripped to 'none' (or 'matrix(a,b,c,d,0,0)').
  // Since it's stripped, we can't recover the original translation from the JSON alone.
  // But we can DETECT the discrepancy by comparing bbox x/y to cssLeft/Top.
  const dx = n.x - parseFloat(s.left);
  const dy = n.y - parseFloat(s.top);
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    mismatches.push({ id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, cssLeft: parseFloat(s.left), cssTop: parseFloat(s.top), dx, dy, w: n.width, h: n.height, transform: s.transform });
  }
}

console.log(`${mismatches.length} elements would be affected by the fix:`);
console.log();
for (const m of mismatches) {
  console.log(`  ${m.id} (${m.type}, "${m.name}")`);
  console.log(`    bbox currently: x=${m.x}, y=${m.y}`);
  console.log(`    css insets:     left=${m.cssLeft}, top=${m.cssTop}`);
  console.log(`    discrepancy:    dx=${m.dx}, dy=${m.dy}`);
  console.log(`    size:           ${m.w} x ${m.h}`);
  console.log(`    captured transform: "${m.transform}" (was stripped by walker)`);
  console.log(`    → with fix: bbox.x=${m.x - m.dx}, bbox.y=${m.y - m.dy}, transform=matrix(1,0,0,1,${m.dx},${m.dy}), top/left=auto`);
  console.log(`    → plugin render at (${m.x - m.dx}, ${m.y - m.dy}) + matrix(${m.dx}, ${m.dy}) = (${m.x}, ${m.y}) [matches bbox]`);
  console.log();
}