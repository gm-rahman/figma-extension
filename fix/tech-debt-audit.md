# Tech-Debt Audit — `html-to-figma`

_Scope: `extension/` + `figma-plugin/` + `backend/` + `test/`_
_Date: 2026-07-05 · Method: verified against the repo (tsc runs, `git ls-files`, grep counts) — not estimated._

---

## Health snapshot

| Signal | Value | Verdict |
|---|---|---|
| Type-check status | figma-plugin ✅ 0 · backend ✅ 0 · **extension ❌ 51 errors** | Extension doesn't compile under `tsc` |
| `strict: true` | All 3 packages | Set, but **unenforced on extension** (Vite/esbuild transpile only) |
| `as any` casts | **198** (~190 lines in `capture-core.ts` alone) | Heavy |
| CI | **None** (`.github/workflows` absent) | No gate |
| Unit tests | **0** (only a Playwright visual-diff harness) | Refactors are unguarded |
| Debt markers (TODO/FIXME) | 0 | Clean |
| Empty `catch {}` | 36 | Silent failures |
| Docs | PROJECT_LOG, README, RASTERIZATION_PLAN, plans/ | **Strong** — low doc debt |
| Committed generated artifacts | **55 files** (~40 MB: `.puku/*.db`, graphify caches, 15 MB snapshots) | Repo bloat |

---

## Prioritized backlog

Score = **(Impact + Risk) × (6 − Effort)**, each 1–5 (effort inverted). Ranked high → low.

| # | Item | Category | I | R | E | **Score** | Rough effort |
|---|---|---|---|---|---|---|---|
| 1 | **Extension fails `tsc`** — missing `@types/chrome`, `DOMRectList` lib, implicit-any callbacks; build never type-checks | Code/Infra | 4 | 4 | 2 | **32** | 0.5–1 day |
| 2 | **No CI** — nothing runs `tsc` or the visual-diff test | Infra | 3 | 4 | 2 | **28** | 0.5 day |
| 3 | **Generated artifacts in git** — `.puku/*.db` (11 MB), `graphify-out/cache`, 15 MB snapshots, root `capture.json`, `test/tmp/*.png` | Infra | 3 | 2 | 2 | **20** | 0.5 day |
| 4 | **Duplicated logic** — in-flow reveal test ×3 (content/run-capture/core), dominant-style block ×2 | Code | 2 | 3 | 2 | **20** | 0.5 day |
| 5 | **36 empty `catch {}`** — dropped layers/SVGs vanish with no signal | Code | 2 | 3 | 3 | **15** | 1 day |
| 6 | **198 `as any`** — type safety eroded, concentrated in `capture-core.ts` | Code | 3 | 3 | 4 | **12** | 2–4 days |
| 7 | **No unit tests** — only end-to-end visual diff; blocks safe refactor of #6/#8 | Test | 3 | 3 | 4 | **12** | 3–5 days |
| 8 | **15 one-off probe scripts** committed (`probe-*`, `bin-gaps*`, `inspect-*`, `sample-*`) — only 3 of 18 `.mjs` are wired to npm | Test | 1 | 1 | 1 | **10** | 1 hr |
| 9 | **God files/functions** — `capture-core.ts` 1678 L, `plugin.ts` 1158 L, `serializeElement` ~360 L | Architecture | 4 | 3 | 5 | **7** | 1–2 wks |

**Dependency debt: low.** express 4.18, vite 5, esbuild 0.20/0.21, playwright 1.45 — all current-ish, nothing abandoned. (Couldn't run `npm audit` offline — worth a one-time check.)

---

## Headline finding (#1 + #2 together)

`extension/` is the largest, most fidelity-critical package (`capture-core.ts` alone is 1,678 lines), and **it has never been type-checked in the build** — Vite/esbuild strip types without checking. Proof:

```
src/background.ts(8,1):   error TS2304: Cannot find name 'chrome'.        ← ×~40
src/background.ts(302,44):error TS7006: Parameter 'sender' implicitly has an 'any' type.
src/capture-core.ts(820,21): error TS2488: DOMRectList must have a [Symbol.iterator]()
```

`strict: true` in `extension/tsconfig.json` is aspirational — 51 real errors sit behind a green build. This is why #1 and #2 are the top two: they're cheap (~1 day combined) and they _stop the bleeding_ so the deeper items (#6, #9) don't keep regressing.

---

## Phased remediation (alongside feature work)

### Phase 0 — Stop the bleeding (~1.5 days, do first)
- Add `@types/chrome` + `"lib": ["ES2020","DOM","DOM.Iterable"]`; fix the 51 errors (mostly the two shown above). Add `"typecheck": "tsc --noEmit"` to each package.
- Add a minimal GitHub Actions workflow: `tsc --noEmit` on all 3 packages + `test/` visual diff on PR. Now #1 can't silently return.

### Phase 1 — De-bloat & de-dupe (~1.5 days, one afternoon each)
- `.gitignore` += `.puku/`, `graphify-out/`, `test/tmp/`, root `capture.json`; `git rm --cached` them (item 3). Decide snapshot policy (Git LFS or regenerate-on-demand) for the 15 MB `test/*.json`.
- Extract the triplicated in-flow reveal test and the duplicated dominant-descendant style block into shared helpers (item 4 — also closes finding #4 from the earlier code review). Delete the 15 dead probe scripts (item 8).

### Phase 2 — Type & error hardening (opportunistic, ~1 wk spread out)
- Replace `as any` cluster-by-cluster as you touch `capture-core.ts`; give the empty catches a `debugLog(...)` so dropped layers leave a trace (items 5, 6).

### Phase 3 — Structural (only after Phase 0's test gate exists, ~1–2 wks)
- Split `serializeElement` into per-concern helpers (text/image/svg/frame), and carve `capture-core.ts` / `plugin.ts` into modules (item 9). Gate every extraction on the visual-diff harness + new unit tests (item 7).

---

## Business justification (one line)

This is a rendering-fidelity tool where "looks slightly wrong" _is_ the bug — yet the biggest package has no type gate and no automated test in CI, so every fidelity fix risks silently breaking another (the code review already found duplicated blocks drifting inside `serializeElement`). Phase 0 buys a safety net for ~1 day of work.
