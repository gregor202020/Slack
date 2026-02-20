/**
 * Bookmark routes — personal message bookmarks with optional notes.
 *
 * Routes:
 *   GET    /api/bookmarks              — list current user's bookmarks
 *   POST   /api/bookmarks              — add a bookmark
 *   PATCH  /api/bookmarks/:bookmarkId  — update bookmark note
 *   DELETE /api/bookmarks/:bookmarkId  — remove a bookmark
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import {
  addBookmark,
  removeBookmark,
  listBookmarks,
  updateBookmarkNote,
} from '../../services/bookmark.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const addBookmarkSchema = z.object({
  messageId: z.string().uuid(),
  note: z.string().max(500).optional(),
})

const updateBookmarkNoteSchema = z.object({
  note: z.string().max(500).nullable(),
})

const bookmarkQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function bookmarkRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/bookmarks — List current user's bookmarks
  app.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const parsed = bookmarkQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message ?? 'Validation failed',
          },
        })
      }
      const { cursor, limit } = parsed.data
      const result = await listBookmarks(id, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // POST /api/bookmarks — Add a bookmark
  app.post('/', {
    preHandler: [authenticate, validateBody(addBookmarkSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { messageId, note } = request.body as { messageId: string; note?: string }
      const bookmark = await addBookmark(id, messageId, note)
      return reply.status(201).send(bookmark)
    },
  })

  // PATCH /api/bookmarks/:bookmarkId — Update bookmark note
  app.patch('/:bookmarkId', {
    preHandler: [authenticate, validateBody(updateBookmarkNoteSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { bookmarkId } = request.params as { bookmarkId: string }
      const { note } = request.body as { note: string | null }
      const updated = await updateBookmarkNote(id, bookmarkId, note)
      return reply.status(200).send(updated)
    },
  })

  // DELETE /api/bookmarks/:bookmarkId — Remove a bookmark
  app.delete('/:bookmarkId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { bookmarkId } = request.params as { bookmarkId: string }
      const result = await removeBookmark(id, bookmarkId)
      return reply.status(200).send(result)
    },
  })
}
