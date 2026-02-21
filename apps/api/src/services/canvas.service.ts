/**
 * Canvas service — Yjs collaborative document management.
 *
 * Handles CRUD, version history, lock/unlock, and template management
 * for per-channel Canvas documents (spec Section 11).
 */

import * as Y from 'yjs'
import { db } from '@smoker/db'
import { canvas, canvasVersions, channels } from '@smoker/db/schema'
import { eq, desc, sql, count } from 'drizzle-orm'
import { emitToChannel } from '../plugins/socket.js'
import { getRedis } from '../lib/redis.js'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../lib/errors.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CANVAS_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const AUTO_VERSION_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Redis-backed template store
// ---------------------------------------------------------------------------

interface CanvasTemplate {
  id: string
  name: string
  yjsState: string // base64-encoded
  createdAt: string // ISO string
}

const TEMPLATE_KEY_PREFIX = 'canvas:template:'
const TEMPLATE_LIST_KEY = 'canvas:templates:list'

function generateTemplateId(): string {
  return crypto.randomUUID()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge a new Yjs binary update into the existing state.
 * Returns the full merged state as a Buffer.
 */
function mergeYjsUpdate(existingState: Buffer | null, update: Buffer): Buffer {
  const doc = new Y.Doc()

  if (existingState && existingState.length > 0) {
    Y.applyUpdate(doc, existingState)
  }

  Y.applyUpdate(doc, update)

  const merged = Buffer.from(Y.encodeStateAsUpdate(doc))
  doc.destroy()
  return merged
}

/**
 * Check if the user is the channel owner or has admin/super_admin org role.
 */
async function isChannelOwnerOrAdmin(
  channelId: string,
  userId: string,
  userOrgRole: string,
): Promise<boolean> {
  if (userOrgRole === 'admin' || userOrgRole === 'super_admin') {
    return true
  }

  const [channel] = await db
    .select({ ownerUserId: channels.ownerUserId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  return channel?.ownerUserId === userId
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Get or create the canvas for a channel.
 * Returns the canvas record with a versions count.
 */
export async function getOrCreateCanvas(channelId: string) {
  // Try to find existing canvas
  const [existing] = await db
    .select()
    .from(canvas)
    .where(eq(canvas.channelId, channelId))
    .limit(1)

  if (existing) {
    // Count versions
    const [versionCount] = await db
      .select({ count: count() })
      .from(canvasVersions)
      .where(eq(canvasVersions.canvasId, existing.id))

    return {
      ...existing,
      yjsState: existing.yjsState
        ? Buffer.from(existing.yjsState).toString('base64')
        : null,
      versionsCount: versionCount?.count ?? 0,
    }
  }

  // Create new canvas with empty Yjs document
  const doc = new Y.Doc()
  const initialState = Buffer.from(Y.encodeStateAsUpdate(doc))
  doc.destroy()

  const [created] = await db
    .insert(canvas)
    .values({
      channelId,
      yjsState: initialState,
      sizeBytes: initialState.length,
    })
    .returning()

  return {
    ...created,
    yjsState: initialState.toString('base64'),
    versionsCount: 0,
  }
}

/**
 * Apply a Yjs update to the canvas document.
 *
 * - Checks lock status
 * - Enforces 5 MB max size
 * - Auto-saves a version every 5 minutes
 * - Emits `canvas:updated` via socket
 */
export async function applyUpdate(
  channelId: string,
  update: Buffer,
  userId: string,
) {
  // Get the canvas (create if needed)
  const [canvasRow] = await db
    .select()
    .from(canvas)
    .where(eq(canvas.channelId, channelId))
    .limit(1)

  if (!canvasRow) {
    throw new NotFoundError('Canvas not found', 'CANVAS_NOT_FOUND')
  }

  // Check lock status
  if (canvasRow.locked && canvasRow.lockedBy !== userId) {
    throw new ForbiddenError(
      'Canvas is locked by another user',
      'CANVAS_LOCKED',
    )
  }

  // Merge the update
  const merged = mergeYjsUpdate(canvasRow.yjsState, update)

  // Enforce size limit
  if (merged.length > MAX_CANVAS_SIZE_BYTES) {
    throw new ValidationError(
      `Canvas exceeds maximum size of ${MAX_CANVAS_SIZE_BYTES / (1024 * 1024)} MB`,
      'CANVAS_TOO_LARGE',
    )
  }

  // Update canvas in DB
  const [updated] = await db
    .update(canvas)
    .set({
      yjsState: merged,
      sizeBytes: merged.length,
      updatedAt: new Date(),
    })
    .where(eq(canvas.id, canvasRow.id))
    .returning()

  // Auto-save version every 5 minutes
  await maybeAutoSaveVersion(canvasRow.id, merged)

  // Emit socket event
  emitToChannel(channelId, 'canvas:updated', {
    channelId,
    canvasId: canvasRow.id,
    update: update.toString('base64'),
    userId,
    sizeBytes: merged.length,
  })

  return {
    ...updated,
    yjsState: merged.toString('base64'),
  }
}

/**
 * Auto-save a version if the last version is older than 5 minutes.
 */
async function maybeAutoSaveVersion(canvasId: string, currentState: Buffer) {
  const [lastVersion] = await db
    .select({ createdAt: canvasVersions.createdAt })
    .from(canvasVersions)
    .where(eq(canvasVersions.canvasId, canvasId))
    .orderBy(desc(canvasVersions.createdAt))
    .limit(1)

  const now = Date.now()
  const shouldSave =
    !lastVersion ||
    now - lastVersion.createdAt.getTime() >= AUTO_VERSION_INTERVAL_MS

  if (shouldSave) {
    await db.insert(canvasVersions).values({
      canvasId,
      yjsSnapshot: currentState,
    })
  }
}

/**
 * Lock a canvas. Only the channel owner or admin+ can lock.
 */
export async function lockCanvas(
  channelId: string,
  userId: string,
  userOrgRole: string,
) {
  const canAllowLock = await isChannelOwnerOrAdmin(channelId, userId, userOrgRole)
  if (!canAllowLock) {
    throw new ForbiddenError(
      'Only the channel owner or admin can lock the canvas',
      'INSUFFICIENT_PERMISSION',
    )
  }

  const [canvasRow] = await db
    .select()
    .from(canvas)
    .where(eq(canvas.channelId, channelId))
    .limit(1)

  if (!canvasRow) {
    throw new NotFoundError('Canvas not found', 'CANVAS_NOT_FOUND')
  }

  if (canvasRow.locked) {
    throw new ConflictError('Canvas is already locked', 'CANVAS_ALREADY_LOCKED')
  }

  const [updated] = await db
    .update(canvas)
    .set({
      locked: true,
      lockedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(canvas.id, canvasRow.id))
    .returning()

  emitToChannel(channelId, 'canvas:locked', {
    channelId,
    canvasId: canvasRow.id,
    lockedBy: userId,
  })

  return updated
}

/**
 * Unlock a canvas. Only the locker or admin+ can unlock.
 */
export async function unlockCanvas(
  channelId: string,
  userId: string,
  userOrgRole: string,
) {
  const [canvasRow] = await db
    .select()
    .from(canvas)
    .where(eq(canvas.channelId, channelId))
    .limit(1)

  if (!canvasRow) {
    throw new NotFoundError('Canvas not found', 'CANVAS_NOT_FOUND')
  }

  if (!canvasRow.locked) {
    throw new ConflictError('Canvas is not locked', 'CANVAS_NOT_LOCKED')
  }

  // Only the user who locked it or an admin can unlock
  const isLocker = canvasRow.lockedBy === userId
  const isAdmin = userOrgRole === 'admin' || userOrgRole === 'super_admin'

  if (!isLocker && !isAdmin) {
    throw new ForbiddenError(
      'Only the user who locked the canvas or an admin can unlock it',
      'INSUFFICIENT_PERMISSION',
    )
  }

  const [updated] = await db
    .update(canvas)
    .set({
      locked: false,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(canvas.id, canvasRow.id))
    .returning()

  emitToChannel(channelId, 'canvas:unlocked', {
    channelId,
    canvasId: canvasRow.id,
    unlockedBy: userId,
  })

  return updated
}

/**
 * List paginated version history for a canvas.
 */
export async function listVersions(
  canvasId: string,
  page: number = 1,
  limit: number = 20,
) {
  const offset = (page - 1) * limit

  const [totalResult] = await db
    .select({ count: count() })
    .from(canvasVersions)
    .where(eq(canvasVersions.canvasId, canvasId))

  const total = totalResult?.count ?? 0

  const versions = await db
    .select({
      id: canvasVersions.id,
      canvasId: canvasVersions.canvasId,
      createdAt: canvasVersions.createdAt,
    })
    .from(canvasVersions)
    .where(eq(canvasVersions.canvasId, canvasId))
    .orderBy(desc(canvasVersions.createdAt))
    .limit(limit)
    .offset(offset)

  return {
    data: versions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * Revert a canvas to a previous version (non-destructive).
 *
 * 1. Save current state as a new version (backup)
 * 2. Apply the old version's snapshot as the new state
 * 3. Emit `canvas:reverted`
 */
export async function revertToVersion(
  channelId: string,
  versionId: string,
  userId: string,
) {
  const [canvasRow] = await db
    .select()
    .from(canvas)
    .where(eq(canvas.channelId, channelId))
    .limit(1)

  if (!canvasRow) {
    throw new NotFoundError('Canvas not found', 'CANVAS_NOT_FOUND')
  }

  // Check lock status
  if (canvasRow.locked && canvasRow.lockedBy !== userId) {
    throw new ForbiddenError(
      'Canvas is locked by another user',
      'CANVAS_LOCKED',
    )
  }

  // Fetch the target version
  const [targetVersion] = await db
    .select()
    .from(canvasVersions)
    .where(eq(canvasVersions.id, versionId))
    .limit(1)

  if (!targetVersion) {
    throw new NotFoundError('Version not found', 'VERSION_NOT_FOUND')
  }

  if (targetVersion.canvasId !== canvasRow.id) {
    throw new ValidationError(
      'Version does not belong to this canvas',
      'VERSION_MISMATCH',
    )
  }

  // Save current state as a new version (non-destructive backup)
  if (canvasRow.yjsState) {
    await db.insert(canvasVersions).values({
      canvasId: canvasRow.id,
      yjsSnapshot: canvasRow.yjsState,
    })
  }

  // Apply the old version's snapshot
  const restoredState = Buffer.from(targetVersion.yjsSnapshot)

  const [updated] = await db
    .update(canvas)
    .set({
      yjsState: restoredState,
      sizeBytes: restoredState.length,
      updatedAt: new Date(),
    })
    .where(eq(canvas.id, canvasRow.id))
    .returning()

  emitToChannel(channelId, 'canvas:reverted', {
    channelId,
    canvasId: canvasRow.id,
    versionId,
    revertedBy: userId,
  })

  return {
    ...updated,
    yjsState: restoredState.toString('base64'),
  }
}

/**
 * List all available canvas templates.
 */
export async function listTemplates() {
  const redis = getRedis()
  const templateIds = await redis.smembers(TEMPLATE_LIST_KEY)

  if (templateIds.length === 0) {
    return []
  }

  const pipeline = redis.pipeline()
  for (const id of templateIds) {
    pipeline.get(`${TEMPLATE_KEY_PREFIX}${id}`)
  }
  const results = await pipeline.exec()

  const templates: { id: string; name: string; createdAt: string }[] = []

  for (const result of results ?? []) {
    const [err, raw] = result
    if (err || !raw) continue
    const template = JSON.parse(raw as string) as CanvasTemplate
    templates.push({
      id: template.id,
      name: template.name,
      createdAt: template.createdAt,
    })
  }

  return templates
}

/**
 * Create a new canvas template.
 */
export async function createTemplate(name: string, yjsState: Buffer) {
  const redis = getRedis()
  const id = generateTemplateId()
  const now = new Date().toISOString()

  const template: CanvasTemplate = {
    id,
    name,
    yjsState: yjsState.toString('base64'),
    createdAt: now,
  }

  await redis.set(`${TEMPLATE_KEY_PREFIX}${id}`, JSON.stringify(template))
  await redis.sadd(TEMPLATE_LIST_KEY, id)

  return {
    id: template.id,
    name: template.name,
    createdAt: now,
  }
}

/**
 * Delete a canvas template.
 */
export async function deleteTemplate(templateId: string) {
  const redis = getRedis()
  const raw = await redis.get(`${TEMPLATE_KEY_PREFIX}${templateId}`)

  if (!raw) {
    throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
  }

  await redis.del(`${TEMPLATE_KEY_PREFIX}${templateId}`)
  await redis.srem(TEMPLATE_LIST_KEY, templateId)

  return { id: templateId }
}
