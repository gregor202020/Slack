/**
 * Canvas routes — CRUD, version history, lock/unlock.
 *
 * Spec references: Section 11
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { requireChannelMembership, requireRole } from '../../middleware/roles.js';

export async function canvasRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/canvas/channel/:channelId — Get Canvas for a channel
  // One Canvas per channel (spec Section 11.1)
  app.get('/channel/:channelId', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (_request, reply) => {
      // TODO: Implement Canvas retrieval
      // - Return Canvas state (Yjs document)
      // - Create Canvas if it doesn't exist yet
      return reply.status(200).send({ message: 'TODO: implement' });
    },
  });

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
    handler: async (_request, reply) => {
      // TODO: Implement Canvas update
      // - Validate Yjs update structure and size (spec Section 11.6)
      // - Max Canvas document size: 5 MB
      // - Reject updates that would exceed size limit
      // - Apply update to server-side Yjs document
      // - Sanitize content (same pipeline as messages, spec Section 11.6)
      // - Auto-save versioning: version every 5 minutes or on significant changes
      return reply.status(200).send({ message: 'TODO: implement' });
    },
  });

  // POST /api/canvas/channel/:channelId/lock — Lock Canvas (read-only)
  // Channel owner or Admin+ (spec Section 11.5)
  app.post('/channel/:channelId/lock', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (_request, reply) => {
      // TODO: Implement Canvas locking
      // - Check: user is channel owner, or Admin+
      // - Set locked = true, locked_by = userId
      return reply.status(200).send({ message: 'TODO: implement' });
    },
  });

  // POST /api/canvas/channel/:channelId/unlock — Unlock Canvas
  app.post('/channel/:channelId/unlock', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (_request, reply) => {
      // TODO: Implement Canvas unlocking
      // - Check: user is channel owner, or Admin+
      return reply.status(200).send({ message: 'TODO: implement' });
    },
  });

  // GET /api/canvas/channel/:channelId/versions — Get Canvas version history
  app.get('/channel/:channelId/versions', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (_request, reply) => {
      // TODO: Implement version history listing
      // - Paginated
      // - Return version snapshots with timestamps
      return reply.status(200).send({ message: 'TODO: implement' });
    },
  });

  // POST /api/canvas/channel/:channelId/revert/:versionId — Revert to a version
  app.post('/channel/:channelId/revert/:versionId', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (_request, reply) => {
      // TODO: Implement Canvas revert
      // - Revert creates a new version (non-destructive, spec Section 11.4)
      return reply.status(200).send({ message: 'TODO: implement' });
    },
  });

  // --- Canvas templates (Admin-managed) ---

  // GET /api/canvas/templates — List Canvas templates
  app.get('/templates', {
    preHandler: [authenticate],
    handler: async (_request, reply) => {
      // TODO: Return available Canvas templates
      return reply.status(200).send({ message: 'TODO: implement' });
    },
  });

  // POST /api/canvas/templates — Create a Canvas template
  app.post('/templates', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (_request, reply) => {
      // TODO: Implement Canvas template creation
      return reply.status(201).send({ message: 'TODO: implement' });
    },
  });

  // DELETE /api/canvas/templates/:templateId — Delete a Canvas template
  app.delete('/templates/:templateId', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (_request, reply) => {
      // TODO: Implement Canvas template deletion
      return reply.status(200).send({ message: 'TODO: implement' });
    },
  });
}
