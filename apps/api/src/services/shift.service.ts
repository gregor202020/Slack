/**
 * Shift service layer.
 *
 * Handles shift CRUD, roster views, optimistic locking,
 * and the full shift-swap workflow (request, accept, decline, override).
 *
 * Spec references: Section 15.2
 */

import { eq, and, desc, gte, lt, sql, or, isNull } from 'drizzle-orm'
import { db, shifts, shiftSwaps, users, venues, userVenues } from '@smoker/db'
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../lib/errors.js'
import { shiftSwapLockedError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { logAudit } from '../lib/audit.js'
import { emitToUser } from '../plugins/socket.js'
import { notifyShiftUpdate } from './notification.service.js'

// ---------------------------------------------------------------------------
// 1. getMyShifts
// ---------------------------------------------------------------------------

export async function getMyShifts(
  userId: string,
  options: {
    startDate?: string
    endDate?: string
    cursor?: string
    limit?: number
  } = {},
) {
  const { startDate, endDate, cursor, limit = 50 } = options
  const pageLimit = Math.min(limit, 100)

  const conditions = [eq(shifts.userId, userId)]

  if (startDate) {
    conditions.push(gte(shifts.startTime, new Date(startDate)))
  }

  if (endDate) {
    conditions.push(lt(shifts.endTime, new Date(endDate)))
  }

  if (cursor) {
    conditions.push(sql`${shifts.startTime} > ${cursor}`)
  }

  const rows = await db
    .select({
      id: shifts.id,
      venueId: shifts.venueId,
      venueName: venues.name,
      userId: shifts.userId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      roleLabel: shifts.roleLabel,
      notes: shifts.notes,
      version: shifts.version,
      lockedBySwapId: shifts.lockedBySwapId,
      createdAt: shifts.createdAt,
      updatedAt: shifts.updatedAt,
    })
    .from(shifts)
    .innerJoin(venues, eq(shifts.venueId, venues.id))
    .where(and(...conditions))
    .orderBy(shifts.startTime)
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const results = hasMore ? rows.slice(0, pageLimit) : rows

  return {
    shifts: results,
    nextCursor: hasMore ? results[results.length - 1]?.startTime?.toISOString() : null,
  }
}

// ---------------------------------------------------------------------------
// 2. getVenueRoster
// ---------------------------------------------------------------------------

const MAX_ROSTER_RANGE_DAYS = 31

export async function getVenueRoster(
  venueId: string,
  options: {
    startDate?: string
    endDate?: string
  } = {},
) {
  const { startDate, endDate } = options

  // Enforce maximum date range of 31 days (Finding Q-28)
  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffMs = end.getTime() - start.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffDays > MAX_ROSTER_RANGE_DAYS) {
      throw new ValidationError(
        `Date range cannot exceed ${MAX_ROSTER_RANGE_DAYS} days`,
        'DATE_RANGE_TOO_LARGE',
      )
    }
  }

  const conditions = [eq(shifts.venueId, venueId)]

  if (startDate) {
    conditions.push(gte(shifts.startTime, new Date(startDate)))
  }

  if (endDate) {
    conditions.push(lt(shifts.endTime, new Date(endDate)))
  }

  const rows = await db
    .select({
      id: shifts.id,
      venueId: shifts.venueId,
      userId: shifts.userId,
      userName: users.fullName,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      roleLabel: shifts.roleLabel,
      notes: shifts.notes,
      version: shifts.version,
      lockedBySwapId: shifts.lockedBySwapId,
      createdAt: shifts.createdAt,
      updatedAt: shifts.updatedAt,
    })
    .from(shifts)
    .innerJoin(users, eq(shifts.userId, users.id))
    .where(and(...conditions))
    .orderBy(shifts.startTime)

  return rows
}

// ---------------------------------------------------------------------------
// 3. createShift
// ---------------------------------------------------------------------------

