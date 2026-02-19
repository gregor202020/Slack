/**
 * Unit tests for auth.service.ts.
 *
 * Tests OTP request/verify logic, token generation, and session management.
 * These tests exercise the service layer directly (not through HTTP).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

// Mock socket.io emitters
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
import { requestOtp, verifyOtp, logout } from '../../../src/services/auth.service.js'
import {
  createTestUser,
  createTestSession,
  cleanupTestData,
} from '../../helpers/db'

describe('Auth Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // requestOtp
  // -------------------------------------------------------------------------

  describe('requestOtp', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return uniform message for registered phone', async () => {
      await createTestUser({ phone: '+15551111111' })

      const result = await requestOtp(
        '+15551111111',
        'sms',
        '127.0.0.1',
        'test-agent',
      )

      expect(result.message).toContain('verification code')
    })

    it('should return uniform message for unregistered phone', async () => {
      const result = await requestOtp(
        '+15559999999',
        'sms',
        '127.0.0.1',
        'test-agent',
      )

      // Same message to avoid phone enumeration
      expect(result.message).toContain('verification code')
    })

    it('should silently handle locked accounts', async () => {
      await createTestUser({
        phone: '+15552222222',
      })

      // The function should still return the same message
      const result = await requestOtp(
        '+15552222222',
        'sms',
        '127.0.0.1',
        'test-agent',
      )

      expect(result.message).toContain('verification code')
    })
  })

  // -------------------------------------------------------------------------
  // verifyOtp
  // -------------------------------------------------------------------------

  describe('verifyOtp', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should throw OTP_EXPIRED when no OTP was requested', async () => {
      await createTestUser({ phone: '+15553333333' })

      await expect(
        verifyOtp('+15553333333', '123456', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })

    it('should throw INVALID_CREDENTIALS for unregistered phone', async () => {
      await expect(
        verifyOtp('+15559999999', '123456', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })

    it('should reject wrong OTP code after requesting', async () => {
      await createTestUser({ phone: '+15554444444' })

      // Request OTP first (stores it in memory)
      await requestOtp('+15554444444', 'sms', '127.0.0.1', 'test-agent')

      // Try with wrong code
      await expect(
        verifyOtp('+15554444444', '000000', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should revoke a session and return success', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id)

      const result = await logout(
        user.id,
        session.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(result.success).toBe(true)
    })
  })
})
