/**
 * File routes -- Upload, download, list, and delete files.
 *
 * Spec references: Section 9
 */

import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { paginationQuerySchema } from '@smoker/shared'
import { authenticate } from '../../middleware/auth.js'
import { requireChannelMembership, requireDmMembership } from '../../middleware/roles.js'
import { extractAuditContext } from '../../lib/audit.js'
import { ForbiddenError } from '../../lib/errors.js'
import { db, channelMembers, dmMembers } from '@smoker/db'
import {
  uploadFile,
  getFileById,
  getFileDownloadUrl,
  deleteFile,
  listChannelFiles,
  listDmFiles,
  listMyFiles,
  getStorageUsage,
} from '../../services/file.service.js'

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/files/upload -- Upload a file
  // Rate limit: 10 per minute per user (spec Section 9.3)
  app.post('/upload', {
    preHandler: [authenticate],
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { id: userId } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const data = await request.file()

      if (!data) {
        return reply.status(400).send({
          error: { code: 'NO_FILE', message: 'No file provided' },
        })
      }

      const fileBuffer = await data.toBuffer()
      const channelId =
        (data.fields.channelId as { value?: string } | undefined)?.value ?? undefined
      const dmId =
        (data.fields.dmId as { value?: string } | undefined)?.value ?? undefined

      // Verify membership in the target channel or DM before allowing upload
      if (channelId) {
        const [member] = await db
          .select({ channelId: channelMembers.channelId })
          .from(channelMembers)
          .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
          .limit(1)
        if (!member) throw new ForbiddenError('Not a member of this channel')
      } else if (dmId) {
        const [member] = await db
          .select({ dmId: dmMembers.dmId })
          .from(dmMembers)
          .where(and(eq(dmMembers.dmId, dmId), eq(dmMembers.userId, userId)))
          .limit(1)
        if (!member) throw new ForbiddenError('Not a member of this DM')
      }

      const file = await uploadFile({
        fileBuffer,
        filename: data.filename,
        mimeType: data.mimetype,
        userId,
        channelId,
        dmId,
        ipAddress,
        userAgent,
      })

      return reply.status(201).send(file)
    },
  })

  // GET /api/files/:fileId -- Get file metadata
  app.get('/:fileId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { fileId } = request.params as { fileId: string }
      const file = await getFileById(fileId, id, orgRole)
      return reply.status(200).send(file)
    },
  })

  // GET /api/files/:fileId/download -- Get a signed download URL
  app.get('/:fileId/download', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { fileId } = request.params as { fileId: string }
      const result = await getFileDownloadUrl(fileId, id, orgRole)
      return reply.status(200).send(result)
    },
  })

  // DELETE /api/files/:fileId -- Delete a file
  app.delete('/:fileId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { fileId } = request.params as { fileId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const result = await deleteFile(fileId, id, orgRole, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // GET /api/files/channel/:channelId -- List files in a channel
  app.get('/channel/:channelId', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await listChannelFiles(channelId, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // GET /api/files/dm/:dmId -- List files in a DM
  app.get('/dm/:dmId', {
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { dmId } = request.params as { dmId: string }
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await listDmFiles(dmId, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // GET /api/files/user/me -- List my uploaded files
  app.get('/user/me', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await listMyFiles(id, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // GET /api/files/storage -- Get storage usage
  app.get('/storage', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const result = await getStorageUsage(id)
      return reply.status(200).send(result)
    },
  })
}
