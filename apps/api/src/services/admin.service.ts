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
} from '@smoker/db'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'
import { sha256 } from '../lib/crypto.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_LIMIT = 50
const VAULT_RETENTION_DAYS = 180

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

  // Fetch matching messages
  const matchingMessages = await db
    .select()
    .from(messages)
    .where(and(...conditions))

  if (matchingMessages.length === 0) {
    return { deleted: 0 }
  }

  const purgeAfter = new Date()
  purgeAfter.setDate(purgeAfter.getDate() + VAULT_RETENTION_DAYS)

  // Move each message to the vault and soft-delete
  for (const msg of matchingMessages) {
    const contentPayload = {
      id: msg.id,
      channelId: msg.channelId,
      dmId: msg.dmId,
      userId: msg.userId,
      parentMessageId: msg.parentMessageId,
      body: msg.body,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    }

    await db.insert(deletedVault).values({
      originalType: 'message',
      originalId: msg.id,
      content: contentPayload,
      contentHash: sha256(JSON.stringify(contentPayload)),
      deletedBy: actorId,
      purgeAfter,
    })
  }

  // Soft-delete all matching messages
  await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(and(...conditions))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'bulk_delete.executed',
    targetType: 'messages',
    metadata: {
      scope,
      channelId,
      olderThanDays,
      deletedCount: matchingMessages.length,
    },
    ipAddress,
    userAgent,
  })

  return { deleted: matchingMessages.length }
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
  // Fetch all matching logs (no pagination for export)
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

  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))

  if (format === 'csv') {
    const header =
      'id,actorId,actorType,action,targetType,targetId,ipAddress,userAgent,createdAt'
    const csvRows = rows.map(
      (r) =>
        `${r.id},${r.actorId ?? ''},${r.actorType},${r.action},${r.targetType ?? ''},${r.targetId ?? ''},${r.ipAddress ?? ''},${r.userAgent ?? ''},${r.createdAt.toISOString()}`,
    )
    return { format: 'csv' as const, data: [header, ...csvRows].join('\n') }
  }

  return { format: 'json' as const, data: rows }
}

// ===========================================================================
// 3. Data Export
// ===========================================================================

/**
 * Request a full organisation data export.
 * For MVP: creates the record with status='pending'. Actual export is TODO.
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
 * Return the file path for a completed export.
 * TODO: Implement actual file generation and signed download URL.
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

  return { filePath: row.s3Key }
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
