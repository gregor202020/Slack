/**
 * Admin service layer.
 *
 * Handles bulk delete, audit log queries, data export,
 * and deleted-content vault operations.
 */

import { eq, and, desc, lt, gte, isNull, sql, count } from 'drizzle-orm'
import {
  db,
  messages,
  auditLogs,
  deletedVault,
  dataExports,
  users,
  channels,
  channelMembers,
  dmMembers,
  files,
  announcements,
} from '@smoker/db'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getConfig } from '../lib/config.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'
import { sha256 } from '../lib/crypto.js'
import { logger } from '../lib/logger.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_LIMIT = 50
const VAULT_RETENTION_DAYS = 180
const EXPORT_HARD_LIMIT = 10_000
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour

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

// ===========================================================================
// 1. Bulk Delete
// ===========================================================================

/**
 * Preview how many messages would be affected by a bulk delete operation.
 * Excludes announcements (messages with no channelId/dmId association are
 * skipped — announcements live in a separate table).
 */
export async function previewBulkDelete(
  scope: 'org' | 'channel',
  channelId?: string,
  olderThanDays?: number,
) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (olderThanDays ?? 90))

  const conditions = [
    isNull(messages.deletedAt),
    lt(messages.createdAt, cutoff),
  ]

  if (scope === 'channel') {
    if (!channelId) {
      throw new ValidationError(
        'channelId is required for channel-scoped bulk delete',
        'CHANNEL_ID_REQUIRED',
      )
    }
    conditions.push(eq(messages.channelId, channelId))
  }

  const [result] = await db
    .select({ total: count() })
    .from(messages)
    .where(and(...conditions))

  return { count: result?.total ?? 0, cutoffDate: cutoff.toISOString() }
}

/**
 * Execute a bulk delete operation.
 *
 * - Verify confirmation text matches "DELETE"
 * - Move matching messages to the deleted vault
 * - Soft-delete the messages
 * - Create an audit log entry
 */
export async function executeBulkDelete(
  scope: 'org' | 'channel',
  channelId: string | undefined,
  olderThanDays: number,
  confirmationText: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  if (confirmationText !== 'DELETE') {
    throw new ValidationError(
      'Confirmation text must be exactly "DELETE"',
      'INVALID_CONFIRMATION',
    )
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)

  const conditions = [
    isNull(messages.deletedAt),
    lt(messages.createdAt, cutoff),
  ]

  if (scope === 'channel') {
    if (!channelId) {
      throw new ValidationError(
        'channelId is required for channel-scoped bulk delete',
        'CHANNEL_ID_REQUIRED',
      )
    }
    conditions.push(eq(messages.channelId, channelId))
  }

  const whereClause = and(...conditions)
  const batchSize = 500
  const purgeAfter = new Date()
  purgeAfter.setDate(purgeAfter.getDate() + VAULT_RETENTION_DAYS)

  let totalDeleted = 0

  await db.transaction(async (tx) => {
    // Process messages in batches to avoid loading everything into memory
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const batch = await tx
        .select({
          id: messages.id,
          channelId: messages.channelId,
          dmId: messages.dmId,
          userId: messages.userId,
          body: messages.body,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(whereClause)
        .limit(batchSize)
        .offset(offset)

      if (batch.length === 0) {
        hasMore = false
        break
      }

      // Batch insert into vault
      await tx.insert(deletedVault).values(
        batch.map((msg) => {
          const contentPayload = JSON.stringify(msg)
          return {
            originalType: 'message' as const,
            originalId: msg.id,
            content: msg,
            contentHash: sha256(contentPayload),
            deletedBy: actorId,
            purgeAfter,
          }
        }),
      )

      totalDeleted += batch.length
      offset += batchSize

      if (batch.length < batchSize) {
        hasMore = false
      }
    }

    if (totalDeleted === 0) {
      return
    }

    // Soft-delete all matching messages
    await tx
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(whereClause)

    await logAudit({
      actorId,
      actorType: 'user',
      action: 'bulk_delete.executed',
      targetType: 'messages',
      metadata: {
        scope,
        channelId,
        olderThanDays,
        deletedCount: totalDeleted,
      },
      ipAddress,
      userAgent,
    })
  })

  return { deleted: totalDeleted }
}

// ===========================================================================
// 2. Audit Logs
// ===========================================================================

interface AuditLogFilters {
  action?: string
  actorId?: string
  targetType?: string
  targetId?: string
  startDate?: string
  endDate?: string
  cursor?: string
  limit?: number
}

/**
 * Query audit logs with optional filters and cursor-based pagination.
 */
export async function queryAuditLogs(filters: AuditLogFilters) {
  const pageLimit = Math.min(filters.limit ?? DEFAULT_PAGE_LIMIT, 100)
  const conditions: ReturnType<typeof eq>[] = []

  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action))
  }
  if (filters.actorId) {
    conditions.push(eq(auditLogs.actorId, filters.actorId))
  }
  if (filters.targetType) {
    conditions.push(eq(auditLogs.targetType, filters.targetType))
  }
  if (filters.targetId) {
    conditions.push(eq(auditLogs.targetId, filters.targetId))
  }
  if (filters.startDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(filters.startDate)))
  }
  if (filters.endDate) {
    conditions.push(lt(auditLogs.createdAt, new Date(filters.endDate)))
  }
  if (filters.cursor) {
    conditions.push(lt(auditLogs.createdAt, new Date(filters.cursor)))
  }

  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null

  return { logs: page, nextCursor }
}

