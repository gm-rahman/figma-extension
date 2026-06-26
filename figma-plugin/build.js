const { execSync } = require('child_process');
const fs = require('fs');

if (!fs.existsSync('dist')) fs.mkdirSync('dist');

// Compile plugin.ts → dist/plugin.js (single bundle, no exports)
execSync('npx esbuild src/plugin.ts --bundle --outfile=dist/plugin.js --target=es2017', { stdio: 'inherit' });

// Compile ui.ts → temp bundle
execSync('npx esbuild src/ui.ts --bundle --outfile=dist/ui-bundle.js --target=es2017', { stdio: 'inherit' });

// Inline the compiled JS directly into ui.html → dist/ui.html
// Figma loads __html__ from the manifest "ui" file — external <script src> won't resolve inside the sandbox
const uiJs   = fs.readFileSync('dist/ui-bundle.js', 'utf-8');
const uiHtml = fs.readFileSync('ui.html', 'utf-8');
const output = uiHtml.replace(
  /<script\s[^>]*src="dist\/ui\.js"[^>]*><\/script>/,
  `<script>\n${uiJs}\n</script>`
);
fs.writeFileSync('dist/ui.html', output);
fs.unlinkSync('dist/ui-bundle.js');

console.log('Build complete → dist/plugin.js + dist/ui.html');
