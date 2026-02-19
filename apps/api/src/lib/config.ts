/**
 * Environment configuration loader.
 *
 * Reads and validates all required environment variables at startup.
 * Secret values are never logged.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }
  return parsed;
}

export interface AppConfig {
  // Server
  port: number;
  host: string;
  nodeEnv: string;
  apiUrl: string;
  webUrl: string;
  isProduction: boolean;
  isDevelopment: boolean;

  // Database
  databaseUrl: string;

  // JWT
  jwtSecret: string;
  jwtAccessExpiry: number;
  jwtRefreshExpiry: number;

  // Twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;

  // S3
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3FileDomain: string;

  // Encryption
  encryptionKey: string;

  // Firebase
  firebaseServiceAccountPath: string;
}

let _config: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const nodeEnv = optional('NODE_ENV', 'development');

  _config = {
    port: optionalInt('PORT', 3001),
    host: optional('HOST', '0.0.0.0'),
    nodeEnv,
    apiUrl: optional('API_URL', 'http://localhost:3001'),
    webUrl: optional('WEB_URL', 'http://localhost:3000'),
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',

    databaseUrl: required('DATABASE_URL'),

    jwtSecret: required('JWT_SECRET'),
    jwtAccessExpiry: optionalInt('JWT_ACCESS_EXPIRY', 900),
    jwtRefreshExpiry: optionalInt('JWT_REFRESH_EXPIRY', 604800),

    twilioAccountSid: optional('TWILIO_ACCOUNT_SID', ''),
    twilioAuthToken: optional('TWILIO_AUTH_TOKEN', ''),
    twilioPhoneNumber: optional('TWILIO_PHONE_NUMBER', ''),

    s3Endpoint: optional('S3_ENDPOINT', 'https://syd1.digitaloceanspaces.com'),
    s3Region: optional('S3_REGION', 'syd1'),
    s3Bucket: optional('S3_BUCKET', 'the-smoker-files'),
    s3AccessKey: optional('S3_ACCESS_KEY', ''),
    s3SecretKey: optional('S3_SECRET_KEY', ''),
    s3FileDomain: optional('S3_FILE_DOMAIN', 'https://files.yourdomain.com'),

    encryptionKey: required('ENCRYPTION_KEY'),

    firebaseServiceAccountPath: optional(
      'FIREBASE_SERVICE_ACCOUNT_PATH',
      './firebase-service-account.json',
    ),
  };

  return _config;
}

/**
 * Returns the singleton config. Throws if loadConfig() has not been called.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return _config;
}
