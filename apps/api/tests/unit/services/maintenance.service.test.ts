/**
 * Unit tests for maintenance.service.ts.
 *
 * Tests maintenance request CRUD, status transitions,
 * and comment management.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

vi.mock('../../../src/plugins/socket.js', () => ({
  initializeSocketIO: vi.fn(),
  getIO: vi.fn(() => ({
    to: () => ({ emit: vi.fn() }),
    emit: vi.fn(),
  })),
  emitToChannel: vi.fn(),
  emitToDm: vi.fn(),
  emitToUser: vi.fn(),
  disconnectUser: vi.fn(),
  removeFromChannelRoom: vi.fn(),
  getOnlineUsers: vi.fn(() => new Set()),
  shutdownSocketIO: vi.fn(),
}))

vi.mock('../../../src/plugins/firebase.js', () => ({
  initFirebase: vi.fn(),
  getFirebaseApp: vi.fn(() => null),
}))

import { loadConfig } from '../../../src/lib/config.js'
import {
  listMaintenanceRequests,
  createMaintenanceRequest,
  getMaintenanceRequest,
  updateMaintenanceRequest,
  changeMaintenanceStatus,
  listComments,
  addComment,
  deleteComment,
} from '../../../src/services/maintenance.service.js'
import {
  createTestUser,
  createTestVenue,
  cleanupTestData,
} from '../../helpers/db'

describe('Maintenance Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // createMaintenanceRequest
  // -------------------------------------------------------------------------

  describe('createMaintenanceRequest', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a maintenance request', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()

      const request = await createMaintenanceRequest(
        {
          venueId: venue.id,
          title: 'Broken window',
          description: 'The front window is cracked.',
          priority: 'high',
        },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(request).toBeDefined()
      expect(request.title).toBe('Broken window')
      expect(request.priority).toBe('high')
      expect(request.status).toBe('open')
    })

    it('should throw when venue does not exist', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        createMaintenanceRequest(
          {
            venueId: fakeId,
            title: 'No Venue',
            description: 'Venue does not exist.',
            priority: 'low',
          },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('Venue not found')
    })
  })

  // -------------------------------------------------------------------------
  // getMaintenanceRequest
  // -------------------------------------------------------------------------

  describe('getMaintenanceRequest', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a maintenance request by ID', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        {
          venueId: venue.id,
          title: 'Get By Id',
          description: 'Test description.',
          priority: 'medium',
        },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      const found = await getMaintenanceRequest(request.id)

      expect(found.id).toBe(request.id)
      expect(found.title).toBe('Get By Id')
      expect(found.commentCount).toBeDefined()
    })

    it('should throw for non-existent request', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getMaintenanceRequest(fakeId)).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // listMaintenanceRequests
  // -------------------------------------------------------------------------

  describe('listMaintenanceRequests', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list all maintenance requests', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()

      await createMaintenanceRequest(
        { venueId: venue.id, title: 'Request 1', description: 'D1', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )
      await createMaintenanceRequest(
        { venueId: venue.id, title: 'Request 2', description: 'D2', priority: 'high' },
        user.id, '127.0.0.1', 'test-agent',
      )

      const result = await listMaintenanceRequests()

      expect(result.requests.length).toBe(2)
    })

    it('should filter by status', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()

      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'Open', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )

      // Change one to in_progress
      await changeMaintenanceStatus(request.id, 'in_progress', user.id, '127.0.0.1', 'test-agent')

      const result = await listMaintenanceRequests({ status: 'in_progress' })

      expect(result.requests.every((r: { status: string }) => r.status === 'in_progress')).toBe(true)
    })

    it('should filter by venue', async () => {
      const user = await createTestUser()
      const venue1 = await createTestVenue({ name: 'Venue 1' })
      const venue2 = await createTestVenue({ name: 'Venue 2' })

      await createMaintenanceRequest(
        { venueId: venue1.id, title: 'V1 Request', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )
      await createMaintenanceRequest(
        { venueId: venue2.id, title: 'V2 Request', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )

      const result = await listMaintenanceRequests({ venueId: venue1.id })

      expect(result.requests.length).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // updateMaintenanceRequest
  // -------------------------------------------------------------------------

  describe('updateMaintenanceRequest', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update title and description', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'Old Title', description: 'Old Desc', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )

      const updated = await updateMaintenanceRequest(
        request.id,
        { title: 'New Title', description: 'New Desc' },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(updated!.title).toBe('New Title')
    })

    it('should throw for non-existent request', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        updateMaintenanceRequest(
          fakeId,
          { title: 'Ghost' },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // changeMaintenanceStatus
  // -------------------------------------------------------------------------

  describe('changeMaintenanceStatus', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should transition from open to in_progress', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'Status Test', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )

      const updated = await changeMaintenanceStatus(
        request.id,
        'in_progress',
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(updated!.status).toBe('in_progress')
    })

    it('should transition from in_progress to done', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'To Done', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )

      await changeMaintenanceStatus(request.id, 'in_progress', user.id, '127.0.0.1', 'test-agent')
      const updated = await changeMaintenanceStatus(request.id, 'done', user.id, '127.0.0.1', 'test-agent')

      expect(updated!.status).toBe('done')
    })

    it('should reject invalid status transition', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'Invalid Trans', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )

      // open -> done is not allowed (must go through in_progress)
      await expect(
        changeMaintenanceStatus(request.id, 'done', user.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('Invalid status transition')
    })
  })

  // -------------------------------------------------------------------------
  // addComment / listComments / deleteComment
  // -------------------------------------------------------------------------

  describe('addComment', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add a comment to a request', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'Comment Test', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )

      const comment = await addComment(
        request.id,
        'Looks like it needs a new part.',
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(comment).toBeDefined()
      expect(comment.body).toBe('Looks like it needs a new part.')
    })

    it('should throw when request does not exist', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        addComment(fakeId, 'Comment body', user.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })
  })

  describe('listComments', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list comments for a request', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'List Comments', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )
      await addComment(request.id, 'Comment 1', user.id, '127.0.0.1', 'test-agent')
      await addComment(request.id, 'Comment 2', user.id, '127.0.0.1', 'test-agent')

      const result = await listComments(request.id)

      expect(result.comments.length).toBe(2)
    })

    it('should return empty list for request with no comments', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'No Comments', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )

      const result = await listComments(request.id)

      expect(result.comments).toEqual([])
    })
  })

  describe('deleteComment', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow author to delete their comment', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'Delete Comment', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )
      const comment = await addComment(request.id, 'Delete me', user.id, '127.0.0.1', 'test-agent')

      await deleteComment(comment.id, user.id, 'basic')

      const result = await listComments(request.id)
      expect(result.comments.length).toBe(0)
    })

    it('should allow admin to delete any comment', async () => {
      const user = await createTestUser()
      const admin = await createTestUser({ orgRole: 'admin' })
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'Admin Delete', description: 'D', priority: 'low' },
        user.id, '127.0.0.1', 'test-agent',
      )
      const comment = await addComment(request.id, 'Admin can delete', user.id, '127.0.0.1', 'test-agent')

      await deleteComment(comment.id, admin.id, 'admin')

      const result = await listComments(request.id)
      expect(result.comments.length).toBe(0)
    })

    it('should reject deletion by non-author non-admin', async () => {
      const author = await createTestUser()
      const other = await createTestUser()
      const venue = await createTestVenue()
      const request = await createMaintenanceRequest(
        { venueId: venue.id, title: 'No Delete', description: 'D', priority: 'low' },
        author.id, '127.0.0.1', 'test-agent',
      )
      const comment = await addComment(request.id, 'Protected', author.id, '127.0.0.1', 'test-agent')

      await expect(
        deleteComment(comment.id, other.id, 'basic'),
      ).rejects.toThrow()
    })
  })
})
