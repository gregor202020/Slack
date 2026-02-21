/**
 * Unit tests for error definitions.
 *
 * Tests all error classes and factory functions:
 *   - AppError base class
 *   - NotFoundError, ForbiddenError, UnauthorizedError, etc.
 *   - Domain-specific error factories
 */

import { describe, it, expect } from 'vitest'

import {
  AppError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  lastSuperAdminError,
  accountLockedError,
  otpExpiredError,
  sessionExpiredError,
  tokenRevokedError,
  userSuspendedError,
  userDeactivatedError,
  channelArchivedError,
  venueArchivedError,
  fileTooLargeError,
  blockedFileTypeError,
  storageQuotaExceededError,
  reauthRequiredError,
  announcementLockedError,
  shiftSwapLockedError,
} from '../../../src/lib/errors.js'

// ---------------------------------------------------------------------------
// AppError base class
// ---------------------------------------------------------------------------

describe('Errors — AppError', () => {
  it('should set message, code, statusCode, and details', () => {
    const err = new AppError('Something broke', 'BROKE', 500, { extra: 'info' })

    expect(err.message).toBe('Something broke')
    expect(err.code).toBe('BROKE')
    expect(err.statusCode).toBe(500)
    expect(err.details).toEqual({ extra: 'info' })
    expect(err.name).toBe('AppError')
  })

  it('should be an instance of Error', () => {
    const err = new AppError('test', 'TEST', 500)
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })

  it('should have undefined details when not provided', () => {
    const err = new AppError('test', 'TEST', 500)
    expect(err.details).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Concrete error classes
// ---------------------------------------------------------------------------

describe('Errors — NotFoundError', () => {
  it('should default to 404 status code', () => {
    const err = new NotFoundError()
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('Resource not found')
    expect(err.name).toBe('NotFoundError')
  })

  it('should accept custom message and code', () => {
    const err = new NotFoundError('User not found', 'USER_NOT_FOUND')
    expect(err.message).toBe('User not found')
    expect(err.code).toBe('USER_NOT_FOUND')
    expect(err.statusCode).toBe(404)
  })

  it('should be instanceof AppError', () => {
    const err = new NotFoundError()
    expect(err).toBeInstanceOf(AppError)
  })
})

describe('Errors — ForbiddenError', () => {
  it('should default to 403 status code', () => {
    const err = new ForbiddenError()
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
    expect(err.name).toBe('ForbiddenError')
  })
})

describe('Errors — UnauthorizedError', () => {
  it('should default to 401 status code', () => {
    const err = new UnauthorizedError()
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.name).toBe('UnauthorizedError')
  })
})

describe('Errors — ConflictError', () => {
  it('should default to 409 status code', () => {
    const err = new ConflictError()
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('CONFLICT')
    expect(err.name).toBe('ConflictError')
  })
})

describe('Errors — ValidationError', () => {
  it('should default to 422 status code', () => {
    const err = new ValidationError()
    expect(err.statusCode).toBe(422)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.name).toBe('ValidationError')
  })

  it('should accept details for field-level errors', () => {
    const err = new ValidationError('Invalid input', 'VALIDATION_ERROR', {
      fields: { name: ['Required'] },
    })
    expect(err.details).toEqual({ fields: { name: ['Required'] } })
  })
})

describe('Errors — RateLimitError', () => {
  it('should default to 429 status code', () => {
    const err = new RateLimitError()
    expect(err.statusCode).toBe(429)
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(err.name).toBe('RateLimitError')
  })
})

describe('Errors — InternalError', () => {
  it('should default to 500 status code', () => {
    const err = new InternalError()
    expect(err.statusCode).toBe(500)
    expect(err.code).toBe('INTERNAL_ERROR')
    expect(err.name).toBe('InternalError')
  })
})

// ---------------------------------------------------------------------------
// Domain-specific error factories
// ---------------------------------------------------------------------------

describe('Errors — factory functions', () => {
  it('lastSuperAdminError should return ConflictError with LAST_SUPER_ADMIN code', () => {
    const err = lastSuperAdminError()
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.code).toBe('LAST_SUPER_ADMIN')
    expect(err.statusCode).toBe(409)
  })

  it('accountLockedError should return ForbiddenError with ACCOUNT_LOCKED code', () => {
    const err = accountLockedError()
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.code).toBe('ACCOUNT_LOCKED')
    expect(err.statusCode).toBe(403)
  })

  it('accountLockedError should include locked_until in details when provided', () => {
    const lockedUntil = new Date('2025-01-01T00:00:00Z')
    const err = accountLockedError(lockedUntil)
    expect(err.details).toEqual({ locked_until: '2025-01-01T00:00:00.000Z' })
  })

  it('accountLockedError should have no details when lockedUntil is not provided', () => {
    const err = accountLockedError()
    expect(err.details).toBeUndefined()
  })

  it('otpExpiredError should return UnauthorizedError with OTP_EXPIRED code', () => {
    const err = otpExpiredError()
    expect(err).toBeInstanceOf(UnauthorizedError)
    expect(err.code).toBe('OTP_EXPIRED')
    expect(err.statusCode).toBe(401)
  })

  it('sessionExpiredError should return UnauthorizedError with SESSION_EXPIRED code', () => {
    const err = sessionExpiredError()
    expect(err).toBeInstanceOf(UnauthorizedError)
    expect(err.code).toBe('SESSION_EXPIRED')
  })

  it('tokenRevokedError should return UnauthorizedError with TOKEN_REVOKED code', () => {
    const err = tokenRevokedError()
    expect(err).toBeInstanceOf(UnauthorizedError)
    expect(err.code).toBe('TOKEN_REVOKED')
  })

  it('userSuspendedError should return ForbiddenError with USER_SUSPENDED code', () => {
    const err = userSuspendedError()
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.code).toBe('USER_SUSPENDED')
  })

  it('userDeactivatedError should return ForbiddenError with USER_DEACTIVATED code', () => {
    const err = userDeactivatedError()
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.code).toBe('USER_DEACTIVATED')
  })

  it('channelArchivedError should return ForbiddenError with CHANNEL_ARCHIVED code', () => {
    const err = channelArchivedError()
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.code).toBe('CHANNEL_ARCHIVED')
  })

  it('venueArchivedError should return ForbiddenError with VENUE_ARCHIVED code', () => {
    const err = venueArchivedError()
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.code).toBe('VENUE_ARCHIVED')
  })

  it('fileTooLargeError should return ValidationError with FILE_TOO_LARGE code', () => {
    const err = fileTooLargeError()
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.code).toBe('FILE_TOO_LARGE')
    expect(err.statusCode).toBe(422)
  })

  it('blockedFileTypeError should return ValidationError with BLOCKED_FILE_TYPE code', () => {
    const err = blockedFileTypeError()
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.code).toBe('BLOCKED_FILE_TYPE')
  })

  it('storageQuotaExceededError should return ForbiddenError with STORAGE_QUOTA_EXCEEDED code', () => {
    const err = storageQuotaExceededError()
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.code).toBe('STORAGE_QUOTA_EXCEEDED')
  })

  it('reauthRequiredError should return UnauthorizedError with REAUTH_REQUIRED code', () => {
    const err = reauthRequiredError()
    expect(err).toBeInstanceOf(UnauthorizedError)
    expect(err.code).toBe('REAUTH_REQUIRED')
  })

  it('announcementLockedError should return ConflictError with ANNOUNCEMENT_LOCKED code', () => {
    const err = announcementLockedError()
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.code).toBe('ANNOUNCEMENT_LOCKED')
    expect(err.statusCode).toBe(409)
  })

  it('shiftSwapLockedError should return ConflictError with SHIFT_SWAP_LOCKED code', () => {
    const err = shiftSwapLockedError()
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.code).toBe('SHIFT_SWAP_LOCKED')
    expect(err.statusCode).toBe(409)
  })
})
