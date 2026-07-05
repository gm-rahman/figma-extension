# Phase 0 — Type-check Gate ("Stop the Bleeding")

_Design spec · 2026-07-05 · Source: `fix/tech-debt-audit.md` items #1 (extension fails `tsc`) + #2 (no CI)._

## Problem

`extension/` is the largest, most fidelity-critical package (`capture-core.ts` alone
is 1,678 lines), yet it **has never been type-checked in the build**. Vite (esbuild)
strips types without checking them, so `strict: true` in `extension/tsconfig.json` is
aspirational. Running `tsc --noEmit` surfaces **51 real errors** hiding behind a green
build. With no CI, nothing stops these — or new ones — from accumulating.

This is a rendering-fidelity tool where "looks slightly wrong" _is_ the bug. Every
fidelity fix currently risks silently breaking another with no type gate and no
automated check. Phase 0 buys a safety net cheaply.

### Verified current state (2026-07-05)

| Package | `tsc --noEmit` result |
|---|---|
| `extension` | **51 errors** |
| `figma-plugin` | 0 errors |
| `backend` | 0 errors |

The 51 `extension` errors break into three root causes:

| Cause | Count | Where | Fix |
|---|---|---|---|
| `chrome` name/namespace not found (`TS2304`/`TS2503`) | 40 | `background.ts`, `content.ts`, `popup.ts` | add `@types/chrome` |
| Implicit-`any` callback params (`TS7006`) | 9 | `background.ts:230 (r)`, `background.ts:302 (msg/sender/sendResponse)`, `content.ts:95/136/263`, `popup.ts:85` | mostly resolved by `@types/chrome`; annotate any residual |
| `DOMRectList` not iterable (`TS2488`) | 2 | `capture-core.ts:820`, `:1022` | add `DOM.Iterable` to `lib` |

(40 + 9 + 2 = 51.)

Other confirmed facts:
- **No `.github/` directory** — CI is greenfield.
- **No root `package.json`** — the three packages are independent; CI installs deps per package.
- **Committed lockfiles exist** in all three packages (`package-lock.json`) — CI uses `npm ci`.
- The `test/` visual-diff harness (`run-capture.mjs`) is **informational, not enforcing**:
  its only `process.exit(1)` is for page-load failure; a structural diff is merely
  printed. It also compares pixel-precise `x/y/width/height` against a **Windows-generated**
  snapshot, so it is not cross-platform-deterministic. It is therefore **not** used as a
  CI gate in Phase 0.

## Goal / Non-goals

**Goal:** `extension/` compiles cleanly under `tsc`; every package exposes a uniform
`typecheck` command; a CI gate prevents type errors from silently returning. **No runtime
behavior changes.**

**Non-goals (deferred to later phases):** the 198 `as any` casts, 36 empty `catch {}`,
repo de-bloat (~40 MB committed artifacts), god-file splits, unit tests, and turning the
visual-diff harness into a real gate.

## Design

### 1. Fix the 51 `extension` errors (root cause, not suppression)

- Add `@types/chrome` to `extension/devDependencies`. Supplies the `chrome.*` namespace
  and types the `sendMessage` / `sendCommand` / `onMessage` callbacks — which also clears
  most implicit-`any` params.
- Add `"DOM.Iterable"` to `lib` in `extension/tsconfig.json`:
  `"lib": ["ES2020", "DOM", "DOM.Iterable"]`. Fixes the two `DOMRectList` iteration errors.
- For any implicit-`any` params that survive after the above, add a **minimal explicit
  type annotation** to that parameter only. No logic is changed.

**Acceptance:** `npx tsc --noEmit` in `extension/` → **0 errors**, and `npm run build`
(Vite) still succeeds with no change in emitted behavior.

### 2. Uniform `typecheck` script

Add `"typecheck": "tsc --noEmit"` to the `scripts` of `extension`, `figma-plugin`, and
`backend` `package.json`. Single command that both CI and developers invoke. `backend`
keeps its existing emitting `"build": "tsc"`.

### 3. CI workflow — `.github/workflows/typecheck.yml`

- **Triggers:** `pull_request` and `push` to `main`.
- **Runner:** `ubuntu-latest` (tsc is OS-agnostic; safe cross-platform — unlike the
  visual-diff test).
- **Node:** 24 LTS via `actions/setup-node`.
- **Matrix** over `[extension, figma-plugin, backend]`. Each job:
  1. `cd` into the package directory
  2. `npm ci`
  3. `npm run typecheck`
- tsc's native non-zero exit fails the job, which fails the check.
- **Lockfiles:** committed `package-lock.json` present in each package → CI uses `npm ci`
  (reproducible). Adding `@types/chrome` to `extension` requires regenerating and
  committing its lockfile.

### 4. Error handling / risks

- CI fails loudly on any type error (tsc exits non-zero natively).
- **Network dependency:** installing `@types/chrome` requires network access — locally as
  well as in CI. If the local environment is offline, this step blocks until connectivity
  is available. (The audit noted `npm audit` could not run offline.)
- The `test/` visual-diff harness is **not touched**.

### 5. Verification plan

- **Local:** `npm run typecheck` is green in all three packages; `npm run build` is green
  in `extension` and `figma-plugin`.
- **CI:** push a branch and confirm the workflow runs green; temporarily inject a type
  error to confirm the check goes **red**, then revert.

## Files touched

| File | Change |
|---|---|
| `extension/tsconfig.json` | add `DOM.Iterable` to `lib` |
| `extension/package.json` | add `@types/chrome` devDep + `typecheck` script |
| `extension/src/*.ts` | minimal explicit annotations only if residual implicit-`any` remains |
| `figma-plugin/package.json` | add `typecheck` script |
| `backend/package.json` | add `typecheck` script |
| `.github/workflows/typecheck.yml` | new — matrix tsc gate |

## Success criteria

1. `npx tsc --noEmit` returns 0 errors in `extension`, `figma-plugin`, and `backend`.
2. `npm run typecheck` exists and passes in all three packages.
3. `npm run build` still succeeds in `extension` and `figma-plugin` (no runtime change).
4. `.github/workflows/typecheck.yml` runs on PRs, passes when types are clean, and fails
   when a type error is introduced.
