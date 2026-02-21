/**
 * Environment configuration loader.
 *
 * Reads and validates all required environment variables at startup.
 * Secret values are never logged.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue
}

function optionalInt(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw) return defaultValue
  const parsed = parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer`)
  }
  return parsed
}

/**
 * Parse a time-string env var (e.g. "15m", "1h", "7d") into seconds.
 * Falls back to parsing as a plain integer (seconds) if no unit suffix.
 * Returns the provided default if the env var is not set.
 */
function parseTimeToSeconds(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw) return defaultValue

  const match = raw.match(/^(\d+)\s*(s|m|h|d)$/i)
  if (match) {
    const value = parseInt(match[1]!, 10)
    const unit = match[2]!.toLowerCase()
    switch (unit) {
      case 's': return value
      case 'm': return value * 60
      case 'h': return value * 3600
      case 'd': return value * 86400
      default: return defaultValue
    }
  }

  // Fall back to plain integer (seconds)
  const parsed = parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid time string (e.g. "15m", "1h") or integer seconds`)
  }
  return parsed
}

export interface AppConfig {
  // Server
  port: number
  host: string
  nodeEnv: string
  apiUrl: string
  webUrl: string
  isProduction: boolean
  isDevelopment: boolean

  // Database
  databaseUrl: string

  // Redis
  redisUrl: string

  // JWT
  jwtSecret: string
  jwtAccessExpiry: number
  jwtRefreshExpiry: number

  // Invite HMAC
  inviteHmacSecret: string

  // OTP
  otpLength: number
  otpExpiryMinutes: number

  // Twilio
  twilioAccountSid: string
  twilioAuthToken: string
  twilioFromNumber: string

  // S3
  s3Endpoint: string
  s3Region: string
  s3Bucket: string
  s3AccessKey: string
  s3SecretKey: string
  s3FileDomain: string

  // Encryption
  encryptionKey: string

  // CORS
  mobileOrigins: string

  // Metrics
  metricsToken: string
}

let _config: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (_config) return _config

  const nodeEnv = optional('NODE_ENV', 'development')

  _config = {
    port: optionalInt('PORT', 4000),
    host: optional('HOST', '0.0.0.0'),
    nodeEnv,
    apiUrl: optional('API_URL', 'http://localhost:4000'),
    webUrl: optional('WEB_URL', 'http://localhost:3000'),
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',

    databaseUrl: required('DATABASE_URL'),

    redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),

    jwtSecret: required('JWT_SECRET'),
    jwtAccessExpiry: parseTimeToSeconds('JWT_ACCESS_EXPIRY', 900),
    jwtRefreshExpiry: parseTimeToSeconds('JWT_REFRESH_EXPIRY', 604800),

    inviteHmacSecret: nodeEnv === 'production' ? required('INVITE_HMAC_SECRET') : optional('INVITE_HMAC_SECRET', 'dev-invite-hmac-secret'),

    otpLength: optionalInt('OTP_LENGTH', 6),
    otpExpiryMinutes: optionalInt('OTP_EXPIRY_MINUTES', 5),

    twilioAccountSid: optional('TWILIO_ACCOUNT_SID', ''),
    twilioAuthToken: optional('TWILIO_AUTH_TOKEN', ''),
    twilioFromNumber: optional('TWILIO_FROM_NUMBER', ''),

    s3Endpoint: optional('S3_ENDPOINT', 'https://syd1.digitaloceanspaces.com'),
    s3Region: optional('S3_REGION', 'syd1'),
    s3Bucket: optional('S3_BUCKET', 'the-smoker-files'),
    s3AccessKey: optional('S3_ACCESS_KEY', ''),
    s3SecretKey: optional('S3_SECRET_KEY', ''),
    s3FileDomain: optional('S3_FILE_DOMAIN', ''),

    encryptionKey: required('PII_ENCRYPTION_KEY'),

    mobileOrigins: optional('MOBILE_ORIGINS', ''),

    metricsToken: optional('METRICS_TOKEN', ''),
  }

  // Warn if S3 is configured but file domain is missing
  if (_config.s3AccessKey && !_config.s3FileDomain) {
    // eslint-disable-next-line no-console
    console.warn('[config] S3 credentials are set but S3_FILE_DOMAIN is empty — file URLs will not resolve correctly')
  }

  return _config
}

/**
 * Returns the singleton config. Throws if loadConfig() has not been called.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    throw new Error('Config not loaded. Call loadConfig() first.')
  }
  return _config
}
