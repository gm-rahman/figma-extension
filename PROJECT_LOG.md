# HTML → Figma — Project Log

A Chrome Extension + Figma Plugin that captures any webpage (public or
localhost) and rebuilds it in Figma as **editable** native layers — frames,
text, vectors, image fills — not screenshots. Goal: match, then beat, the
commercial "html.to.design" plugin.

Last updated: 2026-06-27

---

## 1. Architecture overview

```
┌─────────────────┐   capture    ┌──────────────┐   POST    ┌─────────────┐
│ Chrome Extension│ ───────────▶ │  Backend     │ ───────▶  │   (memory)  │
│  content.js     │   payload    │  Express     │  /capture │   Map store │
│  background.js  │   +images    │  :3000       │           └─────────────┘
│  popup.html     │              └──────────────┘                  │
└─────────────────┘                                                │ GET
        ▲                                                          ▼
        │ capture-core.ts (shared)                       ┌──────────────────┐
        │                                                │  Figma Plugin    │
        │                                                │  ui.ts (iframe)  │
        │                                                │  plugin.ts (sbox)│
        └────────────── same serialization ────────────▶│  builds nodes    │
                         used by the test harness        └──────────────────┘
```

### Components
| Path | Role |
|---|---|
| `extension/src/capture-core.ts` | **Shared, pure** DOM→JSON serialization (no `chrome.*`). Used by both the extension and the offline test harness. The heart of the system. |
| `extension/src/content.ts` | Content script: triggers capture, element picker, drives rasterization screenshots, sends payload to background. |
| `extension/src/background.ts` | Service worker: fetches images, screenshots+crops rasterized elements, POSTs to backend. |
| `extension/src/popup.html/.ts` | Extension popup UI (Capture Full Page / Pick an Element). |
| `extension/src/types.ts` | `ElementStyle`, `CaptureNode`, `CapturePayload` (kept in sync with the plugin copy). |
| `backend/src/index.ts` | Express server, in-memory `Map`, 50 MB JSON limit. Routes: POST `/capture`, GET `/capture/latest`, `/capture/:id`, `/captures`, DELETE `/capture/:id`. |
| `figma-plugin/src/plugin.ts` | Sandbox: turns the capture JSON into Figma nodes. |
| `figma-plugin/src/ui.ts` | Plugin iframe UI: fetches captures, decodes images, posts to sandbox. |
| `figma-plugin/src/types.ts` | Mirror of the extension types. |
| `test/` | **Offline test harness** (Playwright + analyzer + visual preview). |

### Build commands
- Extension: `cd extension && npm run build` (Vite) or `npm run dev` (watch)
- Plugin: `cd figma-plugin && npm run build` (esbuild via `build.js`)
- Backend: `cd backend && npm run dev` (tsx)
- Type-check plugin: `cd figma-plugin && npx tsc --noEmit`

### Key data-flow facts
- Coordinates are **parent-relative** (computed in `content.ts`/`capture-core.ts`);
  the plugin uses `capture.x/y` directly — no extra offset.
- Figma JSON-serializes `postMessage`, so image bytes travel as `number[]`
  (`Uint8Array` → `number[]` in ui.ts → `new Uint8Array()` in plugin.ts).
- Images (incl. rasterized PNGs) live in `payload.images` keyed by URL or
  `rasterId`; ui.ts converts every entry into `imageMap`.

---

## 2. The test harness (how we verify WITHOUT Figma)

Location: `test/`. Runs the **real** `capture-core.ts` in headless Chromium so we
inspect exactly what gets captured — no Chrome→backend→Figma round trip.

| Command | Purpose |
|---|---|
| `npm test` | Capture fixture → analyze → render preview |
| `npm run test:live` | Same against `http://localhost:5173` |
| `node run-capture.mjs --file="C:\path\index.html" --name=x` | Capture a static HTML file (no server) |
| `node run-capture.mjs --url=https://site.com --viewport=1440x900` | Any URL/viewport |
| `node analyze.mjs` | Tree + asset coverage + font usage + PROBLEMS/NOTES |
| `node visual-diff.mjs` | Render `capture.json` → `preview.html` |
| `node run-capture.mjs --update-snapshot` | Commit current capture as regression baseline |

