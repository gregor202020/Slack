/**
 * User service layer.
 *
 * Handles user listing, profile retrieval/update, role management,
 * status changes (suspend/unsuspend/deactivate/reactivate),
 * session listing, and account unlock.
 */

import { eq, and, desc, count, isNull, ne, sql } from 'drizzle-orm'
import { db, users, userSessions, positions, userVenues, venues } from '@smoker/db'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { logAudit } from '../lib/audit.js'
import { getConfig } from '../lib/config.js'
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  lastSuperAdminError,
  userSuspendedError,
  userDeactivatedError,
} from '../lib/errors.js'
import { forceLogoutUser } from './auth.service.js'
import { canManageRole, type OrgRole } from '../middleware/roles.js'
import { logger } from '../lib/logger.js'

// ---------------------------------------------------------------------------
// S3 client (lazy singleton)
// ---------------------------------------------------------------------------

let _s3: S3Client | null = null

function getS3Client(): S3Client {
  if (_s3) return _s3

  const config = getConfig()
  _s3 = new S3Client({
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    credentials: {
      accessKeyId: config.s3AccessKey,
      secretAccessKey: config.s3SecretKey,
    },
    forcePathStyle: true,
  })

  return _s3
}

const AVATAR_UPLOAD_EXPIRY_SECONDS = 300

// ---------------------------------------------------------------------------
// 1. listUsers
// ---------------------------------------------------------------------------

