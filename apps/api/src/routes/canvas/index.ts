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
    schema: {
      summary: 'Get channel Canvas',
      description: 'Returns the Canvas document for a channel (creates one if none exists).',
      tags: ['Canvas'],
      params: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                channelId: { type: 'string', format: 'uuid' },
                yjsState: { type: 'string', description: 'Base64-encoded Yjs document state' },
                isLocked: { type: 'boolean' },
                version: { type: 'integer' },
              },
            },
          },
        },
      },
    },
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
    schema: {
      summary: 'Update Canvas',
      description: 'Applies a Yjs update to the Canvas document.',
      tags: ['Canvas'],
      params: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['update'],
        properties: {
          update: { type: 'string', description: 'Base64-encoded Yjs update' },
        },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'object' } } },
        422: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
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
    schema: {
      summary: 'Lock Canvas',
      description: 'Locks the Canvas, making it read-only. Channel owner or Admin+ only.',
      tags: ['Canvas'],
      params: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { data: { type: 'object' } } },
        403: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
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
    schema: {
      summary: 'Unlock Canvas',
      description: 'Unlocks the Canvas, allowing edits again.',
      tags: ['Canvas'],
      params: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { data: { type: 'object' } } },
      },
    },
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
    schema: {
      summary: 'Get Canvas version history',
      description: 'Returns paginated version history of a Canvas document.',
      tags: ['Canvas'],
      params: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string', format: 'uuid' } } },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '20' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            totalPages: { type: 'integer' },
            currentPage: { type: 'integer' },
          },
        },
      },
    },
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
    schema: {
      summary: 'Revert Canvas to version',
      description: 'Reverts the Canvas document to a specific previous version.',
      tags: ['Canvas'],
      params: {
        type: 'object',
        required: ['channelId', 'versionId'],
        properties: {
          channelId: { type: 'string', format: 'uuid' },
          versionId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'object' } } },
      },
    },
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
    schema: {
      summary: 'List Canvas templates',
      description: 'Returns all available Canvas templates.',
      tags: ['Canvas'],
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (_request, reply) => {
      const templates = await canvasService.listTemplates()

      return reply.status(200).send({ data: templates })
    },
  })

  // POST /api/canvas/templates — Create a Canvas template
  app.post('/templates', {
    schema: {
      summary: 'Create Canvas template',
      description: 'Creates a new Canvas template. Admin or Super admin only.',
      tags: ['Canvas'],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Template name' },
          yjsState: { type: 'string', description: 'Base64-encoded Yjs document state' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        422: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
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

      const template = await canvasService.createTemplate(name.trim(), yjsBuffer)

      return reply.status(201).send({ data: template })
    },
  })

  // DELETE /api/canvas/templates/:templateId — Delete a Canvas template
  app.delete('/templates/:templateId', {
    schema: {
      summary: 'Delete Canvas template',
      description: 'Deletes a Canvas template. Admin or Super admin only.',
      tags: ['Canvas'],
      params: { type: 'object', required: ['templateId'], properties: { templateId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { data: { type: 'object', properties: { success: { type: 'boolean' } } } } },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { templateId } = request.params as { templateId: string }

      const result = await canvasService.deleteTemplate(templateId)

      return reply.status(200).send({ data: result })
    },
  })
}
