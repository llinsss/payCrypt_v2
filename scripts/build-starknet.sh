#!/usr/bin/env bash
# build-starknet.sh — build the Cairo/Starknet contracts with a project/CI-owned
# cache so the build never depends on the host's global registry cache or any
# GUI registry-repair service.
#
# Key points (see issue #511):
#   * XDG_CACHE_HOME points Scarb's cache at a directory we own (defaults to
#     <repo>/.cache/scarb), keeping it fully under CI control.
#   * `--locked` resolves dependencies from the committed Scarb.lock, separating
#     dependency resolution (logged up front) from compilation.
#   * On a build failure we assume possible cache corruption, wipe the cache, and
#     retry once — without involving any host GUI service.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="$REPO_ROOT/contracts/starknet_contract"
CACHE_DIR="${SCARB_CACHE_DIR:-$REPO_ROOT/.cache/scarb}"
export XDG_CACHE_HOME="$CACHE_DIR"
export SCARB_TARGET_DIR="${SCARB_TARGET_DIR:-$REPO_ROOT/target/starknet}"

build() {
  echo "==> [dependency resolution] using Scarb.lock"
  (cd "$CONTRACT_DIR" && scarb build --locked)
}

echo "==> Starknet build (cache dir: $CACHE_DIR)"

if build; then
  echo "==> [compilation] Starknet build succeeded."
  exit 0
fi

echo "==> Build failed; attempting cache-corruption recovery (remove cache, retry)..." >&2
rm -rf "$CACHE_DIR"

if build; then
  echo "==> Starknet build succeeded after cache recovery."
  exit 0
fi

echo "==> Starknet build failed after cache recovery." >&2
exit 1