Outputs: `capture.json` (full payload), `preview.html` (open beside the original),
`snapshot/<name>.json` (structural regression baseline, image bytes stripped).

The harness **also rasterizes** (via Playwright `locator.screenshot`) so the whole
pipeline — including image fills — is verifiable offline before touching the
browser extension.

**Workflow discipline:** fix from `preview.html` + analyzer output, not from Figma
screenshots. Only import to Figma once the preview matches.

---

## 3. Implemented — full history

### Foundations (early sessions)
- Chrome MV3 extension + Figma plugin + Express backend scaffolding (TypeScript).
- DOM serialization with document-relative coordinates.
- Coordinate **double-subtraction bug** fixed (children already parent-relative).
- CSS solid/linear-gradient fills, correct gradient transform matrix.
- Drop shadows, opacity, borders, border-radius.
- Image embedding pipeline (`<img>` → fetch → base64 → image fill).
- SVG capture → `figma.createNodeFromSvg` native vector layers.
- Backend in-memory store + REST routes.

### Refactor
- Extracted pure logic into `capture-core.ts` (no `chrome.*`) so the harness and
  extension share one serializer. `content.ts` became thin (picker + messaging).

### Phase 0 — Test harness
- Playwright + esbuild bundling of `capture-core.ts` into an injectable IIFE.
- `--live`, `--url`, `--file`, `--viewport`, `--name`, `--update-snapshot` flags.
- Snapshot structural diff (added/removed/mutated nodes).
- `visual-diff.mjs` → `preview.html` renderer.
- Analyzer: tree, asset coverage, font usage, input-wrapper checks, problems.
- Waits for `document.fonts.ready` before measuring (text-width accuracy).

### Phase 1 — Pseudo-elements (`::before` / `::after`)
- `getComputedStyle(el, '::before'/'::after')`; synthesize child nodes when
  `content !== 'none'` and there's a visible box or text.
- Position math from `position`/`top`/`left`/`right`/`bottom`/`width`/`height`.
- `::before` inserted behind real children, `::after` in front.
- `pseudo: 'before'|'after'` field for naming/order.

### Phase 2 — Web fonts
- Full CSS weight → Figma style map (Thin…Black + keywords).
- Family-stack fallback chain (try each family before Inter).
- `figma.listAvailableFontsAsync()` to resolve installed family/style.
- **Substitution diagnostics** surfaced in the plugin UI (`requested → loaded`).

### Phase 3 — Inline-row text width
- `measureText()` via `Range.getClientRects()` → real rendered `lines` + `textWidth`.
- Single-line text uses `WIDTH_AND_HEIGHT` (auto-hug; never clips on font drift).
- Center/right single-line text gets an x-offset so it stays positioned.

### Phase 4 — Input-with-icon
- Form-control collapse runs **only** on `<input>/<select>/<textarea>` itself;
  wrappers recurse so sibling icons survive.
- Native + custom (ARIA `combobox`/`listbox`) dropdowns collapse to a single
  value text instead of dumping the whole option list.

### Phase 5 — Backdrop-filter
- Capture `backdropFilter` (+ `-webkit-`). Parse `blur(Npx)` → Figma
  `BACKGROUND_BLUR` effect. Non-blur terms (saturate, etc.) noted, not applied.

### Phase 6 — Robust background-image extraction
- Regex handles multi-layer backgrounds (gradient + url), `image-set()`, quoted
  URLs with query strings — finds the first real `url()`.
- `background.ts`: resolve relative URLs against the page URL; pass data: URLs
  through without fetching.

