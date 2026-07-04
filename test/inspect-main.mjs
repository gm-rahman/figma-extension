import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('capture.json', 'utf8'));
console.log('top keys:', Object.keys(c).slice(0, 15));
console.log('nodes length:', (c.nodes || []).length);
if (c.nodes && c.nodes[0]) {
  console.log('first node keys:', Object.keys(c.nodes[0]).slice(0, 20));
  console.log(JSON.stringify(c.nodes[0], null, 2).slice(0, 1500));
}