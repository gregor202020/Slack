import { beforeAll, afterAll } from 'vitest'

// Set test environment variables before any imports that read config
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only'
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://smoker:smoker@localhost:5432/smoker_test'
process.env.REDIS_URL = 'redis://localhost:6379/1'
process.env.TWILIO_ACCOUNT_SID = 'test_sid'
process.env.TWILIO_AUTH_TOKEN = 'test_token'
process.env.TWILIO_PHONE_NUMBER = '+15555555555'
process.env.S3_BUCKET = 'test-bucket'
process.env.S3_REGION = 'us-east-1'
process.env.S3_ENDPOINT = 'https://test.digitaloceanspaces.com'
process.env.S3_ACCESS_KEY = 'test-access-key'
process.env.S3_SECRET_KEY = 'test-secret-key'
process.env.S3_FILE_DOMAIN = 'https://test-files.example.com'
process.env.PII_ENCRYPTION_KEY = 'a'.repeat(64) // 32-byte hex key for AES-256
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = ''

beforeAll(async () => {
  console.log('Test suite starting...')
})

afterAll(async () => {
  console.log('Test suite complete.')
})
