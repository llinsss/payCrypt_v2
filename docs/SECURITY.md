# Security Configuration

This document describes the HTTP security header configuration and PII encryption
practices implemented in the Tagged backend (issues #458, #459, #460).

---

## HTTP Security Headers (Issue #458)

The backend uses the [`helmet`](https://helmetjs.github.io/) middleware configured
to OWASP recommendations for financial APIs. A custom middleware layer additionally
sets `Permissions-Policy`.

### Headers Configured

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests` | Restricts resource origins; prevents XSS and data injection |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years; eligible for HSTS preload list |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Cross-Origin-Opener-Policy` | `same-origin` | Prevents cross-origin window attacks |
| `Cross-Origin-Resource-Policy` | `same-origin` | Blocks cross-origin reads of API responses |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Requires CORP for sub-resources |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=(), usb=()` | Restricts sensitive browser features |

### Targeting A+ on securityheaders.com

The above configuration is designed to achieve an **A+** rating when tested against
[securityheaders.com](https://securityheaders.com). To verify:

1. Deploy the backend behind HTTPS (HSTS is only evaluated over HTTPS).
2. Submit the API base URL to securityheaders.com.

---

## PII Encryption at Rest (Issue #459)

Sensitive personally identifiable information (PII) is encrypted with **AES-256-GCM**
at the application layer before it is written to the database.

### Encrypted Fields

| Table | Column |
|-------|--------|
| `users` | `phone_number` |
| `kyc` | `bvn`, `nin`, `phone_number`, `document_number`, `account_number` |
| `bank_accounts` | `account_number` |

### Implementation

- **Algorithm**: AES-256-GCM (authenticated encryption — confidentiality + integrity)
- **Key size**: 256 bits (32 bytes)
- **IV**: 12-byte random IV generated fresh for every encryption operation
- **Auth tag**: 16-byte GCM authentication tag validated on every decryption
- **Encoding**: `<iv_hex>:<authTag_hex>:<ciphertext_hex>` stored as a single string

### Key Management

The encryption key is read from the `ENCRYPTION_KEY` environment variable:

```bash
# Generate a secure key
openssl rand -hex 32
```

**Requirements:**
- Must be a 64-character hex string (32 bytes)
- Must **never** be committed to source control
- Should be stored in AWS Secrets Manager, HashiCorp Vault, or equivalent
- Key rotation requires a re-encryption migration

### Decryption

Decryption is transparent at the model layer (`backend/models/`). The `decrypt()`
helper in `backend/utils/encryption.js` is called automatically when reading PII
fields — consumers of the models receive plaintext values.

### Migration

The migration `20260730000001_encrypt_pii_fields.js` encrypts any existing plaintext
records in the database. It is safe to re-run (already-encrypted rows are detected
by `isEncrypted()` and skipped).

---

## NDPR / GDPR Compliance (Issue #460)

### Data Export — `POST /api/account/data-export`

Users can request a full JSON export of all their personal data:
- Profile information
- KYC records
- Bank account details (account number decrypted for the export)
- Transaction history
- Audit logs

The export is assembled synchronously and delivered as a one-time download link
via email (valid for 24 hours).

### Account Deletion — `DELETE /api/account`

Initiates a **soft deletion** with a 30-day grace period:

1. PII fields are **anonymised immediately** (email, tag, phone_number, KYC data)
2. Scheduled payments are cancelled; API keys are revoked
3. Account is flagged `pending_deletion` with a `scheduled_deletion_at` timestamp
4. Cancellation email is sent with a unique token link
5. After 30 days, account is eligible for permanent purge

Financial transaction records are **preserved** for regulatory and audit purposes.

### Cancellation — `POST /api/account/cancel-deletion?token=<token>`

Users can reverse a deletion request within the 30-day grace period using the
token included in the deletion confirmation email.

### Audit Trail

All data export requests, deletion initiations, and cancellations are logged
in the `audit_logs` table with `action` values:
- `data_export_requested`
- `account_deletion_initiated`
- `account_deletion_cancelled`
