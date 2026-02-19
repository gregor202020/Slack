/**
 * Custom error classes for structured API error responses.
 *
 * Each error has a `code` string (matching API endpoint spec error codes),
 * a numeric `statusCode`, and optional `details` for additional context.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', details?: Record<string, unknown>) {
    super(message, code, 404, details);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN', details?: Record<string, unknown>) {
    super(message, code, 403, details);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED', details?: Record<string, unknown>) {
    super(message, code, 401, details);
    this.name = 'UnauthorizedError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT', details?: Record<string, unknown>) {
    super(message, code, 409, details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', code = 'VALIDATION_ERROR', details?: Record<string, unknown>) {
    super(message, code, 422, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', code = 'RATE_LIMIT_EXCEEDED', details?: Record<string, unknown>) {
    super(message, code, 429, details);
    this.name = 'RateLimitError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', code = 'INTERNAL_ERROR', details?: Record<string, unknown>) {
    super(message, code, 500, details);
    this.name = 'InternalError';
  }
}

/**
 * Domain-specific error factory helpers. Use the `code` parameter to match
 * endpoint-specific error codes such as 'LAST_SUPER_ADMIN', 'CHANNEL_ARCHIVED',
 * 'OTP_EXPIRED', etc.
 */
export function lastSuperAdminError(): ConflictError {
  return new ConflictError(
    'Cannot remove the last Super Admin',
    'LAST_SUPER_ADMIN',
  );
}

export function accountLockedError(lockedUntil?: Date): ForbiddenError {
  return new ForbiddenError(
    'Account is temporarily locked',
    'ACCOUNT_LOCKED',
    lockedUntil ? { locked_until: lockedUntil.toISOString() } : undefined,
  );
}

export function otpExpiredError(): UnauthorizedError {
  return new UnauthorizedError('OTP has expired', 'OTP_EXPIRED');
}

export function sessionExpiredError(): UnauthorizedError {
  return new UnauthorizedError('Session has expired', 'SESSION_EXPIRED');
}

export function tokenRevokedError(): UnauthorizedError {
  return new UnauthorizedError('Token has been revoked', 'TOKEN_REVOKED');
}

export function userSuspendedError(): ForbiddenError {
  return new ForbiddenError('User account is suspended', 'USER_SUSPENDED');
}

export function userDeactivatedError(): ForbiddenError {
  return new ForbiddenError('User account is deactivated', 'USER_DEACTIVATED');
}

export function channelArchivedError(): ForbiddenError {
  return new ForbiddenError('Channel is archived', 'CHANNEL_ARCHIVED');
}

export function venueArchivedError(): ForbiddenError {
  return new ForbiddenError('Venue is archived', 'VENUE_ARCHIVED');
}

export function fileTooLargeError(): ValidationError {
  return new ValidationError('File exceeds maximum size limit', 'FILE_TOO_LARGE');
}

export function blockedFileTypeError(): ValidationError {
  return new ValidationError('File type is not allowed', 'BLOCKED_FILE_TYPE');
}

export function storageQuotaExceededError(): ForbiddenError {
  return new ForbiddenError('Storage quota exceeded', 'STORAGE_QUOTA_EXCEEDED');
}

export function reauthRequiredError(): UnauthorizedError {
  return new UnauthorizedError(
    'Re-authentication required for this operation',
    'REAUTH_REQUIRED',
  );
}

export function announcementLockedError(): ConflictError {
  return new ConflictError(
    'Announcement is locked after first acknowledgement',
    'ANNOUNCEMENT_LOCKED',
  );
}

export function shiftSwapLockedError(): ConflictError {
  return new ConflictError(
    'Shift has a pending swap request',
    'SHIFT_SWAP_LOCKED',
  );
}
