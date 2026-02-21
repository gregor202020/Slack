/**
 * Register all Fastify plugins.
 *
 * - CORS with origin restricted to WEB_URL
 * - Helmet with CSP from spec Section 16.10
 * - Rate limiting with global defaults
 * - Cookie with secure settings
 * - CSRF protection using cookie-based double submit
 * - Multipart file uploads with 100MB limit
 */

import type { FastifyInstance } from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyCookie from '@fastify/cookie'
import fastifyCsrfProtection from '@fastify/csrf-protection'
import fastifyMultipart from '@fastify/multipart'
import { getConfig, type AppConfig } from '../lib/config.js'
import { getRedis } from '../lib/redis.js'

/**
 * Build the list of allowed CORS origins for production.
 * Includes the web URL and any configured mobile origins.
 */
function buildCorsOrigins(config: AppConfig): string[] {
  const origins = [config.webUrl]

  if (config.mobileOrigins) {
    const extras = config.mobileOrigins
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    origins.push(...extras)
  }

  return origins
}

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  const config = getConfig()

  // CORS — allow web + mobile origins (spec Section 16.9.5)
  const corsOrigin = config.isDevelopment
    ? true // Allow all origins in development (Expo, localhost variants, etc.)
    : buildCorsOrigins(config)
  await app.register(fastifyCors, {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400, // 24 hours
  })

  // Helmet — security headers (spec Sections 16.10, 16.14)
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", config.s3FileDomain, 'data:'],
        connectSrc: ["'self'", `wss://${new URL(config.apiUrl).hostname}`],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        reportUri: '/api/csp-report',
      },
    },
    // Additional security headers per spec Section 16.14
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    xContentTypeOptions: true,      // X-Content-Type-Options: nosniff
    xFrameOptions: { action: 'deny' }, // X-Frame-Options: DENY
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // Rate limiting — global defaults (spec Section 16.2)
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // Allow custom per-route overrides via routeConfig
    allowList: [],
    redis: getRedis(),
  });

  // Cookie — secure settings for refresh token storage (spec Section 3.4)
  await app.register(fastifyCookie, {
    secret: config.jwtSecret,
    parseOptions: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/',
    },
  });

  // CSRF protection — double-submit cookie pattern (spec Section 16.9.1)
  await app.register(fastifyCsrfProtection, {
    sessionPlugin: '@fastify/cookie',
    cookieOpts: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/',
    },
  });

  // Multipart file uploads — 100MB limit (spec Section 9.3)
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB
      files: 10,
      fields: 20,
    },
  });
}
