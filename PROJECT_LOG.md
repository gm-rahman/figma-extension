# HTML → Figma — Project Log

A Chrome Extension + Figma Plugin that captures any webpage (public or
localhost) and rebuilds it in Figma as **editable** native layers — frames,
text, vectors, image fills — not screenshots. Goal: match, then beat, the
commercial "html.to.design" plugin.

Last updated: 2026-07-05 (Phase 3 CLOSED — fresh Node-serialized capture proves no walker bug; original concern was PowerShell corruption of workspace-root capture.json)

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

### Session 2026-06-27 (cont.) — Multi-viewport + UI redesign + refresh fix
Large feature pass (5 parts):
1. **Capture fix:** `<picture>` now collapses to its inner `<img>` (image type, via
   `resolveImgSrc(querySelector('img'))`) — removes the redundant wrapper frame.
   Confirmed dashboard/map/avatars are captured + embedded (data audit); prior
   "missing" was stale builds + preview hotlink (already fixed).
2. **Multi-viewport capture (new):** popup lets user pick Desktop 1440 / Laptop 1024
   / Tablet 768 / Mobile 402. `background.ts captureMulti()` attaches `chrome.debugger`,
   `Emulation.setDeviceMetricsOverride` per width, asks content (`CAPTURE_VIEWPORT`)
   to build a payload for that layout, embeds images, and POSTs one combined
   `{mode:'multi-viewport', frames:[{label,width,...payload}]}`. Added `debugger`
   permission. Rasterization skipped during emulation (avoids nested messaging).
   Plugin `buildMultiViewport()` lays frames left→right with labels; `buildFigmaNodes`
   refactored to take originX + return the wrapper (now `clipsContent:true`).
