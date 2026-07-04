// Quick classifier: bucket remaining audit-css gaps so we can pick the
// highest-impact closures next.
import { readFileSync } from 'node:fs';
const text = readFileSync('test/tmp/audit-gaps.txt', 'utf8');
const lines = text.split('\n').filter(l => l.match(/^  \S/));
const buckets = new Map();
for (const line of lines) {
  const prop = line.trim().split(/\s+/)[0];
  let bucket = 'other';
  if (/^border-/.test(prop))                              bucket = 'border-* (per-side)';
  else if (/^corner-/.test(prop))                          bucket = 'corner-shape (CSS4)';
  else if (/^font-/.test(prop))                            bucket = 'font-*';
  else if (/^mask-/.test(prop))                            bucket = 'mask-*';
  else if (/^clip-?/.test(prop))                           bucket = 'clip*';
  else if (/^stroke/.test(prop))                           bucket = 'stroke-*';
  else if (/^fill-/.test(prop))                            bucket = 'fill-*';
  else if (/^column-rule/.test(prop))                      bucket = 'column-rule';
  else if (/^animation/.test(prop))                        bucket = 'animation-*';
  else if (/^transition/.test(prop))                       bucket = 'transition-*';
  else if (/^contain-/.test(prop))                         bucket = 'contain-*';
  else if (/^(appearance|outline|background-size|container-type|backface|dynamic-range|font-stretch)$/.test(prop)) bucket = bucket;
  buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
}
console.log('Bucket                                      Count');
console.log('------------------------------------------------');
[...buckets.entries()].sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(k.padEnd(45), v));
console.log('TOTAL', lines.length);
