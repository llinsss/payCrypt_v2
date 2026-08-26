#!/usr/bin/env bash
# check-versions.sh — validate that locally-installed toolchain versions match
# the versions pinned in .nvmrc / .tool-versions. Used by CI and locally so a
# mismatch fails fast with the expected and actual values.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATUS=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "[OK]   $name = $actual"
  else
    echo "[MISMATCH] $name: expected '$expected' but found '$actual'" >&2
    STATUS=1
  fi
}

# Node (from .nvmrc)
if command -v node >/dev/null 2>&1; then
  node_expected="$(cat "$REPO_ROOT/.nvmrc" | tr -d '[:space:]')"
  node_actual="$(node --version | sed 's/^v//')"
  check "node" "$node_expected" "$node_actual"
fi

# Parse .tool-versions entries.
if [ -f "$REPO_ROOT/.tool-versions" ]; then
  while read -r plugin version _; do
    [ -z "${plugin:-}" ] && continue
    case "$plugin" in
      nodejs) continue ;; # validated via .nvmrc above
      scarb)
        if command -v scarb >/dev/null 2>&1; then
          check "scarb" "$version" "$(scarb --version | awk '{print $2}')"
        fi ;;
      foundry)
        if command -v forge >/dev/null 2>&1; then
          check "foundry (forge)" "$version" "$(forge --version | head -1 | awk '{print $2}')"
        fi ;;
      cairo)
        if command -v cairo-compile >/dev/null 2>&1; then
          check "cairo" "$version" "$(cairo-compile --version | awk '{print $2}')"
        fi ;;
    esac
  done < "$REPO_ROOT/.tool-versions"
fi

if [ "$STATUS" -eq 0 ]; then
  echo "==> All pinned tool versions match."
else
  echo "==> Version mismatch(es) detected. Install the expected versions (see docs/TOOLING.md)." >&2
fi
exit $STATUS
