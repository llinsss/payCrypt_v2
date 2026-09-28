# Changelog

All notable changes to Tagged will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Rust/Soroban SDK typed contract errors: a typed `ContractError` enum with
  deterministic `From`/`TryFrom` conversions, stable numeric codes, and
  serialization for cross-contract and SDK boundaries (#838).
- Actionable error classification (`ErrorClass`) distinguishing success,
  boundary, unauthorized, replay, and failure paths, plus cancellation-aware
  handling for in-flight contract calls (#838).
- Unit, property, and local-network tests covering success, boundary,
  unauthorized, replay, and failure paths for the typed contract errors (#838).
- Rust/Soroban SDK pagination iterators: typed cursor- and page-based
  iterators with deterministic cursor validation and page-bound checks (#840).
- Serialization and backward-compatibility guarantees for pagination
  requests, responses, and cursors, including cancellation semantics for
  in-flight iteration and actionable pagination error classification
  (invalid cursor, unauthorized, replay, transient/network, exhausted) (#840).
- Unit, property, and local-network tests covering success, boundary,
  unauthorized, replay, and failure paths for the pagination iterators (#840).

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
