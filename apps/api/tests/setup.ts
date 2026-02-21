import { resolve } from 'node:path'
import { config } from 'dotenv'
import { beforeAll, afterAll } from 'vitest'

// ---------------------------------------------------------------------------
// Load .env.test from project root — single source of truth for test config.
// Individual values can still be overridden via shell env (e.g. in CI).
// ---------------------------------------------------------------------------

config({ path: resolve(__dirname, '../../../.env.test') })

// Ensure critical env vars are set (CI may provide its own values)
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://smoker:smoker_dev@localhost:5433/smoker_test'
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380/1'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only'
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'test_sid'
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'test_token'
process.env.TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+15555555555'
process.env.S3_BUCKET = process.env.S3_BUCKET || 'smoker-test-files'
process.env.S3_REGION = process.env.S3_REGION || 'us-east-1'
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9002'
process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin'
process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin'
process.env.S3_FILE_DOMAIN = process.env.S3_FILE_DOMAIN || 'http://localhost:9002/smoker-test-files'
process.env.PII_ENCRYPTION_KEY = process.env.PII_ENCRYPTION_KEY || 'a'.repeat(64)
process.env.INVITE_HMAC_SECRET = process.env.INVITE_HMAC_SECRET || 'test-hmac-secret-at-least-32-chars-long'

beforeAll(async () => {
  console.log(`Test suite starting... (DB: ${process.env.DATABASE_URL})`)
})

afterAll(async () => {
  // Close the database connection pool so vitest can exit cleanly
  try {
    const { closeDb } = await import('@smoker/db')
    await closeDb()
  } catch {
    // closeDb may not exist or DB was never opened — that's fine
  }

  // Flush the test Redis database (db index 1) so state doesn't leak
  try {
    const { getRedis, closeRedis } = await import('../../src/lib/redis.js')
    const redis = getRedis()
    await redis.flushdb()
    await closeRedis()
  } catch {
    // Redis may not have been initialized — that's fine
  }

  console.log('Test suite complete.')
})
