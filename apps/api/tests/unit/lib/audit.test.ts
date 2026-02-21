/**
 * Unit tests for audit logging module.
 *
 * Tests:
 *   - logAudit: Hash chain computation, DB insert, critical event logging
 *   - extractAuditContext: Request context extraction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  desc: vi.fn(),
}))

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
const mockSelectReturn = { contentHash: 'prev-hash-abc' }
const mockTxLimitFn = vi.fn().mockResolvedValue([mockSelectReturn])
const mockTxOrderByFn = vi.fn().mockReturnValue({ limit: mockTxLimitFn })
const mockTxFromFn = vi.fn().mockReturnValue({ orderBy: mockTxOrderByFn })
const mockTxSelectFn = vi.fn().mockReturnValue({ from: mockTxFromFn })

const mockTx = {
  select: mockTxSelectFn,
  from: mockTxFromFn,
  insert: mockInsert,
}

vi.mock('@smoker/db', () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn(mockTx)
    }),
  },
  auditLogs: {
    contentHash: 'contentHash',
    createdAt: 'createdAt',
  },
}))

vi.mock('../../../src/lib/crypto.js', () => ({
  sha256: vi.fn((input: string) => `sha256_${input.slice(0, 20)}`),
}))

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { logAudit, extractAuditContext } from '../../../src/lib/audit.js'
import { logger } from '../../../src/lib/logger.js'

// ---------------------------------------------------------------------------
// extractAuditContext — pure function
// ---------------------------------------------------------------------------

describe('Audit — extractAuditContext', () => {
  it('should extract ipAddress and userAgent from request', () => {
    const request = {
      ip: '192.168.1.1',
      headers: { 'user-agent': 'Mozilla/5.0' },
    }

    const result = extractAuditContext(request)

    expect(result).toEqual({
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })
  })

  it('should default userAgent to "unknown" when header is missing', () => {
    const request = {
      ip: '10.0.0.1',
      headers: {},
    }

    const result = extractAuditContext(request)

    expect(result).toEqual({
      ipAddress: '10.0.0.1',
      userAgent: 'unknown',
    })
  })
})

// ---------------------------------------------------------------------------
// logAudit
// ---------------------------------------------------------------------------

describe('Audit — logAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should insert an audit log entry with hash chain', async () => {
    await logAudit({
      actorId: 'user-1',
      actorType: 'user',
      action: 'user.created',
      targetType: 'user',
      targetId: 'user-2',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    })

    // Should have called tx.insert with values
    expect(mockInsert).toHaveBeenCalled()
    const insertCall = mockInsert.mock.results[0]
    expect(insertCall?.value?.values).toHaveBeenCalled()
  })

  it('should log critical events to external logger', async () => {
    await logAudit({
      actorId: 'user-1',
      actorType: 'user',
      action: 'auth.login_failed',
      ipAddress: '127.0.0.1',
    })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'critical_audit_event',
        action: 'auth.login_failed',
        actorId: 'user-1',
      }),
      'Critical audit event',
    )
  })

  it('should not log non-critical events to external logger', async () => {
    await logAudit({
      actorId: 'user-1',
      actorType: 'user',
      action: 'user.profile_updated',
    })

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should handle genesis case when no previous audit log exists', async () => {
    // Override to return empty array (no previous entries)
    mockTxLimitFn.mockResolvedValueOnce([])

    await logAudit({
      actorId: 'user-1',
      actorType: 'user',
      action: 'user.created',
    })

    // Should still insert successfully (uses 'genesis' as prevHash)
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should catch and log errors without throwing', async () => {
    const { db } = await import('@smoker/db')
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error('DB connection failed'))

    await logAudit({
      actorId: 'user-1',
      actorType: 'user',
      action: 'user.created',
    })

    // Should log the error but not throw
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.created' }),
      'Failed to write audit log entry',
    )
  })

  it('should include metadata keys in critical event log (not values)', async () => {
    await logAudit({
      actorId: 'user-1',
      actorType: 'user',
      action: 'user.role_changed',
      metadata: { oldRole: 'basic', newRole: 'admin' },
    })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataKeys: ['oldRole', 'newRole'],
      }),
      'Critical audit event',
    )
  })
})
