# Branch Restructure — `main` = runnable core, `development` = everything

_Design spec / runbook · 2026-07-05_

## Goal

Split the repository into two branches on `origin` (`git@github.com:gm-rahman/figma-extension.git`):

- **`development`** — the entire current tree plus dev docs. All active work happens here.
- **`main`** (stays GitHub default) — only the files needed to **build and run the full
  application**, so a visitor can clone `main` and run it end-to-end.

Decisions (locked): reshape `main` via a **removal commit** (not orphan/force) · `main`
**stays the default branch** · core changes flow `development → main` via a **documented
sync script**.

## What "runnable core" is

The app is three cooperating packages (source: `PROJECT_LOG.md`, each `package.json`):

| Package | Build / run | Role |
|---|---|---|
| `backend` | `npm ci && npm run dev` → Express on `:3000` | Relay: receives capture, serves it to the plugin |
| `extension` | `npm ci && npm run build` (Vite → `dist/`) → load unpacked in Chrome | Captures the page DOM |
| `figma-plugin` | `npm ci && npm run build` (esbuild via `build.js`) → import in Figma | Rebuilds capture as Figma nodes |

Flow: extension captures → POST backend `:3000` → figma-plugin GETs → builds nodes. **All
three are required.** `node_modules/` and `dist/` are already gitignored; committed
`package-lock.json` files exist in all three packages (CI/install uses `npm ci`).

### Core set — stays on `main`
`backend/` (all) · `extension/` (all) · `figma-plugin/` (all **except `test-stops.cjs`**) ·
`README.md` · `LICENSE` · `.gitignore`

### Excluded — `development` only
`test/` · `graphify-out/` · `.puku/` · `plans/` · `fix/` · `docs/` · `.agents/` ·
`.claude/` · `capture.json` · `PROJECT_LOG.md` · `RASTERIZATION_PLAN.md` ·
`figma-plugin/test-stops.cjs` (standalone unit test, not part of the build)

`figma-plugin/test-stops.cjs` is core-*adjacent* (it sits in a core package) but is a
standalone `node` regression test that mirrors `plugin.ts` logic — it is not imported by
the build, so it is excluded from `main`.

## Runbook

Preconditions: working tree clean except the known `.claude/settings.json` edit (commit or
stash it to `development` first — `.claude/` is excluded from `main` anyway). Current local
`main` = `origin/main` = `7b72879`. The Phase 0 spec currently lives on branch
`phase0-typecheck-gate`.

### Step 1 — Create `development` (full tree + dev docs)

```bash
# phase0-typecheck-gate = main(7b72879) + the Phase 0 spec commit → rename it
git branch -m phase0-typecheck-gate development
git push -u origin development
```

`development` now holds every current file plus `docs/superpowers/specs/`.

### Step 2 — Correct the Phase 0 spec on `development`

The Phase 0 spec (`docs/superpowers/specs/2026-07-05-phase0-typecheck-gate-design.md`)
contains two now-known errors — fix them here:
- Lockfiles **do** exist and are committed → CI uses **`npm ci`**, not `npm install`; drop
  the "no committed lockfiles" claim.
- CI Node version = **24 LTS**.

Commit on `development`.

### Step 3 — Add the sync script on `development`

Create `scripts/sync-main-from-dev.sh` (documented in the README / a short CONTRIBUTING
note). It syncs only the package **code**, never the `main`-owned `README.md` / `LICENSE`
/ `.gitignore`, and drops the excluded `test-stops.cjs`:

```bash
#!/usr/bin/env bash
# Update main from development's core code. Run from a clean tree.
set -euo pipefail
git checkout main
git checkout development -- backend extension figma-plugin
rm -f figma-plugin/test-stops.cjs           # excluded from main
git rm -q --cached --ignore-unmatch figma-plugin/test-stops.cjs 2>/dev/null || true
git add -A
if git diff --cached --quiet; then
  echo "main already up to date with development core."
else
  git commit -m "sync: update main core from development"
  echo "Committed. Review, then: git push origin main"
fi
```

Commit + push `development`.

### Step 4 — Reshape `main` to core (removal commit)

```bash
git checkout main                       # at 7b72879
git rm -r test graphify-out .puku plans fix .agents .claude \
  capture.json PROJECT_LOG.md RASTERIZATION_PLAN.md figma-plugin/test-stops.cjs
```

Then replace the stub `README.md` with a real one (clone → `npm ci` → build/run steps for
all three packages; how they connect on `:3000`). Add the same README to `development` so
both branches carry it.

```bash
git add README.md
git commit -m "chore: reduce main to runnable core; dev tooling lives on development"
git push origin main                    # fast-forward, no force
```

### Step 5 — Confirm default branch

```bash
gh repo edit gm-rahman/figma-extension --default-branch main   # verify/ensure
```

### Step 6 — Verify runnable

From a fresh clone of `main`, in each of `backend`, `extension`, `figma-plugin`:
`npm ci && npm run build` (backend: `npm run build` = tsc). All three must succeed — this
proves no essential file was excluded. (Requires network for `npm ci`; if offline, this
verification is deferred and flagged, not silently skipped.)

## Safety / risks

- **Outward-facing:** every `git push` publishes to GitHub. Pause for explicit user
  go-ahead before the **first** push (Step 1) and before the `main` push (Step 4).
- **Reversible:** the removal commit keeps full history; `git revert` restores files. No
  force-push anywhere.
- **History size:** large old blobs remain in `main`'s history (clones still fetch them).
  Truly slimming history is a separate `filter-repo` task, intentionally out of scope.
- **`.claude/settings.local.json`** is local editor config that ideally shouldn't be
  tracked; it stays off `main`. Cleaning it from `development` is a separate follow-up.

## Success criteria

1. `origin/development` exists and contains the full tree + `docs/` specs + sync script.
2. `origin/main` contains only the core set (three packages minus `test-stops.cjs`, plus
   `README.md` / `LICENSE` / `.gitignore`); `main` is GitHub's default branch.
3. A fresh clone of `main` builds all three packages with `npm ci && npm run build`.
4. `scripts/sync-main-from-dev.sh` exists on `development` and, run against an up-to-date
   tree, reports "already up to date."
5. The Phase 0 spec on `development` says `npm ci` + Node 24 (no "no lockfiles" claim).