export async function createShift(
  data: {
    venueId: string
    userId: string
    startTime: string
    endTime: string
    roleLabel?: string
    notes?: string
  },
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Validate venue exists
  const [venue] = await db.select().from(venues).where(eq(venues.id, data.venueId)).limit(1)

  if (!venue) {
    throw new NotFoundError('Venue not found', 'VENUE_NOT_FOUND')
  }

  // Validate target user is a member of the venue
  const [membership] = await db
    .select()
    .from(userVenues)
    .where(and(eq(userVenues.userId, data.userId), eq(userVenues.venueId, data.venueId)))
    .limit(1)

  if (!membership) {
    throw new ValidationError(
      'User is not a member of this venue',
      'NOT_VENUE_MEMBER',
    )
  }

  const startTime = new Date(data.startTime)
  const endTime = new Date(data.endTime)

  // Check for overlapping shifts for the same user at the same venue
  const [overlap] = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, data.userId),
        eq(shifts.venueId, data.venueId),
        lt(shifts.startTime, endTime),
        gte(shifts.endTime, startTime),
      ),
    )
    .limit(1)

  if (overlap) {
    throw new ConflictError(
      'User already has a shift during this time at this venue',
      'SHIFT_OVERLAP',
    )
  }

  const [shift] = await db
    .insert(shifts)
    .values({
      venueId: data.venueId,
      userId: data.userId,
      startTime,
      endTime,
      roleLabel: data.roleLabel ?? null,
      notes: data.notes ?? null,
      version: 1,
    })
    .returning()

  if (!shift) {
    throw new Error('Failed to create shift')
  }

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'shift.created',
    targetType: 'shift',
    targetId: shift.id,
    metadata: {
      venueId: data.venueId,
      userId: data.userId,
      startTime: data.startTime,
      endTime: data.endTime,
    },
    ipAddress,
    userAgent,
  })

  emitToUser(data.userId, 'shift:created', shift)

  // Push notification (non-blocking)
  notifyShiftUpdate({ id: shift.id, userId: data.userId, type: 'created' })
    .catch((err) => logger.error({ err }, 'Failed to notify shift created'))

  return shift
}

// ---------------------------------------------------------------------------
// 4. getShift
// ---------------------------------------------------------------------------

export async function getShift(shiftId: string) {
  const rows = await db
    .select({
      id: shifts.id,
      venueId: shifts.venueId,
      venueName: venues.name,
      userId: shifts.userId,
      userName: users.fullName,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      roleLabel: shifts.roleLabel,
      notes: shifts.notes,
      version: shifts.version,
      lockedBySwapId: shifts.lockedBySwapId,
      createdAt: shifts.createdAt,
      updatedAt: shifts.updatedAt,
    })
    .from(shifts)
    .innerJoin(users, eq(shifts.userId, users.id))
    .innerJoin(venues, eq(shifts.venueId, venues.id))
    .where(eq(shifts.id, shiftId))
    .limit(1)

  const shift = rows[0]

  if (!shift) {
    throw new NotFoundError('Shift not found', 'SHIFT_NOT_FOUND')
  }

  return shift
}

// ---------------------------------------------------------------------------
// 5. updateShift
// ---------------------------------------------------------------------------

export async function updateShift(
  shiftId: string,
  data: { startTime?: string; endTime?: string; roleLabel?: string; notes?: string },
  expectedVersion: number,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    version: sql`${shifts.version} + 1`,
  }

  if (data.startTime !== undefined) {
    updateData.startTime = new Date(data.startTime)
  }
  if (data.endTime !== undefined) {
    updateData.endTime = new Date(data.endTime)
  }
  if (data.roleLabel !== undefined) {
    updateData.roleLabel = data.roleLabel
  }
  if (data.notes !== undefined) {
    updateData.notes = data.notes
  }

  const result = await db
    .update(shifts)
    .set(updateData)
    .where(and(eq(shifts.id, shiftId), eq(shifts.version, expectedVersion)))
    .returning()

  const updated = result[0]

  if (!updated) {
    throw new ConflictError('Shift was modified by another user', 'OPTIMISTIC_LOCK_FAILED')
  }

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'shift.updated',
    targetType: 'shift',
    targetId: shiftId,
    metadata: { changes: data, expectedVersion },
    ipAddress,
    userAgent,
  })

  emitToUser(updated.userId, 'shift:updated', updated)

  // Push notification (non-blocking)
  notifyShiftUpdate({ id: shiftId, userId: updated.userId, type: 'updated' })
    .catch((err) => logger.error({ err }, 'Failed to notify shift updated'))

  return updated
}

// ---------------------------------------------------------------------------
// 6. deleteShift
// ---------------------------------------------------------------------------

export async function deleteShift(
  shiftId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [existing] = await db
    .select({ id: shifts.id, venueId: shifts.venueId, userId: shifts.userId })
    .from(shifts)
    .where(eq(shifts.id, shiftId))
    .limit(1)

  if (!existing) {
    throw new NotFoundError('Shift not found', 'SHIFT_NOT_FOUND')
  }

  await db.delete(shifts).where(eq(shifts.id, shiftId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'shift.deleted',
    targetType: 'shift',
    targetId: shiftId,
    metadata: { venueId: existing.venueId, userId: existing.userId },
    ipAddress,
    userAgent,
  })

  emitToUser(existing.userId, 'shift:deleted', { shiftId })

  // Push notification (non-blocking)
  notifyShiftUpdate({ id: shiftId, userId: existing.userId, type: 'deleted' })
    .catch((err) => logger.error({ err }, 'Failed to notify shift deleted'))
}

