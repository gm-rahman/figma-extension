// Inspect the images array and find which one corresponds to node-460 (video)
const fs = require('fs');
const cap = JSON.parse(fs.readFileSync('test/capture.json', 'utf8'));

console.log('images.length:', cap.images.length);
for (let i = 0; i < cap.images.length; i++) {
  const img = cap.images[i];
  const summary = {
    index: i,
    bytes: img.bytes || img.dataURL?.length || 0,
    url: img.url?.slice(0, 100),
    mime: img.mimeType,
    width: img.width,
    height: img.height,
    keys: Object.keys(img),
  };
  console.log(JSON.stringify(summary, null, 2));
}

// Check if video node has any reference to images
function find(node, path) {
  if (node.id === 'node-460' || node.tagName === 'video') {
    console.log('\n--- video node ---');
    console.log(JSON.stringify(node, null, 2).slice(0, 2000));
    return true;
  }
  if (node.children) for (let i = 0; i < node.children.length; i++) if (find(node.children[i], `${path}/${i}`)) return true;
  return false;
}
for (let i = 0; i < cap.nodes.length; i++) find(cap.nodes[i], `${i}`);