// Regression test for parseGradientStops + resolveStopPosition
// Mirrors the logic in src/plugin.ts. Run with: node test-stops.cjs

function resolveStopPosition(pos, vw, vh) {
  if (!pos) return null;
  const t = pos.trim();
  if (t.endsWith('%')) return parseFloat(t) / 100;
  const v = parseFloat(t);
  if (!Number.isFinite(v)) return null;
  if (t.endsWith('vh') || t.endsWith('vw') ||
      t.endsWith('vmin') || t.endsWith('vmax')) return v / 100;
  return null;
}

function parseGradientStops(css, vw, vh) {
  const pattern = /(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})(\s+[\d.]+(?:%|px|vh|vw|vmin|vmax)\b)?/g;
  const raw = [];
  let m;
  while ((m = pattern.exec(css)) !== null) {
    const resolved = m[2] ? resolveStopPosition(m[2].trim(), vw, vh) : undefined;
    raw.push({ color: m[1], pos: resolved == null ? undefined : resolved });
  }
  if (raw.length < 2) return raw.map(s => s.pos);
  let firstDefined = raw.findIndex(s => s.pos !== undefined);
  let lastDefined = -1;
  for (let i = raw.length - 1; i >= 0; i--) if (raw[i].pos !== undefined) { lastDefined = i; break; }
  if (firstDefined < 0 || lastDefined < 0) {
    raw.forEach((s, i) => { s.pos = i / (raw.length - 1); });
  } else {
    raw.forEach((s, i) => {
      if (s.pos === undefined) {
        s.pos = (firstDefined + (i - firstDefined) * (lastDefined - firstDefined) /
                 Math.max(1, raw.length - 1 - firstDefined)) / Math.max(1, lastDefined);
      }
    });
  }
  return raw.map(s => Math.max(0, Math.min(1, s.pos)));
}

const cases = [
  { name: 'Fresha vh 1440x900',
    css:  'radial-gradient(circle, rgb(239,105,151) 20vh, rgb(232,92,186) 40vh, rgb(184,76,220) 60vh)',
    vw: 1440, vh: 900,
    expect: [0.2, 0.4, 0.6] },
  { name: 'Stripe percentage',
    css:  'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 100%)',
    vw: 1440, vh: 900,
    expect: [0.0, 1.0] },
  { name: 'Mixed px + undefined',
    css:  'linear-gradient(0deg, #ff0000, #00ff00 50%, #0000ff 120px)',
    vw: 1440, vh: 900,
    expect: [0.0, 0.5, 1.0] },
  { name: 'Wrong viewport (full pg)',
    css:  'radial-gradient(circle, #ff0000 20vh, #0000ff 60vh)',
    vw: 1440, vh: 5760,
    expect: [0.2, 0.6] },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = parseGradientStops(c.css, c.vw, c.vh);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + c.name);
  console.log('       got      ' + JSON.stringify(got));
  console.log('       expected ' + JSON.stringify(c.expect));
  ok ? pass++ : fail++;
}
console.log('---');
console.log('Summary: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);