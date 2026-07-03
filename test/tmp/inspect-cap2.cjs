const fs = require('fs');
const cap = JSON.parse(fs.readFileSync('test/capture.json', 'utf8'));
console.log('all top-level keys:', Object.keys(cap));
console.log('typeof cap.images:', typeof cap.images);
console.log('typeof cap.rasters:', typeof cap.rasters);

// Find ALL rasters in tree
const rasters = [];
function find(node, path) {
  if (node.rasterId) rasters.push({ id: node.id, rasterId: node.rasterId, path, src: node.src?.slice(0, 80), tag: node.tagName, bytes: node.bytes || node.imageBytes ? Object.keys(node.bytes || node.imageBytes || {}) : null });
  if (node.children) for (let i = 0; i < node.children.length; i++) find(node.children[i], `${path}/${i}`);
}
for (let i = 0; i < cap.nodes.length; i++) find(cap.nodes[i], `${i}`);
console.log('\nrasterized nodes:', rasters.length);
for (const r of rasters) console.log(' ', JSON.stringify(r));

// Hunt for raster data anywhere in the tree
console.log('\nlooking for rasterId data');
function findData(n, p, depth = 0) {
  if (depth > 5) return;
  for (const k of Object.keys(n || {})) {
    if (/raster|imageBytes|dataUrl/i.test(k) && !/style/.test(k)) {
      console.log(`  ${p}.${k}:`, typeof n[k], n[k]?.slice ? n[k].slice(0, 60) : n[k]);
    }
  }
}
for (let i = 0; i < cap.nodes.length; i++) findData(cap.nodes[i], `nodes[${i}]`);