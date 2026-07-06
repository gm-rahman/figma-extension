# Branch Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This is a git-operations plan, not a code-feature plan.** "Tests" here are verification commands with expected output. Several steps push to GitHub and are **hard approval gates** — do not run them without explicit user go-ahead.

**Goal:** Split the repo into `development` (the full tree + tooling/docs) and a reshaped `main` that contains only the files needed to build and run the application, with `main` as GitHub's default.

**Architecture:** `development` already exists locally at `f5fc12d` (full tree + both specs). We finish all `development`-side edits (Phase 0 spec fix, real README, sync script), push `development`, then reshape `main` from `7b72879` with a single **removal commit** (history-preserving, no force-push) and push it. A documented sync script carries future core changes `development → main`.

**Tech Stack:** git, GitHub (`gh` CLI), Node 24 LTS + npm (`npm ci`), bash.

## Status — ✅ COMPLETE (verified 2026-07-05)

All nine tasks are done.

- **Tasks 1–4** (`development`-side edits) — committed on `development`: `.claude` settings
  (`a663201`), Phase 0 spec fix (`33b9781`), README (`269969f`), sync script (`678f260`).
- **Tasks 5–8** (push `development`, reshape + push `main`, set default branch) — found
  **already satisfied on `origin` from an earlier session**, so they were **re-verified
  against the remote, not re-executed**. The STOP/approval-gate steps were therefore moot
  (nothing new was pushed). Verified: `origin/development` @ `678f260`; `origin/main` @
  `8009c39` with a core-only tree (`.gitignore`, `LICENSE`, `README.md`, `backend`,
  `extension`, `figma-plugin`; no `test-stops.cjs`); GitHub default branch = `main`
  (via `git ls-remote --symref origin HEAD` — `gh` was unauthenticated but not required).
- **Task 9** — executed here: a throwaway worktree of `main` built all three packages
  cleanly (`backend` tsc → `dist/`, `extension` Vite → `dist/`, `figma-plugin` esbuild →
  `dist/`), proving no essential file was mis-excluded. `main` is runnable-core-complete.

## Global Constraints

- **Remote:** `git@github.com:gm-rahman/figma-extension.git` (`origin`). Do not add remotes.
- **Approval gates:** STOP and get explicit user approval before **every** `git push` (Tasks 5, 7) and before `gh repo edit --default-branch` (Task 8). Never run these autonomously.
- **No force-push anywhere.** `main` is reshaped with an additive removal commit that preserves history.
- **Package manager:** `npm ci` — all three packages have a committed `package-lock.json`.
- **Node:** 24 LTS (used in the corrected Phase 0 spec and the README).
- **Core set (must remain on `main`), verbatim:** `backend/` (all) · `extension/` (all) · `figma-plugin/` (all **except `test-stops.cjs`**) · `README.md` · `LICENSE` · `.gitignore`.
- **Excluded from `main` (development-only), verbatim:** `test/` · `graphify-out/` · `.puku/` · `plans/` · `fix/` · `docs/` · `.agents/` · `.claude/` · `capture.json` · `PROJECT_LOG.md` · `RASTERIZATION_PLAN.md` · `figma-plugin/test-stops.cjs`.
- **Start state (as planned):** current branch `development` = `f5fc12d`; `main` = `7b72879` tracking `origin/main`; nothing pushed to `origin` yet. _(Note: by the time execution resumed, `development` and the reshaped `main` had already been pushed — see Status above.)_

---

### Task 1: Clean the working tree

There is a pending edit to `.claude/settings.json` (present since the session start). `.claude/` is development-only, so commit it here to get a clean tree before branch switching.

**Files:**
- Modify/commit: `.claude/settings.json`

- [x] **Step 1: Inspect the pending change**

Run: `git status --short && git diff -- .claude/settings.json`
Expected: shows `.claude/settings.json` as modified (` M .claude/settings.json`).

- [x] **Step 2: Decide and stage**

If the change is wanted (default), commit it to `development`:

```bash
git add .claude/settings.json
git commit -m "chore: commit local .claude settings (development-only)"
```

If the change is unwanted, discard instead: `git checkout -- .claude/settings.json`

- [x] **Step 3: Verify clean tree**

Run: `git status --short`
Expected: empty output (no modifications).

---

### Task 2: Correct the Phase 0 spec (npm ci, Node 24, lockfiles exist)

