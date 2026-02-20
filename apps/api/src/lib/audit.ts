/**
 * Audit logging service.
 *
 * Implements the tamper-evident hash chain from spec Section 16.4.
 * Critical events are additionally logged to an external logger.
 */

import { db, auditLogs } from '@smoker/db'
import { desc } from 'drizzle-orm'
import { sha256 } from './crypto.js'
import { logger } from './logger.js'

export type AuditActorType = 'user' | 'api_key' | 'system'

export interface AuditLogParams {
  actorId?: string
  actorType: AuditActorType
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Critical actions that must also be logged to an external append-only log
 * (e.g., AWS CloudWatch Logs) per spec Section 16.4.
 */
const CRITICAL_ACTIONS = new Set([
  'auth.login_failed',
  'auth.otp_failed',
  'auth.account_locked',
  'user.role_changed',
  'export.initiated',
  'vault.purge_requested',
  'vault.purge_executed',
  'vault.accessed',
  'dm.super_admin_access',
  'user.suspended',
  'user.deactivated',
  'api_key.created',
  'api_key.revoked',
  'api_key.rotated',
])

/**
 * Log an audit event.
 *
 * - Computes prevHash from the last audit log entry (hash chain).
 * - Computes contentHash of the current entry.
 * - Inserts into the audit_logs table.
 * - For critical events, also logs to external logger.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  const {
    actorId,
    actorType,
    action,
    targetType,
    targetId,
    metadata,
    ipAddress,
    userAgent,
  } = params

  const timestamp = new Date().toISOString()

  // Build the content hash payload
  const contentPayload = JSON.stringify({
    actorId,
    actorType,
    action,
    targetType,
    targetId,
    metadata,
    ipAddress,
    timestamp,
  })
  const contentHash = sha256(contentPayload)

  try {
    // Wrap read-previous-hash + insert in a transaction to prevent
    // concurrent entries from reading the same prevHash (Finding 5.2).
    let chainHash: string | undefined

    await db.transaction(async (tx) => {
      // Fetch the hash of the last audit log entry for the hash chain
      const [lastEntry] = await tx
        .select({ contentHash: auditLogs.contentHash })
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(1)
      const prevHash = lastEntry?.contentHash ?? 'genesis'

      // Compute the chain hash (hash of prevHash + contentHash)
      chainHash = sha256(`${prevHash}:${contentHash}`)

      // Insert into audit_logs table
      await tx.insert(auditLogs).values({
        actorId: actorId ?? undefined,
        actorType,
        action,
        targetType: targetType ?? undefined,
        targetId: targetId ?? undefined,
        metadata: metadata ?? undefined,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
        contentHash,
        prevHash,
      })
    })

    // Log to external logger for critical events
    if (CRITICAL_ACTIONS.has(action)) {
      logger.warn(
        {
          type: 'critical_audit_event',
          action,
          actorId,
          actorType,
          targetType,
          targetId,
          ipAddress,
          timestamp,
          contentHash,
          chainHash,
          // Redact metadata values that might contain sensitive data
          metadataKeys: metadata ? Object.keys(metadata) : undefined,
        },
        'Critical audit event',
      )
    }
  } catch (error) {
    // Audit logging failures must not crash the application
    logger.error({ err: error, action, actorId }, 'Failed to write audit log entry')
  }
}

/**
 * Helper: Extract audit context from a Fastify request.
 */
export function extractAuditContext(request: {
  ip: string
  headers: { 'user-agent'?: string }
}): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? 'unknown',
  }
}
