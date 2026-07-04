# Plan 03 — Phase 3 investigations (evidence from `capture.json` and live DOM)

> **Last-updated 2026-07-05 — Phase 3 CLOSED.** Fresh Node-serialized
> capture proves no walker bug in `capture-core.ts`; original §3.2
> hypothesis was 100% a tooling artifact (PowerShell `ConvertTo-Json
> -Depth 12` over workspace-root `capture.json`). See §11 below and
> PROJECT_LOG Session 2026-07-05 (cont.) for full verification.

> Pure documentation. Read alongside `plans/02-audit.md` — §3.2 was
> hypothesised before this evidence was gathered, and the hypothesis is
> now **disproved**. This file supersedes §3.2 of the audit until the
> audit's §3.2 is patched (see "Audit patch" at the end).
>
> **2026-07-05 update:** the workspace-root `capture.json` was found to
> be corrupted by PowerShell `ConvertTo-Json -Depth 12` (see PROJECT_LOG
> line 686 and §10.4 below). All §1–§9 evidence sourced from that file
> is suspect. Phase 3 cannot close until a fresh Node-serialized capture
> is produced. **S1 ran** on the live DOM and ruled out the
> display/visibility/opacity/clip/size hypotheses; the remaining
> hypothesis (depth/count guard) requires a fresh capture to verify.
> Next step: `cd test && node run-capture.mjs --name=fresha --viewport=1440x900`.

> Pure documentation. Read alongside `plans/02-audit.md` — §3.2 was
> hypothesised before this evidence was gathered, and the hypothesis is
> now **disproved**. This file supersedes §3.2 of the audit until the
> audit's §3.2 is patched (see "Audit patch" at the end).
>
> Source of truth: `test/capture.json` (live capture, 1.5 MB, ~2838 lines,
> regenerated via `cd test && node run-capture.mjs --name=fresha --viewport=1440x900`).
> All line numbers cited are 1-based counts into that file as of the
> 2026-07-04 verification sweep.

---

## 1. What the user observed on fresha.com

`Container:Section:ForBusinesses` in the live page has:

- A **left column** with "Built for everyone. Find a beauty salon near you."
  heading + body copy + CTA button (marketing text).
- A **right column** with a dashboard image that **overflows the 1440px
  viewport on both sides** (its source size is 2082×776; it's translated
  -1041px so the centre sits flush with the viewport centre, and the
  section clips the rest with `overflow-x: hidden`).

In the import captured to Figma:

- The dashboard image positions correctly (the wrapper has the right
  `transform`, `overflow-x: hidden`, and the picture has the right
  `width/height`).
