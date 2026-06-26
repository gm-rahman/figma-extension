# Plan — Selective Rasterization (Gap #3)

## Goal
Guarantee visual fidelity on **any** website by detecting CSS that Figma cannot
reproduce as native nodes, and capturing just those elements as **real
browser-rendered images** (an image fill on a Figma node). Everything else stays
editable vector/text/frame as today. This is html.to.design's "secret weapon" —
and once we have it, no CSS feature can defeat the import.

Core principle: **rasterize the minimum**. Only elements with Figma-impossible
CSS become images; their subtree is folded into that one image (not recursed),
so we never screenshot things we can already represent natively.

---

## What triggers rasterization

A new `needsRasterization(el, s)` in `capture-core.ts` returns true when the
computed style uses any feature Figma can't draw natively:

| CSS feature | Why Figma can't |
|---|---|
| `clip-path` (polygon/path/circle insets beyond simple radius) | No vector clip from CSS |
| `mask` / `-webkit-mask` | No CSS mask equivalent |
| `filter:` (blur/contrast/hue-rotate/drop-shadow chains on the element itself) | Only layer blur + drop shadow |
| `mix-blend-mode` / `background-blend-mode` (non-`normal`, unsupported modes) | Partial blend support |
| `background-image` with `conic-gradient`, `repeating-*-gradient`, or `image-set` we don't decompose | Only linear/radial basic |
| `background-clip: text` (gradient/clipped text) | Not representable |
| `transform` containing `matrix3d(` / `perspective(` (3D) | 2D affine only |
| `<canvas>`, `<video>` elements | Dynamic surfaces |

Guards:
- **Size guard**: if the element is larger than the viewport in either axis, skip
  (can't screenshot in one shot in v1) and fall back to native capture.
- **Opt-out / opt-in**: a `data-h2f-raster="off|on"` attribute overrides detection.

---

## Data model changes

`extension/src/types.ts` & `figma-plugin/src/types.ts`:
- `CaptureNode.rasterize?: boolean` — node should render as an image.
- `CaptureNode.rasterId?: string` — key into the raster image map.
- `CapturePayload.rasterImages?` is NOT added; reuse the existing image pipeline:
  raster data-URLs go into the same `images` map keyed by `rasterId`, and the
  plugin already turns `images` → `imageMap` (`number[]`) → `figma.createImage`.

`capture-core.ts`:
- Module-level `rasterTargets: { id, x, y, width, height }[]` (document coords),
  reset in `buildPayload`, exported via a getter `getRasterTargets()`.
- In `serializeElement`, BEFORE the normal type switch: if `needsRasterization`,
  set `node.rasterize = true`, `node.rasterId = id`, push the doc-rect to
  `rasterTargets`, set `node.children = []`, and `return node` (no recursion).

---

## Capture pipeline (the screenshot)

Real browser pixels via `chrome.tabs.captureVisibleTab` (pixel-perfect — it's the
actual paint, unlike html2canvas which re-implements CSS and lacks the very
features we're rasterizing).

`content.ts`:
- After `buildPayload`, read `getRasterTargets()`. If non-empty, send them to the
  background worker along with `devicePixelRatio` and current scroll position.
- Expose a tiny message handler `SCROLL_TO {x,y}` so the worker can bring each
  target into view, plus `GET_VIEWPORT` for size.

`background.ts` — new `rasterizeTargets(tabId, targets, dpr)`:
For each target (throttled to respect Chrome's ~2 captures/sec limit):
1. message content: scroll so the target's top-left is at a known viewport offset
   (e.g. 20px,20px margin); wait one rAF + ~50ms for paint.
2. `chrome.tabs.captureVisibleTab(windowId, { format: 'png' })` → dataURL.
3. crop in the worker with `OffscreenCanvas` + `createImageBitmap`:
   - source rect = `(targetViewportX*dpr, targetViewportY*dpr, w*dpr, h*dpr)`
   - draw into a `w×h` (CSS px) canvas → `convertToBlob` → dataURL.
4. store `images[rasterId] = croppedDataUrl`.
Restore original scroll at the end.

Failure handling: any capture error → leave the node as a flat frame fill
(no crash), and log to the capture summary.

---

## Plugin rendering

`figma-plugin/src/plugin.ts`:
- In `buildNode`, add an early branch: if `capture.rasterize && imageBytes[capture.rasterId]`,
  create a `RectangleNode` (or frame) sized `w×h`, fill `IMAGE` `scaleMode:'FILL'`,
  apply corner radius + `applyTransform` + z-order exactly like other nodes, then
  `return` (no children). Name it `"raster: <original name>"` so it's identifiable.
- If the raster bytes are missing, fall back to the normal switch.

---

## Offline test harness (verify WITHOUT Chrome)

This is the big advantage of our harness — Playwright can rasterize too, so we
test the whole path offline:

`test/run-capture.mjs`:
- After capturing the payload, read the raster targets from the page
  (`window.__getRasterTargets()` — expose it from the bundled core).
- For each, use Playwright's element screenshot:
  `page.screenshot({ clip: { x, y, width, height } })` (true Chromium paint) →
  base64 → put into `payload.images[rasterId]`.
- This mirrors the extension pipeline exactly, so the snapshot/preview reflect
  real rasters.

`test/analyze.mjs`:
- New ASSET COVERAGE line: `Rasterized: N` and list each (name + reason), so we
  can see what fell back to image vs stayed native.

`test/visual-diff.mjs`:
- Render `rasterize` nodes as `<img src=dataURL>` at their box — already supported
  by the existing image path; just key off `rasterId`.

---

## Build order (each step verified by the harness before moving on)

1. **Detection only** — add `needsRasterization` + `rasterTargets`; analyzer
   prints `Rasterized: N` with reasons. No images yet. Verify it flags the right
   elements on a fixture with `clip-path` + `conic-gradient`.
2. **Harness rasterization** — Playwright screenshots the targets into `images`;
   preview shows them. Verify pixel fidelity in `preview.html`.
3. **Plugin rendering** — image-fill branch in `buildNode`. (Verified via the
   Figma import.)
4. **Extension pipeline** — `captureVisibleTab` + crop in `background.ts`,
   scroll-into-view handshake in `content.ts`. The harness already proved the
   data contract, so this is "wire the real screenshot source."

---

## Fixture additions (to prove it)
Add to `test/fixture/stripe.html`:
- a `clip-path: polygon(...)` badge
- a `conic-gradient` ring / pie
- a `filter: blur()+hue-rotate()` decorative blob
- `background-clip: text` gradient heading

Expected after build: analyzer shows `Rasterized: 4`, preview shows all four
rendered as crisp images, native elements untouched.

---

## Explicitly NOT in this phase
- Tiling for elements bigger than the viewport (size-guarded out for now).
- Custom font embedding (Gap #4 — separate plan).
- Animated content (we capture a single frame, by design).

## Risk notes
- `captureVisibleTab` includes anything painted ON TOP of the target. Mitigation:
  we rasterize whole subtrees (so the element's own children are intended to be in
  the shot) and target mostly decorative/background elements; siblings rarely
  overlap them. If contamination shows up, v2 can clone the node into an isolated
  offscreen container before shooting.
- Chrome throttles `captureVisibleTab`; we throttle to ≤2/sec and cap the number
  of rasterized elements (e.g. 30) to keep captures fast.
