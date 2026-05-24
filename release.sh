#!/usr/bin/env bash
# release.sh — bump version, tag, push, and watch the GitHub Actions release workflow
#
# Usage:
#   ./release.sh            # auto-bump patch  (0.1.11 → 0.1.12)
#   ./release.sh patch      # same as above
#   ./release.sh minor      # bump minor       (0.1.11 → 0.2.0)
#   ./release.sh major      # bump major       (0.1.11 → 1.0.0)
#   ./release.sh 0.2.5      # exact version

set -euo pipefail

# ── colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { echo -e "${CYAN}▸ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
die()     { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

# ── prereqs ───────────────────────────────────────────────────────────────────
command -v gh   &>/dev/null || die "gh CLI not found — install from https://cli.github.com"
command -v git  &>/dev/null || die "git not found"
command -v node &>/dev/null || die "node not found"

# ── must be run from repo root ────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not inside a git repository"
cd "$REPO_ROOT"

TAURI_CONF="src-tauri/tauri.conf.json"
PKG_JSON="package.json"

[[ -f "$TAURI_CONF" ]] || die "$TAURI_CONF not found"
[[ -f "$PKG_JSON"   ]] || die "$PKG_JSON not found"

# ── read current version ──────────────────────────────────────────────────────
CURRENT=$(node -p "require('./$TAURI_CONF').version")
info "Current version: ${BOLD}$CURRENT"

# ── compute next version ──────────────────────────────────────────────────────
BUMP="${1:-patch}"

bump_version() {
  local cur="$1" part="$2"
  IFS='.' read -r major minor patch <<< "$cur"
  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *)     echo "$part" ;;   # treat as explicit version string
  esac
}

NEXT=$(bump_version "$CURRENT" "$BUMP")

# Validate semver-ish (digits and dots only)
[[ "$NEXT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || die "Invalid version '$NEXT' — must be x.y.z"

TAG="v${NEXT}"

echo ""
echo -e "  ${BOLD}$CURRENT${RESET}  →  ${GREEN}${BOLD}$NEXT${RESET}  (tag: ${CYAN}$TAG${RESET})"
echo ""

# ── confirm ───────────────────────────────────────────────────────────────────
read -r -p "$(echo -e "${YELLOW}Proceed? [y/N] ${RESET}")" CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { warn "Aborted."; exit 0; }

# ── check for uncommitted changes ────────────────────────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "You have uncommitted changes. They will be included in the version bump commit."
  read -r -p "$(echo -e "${YELLOW}Continue anyway? [y/N] ${RESET}")" OK
  [[ "$OK" =~ ^[Yy]$ ]] || { warn "Aborted."; exit 0; }
fi

# ── tag must not already exist ────────────────────────────────────────────────
if git rev-parse "$TAG" &>/dev/null; then
  die "Tag $TAG already exists. Delete it first: git tag -d $TAG && git push origin :$TAG"
fi

# ── bump versions in files ────────────────────────────────────────────────────
info "Bumping version in $TAURI_CONF and $PKG_JSON …"

node - "$TAURI_CONF" "$NEXT" <<'JS'
const fs = require('fs'), [,, file, ver] = process.argv
const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
obj.version = ver
fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n')
JS

node - "$PKG_JSON" "$NEXT" <<'JS'
const fs = require('fs'), [,, file, ver] = process.argv
const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
obj.version = ver
fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n')
JS

success "Version files updated"

# ── commit, tag, push ─────────────────────────────────────────────────────────
info "Committing version bump …"
git add "$TAURI_CONF" "$PKG_JSON"
git commit -m "chore: bump version to $NEXT"

info "Creating tag $TAG …"
git tag "$TAG"

info "Pushing branch + tag …"
git push origin HEAD
git push origin "$TAG"

success "Tag $TAG pushed"

# ── watch the workflow ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Waiting for GitHub Actions workflow to start…${RESET}"

# Give GH a few seconds to register the tag event
sleep 5

# Find the run triggered by this tag
RUN_ID=""
for i in $(seq 1 20); do
  RUN_ID=$(gh run list \
    --workflow release.yml \
    --limit 5 \
    --json headBranch,databaseId,status \
    --jq ".[] | select(.headBranch == \"$TAG\") | .databaseId" 2>/dev/null | head -1)
  if [[ -n "$RUN_ID" ]]; then
    break
  fi
  echo -n "."
  sleep 3
done
echo ""

if [[ -z "$RUN_ID" ]]; then
  warn "Could not find workflow run for tag $TAG after 60s."
  warn "Check manually: gh run list --workflow release.yml"
  warn "Or watch the release at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$TAG"
  exit 0
fi

success "Found workflow run #$RUN_ID"
echo ""
echo -e "${CYAN}Streaming logs (Ctrl+C to detach — workflow keeps running):${RESET}"
echo ""

gh run watch "$RUN_ID" --exit-status && \
  echo -e "\n${GREEN}${BOLD}Release $TAG succeeded!${RESET}" || \
  echo -e "\n${RED}${BOLD}Release $TAG failed — check: gh run view $RUN_ID --log-failed${RESET}"

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo ""
echo -e "  Release: ${CYAN}https://github.com/$REPO/releases/tag/$TAG${RESET}"
