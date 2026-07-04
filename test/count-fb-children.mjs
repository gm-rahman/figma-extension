// One-off counter: how many descendants does Container:ForBusiness_self__l5EtV
// have in the fresh Node-serialized capture.json?
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(readFileSync(resolve(__dirname, 'capture.json'), 'utf8'));

function walk(n, acc) {
  acc.count++;
  const kids = Array.isArray(n.children) ? n.children : [];
  for (const k of kids) walk(k, acc);
}

function findByName(nodes, name) {
  for (const n of nodes) {
    if (n.name === name) return n;
    const k = Array.isArray(n.children) ? n.children : [];
    const found = findByName(k, name);
    if (found) return found;
  }
  return null;
}

const fb = findByName(payload.nodes, 'Container:ForBusiness_self__l5EtV');
if (!fb) {
  console.error('✗ Container:ForBusiness_self__l5EtV not found in fresh capture');
  process.exit(2);
}

console.log(`✓ Found Container:ForBusiness_self__l5EtV`);
console.log(`  rect: ${fb.x},${fb.y} ${fb.width}x${fb.height}`);
console.log(`  own children: ${(fb.children || []).length}`);
console.log(`  children[0] type: ${Array.isArray(fb.children) && fb.children[0] ? fb.children[0].type : 'none'}`);
console.log(`  children[0] name: ${Array.isArray(fb.children) && fb.children[0] ? (fb.children[0].name || fb.children[0].tagName) : 'none'}`);

// Count descendants
const total = { count: 0 };
walk(fb, total);
console.log(`\nTotal elements in ForBusiness_self subtree (including self): ${total.count}`);
console.log(`Total descendants (excluding self): ${total.count - 1}`);

// Walk by type
const byType = {};
const byTag = {};
function tally(n) {
  byType[n.type] = (byType[n.type] || 0) + 1;
  byTag[n.tagName] = (byTag[n.tagName] || 0) + 1;
  const kids = Array.isArray(n.children) ? n.children : [];
  for (const k of kids) tally(k);
}
tally(fb);

console.log(`\nbyType:`);
Object.entries(byType).sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v}`));
console.log(`\nbyTag:`);
Object.entries(byTag).sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(8)} ${v}`));

// Search descendants for visible text
function texts(n, out) {
  if (n.text) out.push({ name: n.name || n.tagName, text: n.text.slice(0, 60), w: n.width, h: n.height });
  const kids = Array.isArray(n.children) ? n.children : [];
  for (const k of kids) texts(k, out);
}
const textsFound = [];
texts(fb, textsFound);
console.log(`\nDescendants carrying text (${textsFound.length}):`);
textsFound.forEach(t => console.log(`  ${t.w}x${t.h}  "${t.text}"`));
