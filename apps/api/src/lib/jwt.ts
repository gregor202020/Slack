/**
 * JWT utility functions for access and refresh token management.
 *
 * Access tokens: 15-minute expiry (configurable via JWT_ACCESS_EXPIRY).
 * Refresh tokens: 7-day expiry (configurable via JWT_REFRESH_EXPIRY).
 */

import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { getConfig } from './config.js';
import { UnauthorizedError } from './errors.js';

export interface JwtPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Sign an access token (short-lived, 15 minutes by default).
 */
export function signAccessToken(payload: {
  userId: string;
  sessionId: string;
}): string {
  const config = getConfig();

  return jwt.sign(
    {
      userId: payload.userId,
      sessionId: payload.sessionId,
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtAccessExpiry,
      jwtid: randomBytes(16).toString('hex'),
      subject: payload.userId,
    },
  );
}

/**
 * Sign a refresh token (long-lived, 7 days by default).
 */
export function signRefreshToken(payload: {
  userId: string;
  sessionId: string;
}): string {
  const config = getConfig();

  return jwt.sign(
    {
      userId: payload.userId,
      sessionId: payload.sessionId,
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtRefreshExpiry,
      jwtid: randomBytes(16).toString('hex'),
      subject: payload.userId,
    },
  );
}

/**
 * Verify and decode a JWT token.
 * Throws UnauthorizedError if the token is invalid or expired.
 */
export function verifyToken(token: string): JwtPayload {
  const config = getConfig();

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;

    return {
      userId: decoded.userId as string,
      sessionId: decoded.sessionId as string,
      iat: decoded.iat!,
      exp: decoded.exp!,
      jti: decoded.jti!,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired', 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token', 'INVALID_TOKEN');
    }
    throw new UnauthorizedError('Token verification failed', 'TOKEN_VERIFICATION_FAILED');
  }
}
