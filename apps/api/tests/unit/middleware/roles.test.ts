/**
 * Unit tests for roles middleware.
 *
 * Tests role-based access control:
 *   - requireRole: Org-level role checks
 *   - isSuperAdmin / isAdminOrAbove: Role hierarchy helpers
 *   - canManageRole: Role management hierarchy
 *   - requireVenueRole / requireChannelMembership / requireDmMembership: DB-dependent checks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('@smoker/db', () => {
  const selectFn = vi.fn()
  const fromFn = vi.fn()
  const whereFn = vi.fn()
  const limitFn = vi.fn()

  const chainMock = {
    select: selectFn.mockReturnThis(),
    from: fromFn.mockReturnThis(),
    where: whereFn.mockReturnThis(),
    limit: limitFn.mockResolvedValue([]),
  }

  return {
    db: chainMock,
    userVenues: { userId: 'userId', venueId: 'venueId', venueRole: 'venueRole' },
    channelMembers: { channelId: 'channelId', userId: 'userId' },
    dmMembers: { dmId: 'dmId', userId: 'userId' },
  }
})

vi.mock('../../../src/lib/audit.js', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../src/lib/errors.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/lib/errors.js')>('../../../src/lib/errors.js')
  return actual
})

import {
  requireRole,
  requireVenueRole,
  requireChannelMembership,
  requireDmMembership,
  isSuperAdmin,
  isAdminOrAbove,
  canManageRole,
} from '../../../src/middleware/roles.js'
import { logAudit } from '../../../src/lib/audit.js'
import { db } from '@smoker/db'
import type { FastifyRequest, FastifyReply } from 'fastify'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    headers: {},
    params: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as FastifyRequest
}

const mockReply = {} as FastifyReply

// ---------------------------------------------------------------------------
// isSuperAdmin / isAdminOrAbove — pure functions
// ---------------------------------------------------------------------------

describe('Roles — isSuperAdmin', () => {
  it('should return true for super_admin role', () => {
    expect(isSuperAdmin({ orgRole: 'super_admin' })).toBe(true)
  })

  it('should return false for admin role', () => {
    expect(isSuperAdmin({ orgRole: 'admin' })).toBe(false)
  })

  it('should return false for basic role', () => {
    expect(isSuperAdmin({ orgRole: 'basic' })).toBe(false)
  })
})

describe('Roles — isAdminOrAbove', () => {
  it('should return true for super_admin role', () => {
    expect(isAdminOrAbove({ orgRole: 'super_admin' })).toBe(true)
  })

  it('should return true for admin role', () => {
    expect(isAdminOrAbove({ orgRole: 'admin' })).toBe(true)
  })

  it('should return false for mid role', () => {
    expect(isAdminOrAbove({ orgRole: 'mid' })).toBe(false)
  })

  it('should return false for basic role', () => {
    expect(isAdminOrAbove({ orgRole: 'basic' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canManageRole — pure function
// ---------------------------------------------------------------------------

describe('Roles — canManageRole', () => {
  it('should allow super_admin to manage admin', () => {
    expect(canManageRole('super_admin', 'admin')).toBe(true)
  })

  it('should allow super_admin to manage mid', () => {
    expect(canManageRole('super_admin', 'mid')).toBe(true)
  })

  it('should allow super_admin to manage basic', () => {
    expect(canManageRole('super_admin', 'basic')).toBe(true)
  })

  it('should not allow super_admin to manage super_admin (equal level)', () => {
    expect(canManageRole('super_admin', 'super_admin')).toBe(false)
  })

  it('should allow admin to manage mid', () => {
    expect(canManageRole('admin', 'mid')).toBe(true)
  })

  it('should allow admin to manage basic', () => {
    expect(canManageRole('admin', 'basic')).toBe(true)
  })

  it('should not allow admin to manage admin (equal level)', () => {
    expect(canManageRole('admin', 'admin')).toBe(false)
  })

  it('should not allow admin to manage super_admin', () => {
    expect(canManageRole('admin', 'super_admin')).toBe(false)
  })

  it('should not allow mid to manage admin', () => {
    expect(canManageRole('mid', 'admin')).toBe(false)
  })

  it('should allow mid to manage basic', () => {
    expect(canManageRole('mid', 'basic')).toBe(true)
  })

  it('should not allow basic to manage anyone', () => {
    expect(canManageRole('basic', 'basic')).toBe(false)
    expect(canManageRole('basic', 'mid')).toBe(false)
    expect(canManageRole('basic', 'admin')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// requireRole — preHandler factory
// ---------------------------------------------------------------------------

describe('Roles — requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw when request.user is not set', async () => {
    const handler = requireRole('admin', 'super_admin')
    const request = mockRequest()

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Authentication required',
    )
  })

  it('should throw INSUFFICIENT_ROLE when user role is not in allowed list', async () => {
    const handler = requireRole('admin', 'super_admin')
    const request = mockRequest()
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Requires one of: admin, super_admin',
    )
  })

  it('should pass when user role is in the allowed list', async () => {
    const handler = requireRole('admin', 'super_admin')
    const request = mockRequest()
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'admin', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()
  })

  it('should pass for super_admin when super_admin is in allowed list', async () => {
    const handler = requireRole('super_admin')
    const request = mockRequest()
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'super_admin', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// requireVenueRole
// ---------------------------------------------------------------------------

describe('Roles — requireVenueRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw when request.user is not set', async () => {
    const handler = requireVenueRole('venueId', 'admin')
    const request = mockRequest()

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Authentication required',
    )
  })

  it('should throw MISSING_VENUE_ID when venue param is missing', async () => {
    const handler = requireVenueRole('venueId', 'admin')
    const request = mockRequest({ params: {} })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Venue ID is required',
    )
  })

  it('should bypass check for super_admin users', async () => {
    const handler = requireVenueRole('venueId', 'admin')
    const request = mockRequest({ params: { venueId: 'venue-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'super_admin', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()
    // Should not query the database
    expect(db.select).not.toHaveBeenCalled()
  })

  it('should throw NOT_VENUE_MEMBER when no membership exists', async () => {
    const handler = requireVenueRole('venueId', 'admin')
    const request = mockRequest({ params: { venueId: 'venue-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    vi.mocked(db.limit).mockResolvedValueOnce([])

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Not a member of this venue',
    )
  })

  it('should throw INSUFFICIENT_VENUE_ROLE when venue role is not allowed', async () => {
    const handler = requireVenueRole('venueId', 'admin', 'super_admin')
    const request = mockRequest({ params: { venueId: 'venue-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    vi.mocked(db.limit).mockResolvedValueOnce([{ venueRole: 'basic' }])

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Requires venue role: admin, super_admin',
    )
  })

  it('should pass when venue role matches', async () => {
    const handler = requireVenueRole('venueId', 'admin', 'super_admin')
    const request = mockRequest({ params: { venueId: 'venue-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    vi.mocked(db.limit).mockResolvedValueOnce([{ venueRole: 'admin' }])

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// requireChannelMembership
// ---------------------------------------------------------------------------

describe('Roles — requireChannelMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw when request.user is not set', async () => {
    const handler = requireChannelMembership('channelId')
    const request = mockRequest()

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Authentication required',
    )
  })

  it('should throw MISSING_CHANNEL_ID when channel param is missing', async () => {
    const handler = requireChannelMembership('channelId')
    const request = mockRequest({ params: {} })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Channel ID is required',
    )
  })

  it('should bypass check for admin users', async () => {
    const handler = requireChannelMembership('channelId')
    const request = mockRequest({ params: { channelId: 'ch-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'admin', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()
  })

  it('should bypass check for super_admin users', async () => {
    const handler = requireChannelMembership('channelId')
    const request = mockRequest({ params: { channelId: 'ch-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'super_admin', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()
  })

  it('should throw NOT_CHANNEL_MEMBER when not a member', async () => {
    const handler = requireChannelMembership('channelId')
    const request = mockRequest({ params: { channelId: 'ch-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    vi.mocked(db.limit).mockResolvedValueOnce([])

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Not a member of this channel',
    )
  })

  it('should pass when user is a channel member', async () => {
    const handler = requireChannelMembership('channelId')
    const request = mockRequest({ params: { channelId: 'ch-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    vi.mocked(db.limit).mockResolvedValueOnce([{ channelId: 'ch-1' }])

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// requireDmMembership
// ---------------------------------------------------------------------------

describe('Roles — requireDmMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw when request.user is not set', async () => {
    const handler = requireDmMembership('dmId')
    const request = mockRequest()

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Authentication required',
    )
  })

  it('should throw MISSING_DM_ID when dm param is missing', async () => {
    const handler = requireDmMembership('dmId')
    const request = mockRequest({ params: {} })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'DM ID is required',
    )
  })

  it('should allow super_admin access and log audit event', async () => {
    const handler = requireDmMembership('dmId')
    const request = mockRequest({
      params: { dmId: 'dm-1' } as unknown,
      ip: '10.0.0.1',
      headers: { 'user-agent': 'test-agent' },
    })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'super_admin', status: 'active' }

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()

    expect(logAudit).toHaveBeenCalledWith({
      actorId: 'user-1',
      actorType: 'user',
      action: 'dm.super_admin_access',
      targetType: 'dm',
      targetId: 'dm-1',
      ipAddress: '10.0.0.1',
      userAgent: 'test-agent',
    })
  })

  it('should throw NOT_DM_MEMBER when not a member', async () => {
    const handler = requireDmMembership('dmId')
    const request = mockRequest({ params: { dmId: 'dm-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    vi.mocked(db.limit).mockResolvedValueOnce([])

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Not a member of this DM',
    )
  })

  it('should pass when user is a DM member', async () => {
    const handler = requireDmMembership('dmId')
    const request = mockRequest({ params: { dmId: 'dm-1' } as unknown })
    request.user = { id: 'user-1', sessionId: 's-1', orgRole: 'basic', status: 'active' }

    vi.mocked(db.limit).mockResolvedValueOnce([{ dmId: 'dm-1' }])

    await expect(handler(request, mockReply, vi.fn())).resolves.toBeUndefined()
  })
})