### Phase 7 — Polish
- Per-corner border radius (`topLeftRadius` etc. when corners differ).
- Multiple box-shadows → array of effects (top-level comma split, inset → inner).
- `currentColor` in SVG markup resolved to the element's computed color.
- `transform` captured; analyzer warns when present.

### Phase 8 — Real-page fixes (from Aether capture)
- **Raw Text-node children** captured (`childNodes`, not just `children`) — fixes
  "Continue with Google" text being dropped next to its `<span>` icon.
- Tiny-but-decorated elements kept (1px divider lines) via box-aware size filter.
- Pure CSS rotations applied (later superseded by full affine in the font/skew work).

### Phase 9 — Polish from real capture
- `stripBoxDecoration()` — synthesized text children no longer repaint the
  parent's pill bg/border (fixes "double layer" on Sign-in pill).
- Synthesized **chevron** for native `<select>` (scales with font-size, 14–24px).
- Native checkbox/radio get a synthesized visible box (border/accent fill; radio
  = circle) — they're invisible in computed style otherwise.
- z-index ordering: children sorted so negative-z decoratives paint behind.
- "icon as text" downgraded to an informational NOTE (e.g. literal `<span>G</span>`).

### Text fidelity — baked line breaks (the html.to.design trick)
- `getWrappedText()` walks characters, detects where each line's top edge changes,
  inserts hard `\n`. Multi-line text now reproduces the original wrapping exactly,
  regardless of font-metric drift. Plugin renders with `WIDTH_AND_HEIGHT` so Figma
  honors the breaks and never re-flows. Fixes the overflowing heading.

### Transforms — full affine incl. skew
- Capture `transform` matrix + `transformOrigin`.
- Plugin `applyTransform()` sets `node.relativeTransform = [[a,c,tx],[b,d,ty]]`,
  pivoting about the transform-origin and folding in page position. Rotation +
  skew + scale now reproduce (only true `matrix3d`/perspective is excluded → rasterized).

### Gap #3 — Selective rasterization (all 4 steps complete)
Detect Figma-impossible CSS → screenshot just that element as real browser pixels
→ image fill. Keeps everything else editable. Plan in `RASTERIZATION_PLAN.md`.

- **Step 1 — Detection.** `rasterizeReason(el, s)` flags: `clip-path`, `mask`,
  element `filter:`, non-normal `mix-blend-mode`/`background-blend-mode` (per-layer
  aware), `conic-gradient`, `repeating-*-gradient`, `background-clip: text`,
  `matrix3d`/`perspective`, `<canvas>`, `<video>`. `data-h2f-raster="on|off"`
  override. Size guard: skip elements larger than the viewport. Cap: 30.
  Flagged nodes get `rasterize/rasterReason/rasterId`, don't recurse, and tag the
  DOM element `data-h2f-rid`. Analyzer reports `rasterized: N` with reasons.
- **Step 2 — Harness capture.** `run-capture.mjs` screenshots each `data-h2f-rid`
  element via Playwright `locator.screenshot` into `payload.images[rasterId]`;
  `visual-diff.mjs` renders them as `<img>` with a minimal style (no bg bleed
  through transparent clip areas).
- **Step 3 — Plugin rendering.** `buildNode` early branch: rasterized node →
  `RectangleNode` with `IMAGE` fill (`scaleMode: FILL`), corner radius + z-order;
  **no** re-applied transform (already baked into the PNG); no children.
- **Step 4 — Extension pipeline.** `content.ts` scrolls each flagged element into
  view, sends rect+DPR to `background.ts`; background `captureVisibleTab` +
  `OffscreenCanvas` crop at DPR → PNG, throttled ~2/sec; merged into
  `payload.images`; `data-h2f-rid` cleaned up afterward. `embedImages` preserves
  existing images.

### Type-safety
- Ran `tsc --noEmit` on the plugin; fixed: `GradientStop`→`ColorStop`,
  `BACKGROUND_BLUR` requires `blurType: 'NORMAL'`, `applyCornerRadii` typed for
  Frame|Rectangle. Plugin is type-clean.

