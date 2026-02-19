/**
 * Maintenance service layer.
 *
 * Handles maintenance request CRUD, status transitions,
 * and comment management for venue-scoped maintenance requests.
 *
 * Spec references: Section 15.1
 */

import { eq, and, desc, sql, count } from 'drizzle-orm'
import { db, maintenanceRequests, maintenanceComments, users, venues } from '@smoker/db'
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminOrSuperAdmin(orgRole: string): boolean {
  return orgRole === 'admin' || orgRole === 'super_admin'
}

/**
 * Valid status transitions for maintenance requests.
 * open -> in_progress -> done (and reverse).
 */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress'],
  in_progress: ['open', 'done'],
  done: ['in_progress'],
}

// ---------------------------------------------------------------------------
// 1. listMaintenanceRequests
// ---------------------------------------------------------------------------

export async function listMaintenanceRequests(
  options: {
    venueId?: string
    status?: string
    priority?: string
    cursor?: string
    limit?: number
  } = {},
) {
  const { venueId, status, priority, cursor, limit = 50 } = options
  const pageLimit = Math.min(limit, 100)

  const conditions = []

  if (venueId) {
    conditions.push(eq(maintenanceRequests.venueId, venueId))
  }

  if (status) {
    conditions.push(eq(maintenanceRequests.status, status))
  }

  if (priority) {
    conditions.push(eq(maintenanceRequests.priority, priority))
  }

  if (cursor) {
    conditions.push(sql`${maintenanceRequests.createdAt} < ${cursor}`)
  }

  const rows = await db
    .select({
      id: maintenanceRequests.id,
      venueId: maintenanceRequests.venueId,
      venueName: venues.name,
      userId: maintenanceRequests.userId,
      creatorName: users.fullName,
      title: maintenanceRequests.title,
      description: maintenanceRequests.description,
      priority: maintenanceRequests.priority,
      status: maintenanceRequests.status,
      createdAt: maintenanceRequests.createdAt,
      updatedAt: maintenanceRequests.updatedAt,
    })
    .from(maintenanceRequests)
    .innerJoin(users, eq(maintenanceRequests.userId, users.id))
    .innerJoin(venues, eq(maintenanceRequests.venueId, venues.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(maintenanceRequests.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const results = hasMore ? rows.slice(0, pageLimit) : rows

  return {
    requests: results,
    nextCursor: hasMore ? results[results.length - 1]?.createdAt?.toISOString() : null,
  }
}

// ---------------------------------------------------------------------------
// 2. createMaintenanceRequest
// ---------------------------------------------------------------------------

export async function createMaintenanceRequest(
  data: { venueId: string; title: string; description: string; priority: string },
  userId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Validate venue exists
  const [venue] = await db.select().from(venues).where(eq(venues.id, data.venueId)).limit(1)

  if (!venue) {
    throw new NotFoundError('Venue not found', 'VENUE_NOT_FOUND')
  }

  const [request] = await db
    .insert(maintenanceRequests)
    .values({
      venueId: data.venueId,
      userId,
      title: data.title,
      description: data.description,
      priority: data.priority,
      status: 'open',
    })
    .returning()

  if (!request) {
    throw new Error('Failed to create maintenance request')
  }

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'maintenance.created',
    targetType: 'maintenance_request',
    targetId: request.id,
    metadata: { venueId: data.venueId, title: data.title, priority: data.priority },
    ipAddress,
    userAgent,
  })

  return request
}

// ---------------------------------------------------------------------------
// 3. getMaintenanceRequest
// ---------------------------------------------------------------------------

export async function getMaintenanceRequest(requestId: string) {
  const rows = await db
    .select({
      id: maintenanceRequests.id,
      venueId: maintenanceRequests.venueId,
      venueName: venues.name,
      userId: maintenanceRequests.userId,
      creatorName: users.fullName,
      title: maintenanceRequests.title,
      description: maintenanceRequests.description,
      priority: maintenanceRequests.priority,
      status: maintenanceRequests.status,
      createdAt: maintenanceRequests.createdAt,
      updatedAt: maintenanceRequests.updatedAt,
      commentCount: sql<number>`(
        SELECT count(*)::int FROM maintenance_comments mc
        WHERE mc.request_id = ${maintenanceRequests.id}
      )`,
    })
    .from(maintenanceRequests)
    .innerJoin(users, eq(maintenanceRequests.userId, users.id))
    .innerJoin(venues, eq(maintenanceRequests.venueId, venues.id))
    .where(eq(maintenanceRequests.id, requestId))
    .limit(1)

  const request = rows[0]

  if (!request) {
    throw new NotFoundError('Maintenance request not found', 'MAINTENANCE_REQUEST_NOT_FOUND')
  }

  return request
}

// ---------------------------------------------------------------------------
// 4. updateMaintenanceRequest
// ---------------------------------------------------------------------------

export async function updateMaintenanceRequest(
  requestId: string,
  data: { title?: string; description?: string; priority?: string },
  userId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [existing] = await db
    .select()
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.id, requestId))
    .limit(1)

  if (!existing) {
    throw new NotFoundError('Maintenance request not found', 'MAINTENANCE_REQUEST_NOT_FOUND')
  }

  const [updated] = await db
    .update(maintenanceRequests)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceRequests.id, requestId))
    .returning()

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'maintenance.updated',
    targetType: 'maintenance_request',
    targetId: requestId,
    metadata: { changes: data },
    ipAddress,
    userAgent,
  })

  return updated
}

