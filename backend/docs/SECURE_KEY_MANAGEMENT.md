# Secure Key Management for Scheduled Payments

## Overview

Private keys for scheduled payments are stored securely using encrypted vault storage. Keys are never exposed in plaintext in logs, configuration files, or over the network.

## Architecture

### Key Storage

- **Encryption**: AES-256-GCM (Authenticated Encryption)
- **Master Key**: Stored in `KEY_VAULT_MASTER_KEY` environment variable (64-character hex string)
- **Storage Location**: File-based vault (`data/key-vault.json`) or custom path via `KEY_VAULT_STORAGE_PATH`
- **Key Format**: Stella secret keys (S-prefixed, 56 characters)

### Key Lifecycle

1. **Storage**: User secrets are encrypted with a data key, which is then encrypted with the master key
2. **Retrieval**: Only decrypted in-memory during payment execution via `KeyVaultService.withUserSecrets()`
3. **Cleanup**: Secrets are automatically zeroed out after the callback completes
4. **Audit**: Every key access is logged to `audit_logs` table with user ID and action details

## Implementation Details

### KeyVaultService API

```javascript
// Store user's signing key
await KeyVaultService.storeUserSecrets(userId, { 
  secret: 'S...', 
  additionalSigningKeys: ['S...'] 
});

// Safely retrieve and use secrets (auto-cleanup)
await KeyVaultService.withUserSecrets(userId, async (secrets) => {
  // secrets[0] is the primary signing key
  // Use for transaction signing
  // Automatically cleared after callback
});

// Get secrets (manual cleanup required)
const secrets = await KeyVaultService.getUserSecrets(userId);
secrets.fill(null); // Manual cleanup

// Delete all secrets for a user
await KeyVaultService.deleteUserSecrets(userId);
```

### Scheduler Integration

The scheduled payment executor retrieves secrets securely:

```javascript
await KeyVaultService.withUserSecrets(payment.user_id, async (secrets) => {
  // Log key access for audit trail
  await AuditLog.create({
    userId: payment.user_id,
    action: "key_accessed",
    resource: "scheduled_payment",
    resourceId: payment.id,
    // ... other details
  });

  // Use signing key for payment
  const signingKey = secrets[0];
  await PaymentService.processPayment({
    // ... payload with signing key
    signingKey: signingKey,
  });
  
  // Secrets automatically cleared here
});
```

## Environment Configuration

**Required environment variables:**

```bash
# Master key for encryption/decryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
KEY_VAULT_MASTER_KEY=<64-character-hex-string>

# Optional: Custom vault file location (defaults to data/key-vault.json)
KEY_VAULT_STORAGE_PATH=/path/to/key-vault.json
```

## Audit Logging

Every key access is logged with:

- `action`: `key_accessed` or `key_access_failed`
- `resource`: `scheduled_payment`
- `resource_id`: Payment ID
- `user_id`: The user whose key was accessed
- `details`: Payment metadata (amount, recipient, etc.)
- `timestamp`: When the access occurred

**Query audit logs:**

```javascript
const logs = await AuditLog.query({
  userId: 123,
  action: 'key_accessed',
  resource: 'scheduled_payment',
  limit: 100,
});
```

## Security Guarantees

✓ Private keys are encrypted at rest using AES-256-GCM  
✓ Keys are only decrypted in-memory during payment execution  
✓ Decrypted keys are automatically cleared after use  
✓ All key accesses are audited and logged  
✓ Keys are never exposed in error messages or logs  
✓ Master key rotation is possible (would require re-encrypting vault)  

## Non-Custodial vs Custodial Wallets

### Non-Custodial
User stores their own signing key in the vault. The scheduler retrieves it for transaction signing.

### Custodial
System signing authority is used instead of user keys. Vault may store alternative credentials.

## Production Checklist

- [ ] Set `KEY_VAULT_MASTER_KEY` in production environment
- [ ] Ensure `data/key-vault.json` is not version controlled
- [ ] Configure file permissions: `600` (user read/write only)
- [ ] Set up regular backups of vault file
- [ ] Monitor audit logs for suspicious key access patterns
- [ ] Test key rotation procedure
- [ ] Document disaster recovery plan for vault loss

## Troubleshooting

**"No signing keys registered for this user"**
- User hasn't registered their signing key yet
- Use `/api/v1/keys/register` endpoint to register

**"KEY_VAULT_MASTER_KEY must be a 64-character hex string"**
- Master key is missing or wrong format
- Generate new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Ensure it's exactly 64 hex characters (32 bytes)

**Vault file not found**
- Default location is `./data/key-vault.json`
- Ensure `data/` directory exists with proper permissions
- Or set `KEY_VAULT_STORAGE_PATH` to custom location
