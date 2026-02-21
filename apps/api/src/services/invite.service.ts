/**
 * Invite service layer.
 *
 * Handles sending, listing, resending, verifying, and cancelling
 * invite links. Invite tokens are HMAC-signed and bound to a
 * hashed phone number so they cannot be reused across recipients.
 */

import { eq, and, gt, desc, isNull, lt } from 'drizzle-orm'
import { db, invites, users } from '@smoker/db'
import { hashToken, generateToken, sha256, hmacSign, hmacVerify } from '../lib/crypto.js'
import { logger } from '../lib/logger.js'
import { logAudit } from '../lib/audit.js'
import { getConfig } from '../lib/config.js'
import {
  NotFoundError,
  ConflictError,
  UnauthorizedError,
} from '../lib/errors.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const DEFAULT_PAGE_LIMIT = 50

// ---------------------------------------------------------------------------
// 1. sendInvite
// ---------------------------------------------------------------------------

export async function sendInvite(
  phone: string,
  invitedBy: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ inviteId: string; inviteLink: string; expiresAt: Date }> {
  const config = getConfig()
  const phoneHash = sha256(phone)

  // Check if user already exists with this phone
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1)

  if (existingUser) {
    throw new ConflictError('Phone number already registered', 'PHONE_ALREADY_REGISTERED')
  }

  // Check if a pending (non-expired, non-accepted) invite exists for this phoneHash
  const now = new Date()
  const [pendingInvite] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.phoneHash, phoneHash),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, now),
      ),
    )
    .limit(1)

  if (pendingInvite) {
    throw new ConflictError('Pending invite already exists', 'INVITE_ALREADY_PENDING')
  }

  // Generate token (256 bits) and HMAC signature
  const token = generateToken(32)
  const signature = hmacSign(token + ':' + phoneHash, config.jwtSecret)
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS)

  // Store invite
  const [invite] = await db
    .insert(invites)
    .values({
      phoneHash,
      tokenHash,
      invitedBy,
      expiresAt,
    })
    .returning()

  if (!invite) {
    throw new Error('Failed to create invite')
  }

  // Build invite link
  const inviteLink = `${config.webUrl}/invite?token=${token}&sig=${signature}`

  // Send SMS in production, log in development
  if (config.isDevelopment) {
    logger.info({ phone, inviteLink }, 'DEV invite link generated')
  } else {
    const twilio = (await import('twilio')).default
    const client = twilio(config.twilioAccountSid, config.twilioAuthToken)
    await client.messages.create({
      body: `You've been invited to The Smoker! Accept your invite here: ${inviteLink}`,
      from: config.twilioPhoneNumber,
      to: phone,
    })
  }

  // Audit log
  await logAudit({
    actorId: invitedBy,
    actorType: 'user',
    action: 'invite.sent',
    targetType: 'invite',
    targetId: invite.id,
    metadata: { phoneHash },
    ipAddress,
    userAgent,
  })

  return { inviteId: invite.id, inviteLink, expiresAt }
}

// ---------------------------------------------------------------------------
// 2. listInvites
// ---------------------------------------------------------------------------

