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
    schema: {
      summary: 'Request OTP',
      description: 'Sends a one-time password to the specified phone number via SMS or email',
      tags: ['Auth'],
      security: [],
      body: {
        type: 'object',
        required: ['phone', 'method'],
        properties: {
          phone: { type: 'string', description: 'Phone number in E.164 format' },
          method: { type: 'string', enum: ['sms', 'email'], description: 'Delivery method for the OTP' },
        },
      },
      response: {
        200: {
          type: 'object',
          description: 'OTP sent successfully',
          properties: {
            success: { type: 'boolean' },
            expiresIn: { type: 'number', description: 'OTP expiry time in seconds' },
          },
        },
        422: {
          type: 'object',
          description: 'Validation error',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        429: {
          type: 'object',
          description: 'Rate limit exceeded',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
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
    schema: {
      summary: 'Verify OTP',
      description: 'Verifies the OTP code and returns access/refresh tokens on success',
      tags: ['Auth'],
      security: [],
      body: {
        type: 'object',
        required: ['phone', 'code'],
        properties: {
          phone: { type: 'string', description: 'Phone number in E.164 format' },
          code: { type: 'string', description: 'OTP code received via SMS or email' },
        },
      },
      response: {
        200: {
          type: 'object',
          description: 'Authentication successful',
          properties: {
            accessToken: { type: 'string', description: 'JWT access token' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                phone: { type: 'string' },
                fullName: { type: 'string' },
                orgRole: { type: 'string' },
                status: { type: 'string' },
                onboardingComplete: { type: 'boolean' },
              },
            },
          },
        },
        401: {
          type: 'object',
          description: 'Invalid or expired OTP',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        429: {
          type: 'object',
          description: 'Rate limit exceeded',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
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
    schema: {
      summary: 'Refresh access token',
      description: 'Uses the httpOnly refresh token cookie to issue a new access token',
      tags: ['Auth'],
      security: [],
      response: {
        200: {
          type: 'object',
          description: 'New access token issued',
          properties: {
            accessToken: { type: 'string', description: 'New JWT access token' },
          },
        },
        401: {
          type: 'object',
          description: 'Missing or invalid refresh token',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
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
    schema: {
      summary: 'Logout',
      description: 'Invalidates the current session and clears the refresh token cookie',
      tags: ['Auth'],
      response: {
        200: {
          type: 'object',
          description: 'Logged out successfully',
          properties: {
            success: { type: 'boolean' },
          },
        },
        401: {
          type: 'object',
          description: 'Not authenticated',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
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