// ---------------------------------------------------------------------------
// 7. requestSwap
// ---------------------------------------------------------------------------

export async function requestSwap(
  data: { shiftId: string; targetUserId: string; targetShiftId: string },
  requesterId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Validate source shift exists
  const [sourceShift] = await db
    .select()
    .from(shifts)
    .where(eq(shifts.id, data.shiftId))
    .limit(1)

  if (!sourceShift) {
    throw new NotFoundError('Source shift not found', 'SHIFT_NOT_FOUND')
  }

  // Validate requester owns the source shift
  if (sourceShift.userId !== requesterId) {
    throw new ForbiddenError('You do not own this shift', 'NOT_SHIFT_OWNER')
  }

  // Validate target shift exists
  const [targetShift] = await db
    .select()
    .from(shifts)
    .where(eq(shifts.id, data.targetShiftId))
    .limit(1)

  if (!targetShift) {
    throw new NotFoundError('Target shift not found', 'SHIFT_NOT_FOUND')
  }

  // Validate target user owns the target shift
  if (targetShift.userId !== data.targetUserId) {
    throw new ValidationError(
      'Target user does not own the target shift',
      'TARGET_SHIFT_MISMATCH',
    )
  }

  // Check no pending swap for the source shift
  const [existingSwap] = await db
    .select({ id: shiftSwaps.id })
    .from(shiftSwaps)
    .where(
      and(
        eq(shiftSwaps.shiftId, data.shiftId),
        eq(shiftSwaps.status, 'pending'),
      ),
    )
    .limit(1)

  if (existingSwap) {
    throw shiftSwapLockedError()
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours

  const [swap] = await db
    .insert(shiftSwaps)
    .values({
      shiftId: data.shiftId,
      requesterUserId: requesterId,
      targetUserId: data.targetUserId,
      targetShiftId: data.targetShiftId,
      status: 'pending',
      expiresAt,
    })
    .returning()

  if (!swap) {
    throw new Error('Failed to create swap request')
  }

  // Lock the source shift
  await db
    .update(shifts)
    .set({ lockedBySwapId: swap.id, updatedAt: new Date() })
    .where(eq(shifts.id, data.shiftId))

  await logAudit({
    actorId: requesterId,
    actorType: 'user',
    action: 'shift.swap_requested',
    targetType: 'shift_swap',
    targetId: swap.id,
    metadata: {
      shiftId: data.shiftId,
      targetUserId: data.targetUserId,
      targetShiftId: data.targetShiftId,
    },
    ipAddress,
    userAgent,
  })

  emitToUser(data.targetUserId, 'shift:swap_requested', swap)

  // Push notification (non-blocking)
  notifyShiftUpdate({ id: swap.id, userId: data.targetUserId, type: 'swap_requested' })
    .catch((err) => logger.error({ err }, 'Failed to notify swap requested'))

  return swap
}

// ---------------------------------------------------------------------------
// 8. acceptSwap
// ---------------------------------------------------------------------------

export async function acceptSwap(
  swapId: string,
  userId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [swap] = await db
    .select()
    .from(shiftSwaps)
    .where(eq(shiftSwaps.id, swapId))
    .limit(1)

  if (!swap) {
    throw new NotFoundError('Swap request not found', 'SWAP_NOT_FOUND')
  }

  // Validate the current user is the target
  if (swap.targetUserId !== userId) {
    throw new ForbiddenError('Only the target user can accept this swap', 'NOT_SWAP_TARGET')
  }

  if (swap.status !== 'pending') {
    throw new ConflictError('Swap request is no longer pending', 'SWAP_NOT_PENDING')
  }

  // Check not expired
  if (swap.expiresAt < new Date()) {
    throw new ConflictError('Swap request has expired', 'SWAP_EXPIRED')
  }

  // Perform all swap mutations inside a single transaction
  await db.transaction(async (tx) => {
    // Swap the userId fields on both shifts using optimistic locking
    const [sourceShift] = await tx
      .select()
      .from(shifts)
      .where(eq(shifts.id, swap.shiftId))
      .limit(1)

    if (!sourceShift) {
      throw new NotFoundError('Source shift not found', 'SHIFT_NOT_FOUND')
    }

    const targetShiftId = swap.targetShiftId
    if (!targetShiftId) {
      throw new NotFoundError('Target shift not found', 'SHIFT_NOT_FOUND')
    }

    const [targetShift] = await tx
      .select()
      .from(shifts)
      .where(eq(shifts.id, targetShiftId))
      .limit(1)

    if (!targetShift) {
      throw new NotFoundError('Target shift not found', 'SHIFT_NOT_FOUND')
    }

    // Update source shift: assign to target user
    const sourceResult = await tx
      .update(shifts)
      .set({
        userId: targetShift.userId,
        lockedBySwapId: null,
        version: sql`${shifts.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(shifts.id, swap.shiftId), eq(shifts.version, sourceShift.version)))
      .returning()

    if (sourceResult.length === 0) {
      throw new ConflictError('Source shift was modified by another user', 'OPTIMISTIC_LOCK_FAILED')
    }

    // Update target shift: assign to source user
    const targetResult = await tx
      .update(shifts)
      .set({
        userId: sourceShift.userId,
        version: sql`${shifts.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(shifts.id, targetShiftId), eq(shifts.version, targetShift.version)))
      .returning()

    if (targetResult.length === 0) {
      throw new ConflictError('Target shift was modified by another user', 'OPTIMISTIC_LOCK_FAILED')
    }

    // Update swap status
    await tx
      .update(shiftSwaps)
      .set({
        status: 'accepted',
        resolvedAt: new Date(),
      })
      .where(eq(shiftSwaps.id, swapId))

    await logAudit({
      actorId: userId,
      actorType: 'user',
      action: 'shift.swap_accepted',
      targetType: 'shift_swap',
      targetId: swapId,
      metadata: {
        shiftId: swap.shiftId,
        targetShiftId,
      },
      ipAddress,
      userAgent,
    })
  })

  emitToUser(swap.requesterUserId, 'shift:swap_accepted', swap)

  // Push notification (non-blocking)
  notifyShiftUpdate({ id: swap.id, userId: swap.requesterUserId, type: 'swap_accepted' })
    .catch((err) => logger.error({ err }, 'Failed to notify swap accepted'))
}

// ---------------------------------------------------------------------------
// 9. declineSwap
// ---------------------------------------------------------------------------

export async function declineSwap(
  swapId: string,
  userId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [swap] = await db
    .select()
    .from(shiftSwaps)
    .where(eq(shiftSwaps.id, swapId))
    .limit(1)

  if (!swap) {
    throw new NotFoundError('Swap request not found', 'SWAP_NOT_FOUND')
  }

  // Validate the current user is the target
  if (swap.targetUserId !== userId) {
    throw new ForbiddenError('Only the target user can decline this swap', 'NOT_SWAP_TARGET')
  }

  if (swap.status !== 'pending') {
    throw new ConflictError('Swap request is no longer pending', 'SWAP_NOT_PENDING')
  }

  // Unlock the source shift
  await db
    .update(shifts)
    .set({ lockedBySwapId: null, updatedAt: new Date() })
    .where(eq(shifts.id, swap.shiftId))

  // Update swap status
  await db
    .update(shiftSwaps)
    .set({
      status: 'declined',
      resolvedAt: new Date(),
    })
    .where(eq(shiftSwaps.id, swapId))

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'shift.swap_declined',
    targetType: 'shift_swap',
    targetId: swapId,
    metadata: { shiftId: swap.shiftId },
    ipAddress,
    userAgent,
  })

  emitToUser(swap.requesterUserId, 'shift:swap_declined', swap)

  // Push notification (non-blocking)
  notifyShiftUpdate({ id: swap.id, userId: swap.requesterUserId, type: 'swap_declined' })
    .catch((err) => logger.error({ err }, 'Failed to notify swap declined'))
}

