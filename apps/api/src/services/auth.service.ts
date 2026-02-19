/**
 * Authentication service layer.
 *
 * Handles OTP-based authentication: requesting codes, verifying them,
 * issuing JWT tokens, refreshing sessions, and logout/force-logout.
 *
 * OTP codes are stored in an in-memory Map with automatic expiry.
 * TODO: Replace in-memory OTP store with Redis for multi-server deployments.
 */

import { eq, and, gte, count, isNull } from 'drizzle-orm'
import { db, users, userSessions, otpAttempts } from '@smoker/db'
import {
  hashToken,
  generateOtp,
  generateToken,
  generateDeviceFingerprint,
  sha256,
} from '../lib/crypto.js'
import { signAccessToken, signRefreshToken } from '../lib/jwt.js'
import { logAudit } from '../lib/audit.js'
import {
  UnauthorizedError,
  RateLimitError,
  accountLockedError,
  otpExpiredError,
  userSuspendedError,
  userDeactivatedError,
  tokenRevokedError,
} from '../lib/errors.js'
import { getConfig } from '../lib/config.js'

// ---------------------------------------------------------------------------
// In-memory OTP store (replace with Redis for multi-server deployments)
// ---------------------------------------------------------------------------

interface OtpEntry {
  hash: string
  expiresAt: number
}

const otpStore = new Map<string, OtpEntry>()

/** Remove expired entries from the in-memory OTP store. */
function cleanExpiredOtps(): void {
  const now = Date.now()
  for (const [key, entry] of otpStore) {
    if (entry.expiresAt <= now) {
      otpStore.delete(key)
    }
  }
}

// Periodically clean expired OTPs every 60 seconds
const OTP_CLEANUP_INTERVAL = 60_000
setInterval(cleanExpiredOtps, OTP_CLEANUP_INTERVAL).unref()

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OTP_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes
const OTP_FATIGUE_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const OTP_FATIGUE_MAX = 3
const VERIFY_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const VERIFY_RATE_LIMIT_MAX = 5
const LOCKOUT_THRESHOLD = 10
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ---------------------------------------------------------------------------
// 1. requestOtp
// ---------------------------------------------------------------------------

export async function requestOtp(
  phone: string,
  method: 'sms' | 'email',
  ipAddress: string,
  userAgent: string,
): Promise<{ message: string }> {
  const phoneHash = sha256(phone)

  // Look up user by plaintext phone
  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)

  // Uniform response: don't reveal whether the phone is registered
  if (!user) {
    return { message: 'If this number is registered, a verification code has been sent.' }
  }

  // OTP fatigue check: count unverified OTP requests in the last hour
  const fatigueWindowStart = new Date(Date.now() - OTP_FATIGUE_WINDOW_MS)
  const [fatigueResult] = await db
    .select({ total: count() })
    .from(otpAttempts)
    .where(
      and(
        eq(otpAttempts.phoneHash, phoneHash),
        eq(otpAttempts.attemptType, 'request'),
        gte(otpAttempts.createdAt, fatigueWindowStart),
      ),
    )

  if (fatigueResult && fatigueResult.total >= OTP_FATIGUE_MAX) {
    // Silently return to avoid revealing rate-limit information
    return { message: 'If this number is registered, a verification code has been sent.' }
  }

  // Account lockout check
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    // Silently return to avoid revealing lockout status
    return { message: 'If this number is registered, a verification code has been sent.' }
  }

  // Generate OTP and store its hash
  const otp = generateOtp()
  const otpHash = hashToken(otp)

  otpStore.set(phoneHash, {
    hash: otpHash,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  })

  // Record the OTP request attempt
  await db.insert(otpAttempts).values({
    phoneHash,
    attemptType: 'request',
    success: true,
    ipAddress,
  })

  // Send OTP via Twilio SMS (or log in development mode)
  const config = getConfig()

  if (config.isDevelopment) {
    // eslint-disable-next-line no-console
    console.log(`[DEV] OTP for ${phone}: ${otp}`)
  } else {
    const twilio = (await import('twilio')).default
    const client = twilio(config.twilioAccountSid, config.twilioAuthToken)
    await client.messages.create({
      body: `Your verification code for The Smoker is: ${otp}`,
      from: config.twilioPhoneNumber,
      to: phone,
    })
  }

  // Audit log
  await logAudit({
    actorId: user.id,
    actorType: 'user',
    action: 'auth.otp_requested',
    targetType: 'user',
    targetId: user.id,
    metadata: { method, phoneHash },
    ipAddress,
    userAgent,
  })

  return { message: 'If this number is registered, a verification code has been sent.' }
}

// ---------------------------------------------------------------------------
// 2. verifyOtp
// ---------------------------------------------------------------------------