// ---------------------------------------------------------------------------
// 5. changeMaintenanceStatus
// ---------------------------------------------------------------------------

export async function changeMaintenanceStatus(
  requestId: string,
  newStatus: string,
  userId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [existing] = await db
    .select()
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.id, requestId))
    .limit(1)

  if (!existing) {
    throw new NotFoundError('Maintenance request not found', 'MAINTENANCE_REQUEST_NOT_FOUND')
  }

  // Validate status transition
  const validTransitions = VALID_STATUS_TRANSITIONS[existing.status]
  if (!validTransitions || !validTransitions.includes(newStatus)) {
    throw new ValidationError(
      `Invalid status transition from '${existing.status}' to '${newStatus}'`,
      'INVALID_STATUS_TRANSITION',
    )
  }

  const [updated] = await db
    .update(maintenanceRequests)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceRequests.id, requestId))
    .returning()

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'maintenance.status_changed',
    targetType: 'maintenance_request',
    targetId: requestId,
    metadata: { previousStatus: existing.status, newStatus },
    ipAddress,
    userAgent,
  })

  // TODO: Auto-post system message to venue channel

  return updated
}

// ---------------------------------------------------------------------------
// 6. listComments
// ---------------------------------------------------------------------------

export async function listComments(
  requestId: string,
  cursor?: string,
  limit = 50,
) {
  const pageLimit = Math.min(limit, 100)

  const conditions = [eq(maintenanceComments.requestId, requestId)]

  if (cursor) {
    conditions.push(sql`${maintenanceComments.createdAt} < ${cursor}`)
  }

  const rows = await db
    .select({
      id: maintenanceComments.id,
      requestId: maintenanceComments.requestId,
      userId: maintenanceComments.userId,
      authorName: users.fullName,
      body: maintenanceComments.body,
      createdAt: maintenanceComments.createdAt,
    })
    .from(maintenanceComments)
    .innerJoin(users, eq(maintenanceComments.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(maintenanceComments.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const results = hasMore ? rows.slice(0, pageLimit) : rows

  return {
    comments: results,
    nextCursor: hasMore ? results[results.length - 1]?.createdAt?.toISOString() : null,
  }
}

// ---------------------------------------------------------------------------
// 7. addComment
// ---------------------------------------------------------------------------

export async function addComment(
  requestId: string,
  body: string,
  userId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Validate request exists
  const [existing] = await db
    .select({ id: maintenanceRequests.id })
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.id, requestId))
    .limit(1)

  if (!existing) {
    throw new NotFoundError('Maintenance request not found', 'MAINTENANCE_REQUEST_NOT_FOUND')
  }

  const [comment] = await db
    .insert(maintenanceComments)
    .values({
      requestId,
      userId,
      body,
    })
    .returning()

  if (!comment) {
    throw new Error('Failed to create comment')
  }

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'maintenance.comment_added',
    targetType: 'maintenance_comment',
    targetId: comment.id,
    metadata: { requestId },
    ipAddress,
    userAgent,
  })

  return comment
}

// ---------------------------------------------------------------------------
// 8. deleteComment
// ---------------------------------------------------------------------------

export async function deleteComment(
  commentId: string,
  userId: string,
  orgRole: string,
) {
  const [comment] = await db
    .select()
    .from(maintenanceComments)
    .where(eq(maintenanceComments.id, commentId))
    .limit(1)

  if (!comment) {
    throw new NotFoundError('Comment not found', 'COMMENT_NOT_FOUND')
  }

  // Only author or admin can delete
  if (comment.userId !== userId && !isAdminOrSuperAdmin(orgRole)) {
    throw new ForbiddenError('Only comment author or admin can delete', 'INSUFFICIENT_ROLE')
  }

  await db.delete(maintenanceComments).where(eq(maintenanceComments.id, commentId))
}

// ---------------------------------------------------------------------------
// 9. listVenueMaintenanceRequests
// ---------------------------------------------------------------------------

export async function listVenueMaintenanceRequests(
  venueId: string,
  options: {
    status?: string
    priority?: string
    cursor?: string
    limit?: number
  } = {},
) {
  return listMaintenanceRequests({ ...options, venueId })
}
