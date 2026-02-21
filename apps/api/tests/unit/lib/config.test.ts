/**
 * Unit tests for config module.
 *
 * Tests:
 *   - loadConfig: Environment variable parsing, defaults, validation
 *   - getConfig: Singleton access pattern
 *   - parseTimeToSeconds: Time string parsing (internal, tested via loadConfig)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Config tests use vi.resetModules() to get fresh module state per test
// because config.ts has module-level singleton state (_config).
// ---------------------------------------------------------------------------

describe('Config — loadConfig / getConfig', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should load config with required env vars from setup.ts', async () => {
    const { loadConfig } = await import('../../../src/lib/config.js')

    const config = loadConfig()

    expect(config.jwtSecret).toBe('test-jwt-secret-key-for-testing-only')
    expect(config.nodeEnv).toBe('test')
    expect(config.isProduction).toBe(false)
  })

  it('should return the same config on subsequent calls (singleton)', async () => {
    const { loadConfig } = await import('../../../src/lib/config.js')

    const first = loadConfig()
    const second = loadConfig()

    expect(first).toBe(second)
  })

  it('should throw from getConfig when loadConfig has not been called', async () => {
    const { getConfig } = await import('../../../src/lib/config.js')

    expect(() => getConfig()).toThrow('Config not loaded. Call loadConfig() first.')
  })

  it('should return config from getConfig after loadConfig is called', async () => {
    const { loadConfig, getConfig } = await import('../../../src/lib/config.js')

    loadConfig()
    const config = getConfig()

    expect(config.jwtSecret).toBe('test-jwt-secret-key-for-testing-only')
  })

  it('should use default values for optional env vars', async () => {
    const { loadConfig } = await import('../../../src/lib/config.js')

    const config = loadConfig()

    // PORT defaults to 4000, HOST defaults to 0.0.0.0
    expect(config.port).toBe(4000)
    expect(config.host).toBe('0.0.0.0')
  })

  it('should throw when a required env var is missing', async () => {
    const originalJwtSecret = process.env.JWT_SECRET
    delete process.env.JWT_SECRET

    const { loadConfig } = await import('../../../src/lib/config.js')

    expect(() => loadConfig()).toThrow('Missing required environment variable: JWT_SECRET')

    // Restore
    process.env.JWT_SECRET = originalJwtSecret
  })

  it('should parse OTP config with defaults', async () => {
    const { loadConfig } = await import('../../../src/lib/config.js')

    const config = loadConfig()

    expect(config.otpLength).toBe(6)
    expect(config.otpExpiryMinutes).toBe(5)
  })

  it('should parse encryption key from env', async () => {
    const { loadConfig } = await import('../../../src/lib/config.js')

    const config = loadConfig()

    expect(config.encryptionKey).toBe('a'.repeat(64))
  })
})

// ---------------------------------------------------------------------------
// parseTimeToSeconds — tested via JWT expiry env vars
// ---------------------------------------------------------------------------

describe('Config — parseTimeToSeconds (via JWT expiry)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should use default value when env var is not set', async () => {
    const { loadConfig } = await import('../../../src/lib/config.js')

    const config = loadConfig()

    // Default JWT_ACCESS_EXPIRY is 900 (15 minutes)
    expect(config.jwtAccessExpiry).toBe(900)
    // Default JWT_REFRESH_EXPIRY is 604800 (7 days)
    expect(config.jwtRefreshExpiry).toBe(604800)
  })

  it('should parse minutes time string (e.g. "15m")', async () => {
    process.env.JWT_ACCESS_EXPIRY = '15m'

    const { loadConfig } = await import('../../../src/lib/config.js')
    const config = loadConfig()

    expect(config.jwtAccessExpiry).toBe(900)

    delete process.env.JWT_ACCESS_EXPIRY
  })

  it('should parse hours time string (e.g. "1h")', async () => {
    process.env.JWT_ACCESS_EXPIRY = '1h'

    const { loadConfig } = await import('../../../src/lib/config.js')
    const config = loadConfig()

    expect(config.jwtAccessExpiry).toBe(3600)

    delete process.env.JWT_ACCESS_EXPIRY
  })

  it('should parse days time string (e.g. "7d")', async () => {
    process.env.JWT_REFRESH_EXPIRY = '7d'

    const { loadConfig } = await import('../../../src/lib/config.js')
    const config = loadConfig()

    expect(config.jwtRefreshExpiry).toBe(604800)

    delete process.env.JWT_REFRESH_EXPIRY
  })

  it('should parse seconds time string (e.g. "30s")', async () => {
    process.env.JWT_ACCESS_EXPIRY = '30s'

    const { loadConfig } = await import('../../../src/lib/config.js')
    const config = loadConfig()

    expect(config.jwtAccessExpiry).toBe(30)

    delete process.env.JWT_ACCESS_EXPIRY
  })

  it('should parse plain integer as seconds', async () => {
    process.env.JWT_ACCESS_EXPIRY = '600'

    const { loadConfig } = await import('../../../src/lib/config.js')
    const config = loadConfig()

    expect(config.jwtAccessExpiry).toBe(600)

    delete process.env.JWT_ACCESS_EXPIRY
  })

  it('should throw on invalid time string', async () => {
    process.env.JWT_ACCESS_EXPIRY = 'not-a-number'

    const { loadConfig } = await import('../../../src/lib/config.js')

    expect(() => loadConfig()).toThrow('must be a valid time string')

    delete process.env.JWT_ACCESS_EXPIRY
  })
})
