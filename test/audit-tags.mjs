// Audit HTML tags + CSS properties used on fresha.com vs what's supported.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('https://www.fresha.com', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

// Collect every tag seen in the document, plus CSS props used
const stats = await page.evaluate(() => {
  const tags = new Map();
  const props = new Map();
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const t = el.tagName.toLowerCase();
    tags.set(t, (tags.get(t) || 0) + 1);
    const cs = window.getComputedStyle(el);
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      props.set(p, (props.get(p) || 0) + 1);
    }
  }
  return {
    tagCount: tags.size,
    propCount: props.size,
    tags: [...tags.entries()].sort((a,b) => b[1]-a[1]),
    props: [...props.entries()].sort((a,b) => b[1]-a[1]),
  };
});

console.log('=== HTML tags ===');
for (const [t, c] of stats.tags) console.log(`  ${t.padEnd(20)} ${c}`);
console.log('\n=== CSS properties ===');
for (const [p, c] of stats.props) console.log(`  ${p.padEnd(28)} ${c}`);

await browser.close();