export async function listUsers(options: {
  status?: string
  role?: string
  venueId?: string
  cursor?: string
  limit?: number
}): Promise<{
  users: Array<{
    id: string
    phone: string
    fullName: string
    email: string | null
    orgRole: string
    status: string
    positionName: string | null
    createdAt: Date
  }>
  nextCursor: string | null
}> {
  const { status, role, venueId, cursor, limit = 25 } = options

  // Build conditions
  const conditions = []

  if (status) {
    conditions.push(eq(users.status, status))
  }

  if (role) {
    conditions.push(eq(users.orgRole, role))
  }

  if (cursor) {
    conditions.push(sql`${users.createdAt} < ${new Date(cursor)}`)
  }

  // If filtering by venue, join through userVenues
  let query

  if (venueId) {
    conditions.push(eq(userVenues.venueId, venueId))

    query = db
      .select({
        id: users.id,
        phone: users.phone,
        fullName: users.fullName,
        email: users.email,
        orgRole: users.orgRole,
        status: users.status,
        positionName: positions.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(userVenues, eq(users.id, userVenues.userId))
      .leftJoin(positions, eq(users.positionId, positions.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(limit + 1)
  } else {
    query = db
      .select({
        id: users.id,
        phone: users.phone,
        fullName: users.fullName,
        email: users.email,
        orgRole: users.orgRole,
        status: users.status,
        positionName: positions.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(positions, eq(users.positionId, positions.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(limit + 1)
  }

  const rows = await query

  const hasMore = rows.length > limit
  const resultRows = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? resultRows[resultRows.length - 1]!.createdAt.toISOString() : null

  return {
    users: resultRows.map((row) => ({
      id: row.id,
      phone: row.phone,
      fullName: row.fullName,
      email: row.email,
      orgRole: row.orgRole,
      status: row.status,
      positionName: row.positionName ?? null,
      createdAt: row.createdAt,
    })),
    nextCursor,
  }
}

// ---------------------------------------------------------------------------
// 2. getMe
// ---------------------------------------------------------------------------

export async function getMe(userId: string): Promise<{
  id: string
  phone: string
  fullName: string
  email: string | null
  address: string | null
  positionId: string | null
  positionName: string | null
  avatarUrl: string | null
  displayName: string | null
  bio: string | null
  timezone: string
  theme: string
  notificationSound: boolean
  notificationDesktop: boolean
  orgRole: string
  status: string
  quietHoursEnabled: boolean
  profileCompletedAt: Date | null
  venues: Array<{ venueId: string; venueName: string; venueRole: string; joinedAt: Date }>
}> {
  const [user] = await db
    .select({
      id: users.id,
      phone: users.phone,
      fullName: users.fullName,
      email: users.email,
      address: users.address,
      positionId: users.positionId,
      positionName: positions.name,
      avatarUrl: users.avatarUrl,
      displayName: users.displayName,
      bio: users.bio,
      timezone: users.timezone,
      theme: users.theme,
      notificationSound: users.notificationSound,
      notificationDesktop: users.notificationDesktop,
      orgRole: users.orgRole,
      status: users.status,
      quietHoursEnabled: users.quietHoursEnabled,
      profileCompletedAt: users.profileCompletedAt,
    })
    .from(users)
    .leftJoin(positions, eq(users.positionId, positions.id))
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  // Fetch venues the user belongs to
  const userVenueRows = await db
    .select({
      venueId: userVenues.venueId,
      venueName: venues.name,
      venueRole: userVenues.venueRole,
      joinedAt: userVenues.joinedAt,
    })
    .from(userVenues)
    .innerJoin(venues, eq(userVenues.venueId, venues.id))
    .where(eq(userVenues.userId, userId))

  return {
    id: user.id,
    phone: user.phone,
    fullName: user.fullName,
    email: user.email,
    address: user.address,
    positionId: user.positionId,
    positionName: user.positionName ?? null,
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    bio: user.bio,
    timezone: user.timezone,
    theme: user.theme,
    notificationSound: user.notificationSound,
    notificationDesktop: user.notificationDesktop,
    orgRole: user.orgRole,
    status: user.status,
    quietHoursEnabled: user.quietHoursEnabled,
    profileCompletedAt: user.profileCompletedAt,
    venues: userVenueRows.map((v) => ({
      venueId: v.venueId,
      venueName: v.venueName,
      venueRole: v.venueRole,
      joinedAt: v.joinedAt,
    })),
  }
}

// ---------------------------------------------------------------------------
// 3. getUserById
// ---------------------------------------------------------------------------

export async function getUserById(
  userId: string,
  requesterId: string,
  requesterRole: string,
): Promise<Record<string, unknown>> {
  const isAdmin = requesterRole === 'admin' || requesterRole === 'super_admin'

  const [user] = await db
    .select({
      id: users.id,
      phone: users.phone,
      fullName: users.fullName,
      email: users.email,
      address: users.address,
      positionId: users.positionId,
      positionName: positions.name,
      avatarUrl: users.avatarUrl,
      displayName: users.displayName,
      bio: users.bio,
      timezone: users.timezone,
      theme: users.theme,
      notificationSound: users.notificationSound,
      notificationDesktop: users.notificationDesktop,
      orgRole: users.orgRole,
      status: users.status,
      quietHoursEnabled: users.quietHoursEnabled,
      profileCompletedAt: users.profileCompletedAt,
    })
    .from(users)
    .leftJoin(positions, eq(users.positionId, positions.id))
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  if (isAdmin) {
    // Audit log PII access
    await logAudit({
      actorId: requesterId,
      actorType: 'user',
      action: 'user.pii_accessed',
      targetType: 'user',
      targetId: userId,
    })

    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      email: user.email,
      address: user.address,
      positionId: user.positionId,
      positionName: user.positionName ?? null,
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      bio: user.bio,
      timezone: user.timezone,
      theme: user.theme,
      notificationSound: user.notificationSound,
      notificationDesktop: user.notificationDesktop,
      orgRole: user.orgRole,
      status: user.status,
      quietHoursEnabled: user.quietHoursEnabled,
      profileCompletedAt: user.profileCompletedAt,
    }
  }

  // Non-admin users see limited profile
  return {
    id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    bio: user.bio,
    orgRole: user.orgRole,
    status: user.status,
    positionName: user.positionName ?? null,
  }
}

// ---------------------------------------------------------------------------
// 4. updateProfile
// ---------------------------------------------------------------------------

export async function updateProfile(
  userId: string,
  data: Partial<{
    fullName: string
    email: string
    address: string
    positionId: string
    timezone: string
    quietHoursEnabled: boolean
  }>,
  ipAddress: string,
  userAgent: string,
): Promise<Record<string, unknown>> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (data.fullName !== undefined) updateData.fullName = data.fullName
  if (data.email !== undefined) updateData.email = data.email
  if (data.address !== undefined) updateData.address = data.address
  if (data.positionId !== undefined) updateData.positionId = data.positionId
  if (data.timezone !== undefined) updateData.timezone = data.timezone
  if (data.quietHoursEnabled !== undefined) updateData.quietHoursEnabled = data.quietHoursEnabled

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning()

  if (!updated) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'user.profile_updated',
    targetType: 'user',
    targetId: userId,
    metadata: { updatedFields: Object.keys(data) },
    ipAddress,
    userAgent,
  })

  return {
    id: updated.id,
    phone: updated.phone,
    fullName: updated.fullName,
    email: updated.email,
    address: updated.address,
    positionId: updated.positionId,
    avatarUrl: updated.avatarUrl,
    displayName: updated.displayName,
    bio: updated.bio,
    timezone: updated.timezone,
    theme: updated.theme,
    notificationSound: updated.notificationSound,
    notificationDesktop: updated.notificationDesktop,
    orgRole: updated.orgRole,
    status: updated.status,
    quietHoursEnabled: updated.quietHoursEnabled,
    profileCompletedAt: updated.profileCompletedAt,
  }
}

// ---------------------------------------------------------------------------
// 5. changeOrgRole
// ---------------------------------------------------------------------------

export async function changeOrgRole(
  targetUserId: string,
  newRole: string,
  actorId: string,
  actorRole: string,
  ipAddress: string,
  userAgent: string,
): Promise<Record<string, unknown>> {
  // Find target user
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)

  if (!target) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  // Check actor can manage this role change
  if (!canManageRole(actorRole as OrgRole, newRole as OrgRole)) {
    throw new ForbiddenError(
      'You do not have permission to assign this role',
      'INSUFFICIENT_ROLE',
    )
  }

  // If demoting from super_admin, ensure they are not the last one
  if (target.orgRole === 'super_admin' && newRole !== 'super_admin') {
    const [superAdminCount] = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.orgRole, 'super_admin'))

    if (superAdminCount && superAdminCount.total <= 1) {
      throw lastSuperAdminError()
    }
  }

  const [updated] = await db
    .update(users)
    .set({ orgRole: newRole, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))
    .returning()

  logger.warn(
    { actorId, targetUserId, previousRole: target.orgRole, newRole },
    'User role changed',
  )

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'user.role_changed',
    targetType: 'user',
    targetId: targetUserId,
    metadata: { previousRole: target.orgRole, newRole },
    ipAddress,
    userAgent,
  })

  return {
    id: updated!.id,
    fullName: updated!.fullName,
    orgRole: updated!.orgRole,
    status: updated!.status,
  }
}

