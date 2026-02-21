/**
 * File service layer.
 *
 * Handles file uploads to S3, metadata retrieval, signed download URLs,
 * soft deletion (vault), and storage quota tracking.
 *
 * Spec references: Section 9
 */

import { eq, and, isNull, sql, desc } from 'drizzle-orm'
import { db, files, channelMembers, dmMembers, deletedVault } from '@smoker/db'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { BLOCKED_FILE_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '@smoker/shared'
import { getConfig } from '../lib/config.js'
import { sanitizeFilename } from '../lib/sanitize.js'
import { sha256 } from '../lib/crypto.js'
import { logAudit } from '../lib/audit.js'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  fileTooLargeError,
  blockedFileTypeError,
  storageQuotaExceededError,
} from '../lib/errors.js'
import { logger } from '../lib/logger.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_LIMIT = 50
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour
const VAULT_RETENTION_DAYS = 180

/** Per-user storage quota in bytes (1 GB). */
const USER_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024

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

/** Reset the S3 client singleton (for testing only). */
export function __resetS3Client(): void {
  _s3 = null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminOrAbove(orgRole: string): boolean {
  return orgRole === 'admin' || orgRole === 'super_admin'
}

/**
 * Check that the user has access to a file based on its channel/DM
 * membership, or is an admin.
 */
async function assertFileAccess(
  file: {
    channelId: string | null
    dmId: string | null
    userId: string
  },
  userId: string,
  orgRole: string,
): Promise<void> {
  // Admins can access any file
  if (isAdminOrAbove(orgRole)) return

  // File owner always has access
  if (file.userId === userId) return

  // Check channel membership
  if (file.channelId) {
    const [membership] = await db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(
        and(
          eq(channelMembers.channelId, file.channelId),
          eq(channelMembers.userId, userId),
        ),
      )
      .limit(1)

    if (membership) return
  }

  // Check DM membership
  if (file.dmId) {
    const [membership] = await db
      .select({ dmId: dmMembers.dmId })
      .from(dmMembers)
      .where(and(eq(dmMembers.dmId, file.dmId), eq(dmMembers.userId, userId)))
      .limit(1)

    if (membership) return
  }

  throw new ForbiddenError('You do not have access to this file', 'FILE_ACCESS_DENIED')
}

// ---------------------------------------------------------------------------
// 1. uploadFile
// ---------------------------------------------------------------------------

export async function uploadFile(options: {
  fileBuffer: Buffer
  filename: string
  mimeType: string
  userId: string
  channelId?: string
  dmId?: string
  ipAddress: string
  userAgent: string
}) {
  const { fileBuffer, filename, mimeType, userId, channelId, dmId, ipAddress, userAgent } =
    options

  // Validate file extension against blocklist
  const ext = filename.includes('.')
    ? `.${filename.split('.').pop()!.toLowerCase()}`
    : ''
  if (BLOCKED_FILE_EXTENSIONS.includes(ext)) {
    throw blockedFileTypeError()
  }

  // Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw fileTooLargeError()
  }

  // Check per-user storage quota
  const { used } = await getStorageUsage(userId)
  if (used + fileBuffer.length > USER_STORAGE_QUOTA_BYTES) {
    throw storageQuotaExceededError()
  }

  // Sanitize filename
  const sanitized = sanitizeFilename(filename)

  // Generate S3 key
  const s3Key = `uploads/${userId}/${Date.now()}-${sanitized}`

  // Upload to S3
  const config = getConfig()
  const s3 = getS3Client()

  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
      ContentDisposition: `attachment; filename="${sanitized}"`,
    }),
  )

  // Insert file record
  const [file] = await db
    .insert(files)
    .values({
      userId,
      channelId: channelId ?? null,
      dmId: dmId ?? null,
      originalFilename: filename,
      sanitizedFilename: sanitized,
      mimeType,
      sizeBytes: BigInt(fileBuffer.length),
      s3Key,
    })
    .returning()

  if (!file) {
    throw new Error('Failed to insert file record')
  }

  // Audit log
  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'file.uploaded',
    targetType: 'file',
    targetId: file.id,
    metadata: {
      filename: sanitized,
      mimeType,
      sizeBytes: fileBuffer.length,
      channelId: channelId ?? null,
      dmId: dmId ?? null,
    },
    ipAddress,
    userAgent,
  })

  logger.info(
    {
      fileId: file.id,
      userId,
      sizeBytes: fileBuffer.length,
      mimeType,
      channelId: channelId ?? null,
      dmId: dmId ?? null,
    },
    'File uploaded',
  )

  return {
    ...file,
    sizeBytes: Number(file.sizeBytes),
  }
}

// ---------------------------------------------------------------------------
// 2. getFileById
// ---------------------------------------------------------------------------

export async function getFileById(fileId: string, userId: string, orgRole: string) {
  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1)

  if (!file) {
    throw new NotFoundError('File not found', 'FILE_NOT_FOUND')
  }

  await assertFileAccess(file, userId, orgRole)

  return {
    ...file,
    sizeBytes: Number(file.sizeBytes),
  }
}

// ---------------------------------------------------------------------------
// 3. getFileDownloadUrl
// ---------------------------------------------------------------------------

