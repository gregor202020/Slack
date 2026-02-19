/**
 * Cryptographic utility functions for token hashing, OTP generation,
 * PII encryption/decryption, HMAC signing, and device fingerprinting.
 */

import { createHash, createHmac, randomBytes, randomInt, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getConfig } from './config.js';

const BCRYPT_ROUNDS = 12;
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * SHA-256 hash a token string. Used for storing token hashes in the database.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically random 6-digit OTP code.
 */
export function generateOtp(): string {
  // randomInt is cryptographically secure
  return randomInt(100_000, 1_000_000).toString();
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
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
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
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
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
 * Hash a password with bcrypt (for future use if password auth is added).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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
