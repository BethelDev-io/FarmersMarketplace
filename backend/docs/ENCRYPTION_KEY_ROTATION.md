# Encryption Key Rotation Guide

## Overview

Custodial Stellar seed phrases stored in `users.stellar_mnemonic` are encrypted at rest using AES-256-GCM. This document describes how to rotate the encryption key when needed (e.g., key compromise, operator departure, security policy requirements).

## When to Rotate Keys

- An operator with access to `ENCRYPTION_SECRET` leaves the team
- Suspected or confirmed key compromise
- Regular security policy requirements (e.g., annual rotation)
- Compliance requirements

## Key Rotation Process

### Prerequisites

- Database backup (always backup before rotation!)
- Access to production environment variables
- Node.js environment with all dependencies installed

### Step 1: Backup

```bash
# Create a database backup
node backend/scripts/backup.js
```

### Step 2: Set Environment Variables

Set both the current and new encryption keys:

```bash
# Keep the current key as OLD
export ENCRYPTION_SECRET_OLD="<current-encryption-secret>"

# Set the new key as current
export ENCRYPTION_SECRET="<new-encryption-secret-generate-strong-random-value>"
```

**Important:** Generate a strong random value for the new key:
```bash
# Example: generate a 32-byte random key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 3: Test with Dry Run

Run the rotation script in dry-run mode to verify everything works:

```bash
cd backend
node scripts/rotate-encryption-key.js --dry-run
```

Review the output to ensure:
- All users with mnemonics are found
- No decryption errors occur
- The script can access both old and new keys

### Step 4: Perform Rotation

Run the rotation script for real:

```bash
node scripts/rotate-encryption-key.js
```

The script will:
1. Decrypt each mnemonic using `ENCRYPTION_SECRET_OLD`
2. Re-encrypt it using the new `ENCRYPTION_SECRET`
3. Update the database with the new ciphertext
4. Report success/failure for each user

### Step 5: Verify

Test that the application can still decrypt mnemonics:

```bash
# Restart your application with the new key
# Test a few operations that require mnemonic decryption:
# - Wallet operations
# - Transaction signing
# - Account exports
```

### Step 6: Remove Old Key

After confirming everything works:

```bash
# Remove the old key from environment
unset ENCRYPTION_SECRET_OLD

# Or remove from .env file, docker-compose.yml, k8s secrets, etc.
```

### Step 7: Update Production Secrets

Update your production secret management system:
- AWS Secrets Manager
- HashiCorp Vault
- Kubernetes Secrets
- Environment variable configuration

## Rollback

If issues occur during rotation:

1. **Before removing `ENCRYPTION_SECRET_OLD`:** Simply swap the keys back
   ```bash
   # Swap keys
   export TEMP="$ENCRYPTION_SECRET"
   export ENCRYPTION_SECRET="$ENCRYPTION_SECRET_OLD"
   export ENCRYPTION_SECRET_OLD="$TEMP"
   
   # Run rotation again
   node scripts/rotate-encryption-key.js
   ```

2. **After removing `ENCRYPTION_SECRET_OLD`:** Restore from backup
   ```bash
   node backend/scripts/restore.js
   ```

## Technical Details

### Encryption Format

The encrypted format includes a version byte to support future algorithm changes:

```
[version(1 byte)] [salt(16 bytes)] [iv(12 bytes)] [authTag(16 bytes)] [ciphertext(variable)]
```

- Version `0x01`: Current format with version byte
- Version `0x00` (implicit): Legacy format without version byte

### Backward Compatibility

The `decrypt()` function automatically:
1. Tries decryption with `ENCRYPTION_SECRET`
2. Falls back to `ENCRYPTION_SECRET_OLD` if set
3. Handles both versioned and legacy formats

This ensures zero-downtime rotation - the application continues working while rotation is in progress.

### Security Considerations

1. **Never log decrypted mnemonics** - They contain private keys
2. **Use strong random keys** - At least 32 bytes of entropy
3. **Secure key storage** - Use proper secret management systems
4. **Audit rotation events** - Log when rotation occurs and by whom
5. **Test in staging first** - Always test the rotation process before production

## Troubleshooting

### "Failed to decrypt value" errors

- Verify `ENCRYPTION_SECRET_OLD` matches the key used to originally encrypt
- Check that the database has not been corrupted
- Ensure environment variables are loaded correctly

### "Some users failed" in rotation summary

- Review the error messages for each failed user
- Check if those users have corrupted mnemonic data
- Consider manually fixing or resetting those accounts

### Application can't decrypt after rotation

- Verify `ENCRYPTION_SECRET` is set correctly in production
- Check that all instances/containers have the new key
- Ensure you didn't remove `ENCRYPTION_SECRET_OLD` before rotation completed

## Related Files

- `backend/src/utils/crypto.js` - Core encryption/decryption logic
- `backend/scripts/rotate-encryption-key.js` - Rotation script
- `backend/src/utils/stellar-accounts.js` - Mnemonic usage for Stellar accounts

## Issue Reference

Implements [#1464 BE-20](https://github.com/zeekman/FarmersMarketplace/issues/1464): Encrypt-at-rest key rotation for users.stellar_mnemonic
