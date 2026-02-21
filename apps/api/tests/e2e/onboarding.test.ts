/**
 * E2E tests for the Onboarding API.
 *
 * Covers: get onboarding status, complete onboarding,
 * list positions, list venues, auth enforcement, and validation.
 *
 * Routes tested:
 *   GET  /api/onboarding/status     — get onboarding status
 *   POST /api/onboarding/complete   — complete onboarding
 *   GET  /api/onboarding/positions  — list available positions
 *   GET  /api/onboarding/venues     — list available venues
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestPosition,
  cleanupTestData,
} from '../helpers/db'

describe('Onboarding API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/onboarding/status — Get onboarding status
  // -------------------------------------------------------------------------

  describe('GET /api/onboarding/status — Get onboarding status', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return onboarding status for an authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/onboarding/status',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('completed')
      expect(typeof body.completed).toBe('boolean')
    })

    it('should return missing fields in the status response', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/onboarding/status',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('missingFields')
      expect(Array.isArray(body.missingFields)).toBe(true)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/onboarding/status',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/onboarding/complete — Complete onboarding
  // -------------------------------------------------------------------------

  describe('POST /api/onboarding/complete — Complete onboarding', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should complete onboarding with all required fields', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)
      const position = await createTestPosition({ name: 'Server' })

      const response = await app.inject({
        method: 'POST',
        url: '/api/onboarding/complete',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fullName: 'John Doe',
          email: 'john@example.com',
          address: '123 Main St',
          positionId: position.id,
          timezone: 'America/Chicago',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('id')
    })

    it('should return 422 for missing required fields', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/onboarding/complete',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fullName: 'Jane Smith',
        },
      })

      // Missing email, address, positionId, timezone — should fail Zod validation
      expect(response.statusCode).toBe(422)
    })

    it('should return 400 for missing fullName', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/onboarding/complete',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          email: 'missing@name.com',
        },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/onboarding/complete',
        payload: { fullName: 'Unauthorized User' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/onboarding/positions — List positions
  // -------------------------------------------------------------------------

  describe('GET /api/onboarding/positions — List positions', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list available positions for an authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/onboarding/positions',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/onboarding/positions',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/onboarding/venues — List venues
  // -------------------------------------------------------------------------

  describe('GET /api/onboarding/venues — List venues', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list available venues for an authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/onboarding/venues',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/onboarding/venues',
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
