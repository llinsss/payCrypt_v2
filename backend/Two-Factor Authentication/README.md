# NestJS TOTP Two-Factor Authentication

Complete implementation of TOTP-based 2FA with QR codes, backup codes, and rate limiting.

## Features

- ✅ TOTP secret generation with QR codes
- ✅ 6-digit code verification with 60s time drift tolerance
- ✅ 10 single-use backup codes for account recovery
- ✅ Rate limiting (5 attempts per 15 minutes)
- ✅ Secure password verification for sensitive operations
- ✅ Complete test coverage

## Installation

```bash
npm install
```

## Database Setup

Run the migration to add 2FA columns to users table:

```bash
npm run migration:run
```

## API Endpoints

### 1. Enable 2FA - Generate QR Code

```http
POST /api/auth/2fa/enable
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "user_password"
}
```

Response:

```json
{
  "message": "Scan QR code with authenticator app",
  "qrCode": "data:image/png;base64,...",
  "secret": "JBSWY3DPEHPK3PXP"
}
```

### 2. Verify TOTP Code - Complete 2FA Setup

```http
POST /api/auth/2fa/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "user_password",
  "token": "123456"
}
```

Response:

```json
{
  "message": "2FA enabled successfully",
  "backupCodes": [
    "ABCD1234",
    "EFGH5678",
    ...
  ]
}
```

### 3. Disable 2FA

```http
POST /api/auth/2fa/disable
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "user_password",
  "token": "123456"
}
```

### 4. Regenerate Backup Codes

```http
GET /api/auth/2fa/backup-codes
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "user_password"
}
```

## Login with 2FA

When 2FA is enabled, include the TOTP token in login requests:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password",
  "twoFactorToken": "123456"
}
```

Or use a backup code:

```json
{
  "email": "user@example.com",
  "password": "password",
  "backupCode": "ABCD1234"
}
```

## Setup Guide

1. User enables 2FA by calling `/api/auth/2fa/enable`
2. User scans QR code with Google Authenticator or Authy
3. User verifies setup by calling `/api/auth/2fa/verify` with a 6-digit code
4. System returns 10 backup codes - user must save these securely
5. Future logins require TOTP code or backup code

## Security Features

- Rate limiting prevents brute force attacks (5 attempts per 15 minutes)
- Backup codes are single-use and hashed
- Password verification required for sensitive operations
- Time drift tolerance of 60 seconds for TOTP codes
- Indexed database queries for 2FA-enabled users

## Testing

```bash
npm test
```

## Environment Variables

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=nestjs_2fa
```

## Dependencies

- `speakeasy` - TOTP generation and verification
- `qrcode` - QR code generation
- `bcrypt` - Password and backup code hashing
- `@nestjs/throttler` - Rate limiting
