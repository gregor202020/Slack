/**
 * Unit tests for bookmark.service.ts.
 *
 * Tests adding, removing, listing, and updating bookmarks.
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
  addBookmark,
  removeBookmark,
  listBookmarks,
  updateBookmarkNote,
} from '../../../src/services/bookmark.service.js'
import {
  createTestUser,
  createTestChannel,
  createTestMessage,
  cleanupTestData,
} from '../../helpers/db'

describe('Bookmark Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // addBookmark
  // -------------------------------------------------------------------------

  describe('addBookmark', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should bookmark a message', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Bookmark me',
      })

      const bookmark = await addBookmark(user.id, message.id)

      expect(bookmark).toBeDefined()
      expect(bookmark!.userId).toBe(user.id)
      expect(bookmark!.messageId).toBe(message.id)
    })

    it('should bookmark a message with a note', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Noted bookmark',
      })

      const bookmark = await addBookmark(user.id, message.id, 'Remember this')

      expect(bookmark!.note).toBe('Remember this')
    })

    it('should throw when message does not exist', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(addBookmark(user.id, fakeId)).rejects.toThrow('not found')
    })

    it('should throw when message is already bookmarked', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Double bookmark',
      })

      await addBookmark(user.id, message.id)

      await expect(
        addBookmark(user.id, message.id),
      ).rejects.toThrow('already bookmarked')
    })

    it('should allow different users to bookmark the same message', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user1.id,
        body: 'Shared bookmark',
      })

      const bm1 = await addBookmark(user1.id, message.id)
      const bm2 = await addBookmark(user2.id, message.id)

      expect(bm1!.id).not.toBe(bm2!.id)
    })
  })

  // -------------------------------------------------------------------------
  // removeBookmark
  // -------------------------------------------------------------------------

  describe('removeBookmark', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should remove a bookmark', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Remove me',
      })
      const bookmark = await addBookmark(user.id, message.id)

      const result = await removeBookmark(user.id, bookmark!.id)

      expect(result.success).toBe(true)
    })

    it('should throw when bookmark does not exist', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(removeBookmark(user.id, fakeId)).rejects.toThrow('not found')
    })

    it('should throw when removing another users bookmark', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user1.id,
        body: 'Not yours',
      })
      const bookmark = await addBookmark(user1.id, message.id)

      await expect(
        removeBookmark(user2.id, bookmark!.id),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // listBookmarks
  // -------------------------------------------------------------------------

  describe('listBookmarks', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return bookmarks for a user', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const msg1 = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Bookmark 1',
      })
      const msg2 = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Bookmark 2',
      })
      await addBookmark(user.id, msg1.id)
      await addBookmark(user.id, msg2.id)

      const result = await listBookmarks(user.id)

      expect(result.bookmarks.length).toBe(2)
      expect(result.bookmarks[0].message).toBeDefined()
    })

    it('should return empty list when user has no bookmarks', async () => {
      const user = await createTestUser()

      const result = await listBookmarks(user.id)

      expect(result.bookmarks).toEqual([])
    })

    it('should paginate bookmarks', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      for (let i = 0; i < 5; i++) {
        const msg = await createTestMessage({
          channelId: channel.id,
          userId: user.id,
          body: `BM ${i}`,
        })
        await addBookmark(user.id, msg.id)
      }

      const result = await listBookmarks(user.id, undefined, 2)

      expect(result.bookmarks.length).toBeLessThanOrEqual(2)
      expect(result.nextCursor).not.toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // updateBookmarkNote
  // -------------------------------------------------------------------------

  describe('updateBookmarkNote', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update the note on a bookmark', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Update note',
      })
      const bookmark = await addBookmark(user.id, message.id, 'Old note')

      const updated = await updateBookmarkNote(user.id, bookmark!.id, 'New note')

      expect(updated!.note).toBe('New note')
    })

    it('should clear the note when set to null', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Clear note',
      })
      const bookmark = await addBookmark(user.id, message.id, 'Has note')

      const updated = await updateBookmarkNote(user.id, bookmark!.id, null)

      expect(updated!.note).toBeNull()
    })

    it('should throw when bookmark does not exist', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        updateBookmarkNote(user.id, fakeId, 'note'),
      ).rejects.toThrow('not found')
    })

    it('should throw when updating another users bookmark', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user1.id,
        body: 'Not your bookmark',
      })
      const bookmark = await addBookmark(user1.id, message.id)

      await expect(
        updateBookmarkNote(user2.id, bookmark!.id, 'hacked'),
      ).rejects.toThrow('not found')
    })
  })
})
