# Plan 01 — Fresha fidelity fixes (card ring · map phone · gradient section)

Each phase is self-contained and executable in a fresh context. Repo:
`C:\Users\Mahfuz\newProject`. Verify with the offline harness:
`cd test; node run-capture.mjs --url="https://www.fresha.com" --name=fresha --viewport=1440x900; node analyze.mjs; node visual-diff.mjs`.

## Phase 0 — Findings (diagnostic complete; evidence in agent report)

1. **Card ring (D1):** NOT in capture.json at all. `getStyleFromComputed`
   (extension/src/capture-core.ts:50–105) never reads `outline*` — grep confirms
   zero matches. Also `hasVisibleBox` (:637) ignores boxShadow/outline, so a
   shadow-only ring pseudo would be dropped. Plugin side is fine: strokes applied
   when `borderStyle!=='none'` (plugin.ts:607) and `inset` shadows map to
   INNER_SHADOW (plugin.ts:324/361).
2. **Map phone (D2):** absent from capture entirely — `DownloadApp_center-images`
   has ONE child (the video phone, rasterized ✓ with PNG present). Suspect drop
   points: opacity-0 reveal animation not caught by force-reveal, or
   `isClippedAway` (:1056). Needs one live-DOM instrumented probe.
3. **Flat gradient section (D3):** it's `FreshaInNumbers` (1440×660, absY 3348),
   rasterized whole with `children=0` because its computed
   `background-clip:text` fires rasterizeReason (capture-core.ts:309). The
   ForBusiness section is native already (gradient is baked into its webp).
   `resolveFills` (plugin.ts:170–196) returns max ONE Paint — no gradient+IMAGE
   dual fill (needed for correctness elsewhere).

**Allowed APIs (verified in @figma/plugin-typings):** `Paint[]` fills arrays
(multiple fills legal, last = top), `Effect` INNER_SHADOW/DROP_SHADOW,
`frame.strokes/strokeWeight/strokeAlign ('OUTSIDE'|'INSIDE'|'CENTER')`.
CSS: `getComputedStyle().outlineStyle/outlineWidth/outlineColor` are standard.
**Anti-patterns:** no invented Figma props; don't set `strokeAlign` values other
than the three literals; never rasterize a container to "fix" styling.

## Phase 1 — Capture + render CSS `outline` (card ring)

Files: `extension/src/{types.ts,capture-core.ts}`, `figma-plugin/src/{types.ts,plugin.ts}`.

1. Add to `ElementStyle` (BOTH copies): `outlineStyle: string; outlineWidth:
   string; outlineColor: string; outlineOffset: string;`
2. `getStyleFromComputed`: copy the four from the computed style (pattern: same
   as the existing border* lines at capture-core.ts:57–59).
3. `hasVisibleBox` (:637): also true when `s.boxShadow !== 'none'` or
   (`s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0`).
4. `stripBoxDecoration`: add `outlineStyle:'none', outlineWidth:'0px'`.
5. Plugin frame branch (after the border stroke block, plugin.ts:~607): if no
   border stroke was applied AND `outlineStyle` is solid-ish with width>0, apply
   `strokes` from outlineColor/outlineWidth with `strokeAlign='OUTSIDE'`
   (CSS outline draws outside the box).
6. Also update `test/fixture/stripe.html`: add a card div with
   `outline:1px solid rgb(229,229,229)` as a regression fixture.

Verify: probe capture.json — every `LocationCard` (or the live ring's node)
carries the ring; preview shows 1px ring on cards; `analyze.mjs` PROBLEMS 0.
Guard: `grep -n outline extension/src/capture-core.ts` non-empty; plugin builds
`tsc --noEmit` clean (bar known DOMRectList noise).
NOTE: if the probe shows the ring is actually an inset box-shadow on a pseudo
(not outline), fix is step 3 alone (hasVisibleBox) — verify which via the data
before coding step 5.

## Phase 2 — Stop rasterizing containers for `background-clip:text` (D3)

File: `extension/src/capture-core.ts` (rasterizeReason, :306–310).

`background-clip:text` must only rasterize the TEXT ELEMENT itself (a gradient
headline like "1 billion+"), never a container. Change the condition to fire
only when the element is a text leaf: `el.childElementCount === 0 &&
(el as HTMLElement).innerText?.trim()`. Containers recurse normally; their
radial gradient renders via the existing native `radialGradientFill`.

Verify: recapture fresha → `FreshaInNumbers` has `rasterize` undefined,
children > 0, radial-gradient in style; a SMALL raster node exists for the
gradient-text heading only; preview shows pink radial section with live text +
counters. PROBLEMS 0. Guard: total raster count stays small (video + heading).

## Phase 3 — Find and fix the missing map-phone (D2)

Files: `test/` (probe), then `extension/src/capture-core.ts` or `content.ts`
(prepareDomForCapture) depending on evidence.

1. Instrument, don't guess: temporary harness probe (Playwright
   `page.evaluate`) — locate the map-phone element in the live DOM
   (`DownloadApp` section, sibling of the video). Log its computed `display`,
   `opacity`, `visibility`, `transitionProperty`, `animationName`, rect, and
   whether `isClippedAway`/`ancestorVisibleFraction` would drop it.
2. Expected causes + matching fix:
   - opacity 0 with ANIMATION (not transition): extend the force-reveal in BOTH
     `test/run-capture.mjs` and `content.ts prepareDomForCapture` to also match
     `animationName !== 'none'`.
   - dropped by clip logic: adjust tolerance/condition per the measured rect.
   - `<iframe>`/`<canvas>` map: route via rasterizeReason (canvas already
     covered; iframe would need a new `'iframe element'` reason).
3. Regression fixture: add an opacity-0-until-animated element to
   `test/fixture/stripe.html` if the cause is the reveal gap.

Verify: recapture → the second mockup node exists with an embedded image (or
raster PNG); preview shows both phones. PROBLEMS 0.

## Phase 4 — Multi-fill support (gradient + image together)

File: `figma-plugin/src/plugin.ts`.

`resolveFills` and the frame builder currently pick ONE paint; CSS multi-layer
backgrounds (e.g. `linear-gradient(...), url(...)`) need both. In the frame
branch: when `backgroundImageUrl` resolves AND the backgroundImage string also
contains a gradient, build `fills = [IMAGE, gradientPaint]` (Figma: last = top;
CSS: earlier layer = top, and our extractor takes the FIRST url — so the
gradient declared before the url sits ON TOP of the image). Keep single-paint
behaviour otherwise. Add a fixture div with `background: linear-gradient(
rgba(0,0,0,.4),rgba(0,0,0,.4)), url(data:...)` — it already exists in
stripe.html (Phase 6 test) — verify it renders gradient-over-image in preview.

Verify: fixture capture → that node's plugin path yields 2 fills (add a tiny
unit probe or rely on Figma import); no regression on single-fill nodes.

## Phase 5 — Verification sweep

1. `cd test && node run-capture.mjs --name=stripe` → PROBLEMS 0, snapshot diff
   reviewed, `--update-snapshot`.
2. Same for fresha; open preview.html beside fresha.com: card rings visible,
   both phones present, FreshaInNumbers native gradient + text, business
   dashboard image present.
3. `cd figma-plugin && npx tsc --noEmit` (only DOMRectList noise allowed);
   both `npm run build`s clean.
4. Append a dated entry to PROJECT_LOG.md describing all phases.
5. Figma end-to-end: reload extension + plugin, capture fresha, import, compare.
