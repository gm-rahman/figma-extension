// Find the DownloadApp_video element in preview.html and inspect it
const fs = require('fs');
const html = fs.readFileSync('test/preview.html', 'utf8');

const idx = html.indexOf('DownloadApp_video');
console.log('found DownloadApp_video at idx:', idx);
if (idx >= 0) {
  console.log('--- 2000 chars around ---');
  console.log(html.substring(Math.max(0, idx - 200), idx + 2000));
}

// Also look for the video phone (phone-1 raster) — that should be the dataURL img
console.log('\n--- searching for data:image/png video ---');
const dataIdx = html.indexOf('data:image/png');
console.log('data:image/png first found at:', dataIdx);
if (dataIdx >= 0) {
  // find the enclosing img/div
  const before = html.lastIndexOf('<', dataIdx);
  const after = html.indexOf('>', dataIdx) + 1;
  console.log('enclosing tag:', html.substring(before, after));
}

// Also search for DownloadApp_section and find video
const sec = html.indexOf('DownloadApp_section');
if (sec >= 0) {
  const slice = html.substring(sec, sec + 4000);
  // Find the 228x491 div
  const phone1 = slice.match(/left:309px[^"]*"/);
  console.log('\n--- DownloadApp_section slice ---');
  if (phone1) {
    const pIdx = slice.indexOf(phone1[0]);
    console.log('phone-1 (309px, 228x491) ctx:', slice.substring(Math.max(0, pIdx - 100), pIdx + 500));
  } else {
    console.log('no 309px match in section; dumping first 2000 chars');
    console.log(slice.substring(0, 2000));
  }
}