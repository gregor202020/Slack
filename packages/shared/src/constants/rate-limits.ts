/**
 * Rate limits from spec Section 16.2.
 * Each constant is an object with { max, window, windowUnit, scope }.
 */

export const RATE_LIMIT_OTP_REQUESTS = {
  max: 5,
  window: 1,
  windowUnit: 'hour' as const,
  scope: 'phone' as const,
} as const;

export const RATE_LIMIT_OTP_VERIFICATION = {
  max: 5,
  window: 1,
  windowUnit: 'code' as const,
  scope: 'otp_code' as const,
} as const;

export const RATE_LIMIT_ACCOUNT_LOCKOUT = {
  max: 10,
  lockoutMinutes: 15,
  scope: 'account' as const,
} as const;

export const RATE_LIMIT_INVITE_VERIFICATION = {
  max: 10,
  window: 1,
  windowUnit: 'hour' as const,
  scope: 'ip' as const,
} as const;

export const RATE_LIMIT_MESSAGE_SENDS = {
  max: 30,
  window: 1,
  windowUnit: 'minute' as const,
  scope: 'user' as const,
} as const;

export const RATE_LIMIT_CHANNEL_CREATION = {
  max: 10,
  window: 1,
  windowUnit: 'hour' as const,
  scope: 'user' as const,
} as const;

export const RATE_LIMIT_DM_CREATION = {
  max: 20,
  window: 1,
  windowUnit: 'hour' as const,
  scope: 'user' as const,
} as const;

export const RATE_LIMIT_FILE_UPLOADS = {
  max: 10,
  window: 1,
  windowUnit: 'minute' as const,
  scope: 'user' as const,
} as const;

export const RATE_LIMIT_EMOJI_REACTIONS = {
  max: 30,
  window: 1,
  windowUnit: 'minute' as const,
  scope: 'user' as const,
} as const;

export const RATE_LIMIT_BROADCAST_MENTIONS = {
  max: 5,
  window: 1,
  windowUnit: 'hour' as const,
  scope: 'user' as const,
} as const;

export const RATE_LIMIT_CANVAS_UPDATES = {
  max: 60,
  window: 1,
  windowUnit: 'minute' as const,
  scope: 'user' as const,
} as const;

export const RATE_LIMIT_API_KEY_DEFAULT = {
  max: 1000,
  window: 1,
  windowUnit: 'hour' as const,
  scope: 'key' as const,
} as const;

export const RATE_LIMIT_SEARCH_QUERIES = {
  max: 30,
  window: 1,
  windowUnit: 'minute' as const,
  scope: 'user' as const,
} as const;