/**
 * Retrieve a single audit log entry by ID.
 */
export async function getAuditLogById(logId: string) {
  const [row] = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.id, logId))
    .limit(1)

  if (!row) {
    throw new NotFoundError('Audit log entry not found', 'AUDIT_LOG_NOT_FOUND')
  }

  return row
}

/**
 * Verify the integrity of the audit log hash chain.
 *
 * Walks the chain in chronological order and verifies that each entry's
 * prevHash matches the contentHash of the preceding entry.
 */
export async function verifyHashChain(startDate?: string, endDate?: string) {
  const conditions: ReturnType<typeof eq>[] = []

  if (startDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(startDate)))
  }
  if (endDate) {
    conditions.push(lt(auditLogs.createdAt, new Date(endDate)))
  }

  const rows = await db
    .select({
      id: auditLogs.id,
      contentHash: auditLogs.contentHash,
      prevHash: auditLogs.prevHash,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(auditLogs.createdAt)

  const broken: { id: string; expected: string; actual: string }[] = []
  let verified = true

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!
    const current = rows[i]!

    if (current.prevHash !== prev.contentHash) {
      verified = false
      broken.push({
        id: current.id,
        expected: prev.contentHash ?? 'null',
        actual: current.prevHash ?? 'null',
      })
    }
  }

  return { verified, entries: rows.length, broken }
}

/**
 * Export audit logs in the requested format (JSON or CSV).
 */
export async function exportAuditLogs(
  filters: AuditLogFilters,
  format: 'json' | 'csv',
) {
  const conditions: ReturnType<typeof eq>[] = []

  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action))
  }
  if (filters.actorId) {
    conditions.push(eq(auditLogs.actorId, filters.actorId))
  }
  if (filters.targetType) {
    conditions.push(eq(auditLogs.targetType, filters.targetType))
  }
  if (filters.targetId) {
    conditions.push(eq(auditLogs.targetId, filters.targetId))
  }
  if (filters.startDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(filters.startDate)))
  }
  if (filters.endDate) {
    conditions.push(lt(auditLogs.createdAt, new Date(filters.endDate)))
  }

  // Hard limit to prevent unbounded queries; fetch one extra to detect truncation
  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(EXPORT_HARD_LIMIT + 1)

  const truncated = rows.length > EXPORT_HARD_LIMIT
  const exportRows = truncated ? rows.slice(0, EXPORT_HARD_LIMIT) : rows

  if (format === 'csv') {
    const header =
      'id,actorId,actorType,action,targetType,targetId,ipAddress,userAgent,createdAt'
    const csvRows = exportRows.map(
      (r) =>
        `${r.id},${r.actorId ?? ''},${r.actorType},${r.action},${r.targetType ?? ''},${r.targetId ?? ''},${r.ipAddress ?? ''},${r.userAgent ?? ''},${r.createdAt.toISOString()}`,
    )
    const csvData = [header, ...csvRows].join('\n')
    return {
      format: 'csv' as const,
      data: truncated
        ? csvData + `\n# Export truncated at ${EXPORT_HARD_LIMIT} rows. Apply narrower filters to export remaining data.`
        : csvData,
      truncated,
    }
  }

  return { format: 'json' as const, data: exportRows, truncated }
}

