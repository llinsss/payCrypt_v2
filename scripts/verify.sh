#!/usr/bin/env bash
# verify.sh — canonical full-repository verification path for payCrypt_v2.
#
# Usage:
#   bash scripts/verify.sh build   # build every supported component
#   bash scripts/verify.sh test    # test every supported component
#
# Each supported component is built/tested in a defined order. When a component
# fails, the script prints the component name and the exact command that failed
# before exiting non-zero, so a CI failure (or a local one) identifies the
# culprit immediately. This is the single command developers and CI share.
set -uo pipefail

MODE="${1:-build}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> payCrypt_v2 verification (mode: $MODE)"

if [ "$MODE" = "build" ]; then
  COMPONENTS=(
    "frontend|cd '$REPO_ROOT' && npm run build"
    "backend|cd '$REPO_ROOT/backend' && npm run build"
    "solidity-contracts|cd '$REPO_ROOT/contracts/solidity_contract' && forge build"
    "starknet-contracts|cd '$REPO_ROOT/contracts/starknet_contract' && scarb build"
  )
elif [ "$MODE" = "test" ]; then
  COMPONENTS=(
    "frontend-lint|cd '$REPO_ROOT' && npm run lint"
    "frontend-typecheck|cd '$REPO_ROOT' && npm run type-check"
    "backend-tests|cd '$REPO_ROOT/backend' && npm test"
    "solidity-tests|cd '$REPO_ROOT/contracts/solidity_contract' && forge test"
  )
else
  echo "Unknown mode: '$MODE' (expected 'build' or 'test')" >&2
  exit 2
fi

STATUS=0
for entry in "${COMPONENTS[@]}"; do
  name="${entry%%|*}"
  cmd="${entry#*|}"
  echo "------------------------------------------------------------"
  echo "==> [$name] $cmd"
  if eval "$cmd"; then
    echo "    [OK] $name"
  else
    echo "    [FAIL] $name (command: $cmd)" >&2
    STATUS=1
  fi
done

echo "------------------------------------------------------------"
if [ "$STATUS" -eq 0 ]; then
  echo "==> All components passed ($MODE)."
else
  echo "==> One or more components FAILED ($MODE). See [FAIL] lines above." >&2
fi
exit $STATUS
