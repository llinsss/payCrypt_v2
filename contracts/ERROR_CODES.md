# Contract Error Code Registry

This file is the registry of numeric error codes returned by the Rust/Soroban
contracts. The `#[repr(u32)]` discriminants in each `#[contracterror]` enum are
the source of truth; this file records who owns each number and must match the
source.

## Ownership and scope

- **Each contract crate owns its own code namespace.** Codes start at `1` in every
  contract, so the same number means different things in different contracts
  (for example `1` is `NotInitialized` in `tag-contract` and `AlreadyInitialized`
  in `wallet`). SDKs must key errors by contract ID and code, never by code alone.
- **Only crates with a `Cargo.toml` are registered below.** Source files that are
  not declared as a module, and enums in directories without a manifest, are not
  part of the external interface and are not listed here.
- **The crate's maintainers own its table.** A change to a `#[contracterror]` enum
  must update its table in this file in the same change.

## Rules

1. **Never renumber.** A released variant keeps its discriminant for the life of
   the contract.
2. **Append only.** New variants take the next unused value. Do not insert
   variants between existing values.
3. **Never reuse a retired value.** If a variant is removed, its value is recorded
   under "Retired" below and is never assigned to another variant in that crate.
4. **Names are documentation, values are the ABI.** Renaming a variant without
   changing its value is allowed only if the table here is updated in the same
   change.

## Registered crates

### `escrow` (`contracts/escrow`) — BLOCKED

`contracts/escrow/src/lib.rs` contains two conflicting numberings for the escrow
error codes, and the crate does not compile as written. The `EscrowError` header
is missing before the block that defines codes `5`–`16`, which is a parse error.
The variants used in the crate are not all defined by the complete `EscrowError`
block (`1`–`10`).

Until the escrow owners pick the released numbering, this crate has no registered
codes. Candidate blocks found in the source:

| Block | Codes |
|-------|-------|
| `EscrowError` (complete enum) | `NotInitialized = 1`, `Unauthorized = 2`, `EscrowNotFound = 3`, `InvalidState = 4`, `AlreadyCancelled = 5`, `ExtensionLimitReached = 6`, `InvalidExtension = 7`, `DeadlineOverflow = 8`, `AmountExceedsRemaining = 9`, `AlreadyInitialized = 10` |
| Orphan fragment (no enum header) | `InvalidAmount = 5`, `AssetMismatch = 6`, `MetadataTooLong = 7`, `InvalidMetadata = 8`, `NotCreated = 9`, `ExtensionTooLong = 10`, `TooManyExtensions = 11`, `DeadlineOverflow = 12`, `NotExpired = 13`, `AlreadyCancelled = 14`, `ExtensionLimitReached = 15`, `InvalidExtension = 16` |

The escrow README lists a third numbering, which matches neither block.

### `tag-contract` (`contracts/tag`) — `TagError`

| Code | Name |
|------|------|
| 1 | `NotInitialized` |
| 2 | `AlreadyInitialized` |
| 3 | `Unauthorized` |
| 4 | `NoPendingTransfer` |
| 5 | `InvalidTagName` |

`contracts/tag/src/transfer.rs` defines a `TransferError` enum but is not declared
as a module in `lib.rs`, so it is not part of the registry.

### `tag_registry` (`contracts/tag_registry`) — `RegistryError`

| Code | Name |
|------|------|
| 1 | `InvalidTag` |
| 2 | `TagAlreadyRegistered` |
| 3 | `TagNotRegistered` |
| 4 | `NotTagOwner` |
| 5 | `InvalidAddress` |
| 6 | `TagReserved` |

### `upgrade_manager` (`contracts/upgrade_manager`) — `UpgradeError`

| Code | Name |
|------|------|
| 1 | `NotInitialized` |
| 2 | `AlreadyInitialized` |
| 3 | `Unauthorized` |
| 4 | `UnknownVersion` |
| 5 | `InvalidState` |
| 6 | `UnauthorizedImplementation` |
| 7 | `DuplicateVersion` |
| 8 | `NoRollbackTarget` |
| 9 | `InvalidRollbackTarget` |
| 10 | `RollbackReasonTooLong` |
| 11 | `InvalidImplementation` |
| 12 | `ProposalExpired` |

### `wallet` (`contracts/wallet`) — `WalletError`

| Code | Name |
|------|------|
| 1 | `AlreadyInitialized` |
| 2 | `NotInitialized` |
| 3 | `Unauthorized` |
| 4 | `ZeroAmount` |
| 5 | `ReentrancyDetected` |
| 6 | `InsufficientBalance` |
| 7 | `LimitExceeded` |
| 8 | `NoPendingLimit` |
| 9 | `LimitDelayNotElapsed` |
| 10 | `NoPendingRouter` |
| 11 | `RouterDelayNotElapsed` |
| 12 | `NoRecoveryRouter` |
| 13 | `RecoveryDelayNotElapsed` |
| 14 | `Paused` |

`contracts/wallet/src/error.rs` defines a second, incompatible `WalletError` but is
not declared as a module, so it is not registered.

### `wallet-contract` (`contracts/soroban/wallet-contract`) — `WalletError`

This crate's `WalletError` shares a name with the `wallet` crate's enum but uses a
different numbering. Match on the contract, not the name.

| Code | Name |
|------|------|
| 1 | `AlreadyInitialized` |
| 2 | `NotInitialized` |
| 3 | `InvalidThreshold` |
| 4 | `DuplicateSigner` |
| 5 | `UnknownSigner` |
| 6 | `LastSigner` |
| 7 | `UnsupportedToken` |
| 8 | `InvalidWithdrawal` |
| 9 | `DestinationNotAllowed` |
| 10 | `UnknownProposal` |
| 11 | `DuplicateApproval` |
| 12 | `InsufficientApprovals` |
| 13 | `StaleProposal` |
| 14 | `ProposalExecuted` |
| 15 | `Unauthorized` |
| 16 | `ReentrancyDetected` |
| 17 | `InvalidRotation` |
| 18 | `ProposalExpired` |
| 19 | `ApprovalNotFound` |
| 20 | `InsufficientAvailableBalance` |
| 21 | `ProposalNotExpired` |
| 22 | `ProposalReleased` |

## Not registered

These enums live in source trees without a `Cargo.toml` in this repository, so they
are not built as contracts. They should not be relied on by SDKs until a manifest
and an entry here exist:

- `contracts/payment/src/lib.rs` (`PaymentError`, `Error` in `error.rs`)
- `contracts/registry/src/lib.rs` (`RegistryError`). It also references variants
  (`NotFound`, `AlreadyRegistered`) its enum does not define.
- `contracts/tag_owner/src/lib.rs` (`Error`) and `contracts/tag_owner/src/errors.rs`
  (`TagOwnerError`)

## Retired

None recorded.