// ===========================================================================
// 3. Data Export
// ===========================================================================

/**
 * Generate an export file, upload to S3, and update the export record.
 * Runs as a background task (fire-and-forget).
 */
async function generateExportFile(exportId: string, scope: 'org' | 'user', targetUserId?: string) {
  try {
    const exportData: Record<string, unknown> = {
      exportId,
      scope,
      generatedAt: new Date().toISOString(),
    }

    if (scope === 'org') {
      const [allUsers, allChannels, allMessages, allAnnouncements, allFiles] = await Promise.all([
        db.select({
          id: users.id,
          fullName: users.fullName,
          phone: users.phone,
          orgRole: users.orgRole,
          status: users.status,
          createdAt: users.createdAt,
        }).from(users).limit(EXPORT_HARD_LIMIT),
        db.select({
          id: channels.id,
          name: channels.name,
          type: channels.type,
          scope: channels.scope,
          venueId: channels.venueId,
          status: channels.status,
          createdAt: channels.createdAt,
        }).from(channels).limit(EXPORT_HARD_LIMIT),
        db.select({
          id: messages.id,
          channelId: messages.channelId,
          dmId: messages.dmId,
          userId: messages.userId,
          body: messages.body,
          createdAt: messages.createdAt,
        }).from(messages).where(isNull(messages.deletedAt)).limit(EXPORT_HARD_LIMIT),
        db.select({
          id: announcements.id,
          scope: announcements.scope,
          title: announcements.title,
          createdAt: announcements.createdAt,
        }).from(announcements).limit(EXPORT_HARD_LIMIT),
        db.select({
          id: files.id,
          userId: files.userId,
          originalFilename: files.originalFilename,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          createdAt: files.createdAt,
        }).from(files).limit(EXPORT_HARD_LIMIT),
      ])

      exportData.users = allUsers
      exportData.channels = allChannels
      exportData.messages = allMessages
      exportData.announcements = allAnnouncements
      exportData.files = allFiles.map((f) => ({ ...f, sizeBytes: Number(f.sizeBytes) }))
    } else if (scope === 'user' && targetUserId) {
      const [userData, userMessages, userDmMemberships, userChannelMemberships, userFiles] = await Promise.all([
        db.select({
          id: users.id,
          fullName: users.fullName,
          phone: users.phone,
          orgRole: users.orgRole,
          status: users.status,
          createdAt: users.createdAt,
        }).from(users).where(eq(users.id, targetUserId)).limit(1),
        db.select({
          id: messages.id,
          channelId: messages.channelId,
          dmId: messages.dmId,
          body: messages.body,
          createdAt: messages.createdAt,
        }).from(messages).where(and(eq(messages.userId, targetUserId), isNull(messages.deletedAt))).limit(EXPORT_HARD_LIMIT),
        db.select({
          dmId: dmMembers.dmId,
          joinedAt: dmMembers.joinedAt,
        }).from(dmMembers).where(eq(dmMembers.userId, targetUserId)),
        db.select({
          channelId: channelMembers.channelId,
          joinedAt: channelMembers.joinedAt,
        }).from(channelMembers).where(eq(channelMembers.userId, targetUserId)),
        db.select({
          id: files.id,
          originalFilename: files.originalFilename,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          createdAt: files.createdAt,
        }).from(files).where(eq(files.userId, targetUserId)).limit(EXPORT_HARD_LIMIT),
      ])

      exportData.user = userData[0] ?? null
      exportData.messages = userMessages
      exportData.dmMemberships = userDmMemberships
      exportData.channelMemberships = userChannelMemberships
      exportData.files = userFiles.map((f) => ({ ...f, sizeBytes: Number(f.sizeBytes) }))
    }

    const jsonContent = JSON.stringify(exportData, null, 2)
    const buffer = Buffer.from(jsonContent, 'utf-8')
    const s3Key = `exports/${exportId}.json`

    const config = getConfig()
    const s3 = getS3Client()

    await s3.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/json',
        ContentDisposition: `attachment; filename="export-${exportId}.json"`,
      }),
    )

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7-day download window

    await db
      .update(dataExports)
      .set({
        status: 'ready',
        s3Key,
        completedAt: new Date(),
        expiresAt,
      })
      .where(eq(dataExports.id, exportId))

    logger.info({ exportId, scope, s3Key }, 'Export file generated and uploaded')
  } catch (err) {
    logger.error({ err, exportId, scope }, 'Failed to generate export file')

    await db
      .update(dataExports)
      .set({ status: 'failed' })
      .where(eq(dataExports.id, exportId))
  }
}