export async function verifyOtp(
  phone: string,
  code: string,
  ipAddress: string,
  userAgent: string,
): Promise<{
  accessToken: string
  refreshToken: string
  user: {
    id: string
    phone: string
    fullName: string
    orgRole: string
    status: string
    profileCompletedAt: Date | null
  }
}> {
  const phoneHash = sha256(phone)

  // Find user by plaintext phone
  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)

  if (!user) {
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')
  }

  // Account lockout check
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw accountLockedError(user.lockedUntil)
  }

  // Check in-memory OTP store for a valid (non-expired) entry
  const storedOtp = otpStore.get(phoneHash)

  if (!storedOtp || storedOtp.expiresAt <= Date.now()) {
    otpStore.delete(phoneHash)
    throw otpExpiredError()
  }

  // Rate-limit failed verify attempts in the last 5 minutes
  const verifyWindowStart = new Date(Date.now() - VERIFY_RATE_LIMIT_WINDOW_MS)
  const [failedResult] = await db
    .select({ total: count() })
    .from(otpAttempts)
    .where(
      and(
        eq(otpAttempts.phoneHash, phoneHash),
        eq(otpAttempts.attemptType, 'verify'),
        eq(otpAttempts.success, false),
        gte(otpAttempts.createdAt, verifyWindowStart),
      ),
    )

  if (failedResult && failedResult.total >= VERIFY_RATE_LIMIT_MAX) {
    throw new RateLimitError('Too many verification attempts', 'RATE_LIMIT_EXCEEDED')
  }

  // Compare hashes
  const providedHash = hashToken(code)

  if (providedHash !== storedOtp.hash) {
    // Record failed verification attempt
    await db.insert(otpAttempts).values({
      phoneHash,
      attemptType: 'verify',
      success: false,
      ipAddress,
    })

    // Increment failed attempts on the user record
    const newFailedAttempts = user.failedOtpAttempts + 1

    if (newFailedAttempts >= LOCKOUT_THRESHOLD) {
      // Lock account for 15 minutes
      await db
        .update(users)
        .set({
          failedOtpAttempts: newFailedAttempts,
          lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
    } else {
      await db
        .update(users)
        .set({
          failedOtpAttempts: newFailedAttempts,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
    }

    await logAudit({
      actorId: user.id,
      actorType: 'user',
      action: 'auth.otp_failed',
      targetType: 'user',
      targetId: user.id,
      metadata: { failedAttempts: newFailedAttempts },
      ipAddress,
      userAgent,
    })

    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')
  }

  // OTP is correct -- clean up the stored entry
  otpStore.delete(phoneHash)

  // Record successful verification attempt
  await db.insert(otpAttempts).values({
    phoneHash,
    attemptType: 'verify',
    success: true,
    ipAddress,
  })

  // Reset failed attempts and clear lockout
  await db
    .update(users)
    .set({
      failedOtpAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  // Generate device fingerprint and refresh token
  const deviceFingerprintHash = generateDeviceFingerprint(userAgent, ipAddress)
  const rawRefreshToken = generateToken()
  const tokenHash = hashToken(rawRefreshToken)

  // Create session
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)

  const [session] = await db
    .insert(userSessions)
    .values({
      userId: user.id,
      deviceFingerprintHash,
      tokenHash,
      expiresAt,
    })
    .returning()

  if (!session) {
    throw new UnauthorizedError('Failed to create session', 'SESSION_CREATE_FAILED')
  }

  // Sign JWT tokens
  const accessToken = signAccessToken({ userId: user.id, sessionId: session.id })
  const refreshToken = signRefreshToken({ userId: user.id, sessionId: session.id })

  // If user was in 'invited' status, activate them
  let currentStatus = user.status
  if (user.status === 'invited') {
    await db
      .update(users)
      .set({
        status: 'active',
        signupAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
    currentStatus = 'active'
  }

  // Audit log
  await logAudit({
    actorId: user.id,
    actorType: 'user',
    action: 'auth.login_success',
    targetType: 'user',
    targetId: user.id,
    metadata: { sessionId: session.id },
    ipAddress,
    userAgent,
  })

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      orgRole: user.orgRole,
      status: currentStatus,
      profileCompletedAt: user.profileCompletedAt,
    },
  }
}

// ---------------------------------------------------------------------------
// 3. refreshAccessToken
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  refreshTokenValue: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ accessToken: string }> {
  const tokenHash = hashToken(refreshTokenValue)

  // Find session by token hash
  const [session] = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.tokenHash, tokenHash))
    .limit(1)

  if (!session || session.revokedAt) {
    throw tokenRevokedError()
  }

  if (session.expiresAt < new Date()) {
    throw new UnauthorizedError('Session expired', 'SESSION_EXPIRED')
  }

  // Device fingerprint validation
  const currentFingerprint = generateDeviceFingerprint(userAgent, ipAddress)

  if (session.deviceFingerprintHash && currentFingerprint !== session.deviceFingerprintHash) {
    // Revoke the session due to device mismatch
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(eq(userSessions.id, session.id))

    await logAudit({
      actorId: session.userId,
      actorType: 'user',
      action: 'auth.device_mismatch',
      targetType: 'session',
      targetId: session.id,
      metadata: { reason: 'Device fingerprint mismatch on token refresh' },
      ipAddress,
      userAgent,
    })

    throw new UnauthorizedError('Device mismatch', 'DEVICE_MISMATCH')
  }

  // Verify user status
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)

  if (!user) {
    throw new UnauthorizedError('User not found', 'USER_NOT_FOUND')
  }

  if (user.status === 'suspended') {
    throw userSuspendedError()
  }

  if (user.status === 'deactivated') {
    throw userDeactivatedError()
  }

  // Sign a new access token
  const accessToken = signAccessToken({ userId: user.id, sessionId: session.id })

  return { accessToken }
}

// ---------------------------------------------------------------------------
// 4. logout
// ---------------------------------------------------------------------------

export async function logout(
  userId: string,
  sessionId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.id, sessionId))

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'auth.logout',
    targetType: 'session',
    targetId: sessionId,
    ipAddress,
    userAgent,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 5. forceLogoutUser
// ---------------------------------------------------------------------------

export async function forceLogoutUser(
  targetUserId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ revokedCount: number }> {
  const now = new Date()

  // Revoke all non-revoked sessions for the target user
  const revoked = await db
    .update(userSessions)
    .set({ revokedAt: now })
    .where(and(eq(userSessions.userId, targetUserId), isNull(userSessions.revokedAt)))
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'auth.force_logout',
    targetType: 'user',
    targetId: targetUserId,
    metadata: { revokedCount: revoked.length },
    ipAddress,
    userAgent,
  })

  return { revokedCount: revoked.length }
}
