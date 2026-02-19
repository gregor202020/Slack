/**
 * Canvas routes — CRUD, version history, lock/unlock.
 *
 * Spec references: Section 11
 */

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/auth.js'
import { requireChannelMembership, requireRole } from '../../middleware/roles.js'
import * as canvasService from '../../services/canvas.service.js'

export async function canvasRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/canvas/channel/:channelId — Get Canvas for a channel
  // One Canvas per channel (spec Section 11.1)
  app.get('/channel/:channelId', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }

      const result = await canvasService.getOrCreateCanvas(channelId)

      return reply.status(200).send({ data: result })
    },
  })

  // PATCH /api/canvas/channel/:channelId — Update Canvas (Yjs update)
  // Rate limit: 60 Yjs updates per minute per user (spec Section 11.6)
  app.patch('/channel/:channelId', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const { update: updateBase64 } = request.body as { update: string }

      if (!updateBase64 || typeof updateBase64 !== 'string') {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing or invalid "update" field (expected base64 string)',
          },
        })
      }

      // Decode base64 to Buffer
      const updateBuffer = Buffer.from(updateBase64, 'base64')

      if (updateBuffer.length === 0) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Update cannot be empty',
          },
        })
      }

      const result = await canvasService.applyUpdate(
        channelId,
        updateBuffer,
        request.user!.id,
      )

      return reply.status(200).send({ data: result })
    },
  })

  // POST /api/canvas/channel/:channelId/lock — Lock Canvas (read-only)
  // Channel owner or Admin+ (spec Section 11.5)
  app.post('/channel/:channelId/lock', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }

      const result = await canvasService.lockCanvas(
        channelId,
        request.user!.id,
        request.user!.orgRole,
      )

      return reply.status(200).send({ data: result })
    },
  })

  // POST /api/canvas/channel/:channelId/unlock — Unlock Canvas
  app.post('/channel/:channelId/unlock', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }

      const result = await canvasService.unlockCanvas(
        channelId,
        request.user!.id,
        request.user!.orgRole,
      )

      return reply.status(200).send({ data: result })
    },
  })

  // GET /api/canvas/channel/:channelId/versions — Get Canvas version history
  app.get('/channel/:channelId/versions', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const { page = '1', limit = '20' } = request.query as {
        page?: string
        limit?: string
      }

      // First get the canvas to obtain the canvasId
      const canvasData = await canvasService.getOrCreateCanvas(channelId)

      const result = await canvasService.listVersions(
        canvasData.id!,
        parseInt(page ?? '1', 10),
        parseInt(limit ?? '20', 10),
      )

      return reply.status(200).send(result)
    },
  })

  // POST /api/canvas/channel/:channelId/revert/:versionId — Revert to a version
  app.post('/channel/:channelId/revert/:versionId', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId, versionId } = request.params as {
        channelId: string
        versionId: string
      }

      const result = await canvasService.revertToVersion(
        channelId,
        versionId,
        request.user!.id,
      )

      return reply.status(200).send({ data: result })
    },
  })

  // --- Canvas templates (Admin-managed) ---

  // GET /api/canvas/templates — List Canvas templates
  app.get('/templates', {
    preHandler: [authenticate],
    handler: async (_request, reply) => {
      const templates = canvasService.listTemplates()

      return reply.status(200).send({ data: templates })
    },
  })

  // POST /api/canvas/templates — Create a Canvas template
  app.post('/templates', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { name, yjsState: yjsStateBase64 } = request.body as {
        name: string
        yjsState?: string
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Template name is required',
          },
        })
      }

      // If yjsState is provided as base64, decode it; otherwise create empty doc
      let yjsBuffer: Buffer
      if (yjsStateBase64 && typeof yjsStateBase64 === 'string') {
        yjsBuffer = Buffer.from(yjsStateBase64, 'base64')
      } else {
        // Create a default empty Yjs document
        const Y = await import('yjs')
        const doc = new Y.Doc()
        yjsBuffer = Buffer.from(Y.encodeStateAsUpdate(doc))
        doc.destroy()
      }

      const template = canvasService.createTemplate(name.trim(), yjsBuffer)

      return reply.status(201).send({ data: template })
    },
  })

  // DELETE /api/canvas/templates/:templateId — Delete a Canvas template
  app.delete('/templates/:templateId', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { templateId } = request.params as { templateId: string }

      const result = canvasService.deleteTemplate(templateId)

      return reply.status(200).send({ data: result })
    },
  })
}