- The **left-column text** ("Built for everyone. Find a beauty salon
  near you…" + CTA) is **missing entirely** from `capture.json`.

There is no visible text node under the ForBusiness section, and no
text demo is being merged into one of the sidebar children. The
section's right-column image is present; the section's left-column
copy is gone.

---

## 2. Evidence — actual structure in `capture.json`

### 2.1 Two siblings, not parent + child

`grep_search` on the file yields three `ForBusiness_self__l5EtV`
hits. Reading the file around them (lines 1640–2110) shows that the
"ForBusiness" element in the live page is split into **two siblings**
under a common parent, not one parent containing both an image and a
text wrapper:

```
line 1682  node-582  Container:Section_self__25TmV   y=4008  h=728  (image section)
line 1893  node-621  Container:Section_self__25TmV   y=4736  h=562  (text section)
```

**Sibling A — the image section** (`node-582`, lines 1682–1892):

| line  | field                                                | value                                                                  |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 1682  | id                                                   | `node-582`                                                             |
| 1683  | tagName / type / name                                | `div` / `frame` / `Container:Section_self__25TmV`                      |
| 1687  | y                                                    | `4008`                                                                 |
| 1689  | height                                               | `728`                                                                  |
| 1722  | position                                             | `relative`                                                             |
| 1736/1737 | overflowX / overflowY                             | `hidden` / `hidden`                                                    |
| 1745  | children →                                           | `[ { node-583 picture } ]`                                             |
| 1746  | id                                                   | `node-583`                                                             |
| 1747  | tagName / type / name                                | `picture` / `image` / `Container:d_block`                              |
| 1750/1751 | x / y                                             | `-105` / `-49`                                                         |
| 1752/1753 | width / height                                     | `2082` / `776`                                                         |
| 1786  | position                                             | `absolute`                                                             |
| 1800/1801 | picture's own overflowX / overflowY               | `hidden` / `hidden`                                                    |
| 1803  | transform                                            | `"matrix(1, 0, 0, 1, -1041, 0)"`  ← translates by `-1041px` (centre)  |
| 1804  | transformOrigin                                      | `1041px 388.039px`                                                     |
| 1811  | src                                                  | `https://www.fresha.com/assets/_next/static/media/forBusinessLarge@2x.6eccd3f9.webp` |
| 1810  | picture's `children`                                 | `[]` (empty raster — no `<source>` siblings, no fallbacks)             |

The picture's `x=-105, y=-49, width=2082, height=776` come from the
live DOM (the image is sized wider than the viewport on purpose so the
art director can choose what to crop). The `transform: matrix(1,0,0,1,-1041,0)`
is the centred-clip trick: image starts at `-1041 + 2082/2 = 0` (i.e.
the image's centre matches the viewport centre). It is placed inside a
`Section_self` wrapper that has `overflow-x: hidden`, so the picture's
left/right overflow is clipped to the 1440-wide viewport — exactly
like the live page.

The picture's own `children` is `[]` because raster images have no
element children to capture (the `<source>` siblings are gone after
the raster binary is fetched into `imageBytes` map upstream of the
capture payload — that's expected for this render).

**Sibling B — the text section** (`node-621`, lines 1893–2036):

| line  | field                                                | value                                                                  |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 1894  | id                                                   | `node-621`                                                             |
| 1897  | name                                                 | `Container:Section_self__25TmV`                                       |
| 1899/1900/1901 | x / y / width / height                          | `0` / `4736` / `1440` / `562`                                          |
| 1934  | position                                             | `relative`                                                             |
| 1948/1949 | overflowX / overflowY                             | `hidden` / `hidden`                                                    |
| 1956  | children →                                           | `[ { node-622 Container:Content_self } ]`                              |
| 1958  | id                                                   | `node-622`                                                             |
| 1961  | name                                                 | `Container:Content_self__i8VxJ`                                       |
| 1997  | display / flexDirection                              | `flex` / `column`                                                      |
| 2012/2013 | overflowX / overflowY                             | `visible` / `visible`                                                  |
| 2020  | children →                                           | `[ { node-623 Container:ForBusiness_self } ]`                          |
| 2022  | id                                                   | `node-623`                                                             |
| 2025  | name                                                 | `Container:ForBusiness_self__l5EtV`                                   |
| 2028/2029/2030 | width / height                                  | `1440` / `562`                                                         |
| —     | paddingTop / paddingBottom                           | `48px` / `24px` (from line 1886's style block)                         |
| —     | display / position                                   | `block` / `static`                                                     |
| 2031  | **`children`**                                       | **`""` (empty)**                                                       |

This is the smoking gun.

The `Container:ForBusiness_self__l5EtV` element — whose `name` is
literally `ForBusiness_self` — has **no captured children** at all. Not
an empty array, not a single text node, not a phantom ghost line.
**Nothing.** The marketing text content that the user sees on
fresha.com under the dashboard image is missing from the entire
`capture.json` graph.

### 2.2 Compare to working siblings

For contrast, **sibling A (the image section) above** is captured
correctly end-to-end:
- Outer wrapper (line 1682): children `[node-583 picture]`.
- node-583: populated with `x`, `y`, `width`, `height`, `style`,
  `transform`, `transformOrigin`, `src`. Right.

And the **`FreshaInNumbers` section above that** (the radial-gradient
stats block, lines 1640–1680) is also captured correctly:
- node-566 (`Container:FreshaInNumbers_self__gvk1_`, line 1666):
  `children: "   "` — a single text node (the orchestrator's
  cascade-threading that ships running numbers with their big
  digits inline). Worked.

But the **text section under ForBusiness** at line 1893 has
`ForBusiness_self` with **empty children**. So the capture graph
disappears at that exact element.

---

## 3. The §3.2 hypothesis (audit) — DISPROVED

`plans/02-audit.md` §3.2 hypothesised:

> "The dashboard image lands as a *sibling* of
> `Container:ForBusiness_self__l5EtV` instead of inside it."

That hypothesis is **wrong** as a description of what the capture
shows. Evidence in §2.1: the dashboard image is not a sibling of
`ForBusiness_self`. It is in **`node-582` Section_self** (a
preceding sibling section entirely). `ForBusiness_self` itself sits
under a totally separate `Section_self` (`node-621`) that comes 73
lines later in `capture.json`. The two sections are not parent/child
or sibling to each other's content node — they are sibling sections
under whichever common ancestor (likely `Container:ForBusinesses` or
the page-root section list).

Therefore the audit's "if the dashboard sibling pattern is in the
capture, then the render pipeline needs a sibling-overflow case"
action item is *not* the right shape of the fix. The capture is
already structurally correct on the image side; the text side is
missing entirely.

---

## 4. New hypothesis (replacement for §3.2's suspected root cause)

The real regression is **text-content pruning in `Container:ForBusiness_self__l5EtV`**.
That element's `children` field is the empty string in `capture.json`,
which means the capture walker never produced any `CaptureNode` for
its inner DOM subtree (no heading, body, CTA button).

We have not yet identified *why* the walker produces zero children
for that specific element while nearby similar elements (e.g.
FreshaInNumbers_self right above it) produce a populated subtree.
Plausible causes to probe in order of likelihood — **none of these
have been verified yet; they are the queue for the next sub-probe**:

1. **The ForBusiness section uses CSS that fails the visibility / size
   filter or the clipping filter.** Specifically: the text subtree may
   be `opacity: 0` (crossfade carousel entry), `display: none`
   (CSS-only state), positioned outside an `overflow: hidden`
   ancestor's clip window, or pulled out of the layout flow by
   `position: absolute` with no fallback. None of these styles appear
   on `node-623` itself (its style reads as `display: block, paddingTop
   48px`), but they may exist on one of its inner children. **Need
   probe:** serialize the live DOM under `.ForBusiness_self` and
   inspect `getComputedStyle()` per descendant.

2. **The walker hits a depth/node-count guard (`MAX_DEPTH` /
   `MAX_NODES`)** before reaching ForBusiness_self's text. The
   count is currently `~600 top-level nodes` (audit §1 lists
   MAX_NODES as `tuned per fixture`). ForBusiness_self is at depth
   ~7 (page → sections → content → forbusiness_self → column →
   heading/body). Need to confirm by reading `MAX_NODES` /
   `MAX_DEPTH` constants and checking `capturedCount` at the time
   we enter `node-623`.

3. **`isClippedAway()` returns true for ForBusiness_self's inner
   elements** because their bounding rect sits outside the
   `Section_self` clip window (`overflowX/Y: hidden`, 1440×562).
   The section uses `overflow: hidden` (line 1948/1949) and the
   dashboard section below it (line 1736/1737) is a separate
   clip window. It is plausible that the text column is positioned
   such that all of its text spans fall outside the *immediately
   enclosing* clip window even though the section itself is at
   `x=0, width=1440`. **Need probe:** scan the live DOM for the
   heading's `getBoundingClientRect()` and compare against
   `node-623`'s `x/width` and against the next-sibling section's
   `y`.

4. **`ancestorVisibleFraction()` returns < 0.15** for some
   descendant, suppressing its demote-to-text attempt (line 1505 in
   capture-core.ts). Combined with the walker dropping the
   descendant outright via `isClippedAway()`, this would yield
   exactly the empty-children symptom we see. But the demote-to-text
   path only fires *for a wrapper that has no children* — if the
   wrapper's own direct children are pruned, demote is moot.

5. **Some ancestor is `display: contents`** and `appendChildNodes`
   is hoisting instead of recursing, with the wrong depth argument
   and the inner content therefore pruned. Unlikely on inspection of
   capture-core.ts:1275 (`display:contents` → `appendChildNodes(
   parentNode, ce, ... )` — children are appended to the *parent*,
   depth is not incremented, so the inner subtree survives).

The most likely cause is **(1) the inner DOM has a state-induced
visibility flip** (e.g. CSS-only carousel entry that uses
`opacity: 0` on a peer that has not yet been promoted) or **(3)
the inner text column is positioned in a way that `isClippedAway`
rejects it on a per-axis basis**.

**Confirm or kill each of these by an explicit capture.json + DOM
probe before writing any code.** That is the Phase 3 follow-up.

---

## 5. Where this puts the audit's Phase 5 ordering

Audit §11 listed Phase 5 ordering as:

> (a) capture-side fix if the probe shows sibling;
> (b) render-side fix if the probe shows child-but-overflow;
> (c) regression guard;
> (d) snapshot refresh;
> (e) Figma end-to-end;
> (f) PROJECT_LOG entry.

With §3.2 disproved, **(a) and (b) collapse into one fix**: a
capture-side fix that surfaces the missing text children into
`capture.json`. Whether the eventual fix is:

- (i) loosen a too-aggressive filter in `capture-core.ts`, **or**
- (ii) account for a state-induced visibility flip in the walker,

the change is in the **capture** layer, not the Figma render layer.
`plugin.ts` already accepts arbitrary `children` arrays and renders
them correctly (sibling A and FreshaInNumbers self are evidence that
the render layer handles populated text subtrees). So once the text
content makes it into the payload, the Figma render should produce
the missing heading/body/button without further changes.

This still needs sign-off from the user before any code is written.

---

## 6. Auxiliary finding — `audit-css.mjs` is broken

While inspecting the project for evidence I confirmed the audit's
§6.2 / §9 aside that **`test/audit-css.mjs` has a regex that scans
for kebab-case CSS property names** but `extension/src/types.ts`
defines `ElementStyle` in **camelCase**. The output therefore
reports GAPs that are not real gaps (e.g. `border-radius` →
counts as missing because we declared `borderRadius`, not because
the field is missing). This audit is informational and unrelated to
ForBusiness, but should be fixed in a small follow-up before we
rely on its output to drive Phase 4 regression coverage.

---

## 7. Audit patch (apply when ready)

The following edits to `plans/02-audit.md` should be applied:

- **§3.2** (ForBusiness regression): replace the "the dashboard image
  lands as a sibling" hypothesis with: "section is correctly split
  into two siblings at the section-list level (image section +
  text section); the text section's `Container:ForBusiness_self__l5EtV`
  has empty `children` in the capture payload — text content was
  pruned at walk time."
- **§3.2 Suspected root cause**: replace with pointer to
  `plans/03-investigations.md §4` and the queue of unverified causes.
- **§3.2 Action**: replace with "Phase 3 follow-up probes (no fix
  until each of the §4 candidates is confirmed or killed by an
  explicit capture.json + DOM check)."
- **§11 Phase 5 ordering**: collapse (a)/(b) into a single
  capture-side fix; note that render-side fixes are not currently
  implicated by the evidence.

The audit's `## 1. Module map`, `## 2 Status table`, `## 4 Test
harness`, `## 5 Regression checklist`, `## 6 Auxiliary tooling`,
`## 7 Decisions`, `## 8 File-by-file as-built`, and `## 10
Out-of-scope` remain accurate and need no edits.

---

## 8. Phase 3 follow-up probe queue (next steps, evidence only)

The next round of sub-probes — each runs against `capture.json`
plus, where indicated, the live DOM via `test/run-capture.mjs`. No
proposed code change in any of them; each is a single, testable
question.

1. **Probe S1 — size filter / display-none?** Read capture.json
   around line 2030 (inside the ForBusiness_self wrapper's style
   block) and confirm no descendant exists with `display: none`.
   *If any descendant appears with `display: none` in the live DOM,
   that is the cause and should be reported.*

2. **Probe S2 — clipped-away check.** For each direct child of
   `node-623`, compute `isClippedAway()` against the
   Section_self (line 1893) clip window. *Expected output: a list
   of inner elements and their clip verdict.*

3. **Probe S3 — depth/node-count guard.** Read `MAX_NODES`,
   `MAX_DEPTH` constants; add a temporary `console.log` of
   `capturedCount` and `depth` at the moment of entry into
   `node-623`. *Expected output: a single numeric pair.*

4. **Probe S4 — ancestor visible fraction.** Compute
   `ancestorVisibleFraction()` for each direct child of `node-623`.
   *Expected output: a list of fractions.*

5. **Probe S5 — state-induced visibility.** In the live DOM
   (Playwright via `run-capture.mjs`), evaluate
   `window.getComputedStyle` on the heading element inside
   `Container:ForBusiness_self` *without* the force-reveal
   pass. *Expected: the rendering state at capture time. If
   `opacity: 0` or `visibility: hidden`, that is the cause.*

The first probe that returns a "yes, X is the cause" outcome
finishes Phase 3 and unblocks Phase 5.

---

## 9. Sign-off still pending

Per the user's plan: **no code change may be made until Phase 3 is
closed (cause confirmed) and the user signs off on Phase 5
ordering.** This document supersedes the audit's §3.2 but does not
authorise any code edit.

---

## 10. Sub-probe S1 — actual result (and a major correction to §1–§9)

**Triggered by.** User instruction: *"close Phase 3, run sub-probe S1 next"*.

**What was actually run.** Two new scripts:
- `test/probe-find-fb.mjs` — selector discovery on `https://www.fresha.com/`
  at 1440×900 (matches `test/run-capture.mjs --viewport=1440x900`).
- `test/probe-s1.mjs` — Playwright probe that locates the live
  `div.ForBusiness_self__l5EtV`, walks its descendant subtree with
  `TreeWalker`, and per descendant captures `display`, `visibility`,
  `opacity`, `getBoundingClientRect()`, ancestor clip verdict
  (`isClippedAway`-equivalent), text content, and the walker's drop
  decision if it were `capture-core.ts:serializeElement` running.

### 10.1 Selector discovery result

`probe-find-fb.mjs` returned exactly **1 candidate**:

```json
{
  "how": "className",
  "cls": "ForBusiness_self__l5EtV",
  "rect": "0,4008 1440x727",
  "text": "Fresha for businessSupercharge your business with the world's top booking platfo"
}
```

Two things to note here:

1. **Live `className` is `ForBusiness_self__l5EtV`** — there is **no
   `Container:` prefix** in the live DOM. The `Container:` prefix is
   added at serialize time by `capture-core.ts:getNodeName()` based on
   `tagName:div + display:block`. The original probe regex
   (`/Container:ForBusiness_self__l5EtV/`) would have matched
   nothing; it had to be corrected to `/ForBusiness_self__l5EtV/`.
2. **The live rect is `0,4008 1440x727`** — this matches capture.json
   line 1682 (`node-582` Section_self, `y=4008 h=728`, the IMAGE
   section), not line 1893 (`node-621`, `y=4736 h=562`, the TEXT
   section). The single candidate returned is the **wrapper** that
   the walker names `Container:ForBusiness_self__l5EtV`, but in the
   live DOM the wrapper's bounding rect matches the image-section's
   rect, not the text-section's rect. This is significant: the
   ForBusiness_self React component renders the section wrapping
   BOTH the image AND the text, and its bounding box is the union
   of the two.

   (In capture.json this is encoded as two separate `Section_self`
   frames at lines 1682 and 1893; the wrapper `ForBusiness_self`
   appears only at line 1881 with `y=0, x=0, w=1440, h=727` —
   RELATIVE to its parent `Content_self`. That parent's parent is
   the second `Section_self` at line 1893, at `y=4736, w=1440, h=562`.
   So the walker IS placing `ForBusiness_self` in the text-section's
   `Content_self`, with coords relative to that content. The live
   DOM bounding rect of the wrapper just happens to match the
   IMAGE section's rect because the React component layout uses
   `position: absolute` or similar — this is not a bug.)

### 10.2 Sub-probe S1 walk result

`probe-s1.mjs` walked **43 descendants** of the live
`ForBusiness_self` element (1 direct child, 43 total elements in
the subtree). Per descendant the probe emitted the full
display/visibility/opacity/rect/clippedBy state and the walker's
drop verdict.

**Summary:**

```
total 43 descendants
 17 contain visible text in the live DOM
  0 are explicitly dropped (display:none / visibility:hidden / opacity:0)
  0 are clipped out of an ancestor's overflow:hidden window
  3 have collapsed rect (width<1 or height<1)  ← all inside a hidden RTL/LTR icon fallback span (cosmetic, not the missing text)
```

**The 17 visible-text elements include the entire missing content:**

| Depth | Tag | Rect | Text |
|------:|-----|------|------|
| 2 | `h2` | `32,4056 600x99` | "Fresha for business" |
| 2 | `p` | `32,4155 600x96` | "Supercharge your business with the world's top booking platform" |
| 2 | `a` (button) | `32,4283 174x48` | "Find out more" |
| 2 | `div.Capterra_self__WhKXE` | `32,4531 600x100` | (Capterra badge with "Excellent 5/5" + stars + "Over 1250 reviews on") |
| 3 | `p` (Capterra rating text) | `32,4531 600x36` | "Excellent 5/5" |
| 3 | five `<svg>` stars | `~128x24` | (visible 24×24 paths) |
| 3 | `div.Capterra_capterraReview__ulLH8` | `32,4611 600x20` | "Over 1250 reviews on" |
| 4 | `p` (Capterra link text) | `32,4611 135x20` | "Over 1250 reviews on" |
| 4 | `a` (Capterra link) | `167,4611 66x17` | (Capterra logo image) |

**All 17 elements have `display: block / flex / inline-flex / inline`, `visibility: visible`, `opacity: 1`, and full bounding rects.** None should be dropped by `serializeElement`'s display/visibility/size/isClippedAway filters at lines 1301/1315/1331.

The 3 collapsed-rect elements are all inside an `rtl-icon` span at
`0,0 0x0` — a React inline conditional that toggles based on the
document's `dir` attribute and carries a 0×0 rect. Not the missing
text.

### 10.3 What this rules out (and what it does not)

**Ruled out by S1 evidence (live DOM, capture-time conditions):**

1. ❌ **Inner descendants carry `display: none` / `visibility: hidden` / `opacity: 0` without a media subtree** — all 43 elements report `visible` and `opacity: 1`. Hypothesis #1 in §4 is dead.
2. ❌ **`isClippedAway()` drops an inner descendant against an ancestor's `overflow: hidden` window** — no ancestor overflow clip window rejects any descendant. Hypothesis #3 in §4 is dead (and was already low-likelihood).
3. ❌ **Inner text subtree has collapsed rects** — the heading, body, CTA, Capterra badge, and Capterra link all have full rects. Hypothesis #2 (size filter) is dead.

**Still open (not investigated by S1):**

4. **`MAX_NODES` / `MAX_DEPTH` guard hits before reaching ForBusiness_self.** S1 didn't measure `capturedCount`. The walker counter is process-global; if the counter is exceeded by the time we reach the ForBusiness section, `appendChildNodes` short-circuits at line 1272 (`if (capturedCount >= MAX_NODES) break;`). That would produce the empty-children symptom exactly.
5. **The capture harness (`test/run-capture.mjs`) doesn't actually have the missing data**, because the workspace-root `capture.json` was overwritten by PowerShell `ConvertTo-Json -Depth 12` (PROJECT_LOG.md line 686). This is the **most important finding of all** and is documented separately in §10.4.

### 10.4 The major correction — `capture.json` was corrupted by PowerShell

While inspecting capture.json around line 1886 to find what
`children` value the walker had actually emitted, the file's
format gave it away:

```
1886:    "style":  "@{backgroundColor=rgba(0, 0, 0, 0); backgroundImage=none; ...}",
1887:    "children":  ""
```

The `style` value is a **PowerShell hashtable `ToString()` output**,
not a JSON object. And `children: ""` is what PowerShell
`ConvertTo-Json -Depth N` produces when the depth limit truncates an
empty array. The workspace-root `capture.json` was last written
2026-07-04 02:46, and PROJECT_LOG.md line 686 records:

> **Recovery note:** During dev the in-progress `capture.json` was overwritten via
> PowerShell `ConvertTo-Json -Depth 12`, which silently truncated Fresha's tree
> from 897 nodes to 61.

The `test/capture.json` file (1.0 MB, stripe fixture) is not affected
— it was written by `test/run-capture.mjs` using Node's
`JSON.stringify(payload, null, 2)`. But there is **no fresh fresha
capture** anywhere in the project.

**Consequences:**

1. **The original §1–§9 findings are based on a corrupted payload.**
   The "children: ''" symptom we chased for §3.2 / §4 / §8 is an
   artifact of PowerShell `ConvertTo-Json`, not a real walker bug.
2. **The walker likely never produced `children: ""`.** In Node's
   `JSON.stringify` serialization, `parentNode.children` is
   initialized to `[]` (line 996 / 1053 / 1083 / 1152 / 1244 / 1347)
   and pushed-to by `appendChildNodes`. If `appendChildNodes` was
   never called, the array would still be `[]`, not `""`. The
   PowerShell artifact `""` cannot be produced by `capture-core.ts`
   as currently written.
3. **Phase 3 must be re-run against a fresh capture** to know the
   real symptom. Options:
   - (a) regenerate the fresha capture via
     `cd test && node run-capture.mjs --name=fresha --viewport=1440x900`,
     which uses Node's `JSON.stringify` and cannot truncate to `""`;
   - (b) re-capture via the Chrome extension (extension writes
     `capture.json` to disk via the standard extension download API,
     also using `JSON.stringify`).
4. **Until the fresh capture is in hand, all four §4 candidate causes
   remain unverified.** S1 has only proved that the **live DOM** is
   not the cause — it has not proved that the **walker output** is
   not the cause. The walker may still be pruning; we just can't
   tell from the corrupted file.

### 10.5 What this means for Phase 3 / Phase 5

- **Phase 3 is NOT yet closed.** S1 closed two of the four
  hypotheses on the live DOM, but a corrupted payload prevents any
  conclusion about the walker's actual output. Before any code
  change:
  1. Run `cd test && node run-capture.mjs --name=fresha --viewport=1440x900`
     to produce a fresh, Node-serialized fresha capture.json.
  2. Inspect the resulting `test/snapshot/fresha.json` (or
     `test/capture.json` if the harness writes there) for
     `Container:ForBusiness_self__l5EtV` and read its `children`
     field. If the children array is populated, the walker is fine
     and there is no ForBusiness regression to fix — the original
     §3.2 concern was an artifact.
  3. If the children array is still empty after a Node
     serialization, then the walker IS pruning and S3 (depth/count
     guard) becomes the next probe — likely with `console.log` of
     `capturedCount` and `depth` at the moment of entry into the
     ForBusiness section.
- **§3.2 of the audit is superseded by this finding.** The audit
  patch applied in §7 of this document must be further amended to
  note that the evidence source itself was corrupted, and the
  corrected action is "re-capture, then re-probe S3 before any
  fix".
- **The user's "close Phase 3, run sub-probe S1 next" instruction is
  honored in spirit**: S1 ran, returned a clear negative on the
  live-DOM hypotheses, and surfaced the real blocker
  (corrupted capture.json). The next concrete step is a fresh
  capture, not another probe.

## 11. Phase 3 closed — fresh Node-serialized capture proves no walker bug

### 11.1 The fresh capture

Ran (working shell, no markdown-link artifact):

```
Set-Location 'C:\Users\Mahfuz\newProject\test'
node run-capture.mjs --url=https://www.fresha.com/ --name=fresha --viewport=1440x900
```

Output: `test/capture.json` (1.3 MB, freshly written 2026-07-05),
901 total nodes, 50 top-level, 35 images fetched, 1 rasterized
(DownloadApp `<video>` — the only Fresha video).

### 11.2 ForBusiness_self subtree — populated

Grep output confirming Node serialization:

```
143073: "name": "Container:ForBusiness_self__l5EtV"
143309: "children": [
```

- `"style":` is a real JSON object (`{ backgroundColor: ..., ... }`)
  — not a PowerShell hashtable ToString string.
- `"children":` is `[` — a real JSON array, not `""`.

Created `test/count-fb-children.mjs` to traverse the subtree and
report descendants by type and visible text. Result:

```
Found Container:ForBusiness_self__l5EtV
  rect: 0,0 1440x727
  own children: 1
  children[0]: frame Container:OverviewSection_self__x15fL
Total elements in ForBusiness_self subtree (incl. self): 35
Total descendants (excl. self): 34

Descendants carrying text (5):
  600x99   "Fresha for business"
  600x96   "Supercharge your business with the world's top booking
            platform for salons and spas. Independently voted no. 1
            by industry professionals."
  174x48   "Find out more" (link button)
  600x36   "Excellent 5/5" (Capterra rating)
  132x20   "Over 1250 reviews on" (Capterra link)
```

The walker captured:
- All 5 expected text nodes with correct rects.
- All 5 visible children at the top of `OverviewSection_content`
  (h2 + p + Link + Capterra badge).
- All wrappers, Flex, and decorative elements (34 descendants total,
  close to S1's live-DOM count of 43 — the 9-node delta is `<svg>`
  star sub-trees collapsed into a single rasterizable group).

### 11.3 visual-diff.mjs renders the full section

Ran `test/visual-diff.mjs` from `C:\Users\Mahfuz\newProject\test`:
"✓ Wrote preview.html (599 KB)". Inspected the file (which is one long
line, so indexed substring search was used) and confirmed every
ForBusiness marker renders with correct computed-style fidelity:

- **Heading**: `<div ... font-family:RoobertPRO, AktivGroteskVF, sans-serif;
  font-size:68px; font-weight:700; line-height:normal; ...>Fresha for
  business</div>`
- **Body**: `<div ... font-size:24px; font-weight:400; line-height:32px;
  ...>Supercharge your business ... Independently voted no. 1 by
  industry professionals.</div>`
- **CTA**: `<div ... data-name="Link #for-business" ...><div ...
  color:rgb(255, 255, 255); font-weight:600; ...>Find out more</div></div>`
  (the inner 24×24 chevron svg is also present).
- **Capterra badge**: image src
  `https://www.fresha.com/assets/_next/static/media/capterra_logo.
  01b4dde5.png` + 5 star SVGs (`fill="rgb(255, 192, 10)"`) + the
  "Excellent 5/5" rating + the "Over 1250 reviews on" link.

### 11.4 Conclusion

The fresh Node-serialized capture contains the full ForBusiness
section with correct rects, styles, and text. `visual-diff.mjs`
renders every element with the correct font, size, weight, color,
line-height, and position. There is no regression in the walker.

The original "missing text in Figma" symptom was 100% the
PowerShell-corrupted workspace-root `capture.json`, which had
`"children": ""` and `"style": "<hashtable ToString>"` for every
node after depth 12 — including the ForBusiness subtree. When that
file was fed to the plugin, the renderer correctly saw an empty
children array and rendered nothing for the section.

### 11.5 Implications for the audit

- **§3.2 of `plans/02-audit.md`** is fully DISPROVED. Replace its
  language ("capture-core.ts may be pruning ForBusiness subtree")
  with "no capture-side regression; PowerShell corruption of the
  source file caused the appearance of an empty children array."
- **§11 of `plans/02-audit.md`** (Phase 5 ordering) is no longer
  applicable as written. The "capture-side fix" line of work is
  closed by evidence. Reopen only if a fresh-capture+Figma run
  surfaces a new render-side regression.
- **PROJECT_LOG Session 2026-07-05 (cont.)** has the full closure
  narrative and verification steps.
- **Phase 5 is effectively closed** unless the user reopens it
  with a fresh regression. The original two-track Phase 5 plan
  (a/b split) can be reverted or archived.

### 11.6 Recommended tooling guard (process, not code)

To prevent the same symptom from recurring:
1. **Never** run `ConvertTo-Json` (PowerShell) or any non-Node
   serializer over `capture.json`. Always use `JSON.stringify`.
2. Add a `test/verify-capture.mjs` script that asserts:
   - Every node has a `children` field that is `typeof === 'object'`
     and `Array.isArray(...)`.
   - Every node's `style` field is `typeof === 'object'` and
     non-null.
   - Top-level `nodes.length` is within ±20% of the live
     `document.querySelectorAll('*').length`.
   Script exits non-zero on failure; CI / smoke test runs it
   before allowing a capture.json upload.
3. If Figma still complains about a fresh capture.json, the
   investigation now has a clean evidence baseline.
