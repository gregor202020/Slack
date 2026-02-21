/**
 * Cryptographic utility functions for token hashing, OTP generation,
 * PII encryption/decryption, HMAC signing, and device fingerprinting.
 */

import { createHash, createHmac, randomBytes, randomInt, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto'
import { getConfig } from './config.js'

const AES_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * SHA-256 hash a token string. Used for storing token hashes in the database.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically random OTP code of the specified length.
 * @param length Number of digits (default 6)
 */
export function generateOtp(length = 6): string {
  const min = Math.pow(10, length - 1)
  const max = Math.pow(10, length)
  // randomInt is cryptographically secure
  return randomInt(min, max).toString()
}

/**
 * Generate a cryptographically random hex-encoded token.
 * @param bytes Number of random bytes (default 32 = 256 bits of entropy)
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * AES-256-GCM encrypt plaintext (for PII fields like email, address).
 * Returns a string in the format: iv:authTag:ciphertext (all hex-encoded).
 */
export function encryptPii(plaintext: string): string {
  const config = getConfig();
  const key = Buffer.from(config.encryptionKey, 'hex');

  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * AES-256-GCM decrypt ciphertext produced by encryptPii.
 */
export function decryptPii(ciphertext: string): string {
  const config = getConfig();
  const key = Buffer.from(config.encryptionKey, 'hex');

  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * HMAC-SHA256 sign data with a key. Used for invite token signing.
 */
export function hmacSign(data: string, key: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

/**
 * HMAC-SHA256 verify: constant-time comparison of signature.
 */
export function hmacVerify(data: string, signature: string, key: string): boolean {
  const expected = hmacSign(data, key);

  if (expected.length !== signature.length) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expected, 'hex');
  const signatureBuf = Buffer.from(signature, 'hex');

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Generate a device fingerprint hash from user-agent and IP address.
 * Used for refresh token device binding (spec Section 3.4).
 */
export function generateDeviceFingerprint(userAgent: string, ip: string): string {
  return createHash('sha256')
    .update(`${userAgent}|${ip}`)
    .digest('hex');
}

/**
 * Compute SHA-256 hash of arbitrary content. Used for audit log hash chains
 * and vault content hashing.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
