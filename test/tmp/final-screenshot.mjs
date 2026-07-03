import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///C:/Users/Mahfuz/newProject/test/preview.html');
await page.waitForTimeout(500);

async function scrollAndGetImg(srcMatcher) {
  await page.evaluate((re) => {
    const el = [...document.querySelectorAll('img')].find(e => e.src && new RegExp(re).test(e.src));
    if (el) el.scrollIntoView({ block: 'center' });
  }, srcMatcher.source);
  await page.waitForTimeout(200);
  const r = await page.evaluate((re) => {
    const el = [...document.querySelectorAll('img')].find(e => e.src && new RegExp(re).test(e.src));
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, srcMatcher.source);
  return r;
}

async function scrollDiv(text) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === t);
    if (el) el.scrollIntoView({ block: 'center' });
  }, text);
  await page.waitForTimeout(200);
  const r = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === t);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, text);
  return r;
}

const phone0 = await scrollAndGetImg(/trendyStudio/);
const phone1 = await scrollAndGetImg(/^data:image\/png/);
const billion = await scrollDiv('1 billion+');

console.log('phone-0 (picture):', phone0);
console.log('phone-1 (video raster):', phone1);
console.log('billion:', billion);

const shots = [['phone0', phone0], ['phone1', phone1], ['billion', billion]];
for (const [name, r] of shots) {
  if (r) {
    await page.screenshot({ path: `test/tmp/${name}.png`, clip: r });
    console.log(`saved test/tmp/${name}.png`);
  }
}

await browser.close();