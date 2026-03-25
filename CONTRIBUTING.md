# Contributing to Tagged

Thank you for your interest in contributing to Tagged! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 14
- Redis >= 6

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/llinsss/payCrypt_v2.git
   cd payCrypt_v2
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   npm install
   
   # Backend
   cd backend
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Frontend
   cp .env.example .env
   
   # Backend
   cd backend
   cp .env.example .env
   ```

4. **Set up database**
   ```bash
   cd backend
   npm run migrate
   ```

5. **Start development servers**
   ```bash
   # Terminal 1: Frontend
   npm run dev
   
   # Terminal 2: Backend
   cd backend
   npm run dev
   ```

## Code Standards

### JavaScript/TypeScript
- Use ES6+ features
- Follow ESLint configuration
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

### Commits
- Use conventional commit messages:
  - `feat:` New features
  - `fix:` Bug fixes
  - `docs:` Documentation changes
  - `style:` Code style changes
  - `refactor:` Code refactoring
  - `test:` Test additions/changes
  - `chore:` Build/tooling changes

### Pull Requests
1. Create a feature branch from `master`
2. Make your changes
3. Write/update tests
4. Ensure all tests pass
5. Update documentation
6. Submit PR with clear description

## Project Structure

```
payCrypt_v2/
├── backend/          # Node.js/Express API
├── src/              # React frontend
├── contracts/        # Smart contracts
├── packages/         # Shared packages
└── docs/            # Documentation
```

## Testing

```bash
# Frontend
npm run test

# Backend
cd backend
npm run test
```

## Questions?

- Open an issue for bugs
- Start a discussion for questions
- Check existing documentation

## License

By contributing, you agree that your contributions will be licensed under the project's license.