### Session 2026-06-27 — Real-page hardening (tested against fresha.com)
Drove the offline harness against a live, complex marketing page (Fresha) and
fixed every structural capture bug it surfaced. Each was verified in `preview.html`
(screenshotted via Playwright) before/after — no Figma round-trip.

- **`display:contents` hoisting (biggest win).** `serializeElement` dropped any
  element with `display:contents` because it has a 0×0 box — silently discarding
  the ENTIRE subtree. On Fresha this nuked the whole hero search bar (collapsed to
  the word "Search") and the nav pills. Fix: extracted child-walking into
  `appendChildNodes()` which recurses INTO `display:contents` children and hoists
  their children up. `buildPayload` uses it too (body-level app-root wrappers).
- **Overflow-clip awareness (odometer counters).** Animated "rolling number"
  widgets stack digits 0-9 in a tall reel clipped to one digit via `overflow:hidden`.
  Capture ignored the clip and baked every hidden digit into one text node
  (`0\n1\n2…`, 27 lines). Added `clipWindowFor()` (intersection of clipping
  ancestors), `hasClippedOverflow()` gate, and `measureClipped()` which walks
  visible text per-character honouring each text node's clip window. Also dedups
  stacked-duplicate glyphs (`rectsCoincide`) — rolling-number libs render the active
  digit twice. Result: `111,159 appointments booked today` instead of a number column.