export async function listInvites(
  cursor?: string,
  limit?: number,
): Promise<{
  items: Array<{
    id: string
    phoneHash: string
    invitedByName: string
    status: 'accepted' | 'expired' | 'pending'
    createdAt: Date
    expiresAt: Date
  }>
  nextCursor: string | null
}> {
  const pageLimit = Math.min(limit ?? DEFAULT_PAGE_LIMIT, 100)
  const now = new Date()

  // Build base query with cursor-based pagination
  const conditions = cursor ? [lt(invites.createdAt, new Date(cursor))] : []

  const rows = await db
    .select({
      id: invites.id,
      phoneHash: invites.phoneHash,
      invitedByName: users.fullName,
      acceptedAt: invites.acceptedAt,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .leftJoin(users, eq(invites.invitedBy, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invites.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const items = rows.slice(0, pageLimit).map((row) => {
    let status: 'accepted' | 'expired' | 'pending'
    if (row.acceptedAt) {
      status = 'accepted'
    } else if (row.expiresAt < now) {
      status = 'expired'
    } else {
      status = 'pending'
    }

    return {
      id: row.id,
      phoneHash: row.phoneHash,
      invitedByName: row.invitedByName ?? 'Unknown',
      status,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }
  })

  const lastItem = items[items.length - 1]
  const nextCursor = hasMore && lastItem ? lastItem.createdAt.toISOString() : null

  return { items, nextCursor }
}

// ---------------------------------------------------------------------------
// 3. resendInvite
// ---------------------------------------------------------------------------

export async function resendInvite(
  inviteId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ inviteLink: string; expiresAt: Date }> {
  const config = getConfig()

  // Find invite by id
  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.id, inviteId))
    .limit(1)

  if (!invite) {
    throw new NotFoundError('Invite not found', 'INVITE_NOT_FOUND')
  }

  if (invite.acceptedAt) {
    throw new ConflictError('Invite already accepted', 'INVITE_ALREADY_ACCEPTED')
  }

  // Generate new token and signature
  const token = generateToken(32)
  const signature = hmacSign(token + ':' + invite.phoneHash, config.jwtSecret)
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS)

  // Update invite with new token and expiry
  await db
    .update(invites)
    .set({ tokenHash, expiresAt })
    .where(eq(invites.id, inviteId))

  // Build new invite link
  const inviteLink = `${config.webUrl}/invite?token=${token}&sig=${signature}`

  // Look up the original phone to send SMS (we only have the hash, so we
  // cannot reverse it). For resend we rely on the admin knowing the
  // recipient — the link is returned to the admin to share manually, but
  // we cannot SMS without the plaintext phone. In production you would
  // store an encrypted phone alongside the hash, but for now we log in dev
  // and return the link for the admin to forward.
  if (config.isDevelopment) {
    logger.info({ inviteId, inviteLink }, 'DEV resent invite link')
  }

  // Audit log
  await logAudit({
    actorId,
    actorType: 'user',
    action: 'invite.resent',
    targetType: 'invite',
    targetId: inviteId,
    metadata: { phoneHash: invite.phoneHash },
    ipAddress,
    userAgent,
  })

  return { inviteLink, expiresAt }
}

// ---------------------------------------------------------------------------
// 4. verifyInvite
// ---------------------------------------------------------------------------

export async function verifyInvite(
  token: string,
  signature: string,
  phone: string,
): Promise<{ userId: string; phone: string }> {
  const config = getConfig()
  const tokenHash = hashToken(token)

  // Find invite by tokenHash
  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, tokenHash))
    .limit(1)

  if (!invite) {
    throw new NotFoundError('Invite not found', 'INVITE_NOT_FOUND')
  }

  // Check if already accepted
  if (invite.acceptedAt) {
    throw new ConflictError('Invite already used', 'INVITE_ALREADY_ACCEPTED')
  }

  // Check expiry
  if (invite.expiresAt < new Date()) {
    throw new UnauthorizedError('Invite has expired', 'INVITE_EXPIRED')
  }

  // Verify HMAC signature
  const isValid = hmacVerify(token + ':' + invite.phoneHash, signature, config.jwtSecret)

  if (!isValid) {
    throw new UnauthorizedError('Invalid invite signature', 'INVALID_INVITE_SIGNATURE')
  }

  // Verify phone matches the stored hash
  const providedPhoneHash = sha256(phone)

  if (providedPhoneHash !== invite.phoneHash) {
    throw new UnauthorizedError(
      'Phone number does not match invite',
      'PHONE_MISMATCH',
    )
  }

  // Mark invite as accepted
  await db
    .update(invites)
    .set({ acceptedAt: new Date() })
    .where(eq(invites.id, invite.id))

  // Create user with status 'invited' (will be activated on first OTP login)
  const [user] = await db
    .insert(users)
    .values({
      phone,
      fullName: '',
      status: 'invited',
    })
    .returning()

  if (!user) {
    throw new Error('Failed to create user from invite')
  }

  return { userId: user.id, phone }
}

// ---------------------------------------------------------------------------
// 5. cancelInvite
// ---------------------------------------------------------------------------

export async function cancelInvite(
  inviteId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  // Find invite
  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.id, inviteId))
    .limit(1)

  if (!invite) {
    throw new NotFoundError('Invite not found', 'INVITE_NOT_FOUND')
  }

  if (invite.acceptedAt) {
    throw new ConflictError('Invite already accepted', 'INVITE_ALREADY_ACCEPTED')
  }

  // Delete the invite row
  await db.delete(invites).where(eq(invites.id, inviteId))

  // Audit log
  await logAudit({
    actorId,
    actorType: 'user',
    action: 'invite.cancelled',
    targetType: 'invite',
    targetId: inviteId,
    metadata: { phoneHash: invite.phoneHash },
    ipAddress,
    userAgent,
  })

  return { success: true }
}