/**
 * Request a full organisation data export.
 */
export async function requestOrgExport(
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [exportRecord] = await db
    .insert(dataExports)
    .values({
      requestedBy: actorId,
      scope: 'org',
      status: 'pending',
    })
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'export.initiated',
    targetType: 'data_export',
    targetId: exportRecord!.id,
    metadata: { exportType: 'org' },
    ipAddress,
    userAgent,
  })

  // Fire-and-forget background export generation
  generateExportFile(exportRecord!.id, 'org')
    .catch((err) => logger.error({ err, exportId: exportRecord!.id }, 'Background org export failed'))

  return exportRecord
}

/**
 * Request a per-user data export (e.g., Subject Access Request).
 */
export async function requestUserExport(
  targetUserId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [exportRecord] = await db
    .insert(dataExports)
    .values({
      requestedBy: actorId,
      scope: 'user',
      targetUserId,
      status: 'pending',
    })
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'export.initiated',
    targetType: 'data_export',
    targetId: exportRecord!.id,
    metadata: { exportType: 'user', targetUserId },
    ipAddress,
    userAgent,
  })

  // Fire-and-forget background export generation
  generateExportFile(exportRecord!.id, 'user', targetUserId)
    .catch((err) => logger.error({ err, exportId: exportRecord!.id }, 'Background user export failed'))

  return exportRecord
}

/**
 * Get the status of an export job.
 */
export async function getExportStatus(exportId: string) {
  const [row] = await db
    .select()
    .from(dataExports)
    .where(eq(dataExports.id, exportId))
    .limit(1)

  if (!row) {
    throw new NotFoundError('Export not found', 'EXPORT_NOT_FOUND')
  }

  return row
}

/**
 * Return a pre-signed S3 download URL for a completed export.
 */
export async function downloadExport(exportId: string) {
  const [row] = await db
    .select()
    .from(dataExports)
    .where(eq(dataExports.id, exportId))
    .limit(1)

  if (!row) {
    throw new NotFoundError('Export not found', 'EXPORT_NOT_FOUND')
  }

  if (row.status !== 'ready') {
    throw new ValidationError(
      `Export is not ready for download (status: ${row.status})`,
      'EXPORT_NOT_READY',
    )
  }

  if (!row.s3Key) {
    throw new ValidationError(
      'Export file is missing',
      'EXPORT_FILE_MISSING',
    )
  }

  const config = getConfig()
  const s3 = getS3Client()

  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: row.s3Key,
    ResponseContentDisposition: `attachment; filename="export-${exportId}.json"`,
  })

  const url = await getSignedUrl(s3, command, {
    expiresIn: SIGNED_URL_EXPIRY_SECONDS,
  })

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000)

  // Record the download timestamp
  await db
    .update(dataExports)
    .set({ downloadedAt: new Date() })
    .where(eq(dataExports.id, exportId))

  return { url, expiresAt: expiresAt.toISOString() }
}

/**
 * List all export records.
 */
export async function listExports() {
  const rows = await db
    .select()
    .from(dataExports)
    .orderBy(desc(dataExports.createdAt))

  return rows
}

// ===========================================================================
// 4. Vault
// ===========================================================================

interface VaultSearchOptions {
  originalType?: string
  search?: string
  cursor?: string
  limit?: number
}

/**
 * Search the deleted-content vault with optional filters.
 */