// ---------------------------------------------------------------------------
// 10. overrideSwap
// ---------------------------------------------------------------------------

export async function overrideSwap(
  swapId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [swap] = await db
    .select()
    .from(shiftSwaps)
    .where(eq(shiftSwaps.id, swapId))
    .limit(1)

  if (!swap) {
    throw new NotFoundError('Swap request not found', 'SWAP_NOT_FOUND')
  }

  // Force-accept: perform the same swap logic as acceptSwap inside a transaction
  await db.transaction(async (tx) => {
    const [sourceShift] = await tx
      .select()
      .from(shifts)
      .where(eq(shifts.id, swap.shiftId))
      .limit(1)

    if (!sourceShift) {
      throw new NotFoundError('Source shift not found', 'SHIFT_NOT_FOUND')
    }

    const targetShiftId = swap.targetShiftId
    if (!targetShiftId) {
      throw new NotFoundError('Target shift not found', 'SHIFT_NOT_FOUND')
    }

    const [targetShift] = await tx
      .select()
      .from(shifts)
      .where(eq(shifts.id, targetShiftId))
      .limit(1)

    if (!targetShift) {
      throw new NotFoundError('Target shift not found', 'SHIFT_NOT_FOUND')
    }

    // Swap users on both shifts
    const sourceResult = await tx
      .update(shifts)
      .set({
        userId: targetShift.userId,
        lockedBySwapId: null,
        version: sql`${shifts.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(shifts.id, swap.shiftId), eq(shifts.version, sourceShift.version)))
      .returning()

    if (sourceResult.length === 0) {
      throw new ConflictError('Source shift was modified by another user', 'OPTIMISTIC_LOCK_FAILED')
    }

    const targetResult = await tx
      .update(shifts)
      .set({
        userId: sourceShift.userId,
        version: sql`${shifts.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(shifts.id, targetShiftId), eq(shifts.version, targetShift.version)))
      .returning()

    if (targetResult.length === 0) {
      throw new ConflictError('Target shift was modified by another user', 'OPTIMISTIC_LOCK_FAILED')
    }

    // Update swap status to overridden
    await tx
      .update(shiftSwaps)
      .set({
        status: 'overridden',
        resolvedAt: new Date(),
      })
      .where(eq(shiftSwaps.id, swapId))

    await logAudit({
      actorId,
      actorType: 'user',
      action: 'shift.swap_overridden',
      targetType: 'shift_swap',
      targetId: swapId,
      metadata: {
        shiftId: swap.shiftId,
        targetShiftId,
      },
      ipAddress,
      userAgent,
    })
  })
}

// ---------------------------------------------------------------------------
// 11. listMySwaps
// ---------------------------------------------------------------------------

export async function listMySwaps(
  userId: string,
  cursor?: string,
  limit = 50,
) {
  const pageLimit = Math.min(limit, 100)

  const conditions = [
    or(
      eq(shiftSwaps.requesterUserId, userId),
      eq(shiftSwaps.targetUserId, userId),
    ),
  ]

  if (cursor) {
    conditions.push(sql`${shiftSwaps.createdAt} < ${cursor}`)
  }

  const rows = await db
    .select({
      id: shiftSwaps.id,
      shiftId: shiftSwaps.shiftId,
      requesterUserId: shiftSwaps.requesterUserId,
      targetUserId: shiftSwaps.targetUserId,
      targetShiftId: shiftSwaps.targetShiftId,
      status: shiftSwaps.status,
      expiresAt: shiftSwaps.expiresAt,
      createdAt: shiftSwaps.createdAt,
      resolvedAt: shiftSwaps.resolvedAt,
    })
    .from(shiftSwaps)
    .where(and(...conditions))
    .orderBy(desc(shiftSwaps.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const results = hasMore ? rows.slice(0, pageLimit) : rows

  return {
    swaps: results,
    nextCursor: hasMore ? results[results.length - 1]?.createdAt?.toISOString() : null,
  }
}

// ---------------------------------------------------------------------------
// 12. listVenueSwaps
// ---------------------------------------------------------------------------

export async function listVenueSwaps(
  venueId: string,
  cursor?: string,
  limit = 50,
) {
  const pageLimit = Math.min(limit, 100)

  const conditions = [eq(shifts.venueId, venueId)]

  if (cursor) {
    conditions.push(sql`${shiftSwaps.createdAt} < ${cursor}`)
  }

  const rows = await db
    .select({
      id: shiftSwaps.id,
      shiftId: shiftSwaps.shiftId,
      requesterUserId: shiftSwaps.requesterUserId,
      targetUserId: shiftSwaps.targetUserId,
      targetShiftId: shiftSwaps.targetShiftId,
      status: shiftSwaps.status,
      expiresAt: shiftSwaps.expiresAt,
      createdAt: shiftSwaps.createdAt,
      resolvedAt: shiftSwaps.resolvedAt,
    })
    .from(shiftSwaps)
    .innerJoin(shifts, eq(shiftSwaps.shiftId, shifts.id))
    .where(and(...conditions))
    .orderBy(desc(shiftSwaps.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const results = hasMore ? rows.slice(0, pageLimit) : rows

  return {
    swaps: results,
    nextCursor: hasMore ? results[results.length - 1]?.createdAt?.toISOString() : null,
  }
}
