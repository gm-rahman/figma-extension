# HTML → Figma

Capture any webpage — public or localhost — and rebuild it in Figma as **editable native
layers** (frames, text, vectors, image fills), not a screenshot.

The system is three cooperating parts:

| Part | What it does |
|---|---|
| `extension/` | Chrome extension (Manifest V3) that captures the page DOM |
| `backend/` | Express relay (`:3000`) that receives a capture and serves it to the plugin |
| `figma-plugin/` | Figma plugin that fetches a capture and rebuilds it as native nodes |

**Flow:** extension captures → `POST http://localhost:3000/capture` → figma-plugin `GET`s
the latest capture → builds Figma nodes.

## Prerequisites

- **Node.js 24 LTS** and npm
- Google Chrome (for the extension)
- Figma desktop app (for the plugin)

## Run the whole thing

### 1. Backend (the relay)

```bash
cd backend
npm ci
npm run dev        # Express on http://localhost:3000
```

### 2. Extension (the capturer)

```bash
cd extension
npm ci
npm run build      # Vite -> extension/dist/
```

In Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select
the `extension/` folder. Use the popup to **Capture Full Page** or **Pick an Element**; the
capture is POSTed to the backend.

### 3. Figma plugin (the rebuilder)

```bash
cd figma-plugin
npm ci
npm run build      # esbuild -> figma-plugin/dist/
```

In Figma: **Plugins → Development → Import plugin from manifest…** → choose
`figma-plugin/manifest.json`. Run the plugin; it fetches the latest capture from the
backend and rebuilds it on the canvas.

## Development

Active development happens on the **`development`** branch, which also holds the offline
test harness, design docs, and tooling. `main` is the runnable-core showcase. To refresh
`main` from `development`, use `scripts/sync-main-from-dev.sh` (on `development`).

## License

MIT — see [LICENSE](LICENSE).
