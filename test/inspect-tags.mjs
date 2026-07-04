import fs from 'node:fs';
const src = process.argv[2] || 'capture.json';
const c = JSON.parse(fs.readFileSync(src,'utf8'));
console.log('top keys:', Object.keys(c).slice(0, 15));
console.log('nodes length:', (c.nodes || []).length);
const counts = {};
const samples = {};
for (const n of c.nodes || []) {
  const t = (n.tagName || '').toLowerCase();
  counts[t] = (counts[t] || 0) + 1;
  if (t && !samples[t]) samples[t] = { tagName: t, type: n.type, name: n.name, hasSrc: !!n.src, hasRaster: !!n.rasterId, width: n.width, height: n.height };
}
console.log('Tag counts in test/capture.json:');
for (const [t, c2] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('  ' + t.padEnd(20) + c2);
console.log('');
for (const t of ['iframe', 'input', 'button', 'picture', 'video', 'img', 'source', 'svg', 'a', 'label', 'select', 'textarea', 'details', 'summary', 'form']) {
  if (samples[t]) console.log(t + ':', JSON.stringify(samples[t]));
}
console.log('');
console.log('TOTAL nodes:', c.nodes.length);
console.log('images:', Object.keys(c.images || {}).length);
