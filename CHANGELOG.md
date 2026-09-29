# Changelog

All notable changes to Tagged will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Tag ownership recovery and governance policy (#720). Recovery is a
governance-gated process, separate from ordinary user-controlled transfer,
and requires a mandatory delay plus supporting evidence before it can
execute.
- Rust/Soroban SDK examples for end-to-end payments: typed APIs for building,
signing, submitting, and confirming Soroban payment transactions, with
deterministic (canonical) serialization of payment intents and results,
cancellation of in-flight operations, and typed, actionable error
classification (validation, unauthorized, replay/duplicate, network,
contract, timeout) (#849).
- Rust SDK event decoding compatibility tests: typed decoding of Soroban
contract events into the canonical payment model with deterministic
validation, plus unit/property tests covering success, boundary,
unauthorized, replay, and failure paths, and actionable classification of
decoding errors (#850).
- Rust SDK mock transport and contract clients: typed contract client APIs
with deterministic request/response serialization and compatibility
handling, an in-memory mock transport for deterministic local testing, and
cancellation-aware transport/client layers with actionable error
classification (validation, unauthorized, replay/duplicate, transport,
contract, timeout). Includes unit/property/local-network tests covering
success, boundary, unauthorized, replay, and failure paths, plus migration,
indexing, monitoring, and rollback notes (#851).
- Rust/Soroban contract documentation generation with pinned toolchain and
  dependency inputs, deterministic artifact identity (content hashing and
  versioning), pre-generation environment validation, release approval, and
  documented rollback behavior (#868).
- Rust/Soroban contract changelog policy defining pinned inputs, artifact
  identity, environment validation, release approval, and rollback for
  contract releases (#869).
- Operator runbooks for Rust/Soroban contract failures covering pinned inputs,
  artifact identity, environment validation, release approval, and rollback,
  with deterministic validation and tests for success, boundary, unauthorized,
  replay, and failure paths (#871).

### Security
- Circuit breaker inspection and reset endpoints are now restricted to
  authenticated admins, resets are rate-limited, and successful resets are
  written to the audit log (#553).

## [1.0.0] - 2024-02-21

### Added
- Multi-chain support (Ethereum, Base, Starknet, Core, Flow, Lisk, U2U, Stellar)
- @tag-based payment system
- KYC integration
- Bank withdrawal functionality
- Real-time balance updates
- QR code generation for payments
- Transaction history and filtering
- Mobile-responsive design
- Stellar payment integration
- U2U Network integration
- Smart wallet creation on-chain
- ERC-20 token support

### Changed
- Rebranded from TaggedPay to Tagged
- Improved transaction validation
- Enhanced error handling
- Optimized database queries

### Fixed
- Duplicate function definitions in Transaction model
- Variable declaration conflicts in controllers
- Package.json syntax errors
- Build configuration issues

### Security
- Added input sanitization
- Implemented rate limiting
- Enhanced JWT authentication
- Added SQL injection prevention

## [0.1.0] - Initial Release

### Added
- Basic payment functionality
- User authentication
- Database setup
- API endpoints