// ---------------------------------------------------------------------------
// 6. suspendUser
// ---------------------------------------------------------------------------

export async function suspendUser(
  targetUserId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)

  if (!target) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  // Cannot suspend yourself
  if (targetUserId === actorId) {
    throw new ForbiddenError('Cannot suspend yourself', 'CANNOT_SELF_SUSPEND')
  }

  // If target is super_admin, ensure they are not the last one
  if (target.orgRole === 'super_admin') {
    const [superAdminCount] = await db
      .select({ total: count() })
      .from(users)
      .where(
        and(eq(users.orgRole, 'super_admin'), ne(users.status, 'suspended')),
      )

    if (superAdminCount && superAdminCount.total <= 1) {
      throw lastSuperAdminError()
    }
  }

  await db
    .update(users)
    .set({ status: 'suspended', updatedAt: new Date() })
    .where(eq(users.id, targetUserId))

  // Force-logout all sessions
  await forceLogoutUser(targetUserId, actorId, ipAddress, userAgent)

  logger.warn({ actorId, targetUserId }, 'User suspended')

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'user.suspended',
    targetType: 'user',
    targetId: targetUserId,
    ipAddress,
    userAgent,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 7. unsuspendUser
// ---------------------------------------------------------------------------

export async function unsuspendUser(
  targetUserId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)

  if (!target) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  if (target.status !== 'suspended') {
    throw new ValidationError('User is not suspended', 'USER_NOT_SUSPENDED')
  }

  await db
    .update(users)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(users.id, targetUserId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'user.unsuspended',
    targetType: 'user',
    targetId: targetUserId,
    ipAddress,
    userAgent,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 8. deactivateUser
// ---------------------------------------------------------------------------

export async function deactivateUser(
  targetUserId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)

  if (!target) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  // Cannot deactivate yourself
  if (targetUserId === actorId) {
    throw new ForbiddenError('Cannot deactivate yourself', 'CANNOT_SELF_DEACTIVATE')
  }

  // If target is super_admin, ensure they are not the last one
  if (target.orgRole === 'super_admin') {
    const [superAdminCount] = await db
      .select({ total: count() })
      .from(users)
      .where(
        and(eq(users.orgRole, 'super_admin'), ne(users.status, 'deactivated')),
      )

    if (superAdminCount && superAdminCount.total <= 1) {
      throw lastSuperAdminError()
    }
  }

  await db
    .update(users)
    .set({ status: 'deactivated', updatedAt: new Date() })
    .where(eq(users.id, targetUserId))

  // Force-logout all sessions
  await forceLogoutUser(targetUserId, actorId, ipAddress, userAgent)

  logger.warn({ actorId, targetUserId }, 'User deactivated')

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'user.deactivated',
    targetType: 'user',
    targetId: targetUserId,
    ipAddress,
    userAgent,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 9. reactivateUser
// ---------------------------------------------------------------------------

export async function reactivateUser(
  targetUserId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)

  if (!target) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  if (target.status !== 'deactivated') {
    throw new ValidationError('User is not deactivated', 'USER_NOT_DEACTIVATED')
  }

  await db
    .update(users)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(users.id, targetUserId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'user.reactivated',
    targetType: 'user',
    targetId: targetUserId,
    ipAddress,
    userAgent,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 10. listUserSessions
// ---------------------------------------------------------------------------

export async function listUserSessions(
  targetUserId: string,
): Promise<
  Array<{
    id: string
    createdAt: Date
    expiresAt: Date
    deviceFingerprintHash: string | null
  }>
> {
  const sessions = await db
    .select({
      id: userSessions.id,
      createdAt: userSessions.createdAt,
      expiresAt: userSessions.expiresAt,
      deviceFingerprintHash: userSessions.deviceFingerprintHash,
    })
    .from(userSessions)
    .where(and(eq(userSessions.userId, targetUserId), isNull(userSessions.revokedAt)))
    .orderBy(desc(userSessions.createdAt))

  return sessions
}

// ---------------------------------------------------------------------------
// 11. unlockUser
// ---------------------------------------------------------------------------

export async function unlockUser(
  targetUserId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)

  if (!target) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  await db
    .update(users)
    .set({
      failedOtpAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetUserId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'user.unlocked',
    targetType: 'user',
    targetId: targetUserId,
    ipAddress,
    userAgent,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 12. updateUserProfile (displayName, bio, timezone)
// ---------------------------------------------------------------------------

export async function updateUserProfile(
  userId: string,
  data: Partial<{
    displayName: string
    bio: string
    timezone: string
  }>,
  ipAddress: string,
  userAgent: string,
): Promise<Record<string, unknown>> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (data.displayName !== undefined) updateData.displayName = data.displayName
  if (data.bio !== undefined) updateData.bio = data.bio
  if (data.timezone !== undefined) updateData.timezone = data.timezone

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning()

  if (!updated) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'user.profile_updated',
    targetType: 'user',
    targetId: userId,
    metadata: { updatedFields: Object.keys(data) },
    ipAddress,
    userAgent,
  })

  return {
    id: updated.id,
    phone: updated.phone,
    fullName: updated.fullName,
    email: updated.email,
    avatarUrl: updated.avatarUrl,
    displayName: updated.displayName,
    bio: updated.bio,
    timezone: updated.timezone,
    theme: updated.theme,
    notificationSound: updated.notificationSound,
    notificationDesktop: updated.notificationDesktop,
    orgRole: updated.orgRole,
    status: updated.status,
  }
}

// ---------------------------------------------------------------------------
// 13. updatePreferences (theme, notificationSound, notificationDesktop)
// ---------------------------------------------------------------------------

export async function updatePreferences(
  userId: string,
  data: Partial<{
    theme: string
    notificationSound: boolean
    notificationDesktop: boolean
  }>,
  ipAddress: string,
  userAgent: string,
): Promise<Record<string, unknown>> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (data.theme !== undefined) updateData.theme = data.theme
  if (data.notificationSound !== undefined) updateData.notificationSound = data.notificationSound
  if (data.notificationDesktop !== undefined) updateData.notificationDesktop = data.notificationDesktop

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning()

  if (!updated) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'user.preferences_updated',
    targetType: 'user',
    targetId: userId,
    metadata: { updatedFields: Object.keys(data) },
    ipAddress,
    userAgent,
  })

  return {
    theme: updated.theme,
    notificationSound: updated.notificationSound,
    notificationDesktop: updated.notificationDesktop,
  }
}