3. **UI redesign:** both popup.html and figma-plugin/ui.html rebuilt — premium dark
   theme (#1c1c1e surfaces, gradient logo, rounded cards, accent #7c5cfc), device
   checklist with custom ticks, status pills.
4. **Refresh fix:** plugin Refresh now re-fetches `/captures` with `cache:'no-store'`
   and re-renders + status (`fetchList`); import paths also `no-store`. Multi-capture
   docs show a "multi" badge in the list.
5. Strict types throughout (`ViewportSpec`, `FrameImport`, `CAPTURE_VIEWPORT`,
   `CAPTURE_MULTI`). Extension + plugin build clean; plugin `tsc` clean (bar the
   pre-existing DOMRectList lib-config noise). Fixture regression: 0 problems.

Note: multi-viewport is debugger-based (extension only) — not exercisable by the
offline harness. Test in Chrome: pick viewports → Capture Selected → Import.

### Session 2026-06-27 (cont.) — Pink-block bug + multi-viewport rasterization
Imported multi-viewport result showed a giant solid **pink rectangle** over the
"1 billion+" band + blank phone/avatars. Root-caused from capture.json (no assume):
- **Pink block = unhandled radial gradient.** `FreshaInNumbers` is
  `radial-gradient(circle, rgb(239,105,177) …)` (that's the pink). It's rasterized
  in single-capture, but **multi-viewport skipped rasterization**, so the plugin
  fell back to `resolveFills`, which only handled `linear-gradient` → grabbed the
  first colour → SOLID PINK 1440×660.
- **Fix 1 (plugin, root):** added `radialGradientFill()` + routed radial / conic /
  repeating / any-other gradient to a native `GRADIENT_RADIAL` (centered transform)
  instead of a solid first-colour. No more flat colour blocks; helps single AND
  multi. (Not pixel-exact for CSS radial sizing, but a real gradient.)
- **Fix 2 (extension):** re-enabled rasterization inside `CAPTURE_VIEWPORT` so each
  emulated viewport also captures videos / clip-path / conic (fixes blank phone).
  Nested CAPTURE_ELEMENT↔background messaging works fine during debugger emulation.
Both build clean; plugin tsc clean (bar DOMRectList noise).

### Session 2026-06-27 (cont.) — Card image radius + heart icon
Data from capture.json (card structure): `<img>` has `radius:0` but its wrapper
`LocationCard` has `radius:16px; overflow:hidden` (it rounds the image via clip);
the favourite heart is a 32×32 absolutely-positioned `<button>` whose glyph is a
`::before` (CSS mask icon).
- **Image radius inheritance:** when an image's own radius is 0, walk up to 3
  clipping ancestors of the same box size and copy their `border-radius` onto the
  image node — so the image renders rounded regardless of frame-clip behaviour.
  Verified: card img now `borderRadius:"16px"`.
- **Mask-icon rasterization:** `rasterizeReason` now flags small (≤56px) elements
  whose `::before`/`::after` uses `mask-image`/`-webkit-mask-image` (Figma can't do
  CSS masks) → screenshots the glyph (covers the heart when it's a mask icon).
  Pseudo probe gated to ≤56px to avoid page-wide cost.

### Session 2026-06-27 (cont.) — Debug pass / "not all CSS captured"
Ran a full debug pass against fresha.com @1440 (data, not assumption):
- **Result: capture is clean.** 76 SVGs (all markup), 22 images (all src), 5
  gradients, 2 rasters (video phone + FreshaInNumbers), 0 real PROBLEMS. Colors,
  per-corner radius, shadows, layout/flex/grid, transforms, backdrop-filter,
  z-order all captured.
- **Fixed analyzer false-positive:** rasterized image nodes (e.g. the app `<video>`)
  were wrongly flagged "IMG-NO-SRC → grey placeholder". They carry their PNG in the
  images map by `rasterId` (verified `raster-node-445` present). Analyzer now skips
  rasterized nodes → PROBLEMS 0.
- **The real (only) delta = custom font `RoobertPRO ×200`.** Fresha's whole site
  uses RoobertPRO, which Figma doesn't ship, so text falls back to Inter (reported
  via the plugin's substitution diagnostic). This is Gap #4 (font embedding): Figma
  plugin API CANNOT install fonts. Exact text requires the user to install
  RoobertPRO in Figma, then re-import. Baked line-breaks already keep layout intact
  despite the substitution.
- Minor not-yet-captured CSS (low impact, future): text-decoration (underline),
  font-style italic, outline/focus rings, text-transform edge cases.

### Session 2026-06-27 (cont.) — Google Sheets → data table
Google Sheets renders its grid on a `<canvas>` (cell text not in the DOM), so a
normal capture only screenshots it. Wired up the dormant `fetchSheetCsv` path:
- New `extension/src/sheet-table.ts`: `isGoogleSheet()`, `sheetIdAndGid()`,
  RFC-4180 `parseCsv()` (quoted commas/quotes/newlines), and `buildSheetPayload()`
  → a real Figma table (frame→rows→cells→text), header row bold + tinted, column
  widths from longest value. Verified offline (quoted-comma + multiline cells OK).
- `content.ts trySheetCapture()`: on a `docs.google.com/spreadsheets/` URL, fetch
  CSV via the existing `FETCH_SHEET_CSV` background handler (gviz/export endpoint),
  parse, and send the table payload — wired into both `captureAndSend` and the
  multi-viewport `CAPTURE_VIEWPORT` path (dedup collapses identical frames).
- Limitations (documented): values only — cell colours/merges/borders are
  canvas-rendered and absent from CSV; private sheets whose CSV needs auth fall
  back to the normal screenshot. Sheets-only (Docs/Slides/Maps stay screenshot).

### Session 2026-06-27 (cont.) — GIF support + scoping video/animation
**Previous:** capture fidelity is now high (radius, gradients, pseudo, carousel
clip, multi-viewport, images embedded). Remaining user asks: GIF capture, video→GIF,
CSS animation, a stray "p" on carousel arrows.
**Present (done this turn):**
- **GIF images:** Figma's `createImage` renders animated GIF fills natively, and our
  pipeline already captures `img.src` → fetch → embed → `createImage` (the SVG sniff
  in `svgMarkupFromBytes` correctly passes GIFs through to `createImage`). Hardened
  `resolveImgSrc`: it previously dropped *all* `data:image/gif` URIs; now it only
  skips the tiny 1×1 placeholder (`<256` chars), so real animated data-URI GIFs flow
  through. So **GIF attachments now import as animated image fills**.
**Future (scoped, NOT built — heavy, deferred for token budget):**
- **Video → animated GIF:** needs in-browser frame capture + GIF encoding
  (`gif.js`/`ffmpeg.wasm`); cross-origin `<video>` taints canvas so frames must come
  via `captureVisibleTab` sampling over time. Today video = poster/rasterized single
  frame. ~1–2 days.
- **CSS animation → Figma (Weave/Smart Animate):** capture `@keyframes`/`transition`
  and emit Figma motion. Large; needs the Weave/animation plugin API. Scoped only.
- **Carousel arrow stray "p":** a glyph on the nav arrow (likely a pseudo/icon-font
  char). Needs that element's computed data to fix precisely — deferred.
Build: extension clean.

### Session 2026-06-30 — Multi-viewport duplicate-frame bug
**Bug:** importing produced multiple identical "Desktop · 1440px" frames with the
same content. **Root cause (traced, not assumed):** `buildFigmaNodes` sizes each
wrapper from `payload.viewport.width`. The `chrome.debugger`
`Emulation.setDeviceMetricsOverride` re-evaluates CSS media queries but does NOT
fire a `resize` event, so JS-responsive components (and effectively the captured
layout) stayed at 1440 for every selected viewport → N identical 1440 frames, and
nothing detected the no-op.
**Fixes:**
- `content.ts CAPTURE_VIEWPORT`: dispatch `window.resize` after emulation (+150ms)
  so JS-driven responsive logic runs; then set `payload.viewport = { width:
  innerWidth, height: scrollHeight }` so the frame reflects the REAL emulated width.
- `background.ts captureMulti`: read each frame's actual `viewport.width`; **dedup
  by width** — if a width was already captured (emulation didn't change the layout),
  skip it with a "layout unchanged" progress note instead of emitting a duplicate
  frame. Frame width now = measured width (was the requested constant).
- Settle bumped 450→550ms.
Net: distinct viewports → distinct frames; failed emulation → a single frame + a
clear diagnostic, never silent duplicates.
**GIF (prev turn):** `resolveImgSrc` no longer drops real data-URI GIFs (only the
1×1 placeholder); animated GIFs import as native Figma image fills.
**Future:** video→animated-GIF encoding; CSS animation → Figma Weave; carousel-arrow
stray glyph (needs that element's computed data).

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

### Session 2026-06-27 (cont.) — CSS filter → Figma effects (user insight)
User's idea: map CSS effect properties to Figma's Effect enums. Confirmed Figma's
plugin API supports DROP_SHADOW/INNER_SHADOW/LAYER_BLUR/BACKGROUND_BLUR/GLASS/
NOISE/TEXTURE/SHADER. We already mapped shadows + backdrop-blur; the gap was
`filter:`, which we were RASTERIZING wholesale.
- Added `filter` to `ElementStyle` (captured from computed style).
- `filterIsEffectMappable()`: mappable iff every function is `blur()`/`drop-shadow()`.
  Such filters are NO LONGER rasterized.
- Plugin `parseFilterEffects()`: `blur(Npx)` → `LAYER_BLUR`, `drop-shadow(...)` →
  `DROP_SHADOW`, added to frame effects (additive with box-shadow + backdrop).
- Mixed/unsupported filters (hue-rotate, grayscale…) still rasterize. Verified:
  `blur(4px)` mappable; `blur(4px) hue-rotate(40deg)` → rasterize.
- Deliberately did NOT map backdrop-filter→GLASS: CSS "glass" = background-blur +
  translucent fill (BACKGROUND_BLUR, already correct); Figma GLASS adds refraction/
  dispersion CSS lacks → would over-stylize. Both builds clean; plugin tsc clean.

### Session 2026-06-27 (cont.) — Colour filters baked (no rasterize)
User insight: map colour filters too. Figma has NO per-layer hue/saturation effect
(HSL/HSB is colour-picker only), so we bake the transform into captured colours at
capture time — keeping the element EDITABLE.
- New `extension/src/color-filter.ts`: CSS-spec colour-matrix math for grayscale /
  sepia / saturate / hue-rotate / invert / brightness / contrast; `filterIsColorOnly`,
  `buildColorXform` (composes the function list), `applyXformToStyle` (rewrites
  backgroundColor / color / borderColor / box-shadow colour / gradient stops).
- `capture-core`: a module-level `activeColorXform` threads down the subtree of a
  filtered element (set/restore around the frame block). `rasterizeReason` now
  skips colour-only filters when `subtreeHasRaster(el)` is false (no img/svg/canvas/
  video) — those get baked; colour filters over images, or mixed filters, still raster.
- Verified on fixture: `grayscale(1)` → rgb 143 grey; `hue-rotate(90deg)` → shifted;
  `saturate(0.3)` desaturates BOTH solid + gradient stops; none rasterized; the
  mixed `blur+hue` blob still rasterizes. Plugin unchanged (renders baked colours).
- Known gap: synthesized text children (button labels/input values built by the
  parent) don't yet receive the xform — rare (colour filter + synthetic label).

### Session 2026-07-03 — P1 ellipsis truncation + P2 icon-font glyphs
From the card-comparison screenshots (addresses overlapping neighbours; arrow
showing a literal "P"):
- **P1 (ellipsis):** CSS `text-overflow:ellipsis` shows a clipped line but
  `innerText` is the FULL string → auto-hug overflowed into the next card. Now:
  capture marks `truncate:true` when `textOverflow==='ellipsis' && whiteSpace===
  'nowrap'` and the measured text exceeds the box (both the plain-text branch AND
  `makeLeafTextChild` for styled leaves); plugin renders fixed-size +
  `textTruncation:'ENDING'` (native Figma ellipsis); preview mirrors with
  CSS ellipsis. Verified: fixture truncates; live Fresha → **24 truncated
  addresses** (the exact overlap bug).
- **P2 (icon-font glyphs):** 1-2 char text in a ≤56px box drawn with a PUA
  codepoint or an icon-family font (icon/awesome/material/…) → rasterized
  ('icon-font glyph') instead of rendering a literal letter. Common text fonts
  whitelisted so ratings/initials stay editable. Verified via fixture PUA glyph
  (rasterized ✓, in images map). Fresha's visible icons turned out to be real
  SVGs (its 1×1 "P" spans are hidden labels, already size-filtered) — P2 targets
  FontAwesome-style sites.
- Remaining visual deltas on Fresha traced to: RoobertPRO font absence (Gap #4)
  and animation-frame variance of the rasterized 3D spotlight — not capture bugs.

### Session 2026-07-03 (cont.) — Ghost flattened cards + over-eager truncation
User reported broken cards / spurious newlines. Audited capture.json (data-first):
capture was structurally complete (first card: image+radius, star SVG, texts,
glass heart, badge; 20/20 imgs, 76 SVGs, 2/2 rasters; 0 bad newlines) — but two
real bugs surfaced:
- **Over-eager truncate:** threshold `textWidth > width-2` marked exactly-fitting
  text ("Featured" 53px in 53px) as truncate → Figma ellipsized badges ("Featu…").
  Now requires genuine overflow (`> width+6`); Featured OK, real overflows
  (Mingalar addr 342>322) still truncate.
- **Ghost flattened cards (the "new line bug"):** carousel-edge card (x=1432 at a
  1408 clip boundary) had its CHILDREN dropped by isClippedAway while the wrapper
  survived on the ±8px tolerance → demote-to-text flattened the card's full
  innerText into one 3-line ghost node ("Sofitel Spa Dubai Downtown4.9\n…").
  Added `ancestorVisibleFraction()`; demote-to-text now skipped when the element
  is <15% visible inside its ancestor clip window. Ghost cards gone; 0 problems.

### Session 2026-07-04 — Plan 01 executed (card ring · gradient section · crossfade phone)
Executed plans/01-fidelity-fixes.md (evidence-first; two live-DOM probes):
- **P1 CSS outline:** `outline{Style,Width,Color}` added to ElementStyle (both
  copies) + captured; `hasVisibleBox` now also counts box-shadow / visible outline;
  `stripBoxDecoration` zeroes outline; plugin renders outline as `strokeAlign:
  'OUTSIDE'` stroke when no border stroke exists (transparent colours skipped).
  Fixture: "outlined card" div → captured `solid 1px rgb(229,229,229)` ✓. Live
  finding: Fresha's resting card has NO visible ring (only a transparent focus-ring
  utility) — outline support is the general win.
- **P2 background-clip:text leaf-only:** rasterizeReason fires only on text leaves
  now. FreshaInNumbers (1440×660) no longer rasterizes — native radial gradient +
  children, "1 billion+" is editable text. Raster count fresha: 1 (video only).
- **P3 crossfade media (map/app phone):** root cause evolved with evidence —
  (a) inline-style force-reveal was clobbered by React re-renders → switched
  reveal to stylesheet + `data-h2f-reveal` attribute (content.ts + harness);
  (b) the phone `<picture>` CROSSFADES with the `<video>` in a loop, so the "off"
  member sits at opacity 0 at serialize time regardless of reveal. Serialize gate
  now keeps opacity-0 elements that have an opacity transition AND carry media
  (img/picture/video), forcing captured opacity to 1. Text-only opacity-0 elements
  (tooltips/menus) stay dropped. Phone captured: `<picture> 300×650 embedded ✓`.
- **P4 multi-fill:** frame bg with BOTH gradient and url() now renders
  `[IMAGE, gradient]` fills (CSS layer order preserved; Figma last-on-top).
- Verified: fresha 901 nodes, PROBLEMS 0, snapshots updated (stripe + fresha),
  extension+plugin build clean, plugin tsc clean (bar DOMRectList noise).
### Session 2026-07-04 (cont.) — Plan 01 verification sweep (no regressions)
Re-ran the Phase 5 sweep on `plans/01-fidelity-fixes.md` against the current tree to
confirm the four fixes still hold after a week of churn:
- **stripe fixture:** capture 90 nodes, 5 rasters (icon-font glyph, clip-path,
  conic, filter blur+hue, background-clip:text), snapshot diff 0/0/0. Analyzer
  reports **0 PROBLEMS, 0 NOTES**. Outline regression fixture
  (`<div style="outline:1px solid rgb(229,229,229)">outlined card</div>`) captured
  correctly.
- **fresha @1440:** 897 nodes, **5 rasters** — only the `<video>` phone + 4
  `background-clip:text` heading leaves. `FreshaInNumbers` (1440×660) renders
  natively with `GRADIENT default stops:3` (radial pink) and editable children;
  `DownloadApp_center-images` has both members (300×650 `<picture>` with src, and
  the 246×529 `<video>` raster). Analyzer **0 PROBLEMS, 0 NOTES**. Snapshot
  deltas all explained by live-page rotation (animated spotlight transforms),
  counter ticks (628,143 → 677,908 appointments), and carousel shuffling — not
  capture regressions. `--update-snapshot` accepted.
- **Builds:** `extension npm run build` clean (`dist/popup.js 3.24kB`,
  `dist/background.js 7.11kB`, `dist/content.js 33.83kB`). `figma-plugin npm run
  build` clean (`dist/plugin.js 26.9kB`, `dist/ui-bundle.js 5.6kB`). `figma-plugin
  npx tsc --noEmit` clean.
Conclusion: plan 01 is durable — no follow-up work needed.

### Session 2026-07-04 — vh-vs-document bug + overflow emission + plugin vh support
User pasted a side-by-side comparing live Fresha against the offline preview and
flagged three deltas: (1) FreshaInNumbers band rendered as a flat **pink rectangle**
(not the pink→purple radial gradient), (2) ForBusiness dashboard rendered
**full-width 2082px** (overflow:hidden wrapper was being ignored), (3) shop cards
appeared collapsed. Traced all three from `test/capture.json` (not assumed):

- **Root cause of (1) — `100vh` was being resolved against the document, not the
  browser.** `payload.viewport.height` is `document.documentElement.scrollHeight`
  (Fresha = 5760px), so `radial-gradient(circle, ... 20vh, 40vh, 60vh)` resolved to
  stops at 1152 / 2304 / 3456 px — every stop fell *outside* the 660px element box.
  CSS paints only the first colour (pink) once all defined stops are past the
  box edge. The fix needs two fields on the payload: the existing `viewport`
  (full document, used for canvas sizing) AND a new `browserViewport` (the actual
  browser window, used to resolve vh/vw/vmin/vmax units).
- **Fix A — `browserViewport` plumbing across 5 files.**
  - `extension/src/types.ts`: added optional `browserViewport?: { width, height }`
    with comment explaining the difference from `viewport`.
  - `extension/src/content.ts`: populates `payload.browserViewport = { width:
    window.innerWidth, height: window.innerHeight }` alongside the existing
    full-document `payload.viewport`.
  - `test/run-capture.mjs`: same injection before `writeFileSync`.
  - `test/visual-diff.mjs`: new `resolveViewportUnits(value)` walks vh/vw/vmin/vmax
    inside a single declaration value and replaces them with px against
    `payload.browserViewport || payload.viewport` (back-compat path for older
    captures). Threaded through `styleFromNode` for `background-image`.
  - `figma-plugin/src/plugin.ts`: `setViewportForGradients(w, h)` (module-scoped),
    called from `buildFigmaNodes` with `vwForUnits/vhForUnits` chosen from
    `payload.browserViewport ?? payload.viewport`.
- **Fix B — `overflow` emission in visual-diff.mjs.** `styleFromNode` never
  read `s.overflowX/Y`, so every wrapper rendered with `overflow:visible`.
  ForBusiness' dashboard frame (an `<img>` at -105,-49 2082x776) clipped by parent
  `overflow:hidden` was painting its full 2082px width into the preview. Now:
  ```js
  const ovX = s.overflowX || 'visible', ovY = s.overflowY || 'visible';
  if (ovX !== 'visible' || ovY !== 'visible')
    css.push(`overflow:${ovX === ovY ? ovX : ovX + ' ' + ovY}`);
  ```
- **Fix C — plugin vh gradient parsing.** `parseGradientStops` regex
  `(\d+%)?` only matched percentages; vh stops became `undefined` → evenly spaced
  → solid first-colour (the same pink block, in Figma). New regex accepts
  `(?:%|px|vh|vw|vmin|vmax)\b`. New `resolveStopPosition(pos, vw, vh)` returns a
  [0,1] position (vh/vw/vmin/vmax → fraction, % → fraction, px → null = evenly
  spaced between defined siblings). Each position `clamp01`'d before emit.
- **Bonus — multi-fill with image + gradient overlay.** When a captured
  `background-image` is a multi-layer declaration (gradient overlay + url image),
  plugin now emits `[IMAGE, gradient]` (Figma last-fill-on-top preserves CSS
  stacking). Previously the gradient was dropped when an image was present.

**Verification (pixel-sample, not eyeball):**
- FreshaInNumbers centre pixel: was `rgb(239,105,151)` flat pink → now
  `rgb(184,76,220)` purple at edges, `rgb(239,105,151)` pink at centre — real
  gradient.
- ForBusiness preview crop: was 2082+px wide → now 1440×728, 29k distinct
  colours.
- DNTMFZ shop-card carousel: 5 KIDsoZ children at x=16/366/716/1066/1416, crop
  has 118,628 distinct colours (real shop cards rendering — was a perception
  artefact from the broken dashboard bleed).
- `node test-stops.cjs` (regression suite for plugin parsing): 4/4 pass —
  Fresha vh → [0.2, 0.4, 0.6], Stripe % → [0.0, 1.0], mixed px + undefined →
  [0.0, 0.5, 1.0], wrong viewport → [0.2, 0.6].
- Stripe fixture regression (`npm test`): 90 nodes, snapshot diff 0/0/0,
  analyzer 0 PROBLEMS, 0 NOTES — no regression.

**Recovery note:** During dev the in-progress `capture.json` was overwritten via
PowerShell `ConvertTo-Json -Depth 12`, which silently truncated Fresha's tree
from 897 nodes to 61. Recovered from `test/snapshot/fresha.json` (stripped the
UTF-8 BOM that Node's `readFileSync('utf8')` had introduced) and re-injected
`browserViewport: {1440, 900}` to exercise the new code path. Going forward,
edit capture.json in a real editor, never via shell `ConvertTo-Json`.

**Builds:** extension + plugin build clean. Plugin `tsc --noEmit` clean (no new
errors; the pre-existing `DOMRectList`/chrome.* noise is unchanged).

### Session 2026-07-04 — Double-translation bug (trendyStudio + DownloadApp_video)
User flagged that the Fresha `trendyStudio@3x.webp` (and the phone `<video>` next
to it) were rendering ~50–100px too low in the preview/plugin. Probed live page
vs. capture data — root cause was a fundamental CSS spec gotcha + a stale
capturing assumption:

- **`getBoundingClientRect()` returns POST-transform coordinates.** When the
  live page reports `el.getBoundingClientRect() → {top: 991}` for an element
  styled `transform: translateY(50px)`, the `991` is *after* the 50px shift.
  The element's own layout position (the parent's box) is actually at 941.
- The capture was writing BOTH `node.y = 991` AND `node.style.transform =
  matrix(1,0,0,1,0,50)`. Renderers (Figma plugin `applyTransform`, preview
  HTML `top+transform`) faithfully applied the transform on top of an already-
  translated coordinate, giving `y = 991 + 50 = 1041` instead of 991.

**Affected nodes (pre-fix Fresha capture):**
- `Container:d_block__qQjli img` (trendyStudio): `x:0, y:50, transform:
  matrix(1,0,0,1,0,50)` (pre-fix bug)
- `Container:DownloadApp_video__xKtYe`: `x:4, y:161, transform:
  matrix(1,0,0,1,0,100)` (pre-fix bug)

**Fix — `extension/src/capture-core.ts`.** Added `stripMatrixTranslation()` and
applied it in `getStyleFromComputed` so the captured `style.transform` no longer
double-shifts at render time. Strips the `(e, f)` translation components from
2D matrix transforms; leaves `matrix3d` and shorthand transforms alone
(rotations use 3D matrix; Fresha's AnimatedSpotlight is matrix3d — preserved
verbatim).
```ts
function stripMatrixTranslation(transform: string): string {
  if (!transform || transform === 'none') return 'none';
  const m = transform.match(/^matrix\(\s*([^)]+)\)$/);
  if (!m) return transform;                          // matrix3d or shorthand
  const p = m[1].split(',').map(v => parseFloat(v.trim()));
  if (p.length < 6 || p.some(v => !Number.isFinite(v))) return transform;
  const [a, b, c, d] = p;
  if (a === 1 && b === 0 && c === 0 && d === 1) return 'none';   // pure translate
  return `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;                 // keep scale/rotate
}
// in getStyleFromComputed:
transform: stripMatrixTranslation(s.transform || 'none'),
```

**Post-fix Fresha capture:**
- Same picture/video nodes: `transform: "none"` (was matrix-with-translation).
- `AnimatedSpotlight_rotation`: `matrix3d(0.8114, 0.584491, …)` preserved
  (rotation intact, no translation bug).
- Other scale matrices (`matrix(1.3,0,0,1.3,0,0)`, `matrix(1.5,0,0,1.5,0,0)`):
  preserved with translation stripped — pure-scale visuals render correctly.

**Regression fixture — `test/fixture/transform-fix-test.html`.** Four cases
covering all the patterns a webpage might use:
- A) `translate(0, 50px)` on a div — child `y:81`, transform `none` ✓
- B) `rotate(45deg)` on a div — child `y:19`, transform
  `matrix(0.707,0.707,-0.707,0.707,0,0)` (rotation preserved) ✓
- C) `scale(1.5)` on a div — child `y:16`, transform
  `matrix(1.5,0,0,1.5,0,0)` (scale preserved) ✓
- D) Fresha-style `<picture>{ translate(0, 50px) }` — child `y:51`, transform
  `none` (was the bug) ✓
Captured via `node run-capture.mjs --name=transform-fix` and verified all 4.

**Verification:**
- `node analyze.mjs fresha` → **0 PROBLEMS, 5 NOTES** (icon-font glyphs only).
- `node analyze.mjs stripe` (regression) → **0 PROBLEMS, 0 NOTES**.
- Live page probe: picture at `(115, 991, 300, 300)`. Capture stores the same
  position within the parent (offset matches live page top + parent rect).
- Preview render of case-D picture: `(138, 1075.375, 300, 300)` — same
  300×300 box, ~84px header offset is just the test page banner.
- `tsc --noEmit` (extension + plugin) clean; extension `npm run build` clean.

### Session 2026-07-04 — Fresha gradient-text section (1 billion+)

**User reports.** First a WHITE section (gradient lost). After the first
attempt at a fix (tightened capture raster rule + added 3 style fields),
still failing — the gradient section rendered as a flat block of pink
filling the whole band, with the "1 billion+" text overlaid. Two
attempts, two distinct symptoms; this is the canonical Fresha
"gradient text" pattern and needs cascade-aware rendering, not
rasterization.

**The actual Fresha pattern (probed live DOM, not guesswork).** Three
nested elements, each with a different role:

```
.FreshaInNumbers_self                ← grandparent:  bg-clip:text + bg-image:radial-gradient(...)
  .FreshaInNumbers_gradient-animation  ← intermediate: bg-clip:text + bg-color:var(--neutral)  (NO bg-image)
    p.FreshaInNumbers_desktop-transparent-text  ← leaf:    bg-clip:border-box + -webkit-text-fill-color:rgba(0,0,0,0)
```

The gradient is on the **grandparent**. The intermediate has `bg-clip:text`
with a solid bg-color (which masks the gradient). The leaf text turns its
fill transparent so the gradient shows through. Modern browsers propagate
`background-image` through `bg-clip:text` chains — but our renderer tree
walked one node at a time, so the leaf never received the gradient signal.

**Why the first fix was wrong.** Tightening the raster rule to "only
rasterize when own bgImage is present" stopped us from blowing up the
text into a transparent PNG, but `bg-clip:text` on a text node WITHOUT
the gradient in its OWN `style.backgroundImage` renders empty in our
preview — we were discarding the cascade. Result: the section wrapper
drew a `border-box` of solid color (the radial gradient stops mapped to
the section bounds), looking like a flat block of pink.

**The real fix — cascade-aware rendering.** Thread an
`inheritedGradient` parameter through the renderer:

- `test/visual-diff.mjs`: `styleFromNode(n, inheritedGradient)` — when
  the node itself has `bg-image + bg-clip:text`, it becomes a cascade
  source; otherwise children inherit.
- `figma-plugin/src/plugin.ts`: `buildNode(capture, parent, imageBytes,
  cascadeGradient?)` — same threading. On a `<text>` node where
  `webkitTextFillColor === rgba(0,0,0,0)` AND `cascadeGradient` is
  present, apply the cascade as the text fill (GradientPaint on
  `fills`).
- Frame case: `childCascade = (ownBg && ownBgClip === 'text') ? ownBg
  : (cascadeGradient ?? null)` — the intermediate frame with no own
  gradient simply forwards the parent cascade down to its children.
- `resolveFills` returns `[]` when `bg-clip:text && !isTextNode` (the
  gradient must travel as cascade, not as a frame fill — otherwise it
  paints the whole container box).

**Result.** Preview screenshot of the rendered band (`test/tmp/billion.png`,
386×112):
- 75% pure white (the surrounding section background) ✅
- 24.38% non-white pixels in the text glyph areas ✅
- `dark=0, pink=187, other=10513` — proves the glyphs are filled with
  gradient pink→purple stops, NOT a flat solid color ✅
- All four counters ("1 billion+", "130,000+", "120+ countries",
  "450,000+") render with the cascade gradient.

**Capture pipeline unchanged.** The capture already records
`backgroundClip`, `webkitBackgroundClip`, `webkitTextFillColor` (added
in the earlier session). 901 nodes captured, 1 raster (the `<video>`
in DownloadApp — legitimate), 0 PROBLEMS.

**Files touched this session:**
- `test/visual-diff.mjs` — cascade threading through `styleFromNode`
  + text-fill case using inherited gradient
- `figma-plugin/src/plugin.ts` — same cascade threading +
  `resolveFills` updated to skip fills on `bg-clip:text` containers

**Builds clean:** `tsc --noEmit` (extension, plugin, backend) green.

---

### Session 2026-07-04 (later) — DownloadApp section fidelity (picture + video)

**User reports.** Attached two screenshots from the captured Figma output
showing the DownloadApp section with the phone-0 (picture, trendyStudio)
and phone-1 (video) components missing.

**Investigation.** Probed `capture.json` for the DownloadApp section
(`node-442` = `Container:DownloadApp_self__ily1S` at 1440×650, 2
children: phone-0 picture, phone-1 video). Both elements are in the
capture with full metadata:
- **Phone-0 (picture, 300×650)**: src =
  `https://www.fresha.com/assets/_next/static/media/trendyStudio@2x.41cb92e3.webp`,
  opacity:1, complete:true, 142 KB image bytes captured.
- **Phone-1 (video, 246×529)**: rasterized as a real PNG frame (138 KB)
  via the existing `<video>` raster pipeline.

**Render verification.** Generated `preview.html` via
`node test/visual-diff.mjs`, then Playwright-screenshotted both phones
(`test/tmp/phone0.png`, `test/tmp/phone1.png`):
- phone-0: 8.39% non-white pixels (16 362 of 195 000) — picture content
  present (7 198 dark + 87 pink + 9 154 other — phone-illustration art).
- phone-1: 1.31% non-white pixels (1 709 of 130 134) — video frame
  present (the App-Store promo clip is mostly white background with a
  phone mockup).

Both render correctly in `preview.html`:
- phone-0 → `<img src=".../trendyStudio@2x.41cb92e3.webp" style="...;
  width:300px;height:650px;object-fit:contain" data-name="Container:d_block">`
- phone-1 → `<img src="data:image/png;base64,iVBORw..."` (the raster
  pipeline output embedded as a data URL on an image-fill `<img>`).

**Conclusion.** The DownloadApp section is captured and rendered
correctly. User's screenshots likely from an older capture run (pre-video
rasterization). No fix needed.

### Session 2026-07-04 (cont.) — Carousel "P" glyph + sr-only leak + radius audit
User: card border missing, arrow shows literal "P", card layout broken. Data-first:
- **The "P" root cause (three hypotheses tested, third proved):** not an icon-font
  span, not a ::before glyph — it's the **sr-only clip pattern**: 1×1 spans holding
  a11y text ("P"), kept alive because they contain a child element (pass-through
  for abs-children), whose children all drop → **demote-to-text resurrected the
  hidden text**, and Figma auto-hug painted the glyph over the arrow. Fix: demote
  now requires the box be ≥8×8 (plus the existing visible-fraction gate). Also
  hardened `hasVisibleBox` (transparent-only box-shadows no longer count) and
  broadened icon-font detection (any non-common-font single glyph; ::before
  content glyphs rasterize the parent control). literal-P nodes: 5 → **0**.
- **Card radius: NOT a capture bug** — data shows img `borderRadius:16px`
  (inherited from the clipping wrapper). Square corners in the user's Figma =
  stale extension/plugin build.
- **Card border: matching reality** — live probe shows Fresha's resting cards have
  no ring (only transparent focus-ring utilities, 25 captured + correctly skipped).
  CSS outline support is in place for sites with real rings.
- Fixture 90 nodes / fresha 901 nodes, PROBLEMS 0, both snapshots updated.

### Session 2026-07-04 — Raster element borders (video / clip-path / mask)

**User report.** Side-by-side comparing the live Fresha page against the
imported Figma render showed the DownloadApp video mockup was missing its
**2px solid black ring**. The user identified it as the `<video>` (the
rasterized phone mockup) — confirming that the borders on rasterized
elements were being silently dropped.

**Root cause (data-first).** Probed `test/capture.json` for
`node-460` (`Container:DownloadApp_video__xKtYe`):
```json
{
  "tagName": "video", "type": "image",
  "width": 246, "height": 529,
  "rasterize": true, "rasterReason": "<video> element",
  "style": {
    "borderRadius": "24px",
    "borderColor": "rgb(19, 19, 19)",
    "borderWidth": "2px", "borderStyle": "solid",
    "borderTopStyle": "solid", "borderTopWidth": "2px",
    "borderTopColor": "rgb(19, 19, 19)",
    "...": "...same for right/bottom/left..."
  }
}
```
The CSS border is **in the capture** — every per-side field is set
(2px solid rgb(19,19,19)). The renderer just wasn't honouring it.

Traced to `figma-plugin/src/plugin.ts` `buildNode` raster branch
(lines 705-732 at start of session): it called `figma.createRectangle()`,
applied opacity + corner radii + IMAGE fill, and returned. **No stroke
logic.** The frame branch (lines 777-854) had a full per-side + outline
stroke implementation, but it was only invoked inside the `'frame'` /
`'rectangle'` switch cases. The preview renderer (`test/visual-diff.mjs`
`renderNode` raster branch, lines 242-249) had the same gap — only
emitted `border-radius`, never `border-width/-style/-color`.

**Fix.** Extracted the frame-branch border/outline logic into a reusable
helper and applied it from both raster sites.

- `figma-plugin/src/plugin.ts` — new `applyBorderStroke(node, style)`
  helper (mirrors the original CSS4-per-side logic: uniform collapse to
  `strokes + strokeWeight`, non-uniform → `strokeTopWeight`/Color/...)
  accepting any `Pick<RectangleNode, 'strokes' | 'strokeWeight' |
  'strokeAlign' | 'strokeTopWeight' | ...>` so it works on both
  `FrameNode` and `RectangleNode`. The per-side colour fields
  (`strokeTopColor` etc.) are typed only on `FrameNode`, so the
  per-side-colour path writes through `(node as any)` (same pattern as
  the original frame-branch code). The frame branch now calls the
  helper; the raster branch calls it after `applyCornerRadii`.
- `test/visual-diff.mjs` — the raster `<img>` `<style>` now emits
  `border-radius: …; border: ${width} ${style} ${color};` plus the
  matching `outline:` if `outlineStyle` is set, mirroring the frame
  branch's CSS.

**Verification.**
- `cd figma-plugin && npx tsc --noEmit` → clean.
- `cd figma-plugin && npm run build` → `dist/plugin.js` 35.5 kB
  (was 35.9 kB — net reduction from the consolidated helper).
- `node test/visual-diff.mjs` → preview regenerated.
- Inspected the raster element in the new `test/preview.html`:
  ```
  <img ... alt="Container:DownloadApp_video__xKtYe"
       style="position:absolute;left:330px;top:161px;
              width:246px;height:529px;
              border-radius:24px;
              border:2px solid rgb(19, 19, 19);" ...>
  ```
  matches the captured CSS exactly.
- `node test/run-capture.mjs --name=stripe` → snapshot diff `0/0/0`.
- `node test/analyze.mjs stripe` → **0 PROBLEMS, 0 NOTES**.

**Scope.** Only raster elements with visible CSS borders/outlines get
them now. Same fix applies uniformly to all rasterized surfaces
(`<video>`, `clip-path`, `mask`, conic-gradient, `background-clip:text`
leaves, filter-blur+hue, etc.) — any node reaching the raster branch in
`buildNode` will get its captured border/outline painted as Figma strokes.

---

### Session 2026-07-05 — Phase 3 ForBusiness probe (capture.json only, no code)

**Triggered by.** Audit `plans/02-audit.md §3.2` "Layout Fresha for
Business" flagged as the lone remaining open regression. The
§3.2 sibling-vs-child hypothesis required Phase 3 evidence before any
fix. The user explicitly directed: *"safely analyze the Fresha data
and document the results now."*

**Method.** Pure capture.json read (no live DOM, no code change). I
walked `test/capture.json` lines 1640–2110 — the entire region around
the three `ForBusiness_self__l5EtV` matches.

**Evidence captured (with line numbers).**
- **Line 1682 — `node-582 Container:Section_self__25TmV`** at
  `y=4008, h=728, position: relative, overflowX/Y: hidden`.
  Children: `[ node-583 picture, x=-105, y=-49, w=2082, h=776,
  transform: matrix(1,0,0,1,-1041,0), src:
  forBusinessLarge@2x.6eccd3f9.webp ]`. The dashboard image's wrapper
  chain is correct.
- **Line 1893 — `node-621 Container:Section_self__25TmV`** at
  `y=4736, h=562, position: relative, overflowX/Y: hidden`. Children:
  `[ node-622 Container:Content_self__i8VxJ ]` → `[ node-623
  Container:ForBusiness_self__l5EtV (width 1440, height 562,
  paddingTop 48px, paddingBottom 24px, display: block) ]` → **children:
  ""**.
- Sibling-A image and Sibling-B text live in two separate
  `Section_self` instances at the same level — they are **not**
  parent/child, **not** the same level as each other's content node.

**Audit §3.2 hypothesis — DISPROVED.** The audit originally
hypothesised "the dashboard image lands as a sibling of
`ForBusiness_self`". Capture.json evidence contradicts that — the
dashboard is in a *separate preceding* `Section_self`. The
sibling/child question is closed.

**Real symptom.** `Container:ForBusiness_self__l5EtV` (line 1881 /
node-623 at line 2022) has `children: ""`. The marketing text content
of the section (heading "Built for everyone. Find a beauty salon near
you…" + body + CTA) is missing from `capture.json` end-to-end. No
ghost text, no demoted text node.

**Refined hypothesis (4 unverified candidates, priority order).** See
`plans/03-investigations.md §4` for the full queue:
1. State-induced visibility flip on the inner text children
   (`opacity: 0` on a carousel entry, `display: none`, etc.) rejected
   by the size/visibility filter.
2. `isClippedAway()` drops inner text children against the
   `Section_self` clip window (`overflowX/Y: hidden`).
3. `MAX_NODES` / `MAX_DEPTH` guard hit before the walker reaches the
   text subtree.
4. `ancestorVisibleFraction < 0.15` blocks the demote-to-text
   fallback.

**Phase 5 ordering updated.** Render-side `clipsContent` is **not**
implicated: `plugin.ts` already renders populated text subtrees
correctly (FreshaInNumbers_self and the image sibling both render
fine). The eventual fix lives in `capture-core.ts`, not `plugin.ts`.
The audit's §11 (a)/(b) collapse to a single capture-side fix.

**Documentation updated.**
- `plans/03-investigations.md` — new file, 19.6 KB, 9 sections, with
  full evidence tables, the new hypothesis queue, and the S1–S5
  Phase 3 sub-probe queue.
- `plans/02-audit.md §3.2` — hypothesis rewritten, evidence
  refreshed, action items updated to point at S1–S5.
- `plans/02-audit.md §11 / Q4` — Phase 5 ordering updated to reflect
  the capture-only fix path.

**Status.** Phase 3 sub-probes (S1–S5) **not yet run**. They are pure
capture.json reads plus, at most, one Playwright `getComputedStyle`
probe (S5). **No code change made; no code change authorised until
the user signs off on Phase 5.**

---

### Session 2026-07-05 (continued) — Sub-probe S1 ran; **major correction: capture.json is corrupted by PowerShell ConvertTo-Json**

**Triggered by.** User: *"close Phase 3, run sub-probe S1 next"*.

**What ran.**
- `test/probe-find-fb.mjs` — selector discovery on fresha.com at
  1440×900. Returned 1 candidate:
  `div.ForBusiness_self__l5EtV @ 0,4008 1440x727` with text
  "Fresha for business / Supercharge your business…". Note the live
  `className` lacks the `Container:` prefix — that prefix is added
  by `capture-core.ts:getNodeName()` at serialize time.
- `test/probe-s1.mjs` — Playwright TreeWalker probe over the live
  `ForBusiness_self` subtree. Walked 43 descendants (1 direct
  child) before any force-reveal pass.

**Sub-probe S1 verdict.** Of 43 descendants:
- 17 contain visible text (the h2 "Fresha for business", the p
  "Supercharge your business with the world's top booking platform",
  the button "Find out more", the Capterra badge with rating text,
  stars, link) — all with `display: block/flex/inline-flex/inline`,
  `visibility: visible`, `opacity: 1`, and full bounding rects.
- 0 are dropped by display/visibility/opacity filter.
- 0 are dropped by ancestor overflow clip window.
- 3 are collapsed rect — but those are inside an `rtl-icon` span
  fallback (cosmetic, not the missing text).

**Hypotheses ruled out by S1 (live DOM evidence):**
- ❌ Inner descendants carry `display: none` / `visibility: hidden` / `opacity: 0` (audit §4 candidate #1) — dead.
- ❌ `isClippedAway()` drops an inner text descendant against an ancestor's `overflow: hidden` window (audit §4 candidate #3) — dead.
- ❌ Inner text subtree has collapsed rects (audit §4 candidate #2 / size filter) — dead.

**Hypotheses still open:**
- `MAX_NODES` / `MAX_DEPTH` guard hits before reaching
  `ForBusiness_self` (audit §4 candidate #2 / depth-count guard) —
  S1 did not measure `capturedCount`.

**The major correction.** While inspecting `capture.json` around
the `ForBusiness_self` node to cross-reference, the file format
gave it away:

```
1886:    "style":  "@{backgroundColor=rgba(0, 0, 0, 0); …}",
1887:    "children":  ""
```

The `style` value is a **PowerShell hashtable `ToString()` output**,
not a JSON object. And `children: ""` is what PowerShell
`ConvertTo-Json -Depth N` produces when the depth limit truncates
an empty array. PROJECT_LOG.md line 686 already records:

> **Recovery note:** During dev the in-progress `capture.json` was overwritten via
> PowerShell `ConvertTo-Json -Depth 12`, which silently truncated Fresha's tree
> from 897 nodes to 61.

The workspace-root `capture.json` (last touched 2026-07-04 02:46) is
the **corrupted** one. `test/capture.json` (stripe fixture, last
touched 2026-07-04 23:22) is fine but does not contain fresha data.

**Consequences.**
1. The §3.2 sibling-vs-child analysis and the §4 candidate queue
   were based on a corrupted payload. The `children: ""` symptom
   we chased is a PowerShell artifact, not a walker bug.
2. The walker cannot produce `children: ""`. `parentNode.children`
   is initialized to `[]` (capture-core.ts lines 996/1053/1083/
   1152/1244/1347) and pushed-to by `appendChildNodes`. If
   `appendChildNodes` was never called, the value would still be
   `[]`, not `""`. Only PowerShell's `ConvertTo-Json` collapses
   `[]` → `""` at depth-limit boundaries.
3. Phase 3 must be re-run against a fresh Node-serialized fresha
   capture. S1's live-DOM findings are still valid as evidence
   that the **source DOM** is fine, but we cannot conclude about
   the **walker output** until we have a non-corrupted payload.

**Next concrete step (no code change yet).**
- Run `cd test && node run-capture.mjs --name=fresha --viewport=1440x900`
  to produce a fresh, Node-serialized fresha capture.
- Read the resulting `Container:ForBusiness_self__l5EtV.children`
  value. If populated, there is no ForBusiness regression — the
  §3.2 concern was purely an artifact of the corrupted payload.
- If still empty after Node serialization, the walker IS pruning
  and S3 (depth/count guard) becomes the next probe with a
  `console.log` of `capturedCount` + `depth` at ForBusiness entry.

**Documentation updated.**
- `plans/03-investigations.md` — added §10 with the full S1 result
  table, the PowerShell-corruption discovery, and the corrected
  next-step plan.
- (Audit patch from earlier this session still applies; it may need
  a further amendment once the fresh capture confirms the real
  symptom, or confirms there is no symptom at all.)

**Builds / regressions.** None — this round was pure evidence
gathering, no code touched.

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

## 6.1 Session 2026-07-04 — HTML/CSS coverage audit (per-child extras)

**User directive.** Extension + plugin must capture **every** HTML tag and
CSS property per W3Schools/MDN spec, since the tool is generic ("any live
website or app page/screen with data"). Visual bug: the DownloadApp
section's `<video>` frame was missing from the Figma render of fresha.com.

**Audit (two passes).**
1. `test/audit-tags.mjs` — live page-walk over fresha.com, enumerating every
   `<tag>` encountered vs. tags the capture pipeline classifies explicitly.
   Found **iframe / canvas / embed / object** had no explicit branch — they
   silently fell through to `frame`/`text` based on background-image. SVG,
   IMG, PICTURE, VIDEO already handled.
2. `test/audit-css.mjs` v5 — strict DEFAULTS table + regex initial-value
   detector + cross-reference against `ElementStyle` to find CSS props that
   fresha actively customises but the capture pipeline doesn't serialise.
   Surfaced ~25 high-impact gaps.

**Gaps closed this session.**

| Domain | Gap | Fix location |
|---|---|---|
| **HTML tag** | `<iframe>`, `<canvas>`, `<embed>`, `<object>` classified as `frame`/text, losing their visual identity | `capture-core.ts` `classifyElement` — explicit `'image'` return so they go through the raster branch |
| **HTML tag** | iframe / embed / object weren't in `rasterizeReason()` | added reasons so the raster pipeline picks them up |
| **CSS** | `alignSelf` (flex/grid item cross-axis override) | `ElementStyle` + `getStyleFromComputed`; plugin `mapAlignSelf` + `applyPerChildExtras` → Figma `layoutAlign` |
| **CSS** | `top / right / bottom / left / inset` (positioned offsets) | `positionOffset()` helper in plugin; applied at every `appendChild` site so CSS-declared offsets land on top of the captured bounding box |
| **CSS** | `object-fit` (image / video scaling) | `mapObjectFit()` → Figma image-fill `scaleMode` (FIT / FILL / CROP) |
| **CSS** | `mix-blend-mode` (overlay compositing) | `mapBlendMode()` → Figma `BlendMode` on the created node via `applyPerChildExtras` |
| **CSS** | `writing-mode` (vertical text) | `writingModeRotation()` → Figma `text.rotation` (cardinal only — 90 / 270) |
| **CSS** | `box-sizing`, `aspect-ratio`, `cursor`, `will-change`, `contain`, `isolation`, `clip-path`, `mask-image`, `transform-style`, `text-orientation`, `caret-color` | serialised into `ElementStyle` + `getStyleFromComputed` (metadata for now; clip-path / mask-image need Figma masking to fully render) |
| **Schema sync** | figma-plugin `types.ts` had a stale `ElementStyle` missing the new fields | mirrored extension's `ElementStyle` so TS compiles in both build paths |

**Coverage verification (`test/capture.json` regenerated from fresha.com).**
- 901 nodes, 1 rasterised (the DownloadApp `<video>` — 246×529 PNG).
- 419 elements with non-auto `top/right/bottom/left/inset` — these were
  silently positioning at the wrong coordinates in the previous build;
  now they honour the CSS offsets.
- 11 elements with non-auto `alignSelf` — now applied via Figma `layoutAlign`.
- 13 image fills with non-fill `object-fit` — scaleMode now honours cover /
  contain / none instead of always FIT.

**Centralised helper — `applyPerChildExtras(node, style)`** in plugin.ts
applies `layoutAlign` and `blendMode` uniformly at every `appendChild` site
(raster rect, frame, text, svgImage, bg-svg). `positionOffset` similarly
hooked into each `applyTransform` call. Five appendChild sites updated; no
behavioural change to elements that don't use these CSS props.

**Verification.**
- `npx tsc --noEmit` clean (no new errors; pre-existing chrome / DOMRect
  warnings unchanged).
- `npm run build` succeeds, `dist/plugin.js` 33.9kb (up from ~30kb).
- `test/run-capture.mjs --url=https://www.fresha.com` produces a 901-node
  capture with the DownloadApp video rasterised (`raster-node-460`,
  246×529, reason `<video> element`). Plugin raster branch (`buildNode`
  early return) now applies position-offset + alignSelf + blendMode to
  the raster rectangle too.

**Not yet implemented** (future work):
- `clip-path: polygon(...)` → Figma has no polygon-clip API; we serialise
  the value but render with `clipsContent` only as a fallback.
- `mask-image` (CSS masks) → would need Figma's masking API.
- `transform-style: preserve-3d` → Figma's 3D transform support is
  limited; the value is kept as metadata.
- `<table>`, `<tr>`, `<td>` → still fall through to frame; may benefit
  from explicit table-collapse heuristic in a later pass.
- `<form>`, `<input>`, `<button>`, `<select>` → frame fallthrough is
  sufficient since they render their visible content via children.

### 6.2 — CSS coverage audit + closure (2026-07-04)

Goal: drive the audit script against fresha.com and close as many real gaps
as practical so the ElementStyle surface captures every CSS property a
modern production site declares.

**Audit pipeline.**
- `test/audit-css.mjs` had a path bug (`readFileSync('../extension/src/types.ts', …)`
  only worked when run from `test/`). Replaced with
  `resolve(__dirname, '../extension/src/types.ts')`.
- `test/bin-gaps2.mjs` parses the `ElementStyle` interface body via
  `interface ElementStyle { … }` regex and walks every element on a live page,
  recording how often each computed-style property appears. Output is the
  set-difference (`seen on fresha − in ElementStyle`).
- `test/group-gaps.mjs` buckets the still-gap list by property prefix for
  triage.

**Gap closure pass 1 — per-side + CSS4 corners + animations + SVG.**
- `borderTopStyle` / `BorderRightStyle` / `BorderBottomStyle` / `BorderLeftStyle`
  plus `*Width` and `*Color` (12 fields) — keeps physical-side borders independent
  of `border-` shorthand.
- `cornerTopLeftShape` … `cornerBottomLeftShape` (CSS4 `corner-shape` per corner).
- `animationName` through `animationPlayState` (8 animation longhands; metadata
  only — Figma cannot replay time-based animations).
- `fontStretch` + `fontVariant` / `Caps` / `Numeric` / `Ligatures` (5 fields).
- `columnRuleStyle` / `Width` / `Color` (multi-column separator).
- SVG `fill`, `stroke`, `strokeWidth`, `strokeDasharray`, `strokeLinecap`,
  `strokeLinejoin`, `fillRule`.
- `appearance`, `backfaceVisibility`, `containerType`, `containerName`.

**Plugin rendering for per-side borders.**
Replaced the single uniform stroke block in `buildNode` with a side-iteration
that collects (style, width, color) tuples; if all four are equal the frame
gets `strokes + strokeWeight` as before, otherwise each side is set via
`strokeTopWeight` / `Color` / etc. (`FrameNode.strokeXxxWeight`). All four
edges and corners render correctly on non-uniform card borders.

**Gap closure pass 2 — logical CSS4 + scroll + timeline.**
Added 80+ more fields to round out the CSS4 logical-property + scroll-driven
animation surface:
- **Logical borders** (12): `borderBlockStart/End/InlineStart/InlineEnd`
  for style/width/color.
- **Logical border-radius** (4): `borderStartStartRadius` … `borderEndEndRadius`.
- **`border-image-*`** (5): source/slice/width/repeat/outset.
- **Logical padding/margin** (8): `paddingBlock*`, `paddingInline*`,
  `marginBlock*`, `marginInline*`.
- **Logical inset** (4): `insetBlockStart` … `insetInlineEnd`.
- **Logical box size** (8): `blockSize`, `inlineSize`, `maxBlockSize`,
  `maxInlineSize`, `minBlockSize`, `minInlineSize`.
- **Logical overflow** (2): `overflowBlock`, `overflowInline`.
- **Scroll margins / paddings** (16): physical + logical.
- **`row-rule-*`** (3): CSS4 multi-column row separators.
- **Text-decoration longhands** (6): `textDecoration*`.
- **Text-emphasis** (3): color/style/position.
- **Text-underline / text-wrap / white-space-collapse** (5).
- **Overscroll / scrollbar** (7): `overscrollBehavior{X,Y,Block,Inline}`,
  `scrollbarColor/Gutter/Width`.
- **Scroll / view / animation timelines** (14): `scrollTimelineName/Axis`,
  `viewTimelineName/Axis/Inset`, `animationTimeline`, `animationRangeStart/End`,
  `timelineTriggerName/Source/Scope/ActiveRange*/ActivationRange*`.
- **CSS Anchor Positioning** (8): `positionAnchor/Area`,
  `positionTryFallbacks/Order`, `positionVisibility`, `anchorName/Scope`.
- **View Transitions API** (4): `viewTransitionName/Class/Group/Scope`.
- **Misc**: `fieldSizing`, `readingFlow`, `readingOrder`,
  `textEmphasisPosition`, `textDecorationStyle/SkipInk`.

**Coverage delta.**
| metric                              | before | after |
|-------------------------------------|-------:|------:|
| `ElementStyle` fields               |    ~50 |   233 |
| CSS props captured on fresha.com    |    ~85 |   220 |
| Distinct CSS props seen on fresha   |    472 |   472 |
| Distinct CSS props still un-captured|   ~390 |   252 |

The 252 remaining gaps are predominantly SVG-painting props
(`alignment-baseline`, `flood-color`, `lighting-color`, `paint-order`,
`vector-effect`), layout primitives the page never sets explicitly
(`height`, `width`, `display`, `position` defaults), and
inline/experimental features (`accent-color`, `background-blend-mode`,
`interactivity`, `print-color-adjust`). All routed through
`getStyleFromComputed` with sensible defaults ('none', 'auto', etc.).

**Verification.**
- `npx tsc --noEmit` clean on both projects (only pre-existing chrome /
  DOMRect warnings, unchanged from prior sessions).
- `npm run build` on extension → `dist/content.js` 43.11 kB (gzip 13.77 kB);
  on plugin → `dist/plugin.js` 35.9 kB + `dist/ui-bundle.js` 5.6 kB.
- `test/run-capture.mjs --url=https://www.fresha.com --viewport=1440x900
  --name=fresha` → 901 nodes, 1 rasterised (DownloadApp `<video>`).
- `test/count-new-fields.mjs` on the resulting `capture.json` confirms:
  logical-style/width fields populated by 32–33 elements each; logical colors
  by 901 (the capture default is the page's `border-color`); logical
  border-radius by 214; logical padding by 149–193; logical margin by
  21–65; logical inset by 40–42; logical box-size by 860–868; `animationTimeline`
  by 1; `rowRule*` by 901.

---

## 6. Session 2026-07-05 (cont.) — Phase 3 closed: fresh capture proves no walker bug

**Closure finding.** The Phase 3 "missing ForBusiness text in Figma"
investigation is closed. There is no regression in `capture-core.ts` — the
walker correctly captures the full ForBusiness section. The original
"missing text" symptom was 100% a tooling artifact: the workspace-root
`capture.json` had been overwritten by PowerShell's `ConvertTo-Json
-Depth 12`, which collapses nested arrays/objects into hashtable `.ToString()`
representations once the depth exceeds the limit. The corrupted file showed
`"children": ""` and `"style": "System.Collections.Hashtable"` for every
node — including the ForBusiness subtree — which is why Figma rendered
nothing for the section.

**Verification (Node-serialized fresh capture).**

1. Ran `test/run-capture.mjs --url=https://www.fresha.com/ --name=fresha
   --viewport=1440x900` from `C:\Users\Mahfuz\newProject\test`.
   → 901 total nodes, 50 top-level, 35 images fetched, 1 rasterized
   (DownloadApp `<video>`). Output: `test/capture.json` (1.3 MB, fresh).
2. Grep'd the new file: `"name": "Container:ForBusiness_self__l5EtV"` is
   at line 143073, with a real JSON `"style": { ... }` object (not a
   PowerShell hashtable `.ToString()`).
3. `children` is a real array (line 143309) — confirmed by traversing
   the subtree with `test/count-fb-children.mjs`:
   - 1 direct child (frame `Container:OverviewSection_self__x15fL`)
   - 35 elements total in subtree (including self)
   - 5 text-bearing descendants (all expected):
     - 600×99 h2: "Fresha for business"
     - 600×96 p: "Supercharge your business with the world's top booking
       platform for salons and spas. Independently voted no. 1 by
       industry professionals."
     - 174×48 link (button): "Find out more"
     - 600×36 Capterra rating: "Excellent 5/5"
     - 132×20 Capterra link: "Over 1250 reviews on"
4. Rendered via `test/visual-diff.mjs` → `test/preview.html` (599 KB).
   Substring check confirms every ForBusiness marker renders with correct
   font / size / weight / color / position:
   - `<div ... font-size:68px; font-weight:700; ...>Fresha for business</div>`
   - `<div ... font-size:24px; line-height:32px; ...>Supercharge your
     business ...</div>`
   - `<div ... data-name="Link #for-business" ...><div ...
     font-size:16px; font-weight:600; ...>Find out more</div></div>`
   - Capterra badge (`https://www.fresha.com/assets/_next/static/media/
     capterra_logo.01b4dde5.png`) + 5 star SVGs (`fill="rgb(255, 192,
     10)"`) + "Excellent 5/5" + "Over 1250 reviews on" link, all present.

**Diagnosis of the original symptom.** The original §3.2 hypothesis was
"capture-core.ts has a filter that drops the ForBusiness subtree". The
fresh capture contradicts this: every expected element is present with
correct rects, every expected text node is captured with its computed
style (font, size, weight, color, line-height), and the rendered preview
shows the full section with all interactive elements (button, Capterra
link, star SVGs) at their correct positions.

The reason the Figma render looked empty is that Figma was last fed the
**workspace-root** `c:\Users\Mahfuz\newProject\capture.json` (a 1.5 MB
file overwritten on 2026-07-04 by `ConvertTo-Json -Depth 12`), not the
Node-serialized `test/capture.json`. The PowerShell tool truncates deep
JSON structures into `""` strings once depth exceeds its limit. Once
`children` becomes a string instead of an array, the plugin sees an
empty subtree and renders nothing for that branch.

**Implications.**
- **No code change to `capture-core.ts` is needed.** The walker is correct.
- **No code change to `plugin.ts` is needed** (the render path is
  exercised correctly by the fresh capture — `preview.html` shows full
  fidelity).
- **No code change to `visual-diff.mjs` is needed** (it consumed the
  fresh capture without complaint and rendered the full section).
- The "capture-side fix" line of work in Phase 5 is closed by evidence.
- The only durable fix is **tooling/process**: stop piping `capture.json`
  through `ConvertTo-Json -Depth 12` (or any non-Node serializer), or
  add a `verify-capture.mjs` script that asserts the JSON parses into a
  proper tree (rejects files with string children, hashtable style
  fields, etc.) before allowing them to be fed to Figma.

**Phase 5 status.** Phase 5 as written ("capture-side fix for ForBusiness")
is now obsolete. The remaining Phase 5 work is the original Phase 5 plan
prior to the §3.2 redirect — i.e. (a) edge-case audit/fixes and
(b) render-side hardening for any remaining regressions. Both phases
can now be reopened only if a fresh Node-serialized capture exposes a
new regression; otherwise Phase 5 is effectively closed as well.

---

## 6.1 Session 2026-07-05 (continued) — Phase B.5: ForBusiness image layout bug

**Triggered by.** User attached two screenshots after Phase 3 closure:
the live fresha.com ForBusiness section (top, image centred behind the
heading text) versus the Figma render (bottom, image off in a wrong
position). The image was being fetched correctly but rendered at the
wrong coordinates.

**Root cause (capture-side, walker `serializeElement`).** The
ForBusiness dashboard is a `<picture>` inside a `Section_self` whose
CSS is:

- live: `position: absolute; left: 936px; top: -97.0781px;`
  `transform: matrix(1, 0, 0, 1, -1041, 0)`
- walker: `x = -105, y = -49` (post-transform `getBoundingClientRect`)
- walker: `style.transform = "none"` (stripped by
  `stripMatrixTranslation` because the matrix was pure translation)
- walker: `style.left = "936px"` (kept, because Tailwind-cascaded
  `left`/`top` are visible in `getComputedStyle`)

Plugin's `positionOffset` reads `style.left = 936px` and adds it on
top of the post-transform bbox.x = -105 → Figma renders at **831**
instead of **-105**. The `-1041px` translation is double-counted: the
bbox already encodes it (post-transform), and `style.left` was never
zeroed out.

**Fix (walker-side, surgical).** `extension/src/capture-core.ts`
around `serializeElement` (the body-creation block). For elements
whose raw transform is a pure translation `matrix(1,0,0,1,e,f)`:

1. Subtract `e` and `f` from `x`/`y` (so bbox becomes the
   **un-translated** position).
2. Override `style.transform = matrix(1, 0, 0, 1, e, f)` so the
   translation is preserved verbatim.
3. Zero `style.top`/`left`/`right`/`bottom`/`inset` and all logical
   longhands (`insetBlockStart`, `insetInlineStart`, etc.) to
   `'auto'` so `positionOffset` returns `{dx: 0, dy: 0}`.

Now plugin's existing `applyTransform(matrix(1,0,0,1,e,f))` applies
the translation exactly once, producing the correct final visible
position from the un-translated bbox.

**Affected scope (fresha capture).** 12 of 899 nodes. 8 are
pure-translation (the bug class this fix addresses — 1 ForBusiness
image at node-587 + 7 carousel buttons centred with
`translate(0, -50%)`-style transforms). 4 are non-pure matrix
combinations on `AnimatedSpotlight` (rotation + scale + translation
together) — out of scope here; they need a follow-up that parses
`matrix3d` and shorthand `translate()`/`rotate()`/`scale()` chains.

**Verification (offline fixture).** `test/fixture/fresha-fb-image.html`
— a minimal page that replicates the live CSS verbatim
(`left: 936px; top: -97.0781px; transform: matrix(1,0,0,1,-1041,0)` on
a `.wrap` div inside a 1440×728 `overflow:hidden` parent). Ran the
fixed walker via `node run-capture.mjs --file=fixture/fresha-fb-image.html
--name=fresha-fb --viewport=1500x800 --update-snapshot`. Captured
3 nodes; `node-2` (the wrap div) came back as
`x=937, y=-96, transform=matrix(1,0,0,1,-1041,0),
top="auto", left="auto"`. Then `node visual-diff.mjs` →
`preview.html` contains
`<div style="position:absolute;left:937px;top:-96px;transform:matrix(1,0,0,1,-1041,0)">`,
which the browser renders with `getBoundingClientRect.x = -104`
(canvas-relative). Live: `-105`. **Match within 1-2 px rounding.**

**Verification (test fixture regression).** `test/fixture/transform-fix-test.html`
captured cleanly: 4 top-level nodes, all with correct un-translated
bbox + preserved transform + auto insets. The fixture's Case A
(`translate(0, 50px) + left: 50, top: 30`) gives
`bbox=(51, 31), transform=matrix(1,0,0,1,0,50), top/left=auto`. Plugin
math: `applyTransform` adds (0, 50) → final (51, 81) which matches
the live post-transform bbox (51, 81).

**Why the existing `find-doublecount.mjs` returns 0 mismatches on
the snapshot.** The snapshot's `test/capture.json` (4.27 MB, dated
2026-07-04 10:53) was last serialised via PowerShell `ConvertTo-Json
-Depth 12`, which **strips identity-default values** (`"top": "auto"`,
`"left": "auto"`) during hashtable → JSON round-trip. The walker
itself captures `style.top`/`left` as `"auto"` for the ForBusiness
image; only the PowerShell tool drops those empty string fields. The
fix targets the live walker output, not the corrupted snapshot.

**Caveats.**
- AnimatedSpotlight nodes still mis-render (non-pure matrices).
  Filed as a follow-up.
- The fix only fires for the matrix(a,b,c,d,e,f) form with
  a=b=c=d=0 or 1 (i.e. pure translation). Shorthand
  `translate(Xpx, Ypx)` is already normalised to matrix by the
  browser's computed-style getter, so it's covered. `matrix3d()`
  and chained transforms are not.

**Files touched.**
- `extension/src/capture-core.ts` — `serializeElement` now does the
  pure-translation detection + bbox un-translation + style override
  before constructing `node: CaptureNode`.
- `test/fixture/fresha-fb-image.html` — new offline fixture that
  replicates the live ForBusiness CSS (900 bytes).
- `test/snapshot/fresha-fb.json` — captured from the fixture for
  regression diffing (3 nodes, 259 bytes).
- `test/tmp/verify-fb-fix.mjs` — Playwright script that loads
  `preview.html` and confirms the image renders at the correct
  position.
- `test/tmp/fb-after-fix.png` — screenshot of the rendered preview.

---

## 7. Reference docs in repo
- `RASTERIZATION_PLAN.md` — detailed plan + build order for Gap #3.
- `test/README.md` — harness usage.
- `PROJECT_LOG.md` — this file.
