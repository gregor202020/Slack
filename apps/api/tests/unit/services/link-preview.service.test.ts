/**
 * Unit tests for link-preview.service.ts.
 *
 * Tests URL extraction, meta tag parsing,
 * link preview retrieval, and processing.
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
  extractUrls,
  getLinkPreviews,
} from '../../../src/services/link-preview.service.js'
import {
  createTestUser,
  createTestChannel,
  createTestMessage,
  cleanupTestData,
} from '../../helpers/db'

describe('Link Preview Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // extractUrls
  // -------------------------------------------------------------------------

  describe('extractUrls', () => {
    it('should extract URLs from a message body', () => {
      const body = 'Check out https://example.com and http://test.org/page'

      const urls = extractUrls(body)

      expect(urls).toContain('https://example.com')
      expect(urls).toContain('http://test.org/page')
    })

    it('should return empty array when no URLs found', () => {
      const body = 'No links here, just plain text.'

      const urls = extractUrls(body)

      expect(urls).toEqual([])
    })

    it('should deduplicate URLs', () => {
      const body = 'Visit https://example.com and again https://example.com'

      const urls = extractUrls(body)

      expect(urls.length).toBe(1)
    })

    it('should cap at 5 URLs per message', () => {
      const body = Array.from({ length: 10 }, (_, i) =>
        `https://example${i}.com`,
      ).join(' ')

      const urls = extractUrls(body)

      expect(urls.length).toBeLessThanOrEqual(5)
    })

    it('should handle URLs with paths and query params', () => {
      const body = 'See https://example.com/path?foo=bar&baz=qux'

      const urls = extractUrls(body)

      expect(urls.length).toBe(1)
      expect(urls[0]).toContain('example.com/path')
    })

    it('should handle URLs with parentheses (Wikipedia style)', () => {
      const body = 'Read https://en.wikipedia.org/wiki/Rust_(programming_language) for more'

      const urls = extractUrls(body)

      expect(urls.length).toBe(1)
      expect(urls[0]).toContain('Rust_(programming_language)')
    })

    it('should not extract non-HTTP URLs', () => {
      const body = 'Use ftp://files.example.com and mailto:user@example.com'

      const urls = extractUrls(body)

      expect(urls).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // getLinkPreviews
  // -------------------------------------------------------------------------

  describe('getLinkPreviews', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return empty array for message with no previews', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'No links here',
      })

      const previews = await getLinkPreviews(message.id)

      expect(previews).toEqual([])
    })

    it('should return empty array for non-existent message', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const previews = await getLinkPreviews(fakeId)

      expect(previews).toEqual([])
    })
  })
})
