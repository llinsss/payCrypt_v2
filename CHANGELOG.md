# Changelog

All notable changes to Tagged will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Rust/Soroban SDK transaction preparation API with typed request/response
  types, deterministic validation and serialization, cancellation of in-flight
  preparation, and actionable error classification (#839).
- Rust/Soroban SDK network configuration types with typed network id, RPC and
  Horizon endpoints, network passphrase, timeouts, retry/cancellation settings,
  deterministic validation and serialization, and actionable error
  classification (#841).
- Rust/Soroban SDK cancellation support with typed request/acknowledge/status
  APIs, deterministic validation and serialization, compatibility handling, and
  actionable error classification for unauthorized, replay, not-found and
  already-cancelled failures (#843).

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
