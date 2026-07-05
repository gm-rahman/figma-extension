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
