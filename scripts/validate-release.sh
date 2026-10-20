#!/usr/bin/env bash
# Release validation for all Rust contract WASM files.
#
# Verifies that every expected contract crate has a built WASM artifact and
# that each artifact exposes a valid Soroban contract spec. Fails with
# actionable messages when a crate or artifact is missing.
#
# Usage:
#   scripts/validate-release.sh [--target-dir <dir>] [--contracts-dir <dir>]
#
# Exit codes:
#   0  all expected contracts validated
#   1  one or more contracts failed validation
#   2  invalid invocation / missing tooling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONTRACTS_DIR="${REPO_ROOT}/contracts"
TARGET_DIR="${REPO_ROOT}/target/wasm32-unknown-unknown/release"

# Expected contract crates. Keep in sync with the workspace members that
# produce deployable WASM artifacts.
EXPECTED_CONTRACTS=(
  "token"
  "escrow"
  "registry"
)

usage() {
  cat <<'EOF'
Usage: scripts/validate-release.sh [options]

Options:
  --contracts-dir <dir>  Directory containing contract crates (default: <repo>/contracts)
  --target-dir <dir>     Directory containing built WASM artifacts
                         (default: <repo>/target/wasm32-unknown-unknown/release)
  -h, --help             Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --contracts-dir)
      CONTRACTS_DIR="$2"
      shift 2
      ;;
    --target-dir)
      TARGET_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v stellar >/dev/null 2>&1; then
  echo "error: 'stellar' CLI not found in PATH; required to validate contract specs" >&2
  echo "       install it from https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli" >&2
  exit 2
fi

failures=0

fail() {
  echo "error: $*" >&2
  failures=$((failures + 1))
}

for contract in "${EXPECTED_CONTRACTS[@]}"; do
  crate_dir="${CONTRACTS_DIR}/${contract}"
  wasm_path="${TARGET_DIR}/${contract}.wasm"

  if [[ ! -d "${crate_dir}" ]]; then
    fail "missing contract crate '${contract}' (expected directory: ${crate_dir})"
    continue
  fi

  if [[ ! -f "${wasm_path}" ]]; then
    fail "missing WASM artifact for '${contract}' (expected: ${wasm_path}); build with 'cargo build --release --target wasm32-unknown-unknown -p ${contract}'"
    continue
  fi

  if [[ ! -s "${wasm_path}" ]]; then
    fail "empty WASM artifact for '${contract}' at ${wasm_path}; rebuild the contract"
    continue
  fi

  if ! spec_output="$(stellar contract info interface --wasm "${wasm_path}" 2>&1)"; then
    fail "invalid contract spec for '${contract}' (${wasm_path}): ${spec_output}"
    continue
  fi

  if [[ -z "${spec_output//[[:space:]]/}" ]]; then
    fail "contract spec for '${contract}' is empty (${wasm_path}); ensure the contract exports #[contractimpl]"
    continue
  fi

  echo "ok: ${contract} (${wasm_path})"
done

if [[ ${failures} -gt 0 ]]; then
  echo "release validation failed: ${failures} contract(s) did not pass" >&2
  exit 1
fi

echo "release validation passed: ${#EXPECTED_CONTRACTS[@]} contract(s) validated"
