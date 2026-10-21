#!/usr/bin/env bash
# Wallet interface compatibility check.
#
# Compares the exported interface of the built wallet contract against the
# committed fixture: function names, ordered input names, output counts and
# WalletError codes. Parameter types are not compared; a type change must
# update the fixture in the same reviewed change.
#
# Usage:
#   scripts/check-wallet-interface.sh [--wasm <path>] [--fixture <path>]
#
# Exit codes:
#   0  interface matches the fixture
#   1  interface drifted from the fixture
#   2  invalid invocation / missing tooling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

WASM_PATH="${REPO_ROOT}/target/wasm32-unknown-unknown/release/wallet_contract.wasm"
FIXTURE_PATH="${REPO_ROOT}/contracts/soroban/wallet-contract/fixtures/interface.v1.json"

usage() {
  cat <<'EOF'
Usage: scripts/check-wallet-interface.sh [options]

Options:
  --wasm <path>     Built wallet contract WASM
                    (default: <repo>/target/wasm32-unknown-unknown/release/wallet_contract.wasm)
  --fixture <path>  Committed interface fixture
                    (default: <repo>/contracts/soroban/wallet-contract/fixtures/interface.v1.json)
  -h, --help        Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wasm)
      WASM_PATH="$2"
      shift 2
      ;;
    --fixture)
      FIXTURE_PATH="$2"
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

for tool in soroban jq; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "error: '${tool}' not found in PATH; required to read the wallet contract interface" >&2
    exit 2
  fi
done

if [[ ! -s "${WASM_PATH}" ]]; then
  echo "error: missing or empty WASM artifact: ${WASM_PATH}; build with 'cargo build --release --target wasm32-unknown-unknown -p wallet-contract'" >&2
  exit 2
fi

if [[ ! -f "${FIXTURE_PATH}" ]]; then
  echo "error: missing interface fixture: ${FIXTURE_PATH}" >&2
  exit 2
fi

# Reduces the spec entries to an order-independent summary. The CLI may print
# entries as one JSON array or as one JSON value per line, so slurp and flatten.
summary_filter='
  [.[] | if type == "array" then .[] else . end] as $entries
  | {
      functions: ([$entries[] | .function_v0? | select(. != null)
                   | {name, inputs: [.inputs[].name], outputs: (.outputs | length)}]
                 | sort_by(.name)),
      errors: ([$entries[] | .udt_error_enum_v0? | select(. != null) | .cases[]
                | {name, value}]
               | sort_by(.value))
    }
'

actual="$(mktemp)"
expected="$(mktemp)"
trap 'rm -f "${actual}" "${expected}"' EXIT

if ! spec_json="$(soroban contract info interface --wasm "${WASM_PATH}" --output json 2>&1)"; then
  echo "error: failed to read contract interface from ${WASM_PATH}: ${spec_json}" >&2
  exit 1
fi

printf '%s\n' "${spec_json}" | jq -s -S "${summary_filter}" > "${actual}"
jq -S . "${FIXTURE_PATH}" > "${expected}"

if ! diff -u "${expected}" "${actual}"; then
  echo "error: wallet contract interface drifted from ${FIXTURE_PATH}" >&2
  echo "       if the change is intentional, update the fixture in the same change" >&2
  exit 1
fi

echo "ok: wallet contract interface matches ${FIXTURE_PATH}"
