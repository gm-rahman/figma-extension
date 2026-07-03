const fs = require('fs');
const cap = JSON.parse(fs.readFileSync('test/capture.json', 'utf8'));
console.log('images keys (first 5):');
const keys = Object.keys(cap.images);
console.log('total keys:', keys.length);
for (const k of keys.slice(0, 5)) {
  const v = cap.images[k];
  console.log(`  ${k}:`, typeof v, v?.dataURL ? `dataURL len=${v.dataURL.length}` : v?.bytes ? `bytes len=${v.bytes.length || JSON.stringify(v.bytes).length}` : JSON.stringify(v).slice(0, 200));
}

// Specifically check for raster-node-460
console.log('\nraster-node-460:');
console.log(' exists:', !!cap.images['raster-node-460']);
console.log(' value type:', typeof cap.images['raster-node-460']);
console.log(' value:', cap.images['raster-node-460'] ? Object.keys(cap.images['raster-node-460']) : 'N/A');

// Search for any image/raster related to node-460
console.log('\nall keys containing raster or 460:');
for (const k of keys) if (/raster|460/.test(k)) console.log(`  ${k}:`, cap.images[k] ? Object.keys(cap.images[k]).join(',') : 'null');