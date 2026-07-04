# Plan 02 — Project audit (current state of HTML→F fidelity)
> **Last-updated 2026-07-05:** §3.2 RESOLVED — fresh Node-serialized
> `test/capture.json` proves there is no ForBusiness walker bug; the
> original "children: ''" symptom was a tooling artifact (PowerShell
> `ConvertTo-Json -Depth 12` over the workspace-root `capture.json`).
> §11 (Phase 5) marked ARCHIVED. See `plans/03-investigations.md §11`
> and PROJECT_LOG Session 2026-07-05 (cont.).
> Pure documentation. **No code changes proposed in this file.** Read alongside
> `plans/01-fidelity-fixes.md` (the prior plan that shipped card-ring + map-phone +
> FreshaInNumbers fixes, leaving three regressions in this session's report).
>
> **General-purpose scope (Session 2026-07-05 — user clarification).** This
> extension/plugin is **not** a fresha-specific tool. fresha.com is **only a
> torture-test fixture** used to drive fidelity. The product must capture
> *any* live website (any `http(s)://` origin via `<all_urls>`) **and any
> local webpage** (`file:///*`) and import it into Figma with maximum fidelity.
> Confirmed by `extension/manifest.json`:
> - `"description": "Capture any webpage and import it into Figma"`
> - `"host_permissions": ["<all_urls>", "file:///*"]`
> - `content_scripts.matches: ["<all_urls>", "file:///*"]`
>
> **Practical implications for this audit:**
> - Every status, gap, and fix in this document is evaluated against
>   *generic* pages, not just fresha. fresha's purpose is to expose
>   edge cases (gradients, carousels, conic-gradient, big images) — not
>   to be a supported target.
> - Snapshot fixtures (`test/snapshot/fresha.json`, `stripe.json`, `aether.json`)
>   are *torture tests*, not deliverables. The stripe fixture is the truth
>   anchor because it is small and stable.
> - The "user-reported" regressions are visible on fresha but are generic
>   failures that would surface on any page with the same CSS patterns.
>   Fixes are expected to generalise.
>
> Audit scope: capture layer (`extension/src/capture-core.ts` + the
> DOM→JSON contract in `extension/src/types.ts`), Figma render layer
> (`figma-plugin/src/plugin.ts` + `ui.ts`), offline preview renderer
> (`test/visual-diff.mjs`), shared colour-filter (`extension/src/color-filter.ts`),
> capture pipeline (`test/run-capture.mjs` + harness `extension/src/content.ts`),
> and the live side-by-side fixtures (`test/snapshot/fresha.json`,
> `test/snapshot/stripe.json`, `test/snapshot/aether.json`).
>
> Verification harness: `cd test && node run-capture.mjs --name=fresha --viewport=1440x900`
> `node analyze.mjs && node visual-diff.mjs`. Snapshot regression: `--update-snapshot`.

---

## 1. Module map & dependencies

```
┌─────────────────────────────────── Browser runtime ───────────────────────────────────┐
│                                                                                         │
│  ┌─────────────┐  CAPTURE_FULL_PAGE   ┌──────────────────┐    postMessage     ┌──────┐  │
│  │ popup.html  │ ───────────────────▶ │ content.ts       │ ─────────────────▶ │ bg   │  │  │
│  │ popup.ts    │ ◀──── progress ───── │ + capture-core.ts│    payload + PNGs  │ .ts  │  │  │
│  └─────────────┘                      │ + color-filter.ts│                    └──────┘  │  │
│                                       └──────────────────┘                              │
│                                                │                                          │
│                                                ▼                                          │
│                                       ┌──────────────────┐                              │
│                                       │ test/run-cap.mjs │  (Playwright — same core)      │
│                                       └──────────────────┘                              │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                            │                                            │
                            ▼                                            ▼
                 ┌──────────────────────┐                  ┌──────────────────────────┐
                 │ test/snapshot/*.json │ ◀── regression ──│ test/analyze.mjs          │
                 │ capture.json (live)  │   baseline       │ test/visual-diff.mjs      │
                 └──────────────────────┘                  │   (preview.html, mirror   │
                            ▲                              │    of plugin.ts renderer) │
                            │ postMessage                  └──────────────────────────┘
                            │ {payload, images}                            │
┌───────────────────────────┴────────────────────────────────────────────────────────────┐
│                   Figma plugin sandbox                                                 │
│   ┌──────────────────┐   CREATE_NODES    ┌─────────────────────┐                       │
│   │ ui.html / ui.ts  │ ────────────────▶ │ plugin.ts           │ ◀── types.ts          │
│   │ (decodes images) │                   │  buildNode /        │                       │
│   └──────────────────┘                   │  applyTransform,    │                       │
│                                          │  resolveFills,      │                       │
│                                          │  applyBorderStroke, │                       │
│                                          │  preloadFonts       │                       │
│                                          └─────────────────────┘                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ Express backend  │  (stores uploaded snapshots,
                                   │ backend/src/*    │   serves UI HTML)
                                   └──────────────────┘
```

| File | Lines | Role | Critical invariants |
|---|---|---|---|
| `extension/src/capture-core.ts` | 1560 | Pure DOM → `CaptureNode` JSON | Pure (no UI); MAX_NODES, MAX_RASTER, MAX_DEPTH, MIN_SIZE, OFFSCREEN_TOL constants tuned per fixture. |
| `extension/src/types.ts` | 340 | Shared `CaptureNode`/`CapturePayload`/`ElementStyle` contract | Captured fields must match what `plugin.ts` and `visual-diff.mjs` consume. |
| `extension/src/content.ts` | – | Hosts `capture-core.ts` + injects `browserViewport` + forces reveal | `force-reveal` rule (modifies `transition: 0s none` etc). |
| `extension/src/color-filter.ts` | – | Colour-only CSS `filter` baking (hue-rotate, grayscale, …) | Only invoked when subtree has no `<img/picture/video/svg/canvas>`. |
| `extension/src/background.ts` | – | MV3 service worker — receives capture payload, fetches cross-origin images as binary | Cross-origin image whitelist check (privacy). |
| `figma-plugin/src/plugin.ts` | 1138 | `CaptureNode[]` → `figma.*` nodes | Pinned Figma plugin-typings; one `buildNode` switch on `capture.type ∈ {frame, text, image, rectangle}`. |
| `figma-plugin/src/ui.ts` | – | Iframe UI: fetches capture from backend, base64-decodes images, posts `CREATE_NODES` | Decodes bytes for `imageBytes` map. |
| `test/run-capture.mjs` | – | Playwright harness using the same `capture-core.ts` source | Mirrors `content.ts`'s prep + viewport plumbing. |
| `test/visual-diff.mjs` | 331 | Offline preview renderer — mirrors `plugin.ts` rendering 1:1 | Single source of truth for "would the plugin render X correctly?". |
| `test/analyze.mjs` | – | Reports `PROBLEMS` + `NOTES` against a `capture.json` | Used in regression suite. |
| `backend/src/index.ts` + `types.ts` | – | Express server hosting the plugin UI | Stateless. |

**Hard invariants that must not regress:**

1. `getStyleFromComputed` (capture-core.ts:70) MUST return the exact field set declared by `ElementStyle` (types.ts:1) — the plugin reads from those names.
2. `plugin.ts:buildNode(capture, parent, imageBytes, cascadeGradient?)` recurses with `cascadeGradient` threaded for Fresha-style gradient-text patterns.
3. `plugin.ts:applyBorderStroke(node, style)` and `plugin.ts:applyCornerRadii(frame, style)` MUST be called from EVERY `case` that produces a node with a box (`frame`, `rectangle`, raster branch).
4. Fresha capture (live @1440×900) currently produces **897 nodes, 5 rasters** (the `<video>` poster + 4 `background-clip:text` heading leaves). Other raster reasons (icon-font glyph, clip-path polygon, conic-gradient, mixed filter, etc.) appear in other fixtures or in older fresha captures — verify the live cap value before relying on it.
5. Stripe regression snapshot (`test/snapshot/stripe.json`) is the project's truth anchor: 90 nodes, 0 raster, 0/0/0 diff, 0 PROBLEMS, 0 NOTES.

---

## 2. Status table — what works, what doesn't, what's missing

> ✅ Works fully · ⚠️ Works with caveats · 🟡 Partial · ❌ Missing · 🔥 Known regression this session

### 2.1 HTML element support

| Tag | Capture | Figma render | Status | Notes |
|---|---|---|---|---|
| `div`, `section`, `header`, `footer`, `main`, `nav`, `aside`, `article` | frame | `figma.createFrame()` (or `RectangleNode` for `display:contents`-hoisted empty box) | ✅ | Most common path. |
| `p`, `h1`-`h6`, `span`, `a`, `strong`, `em`, `b`, `i`, `u`, `label`, `time`, `cite`, `q`, `s`, `small`, `sub`, `sup`, `mark`, `abbr`, `code`, `br`, `wbr` | text | `figma.createText()` | ✅ | Tag-aware `getNodeName` labels; `INLINE_TAGS` set used by `isInlineTextContainer`. |
| `ul`, `ol`, `li` | frame | Frame (list bullets currently omitted) | ⚠️ | `list-style-type` captured → not rendered. |
| `table`, `tr`, `td`, `th` | frame | Nested frames | ⚠️ | Native `display: table-row/cell` not mapped to Figma layout; renders as positioned absolute (works visually but editable structure lost). |
| `button` | frame (has-box) | Frame + centred `Label` child | ✅ | Hover/active states dropped. |
| `input[type=text/email/search/url/tel/password]` | frame | Frame + synthesised value/placeholder Text + chevron | ✅ | `getControlText` (capture-core.ts:426). |
| `input[type=checkbox/radio]` | frame (synthesised) | Frame with accent fill | ✅ | `styleNativeToggle`. |
| `input[type=range/color/file/hidden/submit/reset/button/image/date]` | – | – | ❌ | Non-text input types dropped. |
| `select`, `[role=combobox/listbox]` | frame | Frame + value text + chevron | ✅ | Custom dropdowns collapse to selected option. |
| `textarea` | frame | Frame + value/placeholder text | ✅ | No auto-grow. |
| `[role=option]` | skipped (inner) | – | ✅ | Part of `isCustomSelect` collapse. |
| `img` | image (with `src`) | `figma.createImage()` inside a Frame, scale via `objectFit` | ✅ | Also handles `srcset` + lazy `data-src` via `resolveImgSrc`. |
| `picture` | image (inner `<img>`'s src) | `figma.createImage()` | ✅ | |
| `video` | image (`poster` frame) **or** raster screenshot of the frame | Rectangle with `IMAGE` fill | ⚠️🔆 | Native playback impossible in Figma. **Phase 3 regression: poster is sometimes missing → grey box.** |
| `audio` | – | – | ❌ | No capture branch. |
| `iframe` | image + raster screenshot of the frame | Frame with `IMAGE` fill (the screenshot) | ⚠️ | `classifyElement` returns `'image'` and `serializeElement:1447` defers to rasterizeReason. |
| `embed`, `object` | image + raster | Frame with `IMAGE` fill | ⚠️ | |
| `canvas` | image + raster | Frame with `IMAGE` fill | ✅ | |
| `svg` | image (`svgMarkup` cloned) | `figma.createNodeFromSvg()` native vectors | ✅ | `currentColor` resolved to computed `color`; viewBox auto-applied. |
| MathML (`math`, `mfrac`, `mi`, …) | – | – | ❌ | Falls through default capture as frame, may render as invisible. |
| Web Components (custom elements) | frame | Frame | ⚠️ | Shadow DOM not recursed. |
| `dialog`, `details`, `summary` | frame | Frame | ⚠️ | Native open/close state lost. |
| `form` | frame | Frame | ✅ | |
| Pseudoclass-only styled ancestors | frame (cleaned) | – | ✅ | |

### 2.2 CSS property support

> Format: ✅ fully mapped · ⚠️ captured but partial render · 🟡 captured but not rendered · ❌ not captured

#### Box model & layout

| Property | Capture | Render | Status |
|---|---|---|---|
| `display`, `position`, `top/right/bottom/left/inset` | ✅ | Flex layoutMode + ABSOLUTE positioning; per-side inset parsed by `positionOffset` | ✅ |
| `flex-direction/wrap`, `justify-content`, `align-items`, `align-content`, `align-self` | ✅ | `applyAutoLayout` + `mapAlignSelf` | ✅ |
| `flex-grow/shrink/basis`, `order`, `gap`, `row-gap`, `column-gap` | ✅ | gap captured; not applied to Figma auto-layout (`itemSpacing`) | 🟡 |
| `grid-template-columns/rows`, `grid-column/row`, `place-items` | ✅ | Captured → ignored (no Figma grid) | 🟡 |
| `width/height` | ✅ | Applied via `frame.resize(w, h)` | ✅ |
| `min/max-width/height`, `min/max-block/inline-size` | ✅ | Not enforced — Figma uses captured size | 🟡 |
| `margin`, logical margin (`margin-block/inline-*`) | ✅ | Captured → ignored (Figma uses `itemSpacing` for siblings) | 🟡 |
| `padding`, logical padding | ✅ | Applied to auto-layout via `padding*` if `layoutMode != NONE`; for non-auto-layout children: positions are absolute so padding is metadata | ⚠️ |
| `box-sizing` (content | border) | ✅ | Not enforced (capture stores `width/height` already post-box-sizing) | ✅ |
| `aspect-ratio` | ✅ | Ignored | 🟡 |
| `object-fit`, `object-position` | ✅ | `mapObjectFit` → `FILL/FIT/CROP/TILE`; position not applied | ⚠️ |
| `transform` (2D matrix/scale/rotate/skew/translate) | ✅ | `applyTransform` (with `transform-origin`) | ✅ |
| `transform-origin` | ✅ | Used by `applyTransform` | ✅ |
| `3D transform` (`matrix3d`, `perspective`) | ✅ | Triggers raster (`rasterizeReason: '3D transform'`) | ⚠️ |
| `translate`/`scale`/`rotate` individual properties | ❌ | – | ❌ |
| `rotate`/`scale` per-axis, `individual-transform` | ❌ | – | ❌ |

#### Backgrounds

| Property | Capture | Render | Status |
|---|---|---|---|
| `background-color` | ✅ | `resolveFills` → SOLID paint | ✅ |
| `background-image: url(...)` | ✅ | `figma.createImage` + `object-fit` mapping | ✅ |
| `background-image: gradient(url), …` multi-fill | ✅ | Plugin emits `[IMAGE, gradientPaint]` (last = top in Figma = first in CSS) | ✅ |
| `background-image: linear-gradient(...)` | ✅ | `linearGradientFill` (with vh/vw stop resolution) | ✅ |
| `background-image: radial-gradient(...)` | ✅ | `radialGradientFill` — centred ellipse, not pixel-exact | ⚠️ |
| `background-image: conic-gradient` | ✅ | Rasterized (`rasterizeReason: 'conic-gradient'`) | ⚠️ |
| `background-image: repeating-*` | ✅ | Rasterized (`rasterizeReason: 'repeating-gradient'`) | 🟡 |
| Fresha cascade: `bg-clip:text` + parent gradient + child transparent fill | ✅ | `cascadeGradient` threading in `buildNode` | ✅ |
| `background-position`, `background-size`, `background-repeat`, `background-attachment`, `background-origin` | 🟡 | Captured (`background-position`, `background-repeat` per audit-css.mjs list) but not stored on ElementStyle; `background-size` reported as 2000/2000 occurrences but not persisted | ❌ |
| `background-clip` (`border-box` default, `padding-box`, `content-box`, `text`) | ✅ | Returned `[]` on `text` to prevent wrapper painting; cascade carries the gradient | ✅ |
| `background-blend-mode` (non-normal) | ✅ | Triggers rasterize | ⚠️ |

#### Borders

| Property | Capture | Render | Status |
|---|---|---|---|
| `border-radius` (uniform) | ✅ | `applyCornerRadii` (`cornerRadius` shorthand) | ✅ |
| `border-top/right/bottom/left-radius` | ✅ | `applyCornerRadii` (per-corner) | ✅ |
| `border-radius` with elliptical corners (`10px / 4px`) | ✅ | Horizontal radius used (vertical discarded) | ⚠️ |
| Logical `border-start-start-radius` etc. | ✅ | Stored, not resolved for non-horizontal `writing-mode` | 🟡 |
| `border-image-source/slice/width/repeat/outset` | ✅ | Stored as metadata; **not rendered** | 🟡 |
| `corner-shape` (`round/squircle/bevel/...`, CSS4) | ✅ | Stored as metadata; only `round` rendered | 🟡 |
| `border-color/width/style` (uniform) | ✅ | `applyBorderStroke` → uniform `strokes`/`strokeWeight`/`strokeAlign:'INSIDE'` | ✅ |
| `border-{side}-color/width/style` | ✅ | Per-side `strokeTopWeight/Color` etc. via `applyBorderStroke` | ✅ |
| Logical borders (`border-block-*`/`border-inline-*`) | ✅ | Captured; for non-default `writing-mode` not yet resolved to physical sides | 🟡 |
| `outline-style/width/color/offset` | ✅ | `applyBorderStroke` paints via `OUTSIDE` stroke when no border | ✅ |
| `outline` shorthand & `outline-offset` | ❌ | `outline-offset` captured as string, not rendered | 🟡 |

#### Text

| Property | Capture | Render | Status |
|---|---|---|---|
| `font-family`, `font-size`, `font-weight`, `font-style` | ✅ | Resolved via `preloadFonts` + Figma font stack fallback | ✅ |
| `font-stretch`, `font-variant-*`, `font-feature-settings` | ✅ | Stored as metadata; no Figma mapping | 🟡 |
| `line-height` (number | px) | ✅ | `text.lineHeight` | ✅ |
| `letter-spacing` | ✅ | `text.letterSpacing` | ✅ |
| `word-spacing` | ❌ | – | ❌ |
| `text-align` (left/right/center/justify) | ✅ | `text.textAlignHorizontal` | ✅ |
| `text-align: justify-all/last-baseline` | ❌ | – | ❌ |
| `text-decoration-line/style/color/thickness` | ✅ | Figma's `textDecoration` (single underline/overline/line-through/strike); colour/thickness partly applied | ⚠️ |
| `text-decoration-skip-ink` | ✅ | Stored | 🟡 |
| `text-underline-offset/position` | ✅ | `text.underlineOffset` partly applied | ⚠️ |
| `text-transform: uppercase/lowercase/capitalize` | ❌ | Captured text is the COMPUTED uppercase — but only for full-text transforms; mixed transforms drop CSS context | 🟡 |
| `text-indent` | ❌ | – | ❌ |
| `text-shadow` | ❌ | No capture field | ❌ |
| `text-overflow: ellipsis` (`+ nowrap`) | ✅ | `truncate: true` → `textTruncation:'ENDING'` | ✅ |
| `white-space`, `white-space-collapse`, `text-wrap-mode`, `text-wrap-style` | ✅ | Multi-line text bakes hard `\n` via `getWrappedText`; no `wrap: balance` variant | ⚠️ |
| `overflow-wrap`, `word-break`, `line-break`, `hyphens` | ❌ | – | ❌ |
| `writing-mode`, `text-orientation` | ✅ | `writingModeRotation` → 0/90/-90/270 (cardinal only) | ⚠️ |
| `tab-size`, `hanging-punctuation`, `text-justify` | ❌ | – | ❌ |
| `caret-color`, `autocapitalize`, `spellcheck` (form fields) | 🟡 | Captured, no render | 🟡 |

#### Effects

| Property | Capture | Render | Status |
|---|---|---|---|
| `opacity` | ✅ | `frame.opacity = text.opacity = rect.opacity` | ✅ |
| `box-shadow` (uniform + multi-layer, `inset`) | ✅ | `parseShadows` → `INNER_SHADOW`/`DROP_SHADOW` | ✅ |
| `filter: blur(N)` | ✅ | LAYER_BLUR | ✅ |
| `filter: drop-shadow(...)` | ✅ | DROP_SHADOW effect | ✅ |
| `filter: hue-rotate/grayscale/sepia/saturate/brightness/contrast/invert` (over image-free subtree) | ✅ | **BAKED** into captured RGB via `extension/src/color-filter.ts` | ✅ |
| `filter: <complex>` (mixed functions or over images) | ✅ | Rasterize | ⚠️ |
| `backdrop-filter: blur(...)` | ✅ | BACKGROUND_BLUR (Figma's term) | ✅ |
| `backdrop-filter: saturate/contrast/...` (non-blur) | ✅ | Rasterize | ⚠️ |
| `mix-blend-mode` | ✅ | `mapBlendMode` → Figma blendMode | ✅ |
| `background-blend-mode` (non-normal any layer) | ✅ | Rasterize | ⚠️ |
| `clip-path: polygon/circle/ellipse/path/inset` | ✅ | Rasterize (Figma has no native clip mask per node) | ⚠️ |
| `clip-path: url(...)` (SVG reference) | ✅ | Rasterize | ⚠️ |
| `clip` (legacy) | ❌ | Not captured (deprecated alias of clip-path) | ❌ |
| `mask-image: url(...)/linear-gradient(...)` | ✅ | Rasterize | ⚠️ |
| `isolation: isolate` (stacking context) | ✅ | Captured → not strictly enforced | 🟡 |
| `will-change`, `contain`, `content-visibility` | ✅ | Captured → no render effect (informational) | 🟡 |

#### Sizing & overflow

| Property | Capture | Render | Status |
|---|---|---|---|
| `overflow: hidden/scroll/auto/clip/visible` | ✅ | `clipsContent` on frame | ✅ |
| `overflow-block/inline` (logical) | ✅ | Captured → for non-default writing-mode not resolved | 🟡 |
| `scroll-margin-*` (per-side + logical) | ✅ | Stored as metadata | 🟡 |
| `scroll-padding-*` | ✅ | Metadata only | 🟡 |
| `overscroll-behavior-*` | ✅ | Metadata only | 🟡 |
| `scrollbar-color/width/gutter` | ✅ | Metadata only | 🟡 |
| `scroll-timeline-*`, `view-timeline-*`, `timeline-trigger-*`, `animation-timeline`, `animation-range-*` (CSS4 scroll-driven animations) | ✅ | Metadata only — animation playback out of Figma scope | 🟡 |
| `view-transition-*` (cross-document) | ✅ | Metadata only | 🟡 |

#### Modern / CSS4 anchors & motion

| Property | Capture | Render | Status |
|---|---|---|---|
| `anchor-name`, `anchor-scope`, `position-anchor/area/try-fallbacks/order/visibility` | ✅ | Metadata only — anchor positioning not modelled | 🟡 |
| `field-sizing`, `reading-flow`, `reading-order` | ✅ | Metadata only | 🟡 |
| `transition` properties | ✅ | Metadata only — transitions cannot be authored in Figma | 🟡 |
| `animation` shorthand + longhands (incl. `composite`, `range`) | ✅ | Metadata only — playback out of scope | 🟡 |
| `@property`, `@starting-style`, `@scope`, `@layer` registered custom props | ❌ | Metadata only conceptually — not in `ElementStyle` | 🟡 |

#### SVG attributes (when captured)

| Attribute | Render | Status |
|---|---|---|
| `fill`, `fill-rule`, `stroke`, `stroke-width`, `stroke-dasharray`, `stroke-linecap`, `stroke-linejoin` | ✅ | `Figma's createNodeFromSvg` handles natively | ✅ |
| `marker-start/mid/end`, `paint-order` | 🟡 | Dropped by Figma's parser | 🟡 |

### 2.3 Selector & feature support

| Selector / behaviour | Capture | Render | Status |
|---|---|---|---|
| Class, id, attribute, pseudo-class (`:hover`/`:focus`/`:active`) | Captured at the static state | Only the static captured style rendered | ⚠️ |
| `::before`, `::after` | ✅ (via `capturePseudo`) | Synthesised child node (`pseudo:'before'|'after'`) | ✅ |
| `::placeholder` | ✅ (via `getControlText`) | Used only to colour the placeholder Text node | ✅ |
| `::marker` | ❌ | List bullets are not rendered | ❌ |
| `::selection` | ❌ | – | ❌ |
| `::backdrop` (fullscreen `<dialog>`) | ❌ | – | ❌ |
| `@media` queries | Resolved to whichever viewport at capture time | Static render at that viewport | ⚠️ |
| `@font-face` web fonts | ✅ fontFamily string preserved | Falls back through `resolveFont` → Inter | ⚠️ |
| `@keyframes` animations | ✅ names + longhands stored | Metadata only — no playback in Figma | 🟡 |
| `@supports`, `@container` | ✅ via `container-type/container-name` field | Container queries only influence `contain` semantically | 🟡 |
| `var(--css-var)` | ⚠️ resolved at capture via `getComputedStyle` | Only the computed value ships in `ElementStyle` | ⚠️ |

---

## 3. Known regressions reported this session

> **Status summary (2026-07-04 verification sweep):** the Plan-01 verification
> entry in PROJECT_LOG.md confirms fresha @1440 capture currently shows
> **897 nodes, 5 rasters (the `<video>` phone + 4 `background-clip:text` heading
> leaves)**, `FreshaInNumbers` renders natively with editable children, and
> `DownloadApp_center-images` has both members captured (a 300×650 `<picture>`
> + the 246×529 `<video>` raster). **Stripe regression suite: 0 PROBLEMS, 0 NOTES.**
>
> This means **sections 3.1 and 3.3 are RESOLVED in the live capture.json**.
> Section 3.2 (ForBusiness) requires Phase 3 probes to determine whether the
> remaining issue is capture-side (subtree pruned) or render-side (subtree
> captured but layout broken). The audit captures what we currently know and
> flags what is still uncertain.

### 3.1 ✅ FreshaInNumbers gradient text (no longer flat-pink)

- **Evidence (live data):** `capture.json` line 1669-1676 — `Container:FreshaInNumbers_self__gvk1_` width 1440, height 660, style `backgroundImage=radial-gradient(circle, rgb(239, 105, 151) 20vh, rgb(232, 92, 186) 40vh, rgb(184, 76, 220) 60vh)`, `children: "   "` (three spaces — populated, meaning the cascade is threaded, not rasterized).
- **Status:** **Fixed** in Session 2026-07-04 (Fresha gradient-text section entry in PROJECT_LOG.md). Cascade-gradient threading is present (`buildNode(capture, parent, imageBytes, cascadeGradient?)`), `resolveFills` returns `[]` when `bg-clip:text && !isTextNode`, vh stops are resolved against `browserViewport`. Pixel-sample evidence (`test/tmp/billion.png`, 386×112): 75% white background + 24.38% non-white text glyphs in gradient pink→purple.
- **Watch / regression guard:** if any future change reintroduces a `rasterizeReason: 'background-clip: text'` on a **non-leaf** element, this returns. Add a unit test in `test/analyze.mjs` that fails if any frame node (non-text) has `rasterizeReason: 'background-clip: text'`.

### 3.2 🔥 "Layout Fresha for Business" — RESOLVED (no walker bug; tooling artifact)

- **Closure status:** **RESOLVED 2026-07-05 — there is no regression in
  `capture-core.ts`.** Full evidence in `plans/03-investigations.md §11`.
  PROJECT_LOG Session 2026-07-05 (cont.) has the verification steps.
- **What was originally believed (and how it was disproved):**
  - **Line 1682 — image section `node-582 Container:Section_self__25TmV`**
    at `y=4008, h=728`. Children: `[ node-583 picture
    (forBusinessLarge@2x.6eccd3f9.webp, w=2082 h=776, x=-105 y=-49,
    transform: matrix(1,0,0,1,-1041,0)) ]`. Wrapper has
    `overflowX/Y: hidden, position: relative`. Image renders
    correctly.
  - **Line 1893 — text section `node-621 Container:Section_self__25TmV`**
    at `y=4736, h=562`. Children: `[ node-622
    Container:Content_self__i8VxJ ]` → `[ node-623
    Container:ForBusiness_self__l5EtV (width 1440, height 562,
    paddingTop 48px, paddingBottom 24px, display: block) ]` →
    **`children: ""`**.
  - The dashboard image and the text wrapper are **sibling sections**,
    not parent/child. Both `Section_self` instances have
    `overflowX/Y: hidden`.
  - **Original §3.2 hypothesis — DISPROVED.** The audit originally
    hypothesised the dashboard image would land as a sibling of
    `ForBusiness_self`. Evidence shows the dashboard is in a
    *separate, preceding* `Section_self` (lines 1682–1892); it is
    not a sibling of `ForBusiness_self` at all. The sibling/child
    shape of the dashboard is captured correctly. The render-side
    `clipsContent` theory was ruled out by the same evidence.
- **Deeper finding — the "children: ''" symptom was a tooling artifact.**
  Sub-probe S1 (`plans/03-investigations.md §10.4`) revealed that
  the workspace-root `c:\Users\Mahfuz\newProject\capture.json`
  (1.5 MB, 2026-07-04 02:46) had been overwritten by PowerShell
  `ConvertTo-Json -Depth 12`, which silently truncates deep
  structures into hashtable `.ToString()` representations. The
  corrupted file showed `"style": "@{backgroundColor=...}"` and
  `"children": ""` for every node past depth 12 — including the
  ForBusiness subtree. The walker never produced these values;
  `capture-core.ts` initializes `children = []` (line 996 / 1053 /
  1083 / 1152 / 1244 / 1347) and cannot emit a bare string.
- **Fresh-capture verification.** Ran
  `test/run-capture.mjs --url=https://www.fresha.com/ --name=fresha
  --viewport=1440x900` to regenerate `test/capture.json` (1.3 MB,
  Node-serialized, 901 nodes). ForBusiness_self subtree contains:
  - 1 direct child (frame `OverviewSection_self__x15fL`)
  - 35 elements total in subtree
  - 5 text-bearing descendants: h2 "Fresha for business", body
    paragraph, CTA "Find out more", Capterra "Excellent 5/5",
    Capterra "Over 1250 reviews on"
  `test/visual-diff.mjs` rendered `test/preview.html` (599 KB)
  with every text node, every star SVG, the Capterra badge, and
  the CTA all present at correct positions and computed styles.
- **No code change required.** The walker is correct. The
  render-side code path is correct. The only durable fix is
  tooling/process — see §11 of the investigations doc for the
  recommended `test/verify-capture.mjs` guard.
- **Status:** **CLOSED.** The four §4 candidate causes (visibility
  filter, isClippedAway, MAX_NODES / MAX_DEPTH, ancestorVisibleFraction)
  are not implicated in any real capture, because the original
  evidence came from a corrupted file. They remain valid future-
  hardening candidates if a fresh capture ever exposes a new
  symptom, but they are no longer the path forward.

### 3.3 ✅ DownloadApp video (now captured)

- **Evidence (live data):** `capture.json` line 1366-1376 — `Section:DownloadApp_self__ily1S` width 1440, height 810, `display: block`. The 2026-07-04 verification confirms `DownloadApp_center-images` has both members (300×650 `<picture>` with src, and the 246×529 `<video>` raster). The current `capture.json` does show `children: ""` for `DownloadApp_self`, but this is because the section's children are nested inside `DownloadApp_center-images` (which IS a descendant), not because the subtree was pruned — the wrapper-to-children chain goes section → _center-images → {picture, video}.
- **Status:** **Fixed.** The previous session's `applyBorderStroke` work on the raster branch in `plugin.ts` and `visual-diff.mjs` ensures the `<video>` raster now paints its CSS border. The fade-in / force-reveal gate was already triggering for the carousel `<picture>` because both children carry a transition.
- **Watch / regression guard:** if a future capture drops `DownloadApp_center-images` entirely, check that the carousel's outer wrapper still resolves `transitionProperty: opacity|all` (or extend `force-reveal` to also fire on `animationName !== 'none'`, per §3.2's broader pattern).

### 3.4 ⚠️ Background-size/position captured (2000/2000) but not persisted

- **Evidence:** `node test/audit-css.mjs` first run reported `background-size 2000/2000 occurrences e.g. auto` and `background-position 22/2000 occurrences e.g. 0% 0%`. Cross-checked against `extension/src/types.ts ElementStyle` — **no field exists for these**. The script's regex `/^\s*([a-zA-Z][a-zA-Z0-9_-]*)\??:\s*(?:string|number)/gm` returns false positives because kebab-case props in `ElementStyle` are stored as camelCase.
- **Action:** Confirm with a second-pass check whether `background-size` was ever captured (`grep -rn "backgroundSize\|backgroundPosition\|backgroundRepeat" extension/src/capture-core.ts` returns nothing). Documented as a gap — out of scope for this audit to fix.

---

## 4. Test-harness surface (ground truth)

Files worth knowing for the verification loop:

- `test/run-capture.mjs` — Playwright harness using the same `extension/src/capture-core.ts`. Drives `force-reveal` prep, walks DOM, serializes, and writes PNGs for every raster target.
- `test/analyze.mjs` — Emits `PROBLEMS` + `NOTES` against a `capture.json`. Used by `npm test`'s stripe regression suite (must remain 0/0).
- `test/visual-diff.mjs` — 331-line renderer that **mirrors plugin.ts** 1:1. Anything it renders wrong will be wrong in Figma. Currently handles: border (uniform + per-side), cornerRadius, padding/margin, flex (`display:flex` → flex auto-layout with ABSOLUTE positioning), box-shadow, gradient fills (linear, radial, Fresha cascade via `inheritedGradient` thread), text auto-resize + ellipsis, raster branch (`<img>` with image fills + style + border + outline).
- `test/audit-tags.mjs` — Walks `document.querySelectorAll('*')` via Playwright; produces tag counts + CSS-prop counts for fresha.com (`p:1420, li:1167, a:1102, div:1042, span:933, svg:395, button:150, picture:33, label:31, input:31, iframe:2, footer:2, nav:1, main:1, section:1, h1:1, video:1`). **Not safe to auto-run in CI** (Playwright overhead + live fresha fetch).
- `test/audit-css.mjs` — Same idea but for CSS props. **Has a regex bug** (returns false-positive gap entries because it scans `ElementStyle` for kebab-case `propName?: string` but the field names are camelCased). Treat its `TOP GAPS` output with a grain of salt — verify each before acting.
- **Plan-01 verification (Session 2026-07-04 cont.) confirms:**
  - Stripe fixture: 90 nodes, 5 rasters, 0 PROBLEMS, 0 NOTES, snapshot diff 0/0/0
  - Fresha @1440: 897 nodes, 5 rasters (only `<video>` phone + 4 `bg-clip:text` heading leaves), 0 PROBLEMS, 0 NOTES
  - Snapshot deltas all explained by live-page rotation (animated spotlight transforms), counter ticks, carousel shuffling — **not** capture regressions

---

## 5. Regression-prevention checklist (must not break)

| # | Check | Tool |
|---|---|---|
| 1 | Stripe snapshot diff `0/0/0` (added/removed/changed) | `cd test && npm test` |
| 2 | `analyze.mjs` reports `PROBLEMS: 0 NOTES: 0` on stripe | `node test/analyze.mjs test/snapshot/stripe.json` |
| 3 | `tsc --noEmit` clean across extension, plugin, backend (DOMRectList noise allowed) | `cd figma-plugin && npx tsc --noEmit` |
| 4 | Plugin builds (esbuild) | `cd figma-plugin && npm run build` |
| 5 | Extension builds | `cd extension && npm run build` |
| 6 | Backend builds | `cd backend && npm run build` |
| 7 | `<video>` captures its poster image and `applyBorderStroke` paints it | `test/visual-diff.mjs` raster branch + spec probe |
| 8 | Gradient-text cascade renders the gradient on text glyphs | `node test/visual-diff.mjs` and `FreshaInNumbers_*` band crop |
| 9 | `overflow:hidden` clips on the resulting frame | Manual `test/visual-diff.mjs` check on ForBusiness wrapper |
| 10 | Helvetica-style icon-font glyphs stay rasterized (not literal letters) | `analyze.mjs` `0 PROBLEMS` |

---

## 6. What's NOT in scope for this audit

These are non-goals, captured here so future audit readers don't try to plan them:

- **Animated GIF playback** — Figma renders them natively as image fills; covered.
- **Live scrolling** — Figma has no native scroll containers (carousels come in flat). Carousel-edge cards get `isClippedAway` drop or `truncate` flag.
- **Hover/focus/active styles** — Captured at the static state. Designers re-add interactive states inside Figma.
- **Audio/video autoplay** — Captured as a static poster frame (when present).
- **Print stylesheets** — `media: print` resolved to default in capture.
- **Cross-origin image redactions** — `backend`'s whitelist governs; out of scope for the capture layer.
- **Figma Variables / auto-binding** — generated Figma frames use raw RGB, not Themes.

---

## 7. Decisions from the user (Session 2026-07-05)

> The four open questions have been answered. This section records the
> decisions; downstream phases (8, 9, 10, 11) have been updated to match.

**Q1. Scope (extension is not fresha-specific).** — *Answered by the user
implicitly by stating the extension must capture **any** live or local
website/webpage and import it into Figma via the plugin.*
- This audit is **not** a fresha-fidelity report. fresha is one torture-test
  fixture. The product is general-purpose.
- The `extension/manifest.json` confirms this: `"description": "Capture any
  webpage and import it into Figma"`, with `<all_urls>` + `file:///*`.
- Every gap, fix, and regression is evaluated against *generic* pages.
  Fresha's value is that it stresses gradients, carousels, conic-gradients,
  large raster images, and force-reveal edge cases.
- **Action taken:** the scope disclaimer has been added to the top of this
  document (immediately after the title blockquote). All other sections
  remain valid because their analysis is CSS-pattern-based, not
  fresha-specific.

**Q2. "Mapping" — what was that?** — *User asked for clarification.*
- "Mapping" refers to a possible **Phase 2 deliverable**: a
  `docs/MAPPING.md` reference table documenting *every* HTML tag and CSS
  property the extension captures, what it maps to in Figma, and where to
  find the implementation. The current audit covers the same surface in
  §2 status tables, but as a one-shot doc; a separate `MAPPING.md` would
  be a long-form, alphabetised, search-friendly reference.
- **Decision: do NOT build a separate `MAPPING.md` right now.** The §2
  status tables in this audit are sufficient for current work. The
  mapping table can be extracted later if/when it becomes a maintenance
  burden. This document stands alone.

**Q3. Phase 3 evidence.** — *Answer: capture.json + screenshot is enough.
No live-DOM probes (`page.evaluate` etc.) needed at this stage.*
- For any future investigation: open the relevant `capture.json`, locate
  the suspect node by id/name, read its style + children, then take a
  screenshot of the live page at the matching rect (Playwright already
  does this for raster targets in `test/tmp/`).
- If capture.json evidence is ambiguous, escalate to a `page.evaluate`
  probe — but only as a last resort. Keep the test harness simple.

**Q4. Phase 5 ordering.** — *User asked for clarification (did not
understand the question).*
- The "Phase 5 ordering" question was about: **in what sequence should
  the proposed fixes happen, and which fix goes first?** A "fix order"
  matters because the changes touch overlapping code (`capture-core.ts`
  walker, `plugin.ts` rendering, `analyze.mjs` regression guard).
- **Updated ordering (post-Phase 3 S1–S5 probes):**
  1. Phase 3 sub-probes (capture.json only, possibly one Playwright
     `getComputedStyle` for probe S5 if needed).
  2. Single minimal capture-side fix in `capture-core.ts` — *only the
     capture layer is implicated* by current evidence
     (`plans/03-investigations.md §5`). The render layer is **not**
     implicated: `plugin.ts` already handles populated text subtrees
     correctly (FreshaInNumbers_self, sibling image section both
     render).
  3. Regression guard in `test/analyze.mjs` (asserts no frame deeper
     than depth N has `children: ""` when its parent has
     non-zero `height` and a populated `innerText`).
  4. Refresh fresha + stripe snapshots via `--update-snapshot`.
  5. Figma end-to-end (manual: load plugin, import, eyeball the
     ForBusiness section's left column).
  6. PROJECT_LOG entry.
- **No code changes will start until you say "go" on Phase 5.** This
  document is locked as the source of truth; any divergence from §11
  during implementation should be noted back into §11.

---

## 8. File-by-file "as-built" summary

### 8.1 `extension/src/capture-core.ts` (1560 lines)

- ✅ **DOM sizing & pose:** rect-relative coords, post-transform bbox via `stripMatrixTranslation`, scrollX/Y projection, `display:contents` hoisting, raw Text-node child preservation.
- ✅ **Clip-aware text:** `clipWindowFor`, `rectsCoincide`, `isClipped`, `measureClipped`, `hasClippedOverflow`, `ancestorVisibleFraction`, `isClippedAway` — rolling-number widgets + carousels survive.
- ✅ **Style extraction:** 100+ CSS properties read with defensible defaults; kebab-case ↔ camelCase translations via `(s as any).kebab || kebab`.
- ✅ **Custom-control collapse:** `<select>`, custom ARIA `combobox/listbox`, `<input>` text/email/url/…, native checkbox/radio synthesised.
- ⚠️ **Force-reveal gate:** only fires on `transitionProperty` containing `opacity|all` AND subtree has media. Animations without a transition (a common Fresha pattern) are dropped.
- ⚠️ **Rasterization reasons** (current set): data-attr opt-in, `<canvas/video/iframe/embed/object>`, `clip-path:<…>`, `mask:<…>` (incl. pseudo masks on small elements), mixed `filter:` (non-blur/drop-shadow), `mix-blend-mode` (any non-normal layer), `background-blend-mode`, `background-clip:text` (only on text leaves with their own gradient), `conic-gradient`, `repeating-*`, 3D transforms, icon-font glyphs. Logical: nothing rasterizes text or solid colour.
- ⚠️ **Cascading param `activeColorXform`** threads colour-only filter baking down the subtree.

### 8.2 `extension/src/types.ts` (340 lines)

- ✅ `ElementStyle` reflects capture-core's read set + dedicated metadata fields (animation/timeline names, scroll margins, anchor positioning, view-transition names, etc.) — purely for designer inspection.
- ✅ `CaptureNode` is the canonical wire format shared with `figma-plugin/src/types.ts`.
- ✅ `CapturePayload` carries `viewport` (full document) AND `browserViewport` (1440×900 — required for vh/vw resolution).

### 8.3 `figma-plugin/src/plugin.ts` (1138 lines)

- ✅ **Color helpers:** `parseCssColor` (`rgb()`/`rgba()`/`#hex`/`#hex8` alpha), `parseGradientStops` (stops accept `px|%|vh|vw|vmin|vmax`), `clamp01`, `linearGradientFill`, `radialGradientFill` (centred ellipse), `resolveFills` (single SOLID/GRADIENT/IMAGE — with `bgClip:text` cascade-aware return).
- ✅ **Layout helpers:** `applyTransform` (full 2D matrix incl. skew, with `transform-origin` resolution), `applyCornerRadii` (uniform + per-corner, elliptical → circular), `applyBorderStroke` (uniform + per-side + outline fallback), `sortByZIndex` (stable), `parseMatrix`/`isIdentity`, `positionOffset` (centralized top/right/bottom/left + inset resolution), `applyPerChildExtras` (centralized `layoutAlign` + `blendMode` for all 5 appendChild sites).
- ✅ **Effect helpers:** `parseBackdropBlur` (BACKGROUND_BLUR), `parseSingleShadow` (INNER_SHADOW/DROP_SHADOW), `parseShadows` (multi-layer), `parseFilterEffects` (LAYER_BLUR + DROP_SHADOW filter), `splitTopLevelCommas` (paren-respecting).
- ✅ **Auto-layout helper:** `applyAutoLayout` — `display:flex` → Figma `layoutMode: HORIZONTAL|VERTICAL`, primary/counter axis alignment, FIXED sizing with ABSOLUTE children for pixel accuracy.
- ✅ **Font resolution:** `preloadFonts` indexes Figma-installed families, `resolveFont` walks CSS stack with style fallback chain; substitutions reported back to UI.
- ✅ **Builders:** `buildNode(capture, parent, imageBytes, cascadeGradient?)` — handles `'frame'|'text'|'image'|'rectangle'` plus the raster-precedence branch. `cascadeGradient` threaded for Fresha-style gradient text.
- ✅ **Multi-viewport entry:** `buildMultiViewport` lays each frame left→right with a label.

### 8.4 `test/visual-diff.mjs` (331 lines)

- ✅ Mirrors plugin.ts: `styleFromNode(n, inheritedGradient)` threads cascade; text-fill case uses inherited gradient; raster branch emits border + outline + cornerRadius + box-shadow + transform + z-index; flex layouts applied with ABSOLUTE positioning; multi-fill `[IMAGE, gradient]` emitted when applicable.
- ⚠️ No `mix-blend-mode` mapping in preview (Figma plugin DOES map it, but preview renderer falls back to default compositing).

### 8.5 Fixtures / baselines

- ✅ `test/snapshot/stripe.json` — 90 nodes, 0 raster, 0/0/0 diff, 0 PROBLEMS, 0 NOTES. **Truth anchor.**
- ✅ `test/snapshot/aether.json` — exercises the orb-glow pseudo-element capture (uses `::before` + radial gradient).
- ✅ `test/snapshot/fresha.json` — full home page; **897 nodes, 5 raster targets** (icon-font, clip-path polygon, conic-gradient, mixed filter, bg-clip:text headline) per the 2026-07-04 verification sweep. Also tracks `browserViewport`. The recent cascade-gradient fix did NOT introduce rasterization for the gradient (5 rasters, not 6+), proving the gradient now travels as cascade rather than as a raster.
- ⚠️ `test/fixture/stripe.html` — a local HTML snippet used for offline render testing (no live fetch).

---

## 9. Phase 3 — proposed investigations (NO code changes in this phase)

> **Evidence policy (per Q3 in §7):** capture.json + screenshot is sufficient.
> No live-DOM `page.evaluate` probes needed at this stage. If a capture.json
> snippet is ambiguous, escalate — but try capture.json first.

These are documented-but-deferred investigation steps; run them only after the user signs off on this audit and the Phase 5 ordering:

1. ~~Why does `ForBusiness_self` have `children:""` while its dashboard image is captured as a sibling?~~
   - **Status:** **Original sibling-vs-child question is closed** by `plans/03-investigations.md §2.1`. The dashboard image is **not** a sibling of `ForBusiness_self`; it lives in `node-582 Container:Section_self__25TmV` (a separate preceding section), and `ForBusiness_self` itself sits under `node-621 Container:Section_self__25TmV` (a separate following section). Both are siblings at the section-list level.
   - **Refined question:** **why does `ForBusiness_self` have `children:""` despite being live-populated with marketing text in the live DOM?**
   - **Evidence already gathered (capture.json only):** lines 1893–2036 of `capture.json` show `node-621 Container:Section_self__25TmV` → `node-622 Container:Content_self__i8VxJ` → `node-623 Container:ForBusiness_self__l5EtV` with `children: ""`. The walker's output is empty for that subtree.
     - **⚠ 2026-07-05 correction:** the workspace-root `capture.json` was overwritten by PowerShell `ConvertTo-Json -Depth 12` (PROJECT_LOG.md line 686). The `style` field is a PowerShell hashtable `ToString()`, and `children: ""` is a depth-limit artifact — `capture-core.ts` initializes `children: []` (six sites, lines 996/1053/1083/1152/1244/1347) and cannot produce the empty string directly. **Phase 3 must be re-run against a fresh Node-serialized capture** before any fix is attempted. See `plans/03-investigations.md §10.4` for the full discovery.
   - **Live-DOM S1 result (also 2026-07-05):** `test/probe-s1.mjs` walked 43 descendants of the live `ForBusiness_self` element. 17 contain visible text (the h2 "Fresha for business", the body p, the CTA button, the Capterra badge with rating + stars + link) — all `display: block/flex`, `visibility: visible`, `opacity: 1`, full rects. **0 elements are dropped by display/visibility/opacity/clipping/size filters on the live DOM.** So the source DOM is fine; the question is what the walker does to it.
   - **Screenshot cross-check:** open `test/tmp/` for any rasterized PNG of the dashboard image (`forBusinessLarge@2x.6eccd3f9.webp`) and confirm it matches the live fresha.com capture (this is an image-side confirmation, not a text-side one — text is not rasterized).
   - **Fresh Node-serialized capture (2026-07-05):** `cd test && node run-capture.mjs --url=https://www.fresha.com/ --name=fresha --viewport=1440x900` produced `test/capture.json` (1.3 MB, 901 nodes). ForBusiness_self subtree contains 35 elements with 5 text nodes (h2, body p, CTA button, Capterra rating, Capterra link), all with correct rects, styles, and font properties. `test/visual-diff.mjs` rendered the full section into `test/preview.html` (599 KB) with every text node, star SVG, Capterra badge, and CTA at correct positions and computed styles.
  - **Phase 3 closure:** **CLOSED 2026-07-05.** No walker bug. No code change to `capture-core.ts`. Full narrative in `plans/03-investigations.md §11` and PROJECT_LOG Session 2026-07-05 (cont.). The pre-closure "next concrete step" (S3 console.log probe gated on a fresh capture) is now obsolete — the fresh capture shows a populated subtree, which makes the S3 hypothesis moot.
2. **Why is the `DownloadApp` second-phone `<picture>` opacity-0-pending-animation dropped?**
   - **Already resolved** per §3.3 + the 2026-07-04 verification sweep.
     Defer unless a future capture proves otherwise.

If the investigations come back negative (capture is actually correct, the issue is render-side), the audit should be updated and Phase 5 re-scoped.

---

## 10. Phase 4 — proposed regression checklist (`plans/02-audit.md` continues in `plans/03-regression-checklist.md` if approved)

To be drafted after Phase 3 evidence is in. Will codify exactly:

- The five raster reasons that show up on fresha and what each is rasterizing.
- The three gradients-on-fresha sections (ForBusiness baked; FreshaInNumbers native; conic-gradient raster) and what their plugin render must look like.
- The carousel-edge tolerance (`OFFSCREEN_TOL=8`) and what happens just outside it.

---

## 11. Phase 5 — implementation order (ARCHIVED 2026-07-05)

**Closure status:** **OBSOLETE 2026-07-05.** Phase 3 closed with no
walker bug found (see §3.2 above and `plans/03-investigations.md §11`).
The original Phase 5 ordering (capture-side fix + render-side fix for
ForBusiness) is no longer applicable. Phase 5 is effectively closed
unless the user reopens it with a fresh regression.

> **Phase 5 ordering (archived 2026-07-05).** The original numbering below is preserved for traceability.
> The active plan in 2026-07-05 is the "Recommended next steps" block at the end of this section.
> If a fresh regression is discovered, reopen Phase 5 by re-running Phase 3 probes against a
> fresh Node-serialized capture; the (a)/(b) lines of work may then re-engage.

1. ~~**Lock this audit.** `plans/02-audit.md` becomes the source of truth.~~ **DONE 2026-07-05.**
2. ~~**Run the single Phase 3 probe (ForBusiness only).** Capture.json + a
   screenshot of the rasterized dashboard image. Save evidence in
   `plans/03-investigations.md`. **No code changes during this step.**~~ **DONE 2026-07-05 — Phase 3 closed with negative result (no walker bug).**
3. ~~**Wait for user approval** of the audit + Phase 5 ordering before any
   code changes.~~ **OBSOLETE — Phase 5 (a)/(b) closed by negative evidence.**
4. ~~**Execute the minimal fix set** in this order:~~ **OBSOLETE — (a) capture-side fix is moot; (b) render-side fix is moot; (c)/(d) remain as candidate future work if user reopens Phase 5 with a fresh regression.**
   - ~~**(a) Capture-side fix** — if probe shows the dashboard is a sibling
     of `ForBusiness_self`, fix the walker in `capture-core.ts`
     (`display:contents` hoisting order). Otherwise skip.~~ **MOOT.**
   - ~~**(b) Render-side fix** — if probe shows the dashboard IS a child but
     layout overflows, fix `clipsContent` propagation in `plugin.ts`.
     Otherwise skip.~~ **MOOT.**
   - **(c) Regression guard** — add an assertion in `test/analyze.mjs` that
     fails if any non-text frame node carries
     `rasterizeReason: 'background-clip: text'`. Always applied, even if
     (a)/(b) are skipped. **STILL VALID CANDIDATE — reopens with Phase 5.**
   - **(d) Refresh snapshot** — `node run-capture.mjs --name=fresha
     --update-snapshot` only after a manually-verified preview match.
     **STILL VALID CANDIDATE — already executed once (2026-07-04 verification
     sweep), and can be re-executed as part of any future Phase 5 work.**
5. ~~**End-to-end Figma check** — reload extension + plugin, capture any
   test page (fresha or stripe), import, compare against the snapshot.~~ **PENDING USER DIRECTION — user should feed fresh `test/capture.json` to Figma to confirm the section renders correctly there too.**
6. ~~**Append a dated entry to `PROJECT_LOG.md`** describing the fix,
   evidence, and snapshot delta.~~ **DONE 2026-07-05 (this entry).**

> Hard rule: **if any future probe produces evidence that contradicts
> §3.2 (RESOLVED)**, update §3.2 in this audit and re-confirm the ordering before
> touching code.

**Recommended next steps (user decision):**

- **(i) Verify in Figma.** User loads `test/capture.json` (1.3 MB,
  fresh Node-serialized) into the Figma plugin and confirms the
  ForBusiness section renders correctly with all text + CTA + Capterra
  badge. If yes, no Phase 5 work needed.
- **(ii) Add tooling guard.** Build `test/verify-capture.mjs` per
  `plans/03-investigations.md §11.6`: asserts every node has a
  `children` field that is an array, and a `style` field that is an
  object. Prevents future PowerShell-corruption regressions.
- **(iii) Archive Phase 5.** Mark Phase 5 (a)/(b) as closed; preserve
  (c)/(d) as candidate future work. Update `plans/02-audit.md` to
  drop Phase 5 entirely if the user prefers.

---

**END OF AUDIT — no source code was modified during creation of this document.**