// ---------------------------------------------------------------------------
// 14. getAvatarUploadUrl — presigned S3 URL for avatar upload
// ---------------------------------------------------------------------------

export async function getAvatarUploadUrl(
  userId: string,
  contentType: string,
): Promise<{ uploadUrl: string; avatarUrl: string }> {
  const config = getConfig()
  const s3 = getS3Client()

  const ext = contentType === 'image/png' ? 'png'
    : contentType === 'image/webp' ? 'webp'
    : contentType === 'image/gif' ? 'gif'
    : 'jpg'

  const s3Key = `avatars/${userId}/${Date.now()}.${ext}`

  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: s3Key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: AVATAR_UPLOAD_EXPIRY_SECONDS,
  })

  const avatarUrl = `${config.s3FileDomain}/${s3Key}`

  // Save the avatar URL immediately — the client will upload to the presigned URL
  await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId))

  logger.info({ userId, s3Key }, 'Avatar upload URL generated')

  return { uploadUrl, avatarUrl }
}

// ---------------------------------------------------------------------------
// 15. removeAvatar — delete avatar from S3 and clear URL
// ---------------------------------------------------------------------------

export async function removeAvatar(
  userId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  const [user] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  if (user.avatarUrl) {
    // Extract S3 key from the URL
    const config = getConfig()
    const s3Key = user.avatarUrl.replace(`${config.s3FileDomain}/`, '')

    try {
      const s3 = getS3Client()
      await s3.send(
        new DeleteObjectCommand({
          Bucket: config.s3Bucket,
          Key: s3Key,
        }),
      )
    } catch (err) {
      logger.warn({ userId, s3Key, err }, 'Failed to delete avatar from S3')
    }
  }

  await db
    .update(users)
    .set({ avatarUrl: null, updatedAt: new Date() })
    .where(eq(users.id, userId))

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'user.avatar_removed',
    targetType: 'user',
    targetId: userId,
    ipAddress,
    userAgent,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 16. getUserProfile — public profile info for another user
// ---------------------------------------------------------------------------

export async function getUserProfile(
  targetUserId: string,
): Promise<Record<string, unknown>> {
  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      displayName: users.displayName,
      bio: users.bio,
      orgRole: users.orgRole,
      status: users.status,
      positionName: positions.name,
    })
    .from(users)
    .leftJoin(positions, eq(users.positionId, positions.id))
    .where(eq(users.id, targetUserId))
    .limit(1)

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  return {
    id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    bio: user.bio,
    orgRole: user.orgRole,
    status: user.status,
    positionName: user.positionName ?? null,
  }
}
