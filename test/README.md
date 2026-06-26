# Capture test harness

Runs the **real** capture logic (`extension/src/capture-core.ts`) in headless
Chromium so we can inspect exactly what gets captured — no Chrome → backend → Figma
round trip.

## Quick start

```bash
cd test
npm install                       # first time only
npx playwright install chromium   # first time only

npm test                          # capture fixture + analyze + render preview
```

Open `test/preview.html` in your browser. That's what your capture will look like.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Capture fixture/stripe.html, analyze, render preview |
| `npm run test:live` | Same against `http://localhost:5173` (your dev server) |
| `npm run capture` | Just write `capture.json` |
| `npm run live` | Capture from `localhost:5173` only |
| `npm run analyze` | Print tree + asset coverage + font usage + problems |
| `npm run preview` | Render `capture.json` → `preview.html` |
| `npm run snapshot:update` | Commit the latest capture as the regression baseline |

## Custom URL / viewport

```bash
node run-capture.mjs --url=https://stripe.com/signup --viewport=1440x900
node run-capture.mjs --name=aether --url=http://localhost:5173
```

**PowerShell** equivalent (no env-var prefix syntax in PS):
```powershell
node run-capture.mjs --url="http://localhost:5173" --name=aether
```

## Workflow

1. `npm run live` — captures localhost. Snapshot diff shows what changed since baseline.
2. `node analyze.mjs` — see structural issues + asset coverage + font list.
3. `node visual-diff.mjs` → open `preview.html` next to the original page. **Side-by-side** is the fastest way to spot problems.
4. Once preview matches the original, **then** import into Figma.

That order ends the open-Figma-and-eyeball loop.
