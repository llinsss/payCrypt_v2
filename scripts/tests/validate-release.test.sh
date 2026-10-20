#!/usr/bin/env bash
# Tests for scripts/validate-release.sh (issue #1010).
#
# Covers success, authorization (missing artifact / missing crate), boundary
# (empty artifact set, extra artifacts) and failure (spec validation) cases.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VALIDATOR="$REPO_ROOT/scripts/validate-release.sh"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); printf 'ok   - %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL - %s\n' "$1"; }

assert_ok() {
  local name="$1"; shift
  if "$@" >/tmp/validate-release.out 2>&1; then
    pass "$name"
  else
    fail "$name"
    sed 's/^/    /' /tmp/validate-release.out
  fi
}

assert_fails_with() {
  local name="$1" expected="$2"; shift 2
  if "$@" >/tmp/validate-release.out 2>&1; then
    fail "$name (expected failure, got success)"
    return
  fi
  if grep -qF -- "$expected" /tmp/validate-release.out; then
    pass "$name"
  else
    fail "$name (missing message: $expected)"
    sed 's/^/    /' /tmp/validate-release.out
  fi
}

# Build a throwaway workspace with the expected contract layout.
make_fixture() {
  local root
  root="$(mktemp -d)"
  mkdir -p "$root/contracts/token" "$root/contracts/vault" "$root/target/wasm32-unknown-unknown/release"
  printf 'name = "token"\n' >"$root/contracts/token/Cargo.toml"
  printf 'name = "vault"\n' >"$root/contracts/vault/Cargo.toml"
  printf 'wasm' >"$root/target/wasm32-unknown-unknown/release/token.wasm"
  printf 'wasm' >"$root/target/wasm32-unknown-unknown/release/vault.wasm"
  printf 'token\nvault\n' >"$root/contracts/expected.txt"
  printf '%s' "$root"
}

if [[ ! -x "$VALIDATOR" ]]; then
  fail "validator script exists and is executable ($VALIDATOR)"
  printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
  exit 1
fi

# --- success ---------------------------------------------------------------
fixture="$(make_fixture)"
assert_ok "all expected artifacts present" "$VALIDATOR" --root "$fixture"
rm -rf "$fixture"

# --- authorization: missing artifact --------------------------------------
fixture="$(make_fixture)"
rm -f "$fixture/target/wasm32-unknown-unknown/release/vault.wasm"
assert_fails_with "missing wasm artifact is reported" "vault" "$VALIDATOR" --root "$fixture"
rm -rf "$fixture"

# --- authorization: missing crate -----------------------------------------
fixture="$(make_fixture)"
rm -rf "$fixture/contracts/vault"
assert_fails_with "missing crate is reported" "vault" "$VALIDATOR" --root "$fixture"
rm -rf "$fixture"

# --- boundary: empty expected set -----------------------------------------
fixture="$(make_fixture)"
: >"$fixture/contracts/expected.txt"
assert_fails_with "empty expected set is rejected" "expected" "$VALIDATOR" --root "$fixture"
rm -rf "$fixture"

# --- boundary: extra artifacts are tolerated ------------------------------
fixture="$(make_fixture)"
printf 'wasm' >"$fixture/target/wasm32-unknown-unknown/release/extra.wasm"
assert_ok "extra artifacts do not fail validation" "$VALIDATOR" --root "$fixture"
rm -rf "$fixture"

# --- failure: spec validation ---------------------------------------------
fixture="$(make_fixture)"
printf 'name = "token"\n' >"$fixture/contracts/token/Cargo.toml"
printf 'not a spec' >"$fixture/contracts/token/spec.json"
assert_fails_with "invalid contract spec is reported" "spec" "$VALIDATOR" --root "$fixture"
rm -rf "$fixture"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
