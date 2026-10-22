# Malicious Token Test Doubles (Soroban)

Reusable test doubles that emulate hostile or misbehaving SEP-41 / token-like
contracts. They exist so that every value-moving contract in this repo can be
tested against the failure modes it must survive, not just the happy path.

These doubles are intentionally *not* production code. They live in a shared
test-support module so they can be reused across crates instead of being
duplicated per crate.

## Doubles

| Double | Behavior it emulates |
| --- | --- |
| `FailingToken` | `transfer` / `transfer_from` revert unconditionally |
| `ReentrantToken` | invokes a callback into the caller during `transfer` (reentrancy) |
| `FeeOnTransferToken` | deducts a fee so the recipient receives less than the sent amount |
| `PausableToken` | rejects transfers while paused |
| `RevokingToken` | revokes / expires authorization mid-flow |
| `EdgeCaseToken` | returns zero, max, and overflow/negative edge values |

## Behaviors: rejected vs. supported

For each value-moving contract, the table below records whether the contract
**rejects** the malicious behavior (handles it safely) or **supports** it
(allows it through). "Rejected" is the desired outcome for hostile inputs.

| Contract | Failing | Reentrancy | Fee-on-transfer | Paused | Revoked auth | Edge values |
| --- | --- | --- | --- | --- | --- | --- |
| _value-moving contract A_ | rejected | rejected | supported | rejected | rejected | rejected |
| _value-moving contract B_ | rejected | rejected | supported | rejected | rejected | rejected |

> Fill in one row per value-moving contract as its tests are added. A behavior
> is **rejected** when the contract returns an error / leaves state unchanged,
> and **supported** when the contract intentionally accepts it (e.g. a
> fee-on-transfer token is a legitimate token variant, so the contract must
> account for the reduced received amount rather than revert).

## Authorization fixtures

The `auth` module configures the test `Env`'s mocked authorization so tests
state who authorized which call without building `MockAuth` trees by hand.
These helpers only change what the test host reports as signed. They never
bypass a contract's own `require_auth` checks, which still run.

| Helper | Mocked authorization | Expected contract outcome |
| --- | --- | --- |
| `authorize_all` | every `require_auth` succeeds | authorized path proceeds |
| `unauthorized` | no `require_auth` succeeds (`set_auths(&[])`) | rejected with an auth error |
| `authorize_invoke` | one address, for one exact `(contract, fn, args)` | proceeds only for that call |
| `authorize_delegated` | owner signs for a delegate call that sub-invokes one target call | proceeds only for that chain |

Each helper replaces the previous mock set, so call one helper right before
the invocation it covers. Changing the args, target, or function in a test
should make the call fail.

## Usage

Import the doubles from the shared test-support module in each crate's test
suite. Do not copy them into individual crates; extend this module instead so
all crates exercise the same hostile behaviors.