export async function searchVault(options: VaultSearchOptions) {
  const pageLimit = Math.min(options.limit ?? DEFAULT_PAGE_LIMIT, 100)
  const conditions: ReturnType<typeof eq>[] = []

  if (options.originalType) {
    conditions.push(eq(deletedVault.originalType, options.originalType))
  }

  if (options.cursor) {
    conditions.push(lt(deletedVault.deletedAt, new Date(options.cursor)))
  }

  // Basic text search on the JSONB content field
  if (options.search) {
    conditions.push(
      sql`${deletedVault.content}::text ILIKE ${'%' + options.search + '%'}` as ReturnType<
        typeof eq
      >,
    )
  }

  const rows = await db
    .select({
      id: deletedVault.id,
      originalType: deletedVault.originalType,
      originalId: deletedVault.originalId,
      contentHash: deletedVault.contentHash,
      deletedBy: deletedVault.deletedBy,
      deletedAt: deletedVault.deletedAt,
      purgeAfter: deletedVault.purgeAfter,
      earlyPurgeRequestedAt: deletedVault.earlyPurgeRequestedAt,
      earlyPurgeRequestedBy: deletedVault.earlyPurgeRequestedBy,
    })
    .from(deletedVault)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(deletedVault.deletedAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.deletedAt.toISOString() : null

  return { items: page, nextCursor }
}

/**
 * Get a single vault item with its full content.
 */
export async function getVaultItem(vaultId: string) {
  const [row] = await db
    .select()
    .from(deletedVault)
    .where(eq(deletedVault.id, vaultId))
    .limit(1)

  if (!row) {
    throw new NotFoundError('Vault item not found', 'VAULT_ITEM_NOT_FOUND')
  }

  return row
}

/**
 * Request early purge of a vault item. Sets earlyPurgeRequestedAt with a
 * 48-hour delay before actual purge.
 */
export async function requestEarlyPurge(
  vaultId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [item] = await db
    .select()
    .from(deletedVault)
    .where(eq(deletedVault.id, vaultId))
    .limit(1)

  if (!item) {
    throw new NotFoundError('Vault item not found', 'VAULT_ITEM_NOT_FOUND')
  }

  if (item.earlyPurgeRequestedAt) {
    throw new ValidationError(
      'Early purge has already been requested for this item',
      'PURGE_ALREADY_REQUESTED',
    )
  }

  const [updated] = await db
    .update(deletedVault)
    .set({
      earlyPurgeRequestedAt: new Date(),
      earlyPurgeRequestedBy: actorId,
    })
    .where(eq(deletedVault.id, vaultId))
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'vault.purge_requested',
    targetType: 'vault_item',
    targetId: vaultId,
    metadata: {
      originalType: item.originalType,
      originalId: item.originalId,
      contentHash: item.contentHash,
    },
    ipAddress,
    userAgent,
  })

  return updated
}

/**
 * Cancel a pending early purge request. Can be cancelled by any super admin
 * during the 48-hour delay window.
 */
export async function cancelPurge(
  vaultId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [item] = await db
    .select()
    .from(deletedVault)
    .where(eq(deletedVault.id, vaultId))
    .limit(1)

  if (!item) {
    throw new NotFoundError('Vault item not found', 'VAULT_ITEM_NOT_FOUND')
  }

  if (!item.earlyPurgeRequestedAt) {
    throw new ValidationError(
      'No pending purge request for this item',
      'NO_PENDING_PURGE',
    )
  }

  const [updated] = await db
    .update(deletedVault)
    .set({
      earlyPurgeRequestedAt: null,
      earlyPurgeRequestedBy: null,
    })
    .where(eq(deletedVault.id, vaultId))
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'vault.purge_cancelled',
    targetType: 'vault_item',
    targetId: vaultId,
    metadata: {
      originalType: item.originalType,
      originalId: item.originalId,
    },
    ipAddress,
    userAgent,
  })

  return updated
}

/**
 * List all vault items that have a pending early purge request.
 */
export async function listPendingPurges() {
  const rows = await db
    .select()
    .from(deletedVault)
    .where(
      sql`${deletedVault.earlyPurgeRequestedAt} IS NOT NULL` as ReturnType<typeof eq>,
    )
    .orderBy(deletedVault.earlyPurgeRequestedAt)

  return rows
}
