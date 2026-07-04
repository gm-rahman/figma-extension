import fs from 'node:fs';
const src = process.argv[2] || 'test/capture.json';
const c = JSON.parse(fs.readFileSync(src,'utf8'));
const counts = {};
const samples = {};
const types = {};
const styleCounts = {};

function walk(n) {
  const t = (n.tagName || '').toLowerCase();
  counts[t] = (counts[t]||0)+1;
  if (t && !samples[t]) samples[t] = { tagName: t, type: n.type, name: n.name, hasSrc: !!n.src, hasRaster: !!n.rasterId, hasSvg: !!n.svgMarkup, width: n.width, height: n.height };
  types[n.type] = (types[n.type]||0)+1;
  if (n.style) for (const k of Object.keys(n.style)) styleCounts[k] = (styleCounts[k]||0)+1;
  for (const ch of n.children || []) walk(ch);
}
for (const n of c.nodes || []) walk(n);
console.log('TOTAL nodes:', c.nodes.length);
console.log('');
console.log('Type counts:');
for (const [t, c2] of Object.entries(types).sort((a,b)=>b[1]-a[1])) console.log('  ' + t.padEnd(20) + c2);
console.log('');
console.log('Tag counts:');
for (const [t, c2] of Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 40)) console.log('  ' + t.padEnd(20) + c2);
console.log('');
for (const t of ['iframe','input','button','picture','video','img','source','svg','a','label','select','textarea','details','summary','form','footer','header','nav','main','section','article','aside','ul','ol','li','table','thead','tbody','tr','td','th','figure','figcaption','h1','h2','h3','h4','h5','h6']) {
  if (samples[t]) console.log(t + ':', JSON.stringify(samples[t]));
}
console.log('');
console.log('Style field frequency:');
for (const [k, c2] of Object.entries(styleCounts).sort((a,b)=>b[1]-a[1]).slice(0, 60)) console.log('  ' + k.padEnd(36) + c2);