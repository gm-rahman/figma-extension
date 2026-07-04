// group-gaps.mjs — categorize remaining audit gaps by prefix.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const lines = readFileSync(resolve(__dirname, 'tmp/gaps2.txt'), 'utf8').split(/\r?\n/);
const groups = new Map();
const highValue = [];
let total = 0;
for (const ln of lines) {
  const m = ln.match(/^\s*(\d+)\s+([a-z][a-z0-9-]*)/);
  if (!m) continue;
  total++;
  const c = parseInt(m[1], 10);
  const p = m[2];
  const prefix = p.split('-').slice(0, 2).join('-');
  groups.set(prefix, (groups.get(prefix) || 0) + 1);
  if (c >= 100) highValue.push([c, p]);
}
console.log(`Total gap entries: ${total}`);
console.log('\n=== PREFIX BUCKETS ===');
for (const [k, v] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(v).padStart(4)}  ${k}`);
}
console.log('\n=== HIGH-VALUE PROPS (count >= 100) ===');
for (const [c, p] of highValue.sort((a, b) => b[0] - a[0])) {
  console.log(`${String(c).padStart(5)}  ${p}`);
}