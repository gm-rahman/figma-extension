// Find all video + picture elements in the capture
const fs = require('fs');
const cap = JSON.parse(fs.readFileSync('test/capture.json', 'utf8'));
const root = cap.nodes;

function walk(n, depth = 0, path = '') {
  if (!n) return;
  if (n.tagName === 'video' || n.tagName === 'picture' || n.tagName === 'VIDEO' || n.tagName === 'PICTURE') {
    console.log(`--- ${n.tagName} at ${path} ---`);
    console.log(JSON.stringify({
      id: n.id,
      name: n.name,
      tag: n.tagName,
      src: n.src,
      type: n.type,
      width: n.width,
      height: n.height,
      x: n.x, y: n.y,
      opacity: n.style?.opacity,
      rasterizeReason: n.rasterizeReason,
      backgroundImage: n.style?.backgroundImage,
      hasChildren: !!n.children?.length,
      childSummary: n.children?.map(c => ({ tag: c.tagName, type: c.type, src: c.src?.slice(0, 80), name: c.name }))
    }, null, 2));
  }
  if (n.children) for (let i = 0; i < n.children.length; i++) walk(n.children[i], depth + 1, `${path}/${i}`);
}

console.log('total top-level:', root.length);
for (let i = 0; i < root.length; i++) walk(root[i], 0, `${i}`);

const counts = {};
function count(n) {
  if (!n) return;
  counts[n.tagName || n.type || 'unknown'] = (counts[n.tagName || n.type || 'unknown'] || 0) + 1;
  if (n.children) for (const c of n.children) count(c);
}
for (const r of root) count(r);
console.log('\ntag counts (filtered):');
for (const k of Object.keys(counts)) if (/video|picture|img|svg|image/i.test(k)) console.log(`  ${k}: ${counts[k]}`);