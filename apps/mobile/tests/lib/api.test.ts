/**
 * Unit tests for the mobile API client.
 *
 * Tests URL construction, header handling, auth token injection,
 * automatic 401 refresh, query parameter serialization, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  apiClient,
  API_URL,
  getAccessToken,
  setAccessToken,
  setRefreshToken,
  clearTokens,
  getRefreshToken,
} from '../../src/lib/api'
import { __reset as resetSecureStore } from '../__mocks__/expo-secure-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    headers: new Headers(),
  } as unknown as Response
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Client', () => {
  beforeEach(() => {
    resetSecureStore()
    mockFetch.mockReset()
  })

  // -----------------------------------------------------------------------
  // API_URL configuration
  // -----------------------------------------------------------------------

  describe('API_URL', () => {
    it('should be defined and default to localhost:4000/api', () => {
      expect(API_URL).toBe('http://localhost:4000/api')
    })
  })

  // -----------------------------------------------------------------------
  // Token helpers
  // -----------------------------------------------------------------------

  describe('Token helpers', () => {
    it('should store and retrieve an access token', async () => {
      await setAccessToken('test-access-token')
      const token = await getAccessToken()
      expect(token).toBe('test-access-token')
    })

    it('should store and retrieve a refresh token', async () => {
      await setRefreshToken('test-refresh-token')
      const token = await getRefreshToken()
      expect(token).toBe('test-refresh-token')
    })

    it('should return null when no access token is stored', async () => {
      const token = await getAccessToken()
      expect(token).toBeNull()
    })

    it('should clear all tokens', async () => {
      await setAccessToken('access')
      await setRefreshToken('refresh')
      await clearTokens()

      expect(await getAccessToken()).toBeNull()
      expect(await getRefreshToken()).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // URL construction
  // -----------------------------------------------------------------------

  describe('URL construction', () => {
    it('should prepend API_URL to the path', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

      await apiClient.get('/users/me')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toBe('http://localhost:4000/api/users/me')
    })

    it('should append query params when provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))

      await apiClient.get('/messages', {
        params: { cursor: 'abc123', limit: 25 },
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('cursor=abc123')
      expect(calledUrl).toContain('limit=25')
    })

    it('should skip undefined query params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))

      await apiClient.get('/messages', {
        params: { cursor: undefined, limit: 10 },
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).not.toContain('cursor')
      expect(calledUrl).toContain('limit=10')
    })
  })

  // -----------------------------------------------------------------------
  // Header handling
  // -----------------------------------------------------------------------

  describe('Header handling', () => {
    it('should set Content-Type to application/json by default', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}))

      await apiClient.get('/test')

      const opts = mockFetch.mock.calls[0][1] as RequestInit
      const headers = opts.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('should include Authorization header when access token is set', async () => {
      await setAccessToken('my-token')
      mockFetch.mockResolvedValueOnce(jsonResponse({}))

      await apiClient.get('/test')

      const opts = mockFetch.mock.calls[0][1] as RequestInit
      const headers = opts.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer my-token')
    })

    it('should not include Authorization header when no token is set', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}))

      await apiClient.get('/test')

      const opts = mockFetch.mock.calls[0][1] as RequestInit
      const headers = opts.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
    })

    it('should merge custom headers with defaults', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}))

      await apiClient.get('/test', {
        headers: { 'X-Custom': 'value' },
      })

      const opts = mockFetch.mock.calls[0][1] as RequestInit
      const headers = opts.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['X-Custom']).toBe('value')
    })
  })

  // -----------------------------------------------------------------------
  // HTTP methods
  // -----------------------------------------------------------------------

  describe('HTTP methods', () => {
    it('should send GET requests', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1' }))

      const result = await apiClient.get('/users/1')

      expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'GET' })
      expect(result).toEqual({ id: '1' })
    })

    it('should send POST requests with body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ created: true }))

      await apiClient.post('/auth', { phone: '+15551234567' })

      const opts = mockFetch.mock.calls[0][1] as RequestInit
      expect(opts.method).toBe('POST')
      expect(opts.body).toBe(JSON.stringify({ phone: '+15551234567' }))
    })

    it('should send PUT requests with body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ updated: true }))

      await apiClient.put('/users/1', { fullName: 'Jane' })

      const opts = mockFetch.mock.calls[0][1] as RequestInit
      expect(opts.method).toBe('PUT')
      expect(opts.body).toBe(JSON.stringify({ fullName: 'Jane' }))
    })

    it('should send PATCH requests with body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ updated: true }))

      await apiClient.patch('/users/1', { fullName: 'Jane' })

      const opts = mockFetch.mock.calls[0][1] as RequestInit
      expect(opts.method).toBe('PATCH')
      expect(opts.body).toBe(JSON.stringify({ fullName: 'Jane' }))
    })

    it('should send DELETE requests', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))

      await apiClient.delete('/users/1')

      expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
    })

    it('should send POST with undefined body without body in request', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

      await apiClient.post('/auth/logout')

      const opts = mockFetch.mock.calls[0][1] as RequestInit
      expect(opts.body).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('Error handling', () => {
    it('should throw an error with status and data on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'NOT_FOUND', message: 'User not found' } },
          404,
        ),
      )

      try {
        await apiClient.get('/users/nonexistent')
        expect.fail('Should have thrown')
      } catch (err) {
        const error = err as Error & { status: number; data: unknown }
        expect(error).toBeInstanceOf(Error)
        expect(error.status).toBe(404)
        expect(error.data).toEqual({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        })
      }
    })

    it('should use status code in message when error body has no message', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({}, 500),
      )

      try {
        await apiClient.get('/explode')
        expect.fail('Should have thrown')
      } catch (err) {
        const error = err as Error & { status: number }
        expect(error.message).toContain('500')
        expect(error.status).toBe(500)
      }
    })

    it('should handle non-JSON error responses gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => { throw new Error('not JSON') },
        headers: new Headers(),
      } as unknown as Response)

      try {
        await apiClient.get('/bad-gateway')
        expect.fail('Should have thrown')
      } catch (err) {
        const error = err as Error & { status: number; data: unknown }
        expect(error.status).toBe(502)
        expect(error.data).toEqual({})
      }
    })
  })

  // -----------------------------------------------------------------------
  // Auto-refresh on 401
  // -----------------------------------------------------------------------

  describe('Auto-refresh on 401', () => {
    it('should attempt to refresh token on 401 and retry the request', async () => {
      await setAccessToken('old-token')
      await setRefreshToken('my-refresh-token')

      // First call: 401
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401))
      // Refresh call: success
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ accessToken: 'new-token' }),
      )
      // Retry with new token: success
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1', fullName: 'Test' }))

      const result = await apiClient.get<{ id: string; fullName: string }>('/users/me')

      expect(result.fullName).toBe('Test')

      // Should have been called 3 times: original, refresh, retry
      expect(mockFetch).toHaveBeenCalledTimes(3)

      // Verify the refresh call
      const refreshUrl = mockFetch.mock.calls[1][0] as string
      expect(refreshUrl).toContain('/auth/refresh')

      // Verify retry used the new token
      const retryOpts = mockFetch.mock.calls[2][1] as RequestInit
      const retryHeaders = retryOpts.headers as Record<string, string>
      expect(retryHeaders['Authorization']).toBe('Bearer new-token')
    })

    it('should clear tokens if refresh fails', async () => {
      await setAccessToken('old-token')
      await setRefreshToken('bad-refresh')

      // First call: 401
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401))
      // Refresh call: fails
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401))

      try {
        await apiClient.get('/users/me')
        expect.fail('Should have thrown')
      } catch {
        // Expected
      }

      // Tokens should be cleared
      expect(await getAccessToken()).toBeNull()
      expect(await getRefreshToken()).toBeNull()
    })

    it('should not attempt refresh when no access token was set', async () => {
      // No token set at all
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401))

      try {
        await apiClient.get('/users/me')
        expect.fail('Should have thrown')
      } catch {
        // Expected
      }

      // Only one call (no refresh attempt)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should not attempt refresh when no refresh token is available', async () => {
      await setAccessToken('some-token')
      // No refresh token set

      // First call: 401
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401))

      try {
        await apiClient.get('/users/me')
        expect.fail('Should have thrown')
      } catch {
        // Expected
      }

      // Two calls: original request + refresh attempt (which returns null immediately)
      // The refresh function calls fetch for /auth/refresh only if refreshToken is set
      // Since no refresh token, it returns null, so no retry
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
