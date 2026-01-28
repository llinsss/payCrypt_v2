# STELLAR CONTRIBUTIONS

This folder contains open-source contributions for Tagged's Stellar blockchain integration.

## Purpose
Enable community developers to contribute to Tagged's Stellar ecosystem while maintaining security and control over the core platform.

## Structure

### `taggedpay-stellar-backend/`
NestJS backend API for Stellar blockchain integration:
- @tag resolution on Stellar network
- Account creation and management
- Payment processing
- Transaction history
- Balance queries

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Basic knowledge of Stellar blockchain

### Setup
```bash
cd "STELLAR CONTRIBUTIONS/taggedpay-stellar-backend"
npm install
npm run start:dev
```

### API Endpoints (Planned)
```
POST /api/v1/accounts          # Create Stellar account with @tag
GET  /api/v1/accounts/:tag     # Get account info by @tag
POST /api/v1/payments          # Send payment between @tags
GET  /api/v1/balances/:tag     # Get account balances
POST /api/v1/tags/register     # Register new @tag
GET  /api/v1/transactions/:tag # Get transaction history
```

## Contribution Guidelines

### What You Can Contribute
✅ Stellar blockchain integrations  
✅ API endpoint improvements  
✅ Documentation and examples  
✅ Testing and bug fixes  
✅ Performance optimizations  

### What's Protected
❌ Core Tagged business logic  
❌ User authentication systems  
❌ KYC/compliance features  
❌ Main application codebase  

## Development Roadmap

### Phase 1: Core Infrastructure
- [ ] Stellar SDK integration
- [ ] @tag resolution system
- [ ] Basic account management
- [ ] Payment processing

### Phase 2: Advanced Features
- [ ] Multi-asset support
- [ ] Transaction batching
- [ ] Webhook system
- [ ] Rate limiting

### Phase 3: Developer Tools
- [ ] SDK documentation
- [ ] Integration examples
- [ ] Testing utilities
- [ ] Performance monitoring

## Tech Stack
- **Backend**: NestJS + TypeScript
- **Blockchain**: Stellar SDK
- **Database**: PostgreSQL (planned)
- **Testing**: Jest
- **Documentation**: Swagger/OpenAPI

## Community
- **Issues**: Report bugs and request features
- **Discussions**: Share ideas and ask questions
- **Pull Requests**: Submit your contributions

---

**Note**: This is a controlled open-source environment. All contributions are reviewed by the Tagged team before merging.