- **`isInlineTextContainer` widget guard.** A layout container whose fields are
  form controls (whose text isn't in `innerText`) was flattened to a single text
  node. Now refuses to flatten anything containing `input/select/textarea/button/
  [role=combobox|listbox|option]`.
- **Zero-size containers with children kept.** A collapsed (e.g. 0-height) box that
  hosts absolutely-positioned children (decorative glow/spotlight layers) was
  dropped by the size filter. Now kept as a pass-through frame when it has element
  children. (Plugin already applies `backgroundImageUrl` as an IMAGE fill.)
- **Harness reliability (was non-deterministic).** `networkidle` never settles on
  analytics-heavy sites → frequent timeouts and inconsistent captures (1154 vs 2353
  nodes between runs). Switched to `domcontentloaded` + best-effort idle, added
  full-page auto-scroll (triggers lazy images / below-the-fold sections), image
  settle wait, and a **force-reveal pass** that bumps `opacity:0` scroll-reveal
  elements (fast programmatic scroll misses IntersectionObserver thresholds, which
  otherwise drops product imagery — e.g. the app-section phone mockups). Two
  back-to-back Fresha captures now produce identical structure, no timeouts.
- **Preview renders CSS background-image** elements (`visual-diff.mjs`) so bg-image
  divs (spotlight glow) show instead of an `image?` placeholder.
- **Counter line-break fixed.** `measureClipped` now starts a new line only when a
  glyph's vertical CENTER drops below the current line's bottom (was a raw `top`
  jump), so a big rolling number + smaller trailing label stay on one line:
  `216,457 appointments booked today`.
- **Live capture now mirrors the harness.** Ported the auto-scroll + force-reveal +
  font/image settle into the extension content script (`content.ts`
  `prepareDomForCapture()`), run before a full-page capture and reverted afterwards
  (scroll position + forced opacity restored). Real captures now include lazy
  images and scroll-reveal product imagery (app-section phones/QR/map) that the
  live extension previously dropped.

Outcome: Fresha home page reproduces in the offline preview with the hero search
bar, nav, rolling counter, all card carousels, app-download phones/QR/map, reviews,
"1 billion+", business dashboard and footer — a night-and-day change from the
initial broken import.

### Session 2026-06-27 (cont.) — Image pipeline + SVG backgrounds
Comparing the real Figma import (not just the preview) showed many elements as flat
**lavender boxes** (`{r:.88,g:.88,b:.92}` — the plugin's missing-image fallback).
Root-caused two separate issues via the data, no guessing:

- **Image cap dropped 43 of 83 images.** `background.ts` embedded only the first
  `MAX_IMAGES=40` URLs (DOM order), so everything later — trending photos,
  `qr-code.png`, review avatars, the `forBusinessMedium` dashboard — got no bytes
  and fell back to lavender. Raised the cap to **1000** and **hardened the pipeline**:
  parallel fetching (`FETCH_CONCURRENCY=8`, was strictly sequential), a
  `MAX_TOTAL_BYTES` budget to stay under the backend's 50 MB JSON limit, per-image
  limit raised 2 MB → 12 MB, and **downscale of rasters above Figma's 4096px**
  `createImage` ceiling (decode only files big enough to plausibly exceed it).
- **SVG backgrounds can't be `createImage`d.** The hero glow is `spotlight*.svg`
  (a `#FFD7FF` blob with a Gaussian-blur filter). `figma.createImage` decodes
  PNG/JPG/GIF only (Figma docs), so it threw → lavender wash. Now `background.ts`
  keeps SVG sources as raw markup (`data:image/svg+xml`), and `plugin.ts` sniffs
  image bytes (`svgMarkupFromBytes`, rejecting raster magic numbers up front,
  manual UTF-8 decode since the sandbox lacks `TextDecoder`) and renders them as
  **native vectors** via `createNodeFromSvg` — Figma converts `feGaussianBlur` to a
  layer-blur effect. Handled for both the type-image and frame-background paths.
  Verified the full encode→decode→sniff chain byte-exact offline against the live
  SVG; a PNG is correctly not misdetected.

Decision log: SVG → vector (editable, on-brand) over rasterize; image pipeline →
full harden over minimal. Plugin stays `tsc --noEmit` clean; extension builds clean.

### Session 2026-06-27 (cont.) — Lazy image src + blank-capture diagnosis
User reported a near-blank, narrow-right-column capture of fresha.com vs the full
original. Drove the harness against live fresha.com to get data, not guesses:
- **Engine confirmed healthy:** `--url=https://www.fresha.com --viewport=1440x900`
  → 82 images (all with src), 270 SVGs, 125 pseudo-elements, full 1440 width,
  0 problems. So the blank/narrow capture was a **stale extension build** (made
  before `prepareDomForCapture()`/lazy-load existed) — fix is reload + recapture.
- **Lazy `srcset`/`data-src` fallback added** (`resolveImgSrc` in capture-core):
  when `currentSrc` is empty or a 1px gif placeholder, fall back to srcset
  (largest), `data-src`, `data-lazy-src`, `data-srcset`, then `src`. Covers lazy
  images that expose a URL without having loaded.
- Confirmed `content.ts` already awaits `prepareDomForCapture()` (full-page scroll
  + reveal + settle) before `buildPayload` — extension already mirrors the harness.

Takeaway documented for the user: DevTools shows everything because *you scrolled*;
a one-shot capture must first trigger lazy-load (we do) and re-measure at a chosen
viewport. After reloading the extension, live captures match the harness.

### Session 2026-06-27 (cont.) — Capture progress UI
Made the load-waiting visible so the user can confirm it runs (and so long pages
don't look frozen):
- `content.ts` emits `CAPTURE_PROGRESS` messages at each phase: "Preparing page
  (loading images & sections)…", "Reading layout…", "Capturing effects N/total…",
  "Saving capture…".
- `popup.ts` shows each progress message and **resets the capture timeout** on every
  update (raised 15s → 60s) so it only fires on a genuine stall, not on slow lazy-load.
- Confirmed no page refresh: capture primes the page in place (scroll + reveal +
  settle) and restores scroll/opacity afterward — SPA/auth/form state preserved.
- **Strict typing pass:** `CapturePhase` + `CaptureProgressMessage` ({phase, message,
  current?, total?}) added to `types.ts`; `MessageFromContent` is now a typed union
  incl. progress. `content.ts progress()` and the `popup.ts` listener are fully
  typed — no `any` in the message path.

### Session 2026-06-27 (cont.) — Harness image embedding (preview fidelity)
User marked a fresha.com preview: app phone/map, business dashboard, review
avatars "did not fetch", and "gradient is missing". Investigated with data (live
DOM probe + capture audit), no assumptions:
- **Root cause (single):** the harness only embedded *rasterized* PNGs, so
  `preview.html` hotlinked remote `<img>`/bg URLs — Fresha's CDN blocks hotlinking
  → blank. Every "missing" item had a valid `src` in the capture; the preview just
  couldn't load them. (Figma was never affected — its background worker fetches.)
- **Fix:** `run-capture.mjs` now fetches every remote `src`/`backgroundImageUrl`
  via `page.request.get` (with page referer) and embeds as data-URLs into
  `payload.images`, mirroring the extension's `background.ts`. Result: **82/82
  fetched, 0 failed**; preview is now self-contained and trustworthy.
- **"Gradient is missing" — diagnosed, not a bug.** Live-DOM probe found ZERO
  gradient elements (w>150) in the business band; the green/lime glow is **baked
  into the 2082×776 dashboard `<img>`**. Embedding that image restores it. All four
  marked items shared the one root cause.
- **Noted for future (not this fix):** card/review rows are horizontal carousels
  captured in full (x up to ~9514, clipped by `overflow:hidden` live). Preview
  doesn't clip → they spill right. Real structural item: respect carousel
  overflow-clip (capture only in-viewport items or set `clipsContent`).

### Session 2026-06-27 (cont.) — Carousel overflow clipping
Tackled the structural item above. Added `isClippedAway(el, rect)` in capture-core:
walks clipping ancestors (overflow != visible) PER-AXIS, builds the visible window,
and drops any element scrolled entirely outside it (8px tolerance). `position:fixed`
is exempt (escapes clipping). Applied right after the size filter in
`serializeElement`. Verified on fresha.com @1440:
- nodes **2257 → 871**, maxRight **~9514 → 1977** (1977 = the partially-visible
  dashboard image, correctly kept whole), images **82 → 22** (only visible thumbs).
- Card rows now hold **4 thumbnails each** (was 16-24) — exactly matching the live
  page's visible carousel. Not over-clipped.
Result: capture matches what's actually visible; no off-canvas bloat in Figma.

### Session 2026-06-27 (cont.) — `<video>` capture + missing-imagery audit
User marked up a fresha.com capture flagging missing app-section phone + business
dashboard. Audited with the harness (data, not guessing):
- **`<video>` now captured.** `classifyElement` treats `<video>` as image; the
  serialize image branch uses `video.poster`. Posterless videos (Fresha's app-phone
  has no poster) are already caught by `rasterizeReason('<video> element')` → the
  visible frame is screenshotted. Verified: `DownloadApp_video` 246×529 →
  `rasterize:true`, present in images map.
- **Audit result: capture is COMPLETE.** All 48 card thumbnails, the "Fresha in
  numbers" banner (1440×660), and the **business dashboard** (2082×776 @ y=3937)
  all captured WITH sources. `MAX_IMAGES` already 1000 + 42 MB total guard (prior
  session), so Figma embeds them all. The user's missing areas were a **stale
  extension build** — resolved by rebuild + reload + recapture.

---

## 4. Current status

- **Aether sign-up page (user's real localhost file):** 0 PROBLEMS, 0 NOTES,
  0 rasterized (uses no impossible CSS — we don't over-rasterize). Layout, grid,
  flex, gradients, pseudo-elements, dropdown chevron, checkbox, baked line breaks,
  text widths, z-order all verified against real measured data.
- **Torture fixture:** 4 elements correctly rasterized (clip-path, conic, filter,
  gradient-text); everything else native. Preview renders all crisply.
- **3 of 4 html.to.design gaps closed:** baked line breaks, full-affine transforms,
  selective rasterization.

---

## 5. Known limitations

| Limitation | Why | Mitigation / status |
|---|---|---|
| Custom (non-Google) fonts may substitute to Inter | Plugin API can't install fonts; Figma ships Google Fonts only | Baked line breaks make wrapping font-independent; substitution is reported in the UI. Real fix = Gap #4. |
| Elements larger than the viewport aren't rasterized | `captureVisibleTab` is one viewport | Size-guarded → falls back to native capture. Future: tiling. |
| `captureVisibleTab` includes anything painted on top of the target | It's a viewport screenshot | We target decorative/standalone elements + rasterize whole subtrees. Future: clone-isolate offscreen. |
| `matrix3d`/perspective 3D transforms | Figma is 2D | Such elements are rasterized instead. |
| Animations / transitions / video motion | Single-frame capture by design | Out of scope. |
| Capture is viewport-width specific | Responsive pages lay out per width | Expected for any HTML→design tool; `--viewport` controls it. |
| Browser zoom ≠ 100% may skew raster crop | DPR handled, zoom not | Capture at 100% zoom. |
| Rotated/animated decorative layers (e.g. Fresha hero "spotlight" glow) may be mispositioned in the offline preview | Glow is a large rotated SVG bg on an absolutely-positioned layer inside a 0-height, rotation-animated ancestor chain; `visual-diff.mjs` can't place the rotated off-canvas layer well | Now captured (was dropped entirely) and the plugin renders it as an IMAGE fill; preview placement is approximate. |

---

## 6. TODO / future work

### Gap #4 — Custom font embedding (the last html.to.design gap)
- Detect `@font-face` rules / loaded font files on the page.
- Options: (a) backend font service that uploads to the user's Figma via REST;
  (b) bundle common web fonts; (c) at minimum, a clear per-font substitution
  report with a "install this font" link.
- Lower urgency now that baked line breaks decouple layout from font metrics.

### Rasterization hardening
- **Tiling** for elements larger than the viewport (capture in strips, stitch).
- **Clone-isolate** an element offscreen before screenshot to avoid foreground
  contamination from overlapping siblings.
- Make `MAX_RASTER` / throttle configurable; show progress in the popup.

### Layout / Auto Layout
- Currently positions are absolute with flex containers annotated. Consider true
  Auto Layout (gap/padding driven) as an optional "responsive" mode, while keeping
  absolute as the pixel-accurate default.
- CSS Grid → Figma grid layout (Figma now has native grid) instead of absolute.

### Capture fidelity
- `clip-path` simple cases (inset/circle/round) → native Figma rounded rects /
  ellipses instead of rasterizing, to keep them editable.
- Multiple background layers (stacked gradients) → multiple Figma fills.
- `letter-spacing`, `text-transform`, `text-decoration` (underline/strike) full coverage.
- `object-fit`/`object-position` for images.
- Lazy-loaded images (scroll to trigger, or read `data-src`/`srcset`).
- List markers (`<ul>`/`<ol>` bullets/numbers).

### Productization
- Chrome extension UI: viewport-width picker before capture; capture progress;
  per-capture history.
- Replace in-memory backend with persistent storage (or go backend-less via
  `chrome.storage` / direct plugin fetch) so captures survive restarts.
- Figma plugin: import options (e.g. flatten rasters, toggle Auto Layout).
- Publishing: Chrome Web Store + Figma Community listing, manifest icons, privacy.

### Engineering hygiene
- Add a proper `npm run typecheck` to the extension (wire `@types/chrome` + tsconfig
  so `tsc --noEmit` runs clean like the plugin does).
- CI: run the harness on a set of fixtures; fail on snapshot regressions.
- Unit tests for `capture-core` helpers (color parse, gradient, measureText, wrap).

---

## 7. Reference docs in repo
- `RASTERIZATION_PLAN.md` — detailed plan + build order for Gap #3.
- `test/README.md` — harness usage.
- `PROJECT_LOG.md` — this file.