The Phase 0 spec was written before we discovered committed lockfiles. Fix the three inaccuracies.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-05-phase0-typecheck-gate-design.md`

- [x] **Step 1: Fix the "no lockfiles" fact**

Replace:
```
- **No committed lockfiles** — so `npm install`, not `npm ci`.
```
with:
```
- **Committed lockfiles exist** in all three packages (`package-lock.json`) — CI uses `npm ci`.
```

- [x] **Step 2: Fix the CI Node version**

Replace:
```
- **Node:** 20 LTS via `actions/setup-node`.
```
with:
```
- **Node:** 24 LTS via `actions/setup-node`.
```

- [x] **Step 3: Fix the matrix install command**

Replace the matrix step line:
```
  2. `npm install`
```
with:
```
  2. `npm ci`
```

- [x] **Step 4: Fix the Lockfiles bullet**

Replace:
```
- **Lockfiles:** none committed → `npm install` (not `npm ci`). Committing lockfiles for
  reproducible installs is noted as an optional future improvement, deferred.
```
with:
```
- **Lockfiles:** committed `package-lock.json` present in each package → CI uses `npm ci`
  (reproducible). Adding `@types/chrome` to `extension` requires regenerating and
  committing its lockfile.
```

- [x] **Step 5: Verify no stale references remain**

Run: `grep -nE "npm install|20 LTS|no committed lockfiles" docs/superpowers/specs/2026-07-05-phase0-typecheck-gate-design.md`
Expected: no output (exit code 1).

- [x] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-07-05-phase0-typecheck-gate-design.md
git commit -m "docs: correct Phase 0 spec (lockfiles exist -> npm ci; Node 24)"
```

---

### Task 3: Write the real README on `development`

Replace the stub `# figma-extension` with a runnable README. It becomes `main`'s showcase README (pulled onto `main` in Task 6) and also lives on `development`.

**Files:**
- Modify: `README.md`

- [x] **Step 1: Write the README**

Write `README.md` with exactly this content:

```markdown
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
```

- [x] **Step 2: Verify it is no longer the stub**

Run: `head -1 README.md`
Expected: `# HTML → Figma`

- [x] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: real README with build/run instructions for all three packages"
```

---

### Task 4: Add the sync script on `development`

**Files:**
- Create: `scripts/sync-main-from-dev.sh`

- [x] **Step 1: Create the script**

Write `scripts/sync-main-from-dev.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# Update main from development's core code. Run from a clean tree on development.
# Syncs only package code; never touches main-owned README.md / LICENSE / .gitignore.
set -euo pipefail

git checkout main
git checkout development -- backend extension figma-plugin
rm -f figma-plugin/test-stops.cjs                                   # excluded from main
git rm -q --cached --ignore-unmatch figma-plugin/test-stops.cjs 2>/dev/null || true
git add -A
if git diff --cached --quiet; then
  echo "main already up to date with development core."
else
  git commit -m "sync: update main core from development"
  echo "Committed. Review, then: git push origin main"
fi
```

- [x] **Step 2: Make it executable and syntax-check it**

```bash
chmod +x scripts/sync-main-from-dev.sh
bash -n scripts/sync-main-from-dev.sh
```
Expected: no output from `bash -n` (valid syntax). Do **not** run the script yet — Task 6 does the first reshape manually.

- [x] **Step 3: Commit**

```bash
git add scripts/sync-main-from-dev.sh
git commit -m "chore: add sync-main-from-dev script"
```

---

### Task 5: Push `development` to origin — APPROVAL GATE

**Files:** none (remote ref only)

- [x] **Step 1: STOP — request explicit user approval**

This publishes the `development` branch to GitHub. Do not proceed until the user explicitly says to push.

- [x] **Step 2: Confirm what will be pushed**

Run: `git log --oneline origin/main..development`
Expected: the four/five `development` commits (phase0 spec, branch-restructure spec, .claude settings, phase0 correction, README, sync script) — none unexpected.

- [x] **Step 3: Push**

```bash
git push -u origin development
```

- [x] **Step 4: Verify**

Run: `git branch -vv`
Expected: `development` shows `[origin/development]` tracking.

---

### Task 6: Reshape `main` to core (removal commit)

**Files:**
- Modify (branch tree): remove all excluded paths; pull real `README.md` from `development`.

- [x] **Step 1: Switch to main and confirm base**

```bash
git checkout main
git rev-parse HEAD
```
Expected: `7b72879...` (matches `origin/main`).

- [x] **Step 2: Remove non-core paths**

```bash
git rm -r test graphify-out .puku plans fix .agents .claude \
  capture.json PROJECT_LOG.md RASTERIZATION_PLAN.md figma-plugin/test-stops.cjs
