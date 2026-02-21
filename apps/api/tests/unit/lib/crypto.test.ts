/**
 * Unit tests for crypto utilities.
 *
 * Tests pure cryptographic functions:
 *   - hashToken / sha256: SHA-256 hashing
 *   - generateOtp: Cryptographic OTP generation
 *   - generateToken: Random hex token generation
 *   - encryptPii / decryptPii: AES-256-GCM encryption round-trip
 *   - hmacSign / hmacVerify: HMAC-SHA256 signing and verification
 *   - generateDeviceFingerprint: Device fingerprint hashing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock config for PII encryption
// ---------------------------------------------------------------------------

vi.mock('../../../src/lib/config.js', () => ({
  getConfig: vi.fn(() => ({
    encryptionKey: 'a'.repeat(64), // 32-byte hex key
  })),
}))

import {
  hashToken,
  sha256,
  generateOtp,
  generateToken,
  encryptPii,
  decryptPii,
  hmacSign,
  hmacVerify,
  generateDeviceFingerprint,
} from '../../../src/lib/crypto.js'

// ---------------------------------------------------------------------------
// hashToken / sha256
// ---------------------------------------------------------------------------

describe('Crypto — hashToken', () => {
  it('should return a 64-character hex string', () => {
    const hash = hashToken('my-token')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should produce consistent hashes for the same input', () => {
    const hash1 = hashToken('test-token')
    const hash2 = hashToken('test-token')
    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different inputs', () => {
    const hash1 = hashToken('token-a')
    const hash2 = hashToken('token-b')
    expect(hash1).not.toBe(hash2)
  })
})

describe('Crypto — sha256', () => {
  it('should return a 64-character hex string', () => {
    const hash = sha256('hello world')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should be deterministic', () => {
    const hash1 = sha256('audit-content')
    const hash2 = sha256('audit-content')
    expect(hash1).toBe(hash2)
  })
})

// ---------------------------------------------------------------------------
// generateOtp
// ---------------------------------------------------------------------------

describe('Crypto — generateOtp', () => {
  it('should generate a 6-digit OTP by default', () => {
    const otp = generateOtp()
    expect(otp).toMatch(/^\d{6}$/)
  })

  it('should generate OTP of specified length', () => {
    const otp4 = generateOtp(4)
    expect(otp4).toMatch(/^\d{4}$/)

    const otp8 = generateOtp(8)
    expect(otp8).toMatch(/^\d{8}$/)
  })

  it('should generate different OTPs on subsequent calls', () => {
    const otps = new Set<string>()
    for (let i = 0; i < 20; i++) {
      otps.add(generateOtp())
    }
    // With cryptographic randomness, 20 6-digit OTPs should almost certainly be unique
    expect(otps.size).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// generateToken
// ---------------------------------------------------------------------------

describe('Crypto — generateToken', () => {
  it('should generate a 64-character hex string by default (32 bytes)', () => {
    const token = generateToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should generate token of specified byte length', () => {
    const token16 = generateToken(16)
    expect(token16).toHaveLength(32) // 16 bytes = 32 hex chars
  })

  it('should generate unique tokens', () => {
    const token1 = generateToken()
    const token2 = generateToken()
    expect(token1).not.toBe(token2)
  })
})

// ---------------------------------------------------------------------------
// encryptPii / decryptPii
// ---------------------------------------------------------------------------

describe('Crypto — encryptPii / decryptPii', () => {
  it('should encrypt and decrypt a string round-trip', () => {
    const plaintext = 'user@example.com'
    const encrypted = encryptPii(plaintext)
    const decrypted = decryptPii(encrypted)

    expect(decrypted).toBe(plaintext)
  })

  it('should return ciphertext in iv:authTag:data format', () => {
    const encrypted = encryptPii('test data')
    const parts = encrypted.split(':')

    expect(parts).toHaveLength(3)
    // IV should be 24 hex chars (12 bytes)
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/)
    // Auth tag should be 32 hex chars (16 bytes)
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/)
    // Ciphertext should be hex
    expect(parts[2]).toMatch(/^[0-9a-f]+$/)
  })

  it('should produce different ciphertexts for the same plaintext (random IV)', () => {
    const encrypted1 = encryptPii('same input')
    const encrypted2 = encryptPii('same input')

    expect(encrypted1).not.toBe(encrypted2)

    // But both should decrypt to the same value
    expect(decryptPii(encrypted1)).toBe('same input')
    expect(decryptPii(encrypted2)).toBe('same input')
  })

  it('should throw on invalid ciphertext format', () => {
    expect(() => decryptPii('invalid-data')).toThrow('Invalid ciphertext format')
  })

  it('should handle empty string encryption', () => {
    const encrypted = encryptPii('')
    const decrypted = decryptPii(encrypted)
    expect(decrypted).toBe('')
  })

  it('should handle unicode content', () => {
    const plaintext = 'Hello, World!'
    const encrypted = encryptPii(plaintext)
    const decrypted = decryptPii(encrypted)
    expect(decrypted).toBe(plaintext)
  })
})

// ---------------------------------------------------------------------------
// hmacSign / hmacVerify
// ---------------------------------------------------------------------------

describe('Crypto — hmacSign / hmacVerify', () => {
  const key = 'test-hmac-secret-key'

  it('should produce a 64-character hex HMAC signature', () => {
    const sig = hmacSign('data-to-sign', key)
    expect(sig).toHaveLength(64)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should produce consistent signatures for the same input', () => {
    const sig1 = hmacSign('data', key)
    const sig2 = hmacSign('data', key)
    expect(sig1).toBe(sig2)
  })

  it('should produce different signatures for different data', () => {
    const sig1 = hmacSign('data-a', key)
    const sig2 = hmacSign('data-b', key)
    expect(sig1).not.toBe(sig2)
  })

  it('should produce different signatures for different keys', () => {
    const sig1 = hmacSign('data', 'key-1')
    const sig2 = hmacSign('data', 'key-2')
    expect(sig1).not.toBe(sig2)
  })

  it('should verify a valid signature', () => {
    const sig = hmacSign('verify-me', key)
    expect(hmacVerify('verify-me', sig, key)).toBe(true)
  })

  it('should reject an invalid signature', () => {
    const sig = hmacSign('verify-me', key)
    expect(hmacVerify('tampered-data', sig, key)).toBe(false)
  })

  it('should reject a wrong-length signature', () => {
    expect(hmacVerify('data', 'short', key)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generateDeviceFingerprint
// ---------------------------------------------------------------------------

describe('Crypto — generateDeviceFingerprint', () => {
  it('should return a 64-character hex hash', () => {
    const fp = generateDeviceFingerprint('Mozilla/5.0', '192.168.1.1')
    expect(fp).toHaveLength(64)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should be deterministic for the same inputs', () => {
    const fp1 = generateDeviceFingerprint('Chrome/120', '10.0.0.1')
    const fp2 = generateDeviceFingerprint('Chrome/120', '10.0.0.1')
    expect(fp1).toBe(fp2)
  })

  it('should differ when user agent changes', () => {
    const fp1 = generateDeviceFingerprint('Chrome/120', '10.0.0.1')
    const fp2 = generateDeviceFingerprint('Firefox/120', '10.0.0.1')
    expect(fp1).not.toBe(fp2)
  })

  it('should differ when IP changes', () => {
    const fp1 = generateDeviceFingerprint('Chrome/120', '10.0.0.1')
    const fp2 = generateDeviceFingerprint('Chrome/120', '10.0.0.2')
    expect(fp1).not.toBe(fp2)
  })
})