export async function getFileDownloadUrl(
  fileId: string,
  userId: string,
  orgRole: string,
) {
  const file = await getFileById(fileId, userId, orgRole)

  const config = getConfig()
  const s3 = getS3Client()

  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: file.s3Key,
    ResponseContentDisposition: `attachment; filename="${file.sanitizedFilename}"`,
  })

  const url = await getSignedUrl(s3, command, {
    expiresIn: SIGNED_URL_EXPIRY_SECONDS,
  })

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000)

  logger.info(
    { fileId, userId, sizeBytes: file.sizeBytes },
    'File download URL generated',
  )

  return { url, expiresAt: expiresAt.toISOString() }
}

// ---------------------------------------------------------------------------
// 4. deleteFile
// ---------------------------------------------------------------------------

export async function deleteFile(
  fileId: string,
  userId: string,
  orgRole: string,
  ipAddress: string,
  userAgent: string,
) {
  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1)

  if (!file) {
    throw new NotFoundError('File not found', 'FILE_NOT_FOUND')
  }

  // Only file owner or admin can delete
  if (file.userId !== userId && !isAdminOrAbove(orgRole)) {
    throw new ForbiddenError(
      'Only file owner or admin can delete',
      'DELETE_FORBIDDEN',
    )
  }

  // Move to vault
  const purgeAfter = new Date()
  purgeAfter.setDate(purgeAfter.getDate() + VAULT_RETENTION_DAYS)

  const contentPayload = {
    id: file.id,
    userId: file.userId,
    channelId: file.channelId,
    dmId: file.dmId,
    messageId: file.messageId,
    originalFilename: file.originalFilename,
    sanitizedFilename: file.sanitizedFilename,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    s3Key: file.s3Key,
    createdAt: file.createdAt,
  }

  await db.insert(deletedVault).values({
    originalType: 'file',
    originalId: file.id,
    content: contentPayload,
    contentHash: sha256(JSON.stringify(contentPayload)),
    deletedBy: userId,
    purgeAfter,
  })

  // Remove file record from files table (soft delete via vault)
  await db.delete(files).where(eq(files.id, fileId))

  const deletedByAdmin = isAdminOrAbove(orgRole) && file.userId !== userId

  logger.info(
    {
      fileId,
      userId,
      sizeBytes: Number(file.sizeBytes),
      deletedByAdmin,
    },
    'File deleted',
  )

  // Audit log
  const action = deletedByAdmin ? 'file.deleted_by_admin' : 'file.deleted'

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action,
    targetType: 'file',
    targetId: fileId,
    metadata: {
      filename: file.sanitizedFilename,
      originalOwnerId: file.userId,
    },
    ipAddress,
    userAgent,
  })

  return { success: true as const }
}

// ---------------------------------------------------------------------------
// 5. listChannelFiles
// ---------------------------------------------------------------------------

export async function listChannelFiles(
  channelId: string,
  cursor?: string,
  limit?: number,
) {
  const pageLimit = Math.min(limit ?? DEFAULT_PAGE_LIMIT, 100)

  const conditions = [eq(files.channelId, channelId)]

  if (cursor) {
    conditions.push(sql`${files.createdAt} < ${cursor}`)
  }

  const rows = await db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore
    ? page[page.length - 1]!.createdAt.toISOString()
    : null

  return {
    files: page.map((f) => ({ ...f, sizeBytes: Number(f.sizeBytes) })),
    nextCursor,
  }
}

// ---------------------------------------------------------------------------
// 6. listDmFiles
// ---------------------------------------------------------------------------

export async function listDmFiles(
  dmId: string,
  cursor?: string,
  limit?: number,
) {
  const pageLimit = Math.min(limit ?? DEFAULT_PAGE_LIMIT, 100)

  const conditions = [eq(files.dmId, dmId)]

  if (cursor) {
    conditions.push(sql`${files.createdAt} < ${cursor}`)
  }

  const rows = await db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore
    ? page[page.length - 1]!.createdAt.toISOString()
    : null

  return {
    files: page.map((f) => ({ ...f, sizeBytes: Number(f.sizeBytes) })),
    nextCursor,
  }
}

// ---------------------------------------------------------------------------
// 7. listMyFiles
// ---------------------------------------------------------------------------

export async function listMyFiles(
  userId: string,
  cursor?: string,
  limit?: number,
) {
  const pageLimit = Math.min(limit ?? DEFAULT_PAGE_LIMIT, 100)

  const conditions = [eq(files.userId, userId)]

  if (cursor) {
    conditions.push(sql`${files.createdAt} < ${cursor}`)
  }

  const rows = await db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore
    ? page[page.length - 1]!.createdAt.toISOString()
    : null

  return {
    files: page.map((f) => ({ ...f, sizeBytes: Number(f.sizeBytes) })),
    nextCursor,
  }
}

// ---------------------------------------------------------------------------
// 8. getStorageUsage
// ---------------------------------------------------------------------------

export async function getStorageUsage(userId: string) {
  const [result] = await db
    .select({
      totalBytes: sql<string>`coalesce(sum(${files.sizeBytes}), 0)`,
    })
    .from(files)
    .where(eq(files.userId, userId))

  const used = Number(result?.totalBytes ?? 0)
  const quota = USER_STORAGE_QUOTA_BYTES
  const percentage = quota > 0 ? Math.round((used / quota) * 10000) / 100 : 0

  return { used, quota, percentage }
}