```
Expected: git lists each removed path. (`docs/` and `scripts/` do not exist on `main`, so they are not listed — correct.)

- [x] **Step 3: Bring the real README onto main**

```bash
git checkout development -- README.md
```

- [x] **Step 4: Verify the tree is core-only**

List the top-level entries that remain and confirm no excluded paths:
```bash
git ls-files | sed 's#/.*##' | sort -u
```
Expected exactly: `.gitignore`, `LICENSE`, `README.md`, `backend`, `extension`, `figma-plugin`.

Run: `git ls-files figma-plugin | grep test-stops.cjs`
Expected: no output (exit 1) — `test-stops.cjs` is gone.

- [x] **Step 5: Commit the reshape**

```bash
git add -A
git commit -m "chore: reduce main to runnable core; dev tooling lives on development"
```

---

### Task 7: Push `main` to origin — APPROVAL GATE

**Files:** none (remote ref only)

- [x] **Step 1: STOP — request explicit user approval**

This publishes the reshaped `main` (a fast-forward, no force). Do not proceed until the user explicitly says to push.

- [x] **Step 2: Confirm it is a fast-forward**

Run: `git log --oneline origin/main..main`
Expected: exactly one new commit — the reshape. (If more/fewer, stop and investigate.)

- [x] **Step 3: Push**

```bash
git push origin main
```

- [x] **Step 4: Verify remote main tree**

Run: `git ls-tree -r --name-only origin/main | sed 's#/.*##' | sort -u`
Expected: `.gitignore`, `LICENSE`, `README.md`, `backend`, `extension`, `figma-plugin`.

---

### Task 8: Confirm GitHub default branch = `main` — APPROVAL GATE (conditional)

**Files:** none (GitHub repo setting)

- [x] **Step 1: Check current default**

Run: `gh repo view gm-rahman/figma-extension --json defaultBranchRef -q .defaultBranchRef.name`
Expected: `main`. If it already prints `main`, this task is done — skip the remaining steps.

- [x] **Step 2: STOP — request approval only if a change is needed**

If Step 1 did not print `main`, request explicit user approval, then run:
```bash
gh repo edit gm-rahman/figma-extension --default-branch main
```

- [x] **Step 3: Verify**

Run: `gh repo view gm-rahman/figma-extension --json defaultBranchRef -q .defaultBranchRef.name`
Expected: `main`.

---

### Task 9: Verify `main` is actually runnable

Prove nothing essential was excluded by building all three packages from a clean checkout of `main`.

**Files:** none (throwaway clone)

- [x] **Step 1: Fresh checkout of main into a temp dir**

```bash
TMP="${CLAUDE_JOB_DIR:-/tmp}/main-verify"
rm -rf "$TMP" && git clone -b main --single-branch "$(git remote get-url origin)" "$TMP"
```
(If offline / push not yet done, substitute a local worktree: `git worktree add "$TMP" main`.)

- [x] **Step 2: Build backend**

```bash
cd "$TMP/backend" && npm ci && npm run build
```
Expected: `tsc` completes, `dist/` produced, exit 0.

- [x] **Step 3: Build extension**

```bash
cd "$TMP/extension" && npm ci && npm run build
```
Expected: Vite build succeeds, `dist/` produced, exit 0.

- [x] **Step 4: Build figma-plugin**

```bash
cd "$TMP/figma-plugin" && npm ci && npm run build
```
Expected: esbuild (via `build.js`) succeeds, `dist/` produced, exit 0.

- [x] **Step 5: Report**

All three builds pass → `main` is runnable-core-complete. If any build fails on a missing file, that file was mis-excluded: add it to the core set, amend Task 6, and re-verify. If offline blocks `npm ci`, report that this verification was deferred (do not claim it passed).

---

## Self-Review

**Spec coverage** (against `2026-07-05-branch-restructure-design.md`):
- Create `development` (full tree + docs) → exists at start; finalized + pushed in Tasks 1–5. ✓
- Correct Phase 0 spec → Task 2. ✓
- Sync script → Task 4. ✓
- Reshape `main` via removal commit → Task 6. ✓
- Real README → Task 3 (written) + Task 6 (pulled onto main). ✓
- Default branch = main → Task 8. ✓
- Verify runnable → Task 9. ✓
- Safety (approval gates, no force-push) → Global Constraints + Tasks 5, 7, 8. ✓

**Placeholder scan:** no TBD/TODO; README and sync-script content given in full; every verification step has an exact command + expected output. ✓

**Consistency:** excluded/core path lists are identical across Global Constraints, Task 6, and the sync script (`test-stops.cjs` excluded everywhere; README/LICENSE/.gitignore never synced by the script since main owns them). ✓
