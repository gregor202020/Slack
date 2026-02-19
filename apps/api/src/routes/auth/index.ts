/**
 * Auth routes — OTP request, verification, token refresh, and logout.
 *
 * Spec references: Sections 3.1-3.5
 */

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { otpRequestSchema, otpVerifySchema } from '@smoker/shared/validation/schemas'
import { extractAuditContext } from '../../lib/audit.js'
import {
  requestOtp,
  verifyOtp,
  refreshAccessToken,
  logout,
} from '../../services/auth.service.js'
import { UnauthorizedError } from '../../lib/errors.js'
import { getConfig } from '../../lib/config.js'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth — Request OTP
  // Rate limit: 5 per hour per phone number (spec Section 3.2)
  app.post('/', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 hour',
      },
    },
    preHandler: [validateBody(otpRequestSchema)],
    handler: async (request, reply) => {
      const { phone, method } = request.body as { phone: string; method: 'sms' | 'email' }
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await requestOtp(phone, method, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/auth/verify — Verify OTP
  // Rate limit: 10 attempts per minute (spec Section 3.2)
  app.post('/verify', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    preHandler: [validateBody(otpVerifySchema)],
    handler: async (request, reply) => {
      const { phone, code } = request.body as { phone: string; code: string }
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await verifyOtp(phone, code, ipAddress, userAgent)

      // Set refresh token as httpOnly secure cookie
      const config = getConfig()
      reply.setCookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        path: '/api/auth/refresh',
        maxAge: config.jwtRefreshExpiry,
      })

      return reply.status(200).send({
        accessToken: result.accessToken,
        user: result.user,
      })
    },
  })

  // POST /api/auth/refresh — Refresh access token
  app.post('/refresh', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      // Extract refresh token from httpOnly cookie
      const refreshToken =
        (request.cookies as Record<string, string | undefined>)?.refreshToken ?? null

      if (!refreshToken) {
        throw new UnauthorizedError('Missing refresh token', 'MISSING_REFRESH_TOKEN')
      }

      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await refreshAccessToken(refreshToken, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/auth/logout — Logout current session
  app.post('/logout', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await logout(user.id, user.sessionId, ipAddress, userAgent)

      // Clear the refresh token cookie
      reply.clearCookie('refreshToken', {
        path: '/api/auth/refresh',
      })

      return reply.status(200).send(result)
    },
  })
}
