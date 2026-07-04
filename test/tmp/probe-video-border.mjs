import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///C:/Users/Mahfuz/newProject/test/preview.html');
await page.waitForTimeout(500);

// Find the DownloadApp_video raster img
const rect = await page.evaluate(() => {
  const img = [...document.querySelectorAll('img[alt*="DownloadApp_video"]')][0];
  if (!img) return null;
  const b = img.getBoundingClientRect();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
});
console.log('video rect:', rect);

// Sample pixels at the top border (a thin slice inside the top edge) and one
// row inside (to compare against the phone-screen colour).
const probe = await page.evaluate(() => {
  const img = [...document.querySelectorAll('img[alt*="DownloadApp_video"]')][0];
  const r = img.getBoundingClientRect();
  const c = document.createElement('canvas');
  c.width = Math.ceil(r.width);
  c.height = Math.ceil(r.height);
  // The img has a CSS border too, so sample both inside and on the border.
  const ctx = c.getContext('2d');
  // Inline svg-as-img, sample via html2canvas-like approach: copy outerHTML.
  // Simpler: paint a checkerboard beneath to test border color presence.
  ctx.fillStyle = '#888';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  function at(x, y) {
    const i = (y * c.width + x) * 4;
    return [d[i], d[i+1], d[i+2]];
  }
  // top edge (should be the captured phone PNG top, white-ish)
  const topCentre = at(Math.floor(c.width/2), 5);
  // 5px inside the image — phone screen
  const insideTop = at(Math.floor(c.width/2), 30);
  // middle of phone
  const mid = at(Math.floor(c.width/2), Math.floor(c.height/2));
  return { topCentre, insideTop, mid };
});
console.log('pixel probe:', probe);

// Take a full-window screenshot cropped to the video for visual confirmation.
if (rect) {
  await page.screenshot({ path: 'test/tmp/video-with-border.png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
  console.log('saved test/tmp/video-with-border.png');
}

await browser.close();