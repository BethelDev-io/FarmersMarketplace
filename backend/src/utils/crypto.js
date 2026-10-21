/**
 * AES-256-GCM helpers for encrypting secrets at rest with key rotation support.
 *
 * The encryption key is derived from process.env.ENCRYPTION_SECRET via scrypt
 * so the raw environment value does not need to be exactly 32 bytes.
 *
 * Key rotation is supported via ENCRYPTION_SECRET_OLD environment variable.
 * When rotating keys:
 *   1. Set ENCRYPTION_SECRET_OLD to the current ENCRYPTION_SECRET value
 *   2. Set ENCRYPTION_SECRET to the new key
 *   3. Run the rotation script: node scripts/rotate-encryption-key.js
 *   4. After all records are re-encrypted, remove ENCRYPTION_SECRET_OLD
 *
 * Stored format (hex): version(1) | salt(16) | iv(12) | authTag(16) | ciphertext.
 * Version byte: 0x01 for current key, 0x00 for legacy format (no version byte)
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 32 };
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION_CURRENT = 0x01;

function getSecret() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error('ENCRYPTION_SECRET env variable is not set');
  return secret;
}

function getOldSecret() {
  return process.env.ENCRYPTION_SECRET_OLD || null;
}

function deriveKey(secret, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(
      secret,
      salt,
      SCRYPT_PARAMS.dkLen,
      { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p },
      (error, key) => (error ? reject(error) : resolve(key))
    )
  );
}

async function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext.length) {
    throw new Error('encrypt() requires a non-empty string');
  }
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await deriveKey(getSecret(), salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Include version byte to track which key was used
  const version = Buffer.from([VERSION_CURRENT]);
  return Buffer.concat([version, salt, iv, authTag, ciphertext]).toString('hex');
}

async function decryptWithKey(buffer, secret) {
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = buffer.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const key = await deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function decrypt(encryptedHex) {
  if (typeof encryptedHex !== 'string') {
    throw new Error('decrypt() requires an encrypted string');
  }
  const buffer = Buffer.from(encryptedHex, 'hex');
  
  // Check for version byte
  const hasVersion = buffer.length > 0 && buffer[0] === VERSION_CURRENT;
  const dataBuffer = hasVersion ? buffer.subarray(1) : buffer;
  
  const minLength = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (dataBuffer.length < minLength) {
    throw new Error('decrypt() requires a valid encrypted payload');
  }

  // Try decrypting with current key
  try {
    return await decryptWithKey(dataBuffer, getSecret());
  } catch (currentKeyError) {
    // If current key fails and we have an old key, try it
    const oldSecret = getOldSecret();
    if (oldSecret) {
      try {
        return await decryptWithKey(dataBuffer, oldSecret);
      } catch (oldKeyError) {
        // Both keys failed
        throw new Error(
          'Failed to decrypt value: neither ENCRYPTION_SECRET nor ENCRYPTION_SECRET_OLD match the key used to encrypt it'
        );
      }
    }
    // No old key available, throw original error
    throw new Error(
      'Failed to decrypt value: ENCRYPTION_SECRET does not match the key used to encrypt it'
    );
  }
}

/**
 * Check if a value needs re-encryption (was encrypted with old key or old format).
 * Returns true if the value should be re-encrypted with the current key.
 */
async function needsReEncryption(encryptedHex) {
  if (typeof encryptedHex !== 'string') return false;
  
  const buffer = Buffer.from(encryptedHex, 'hex');
  if (buffer.length === 0) return false;
  
  // Check if it has the current version byte
  const hasCurrentVersion = buffer[0] === VERSION_CURRENT;
  if (!hasCurrentVersion) return true; // Old format or old key
  
  // Has version byte, but we need to check if it was encrypted with old key
  // If we can decrypt with old key but not current key, it needs re-encryption
  const oldSecret = getOldSecret();
  if (!oldSecret) return false; // No rotation in progress
  
  const dataBuffer = buffer.subarray(1);
  try {
    await decryptWithKey(dataBuffer, getSecret());
    return false; // Successfully decrypted with current key
  } catch {
    try {
      await decryptWithKey(dataBuffer, oldSecret);
      return true; // Decrypted with old key, needs re-encryption
    } catch {
      return false; // Can't decrypt with either, don't try to re-encrypt
    }
  }
}

function isPlaintext(value) {
  return typeof value === 'string' && /^S[A-Z2-7]{55}$/.test(value);
}

async function decryptUserSecretKey(value) {
  if (typeof value !== 'string' || !value.length) {
    throw new Error('User Stellar secret key is missing');
  }
  if (isPlaintext(value)) return value;
  return decrypt(value);
}

module.exports = { 
  encrypt, 
  decrypt, 
  decryptUserSecretKey, 
  isPlaintext, 
  needsReEncryption,
  getOldSecret 
};
