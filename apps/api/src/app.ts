/**
 * Fastify app factory function.
 *
 * Creates and configures the Fastify instance with:
 * - Logger config (pino) with sensitive data redaction (spec Section 16.12)
 * - All plugins via plugins/index.ts
 * - All routes via routes/index.ts
 * - Global error handler (Zod validation errors, AppError, unknown errors)
 * - onRequest hook for request ID generation
 * - onResponse hook for request logging with userId and metrics tracking
 * - Health check and /api/metrics endpoints
 * - Error correlation IDs via request ID
 */

import Fastify, { type FastifyInstance, type FastifyError } from 'fastify'
import { randomBytes } from 'node:crypto'
import { registerPlugins } from './plugins/index.js'
import { registerRoutes } from './routes/index.js'
import { AppError, ValidationError, InternalError } from './lib/errors.js'
import { getConfig } from './lib/config.js'
import { setLogger } from './lib/logger.js'
import { recordRequest, recordPrometheusRequest, getMetrics, getPrometheusMetrics } from './lib/metrics.js'
import { trackError } from './lib/error-tracker.js'
import { sql as pgSql } from '@smoker/db'

/** Threshold in ms above which requests are logged at warn level. */
const SLOW_REQUEST_THRESHOLD_MS = 1000

export async function buildApp(): Promise<FastifyInstance> {
  const config = getConfig()

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? (config.isDevelopment ? 'debug' : 'info'),
      transport: config.isDevelopment
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
      // Redact sensitive data from logs per spec Section 16.12
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.otp',
          'req.body.password',
          'req.body.token',
          'req.body.refreshToken',
          'req.body.email',
          'req.body.address',
          'req.body.phone',
          'req.body.apiKey',
          // Redact phone numbers and tokens in arbitrary log objects
          'phone',
          'phoneNumber',
          'token',
          'accessToken',
          'refreshToken',
        ],
        censor: '[REDACTED]',
      },
    },
    // Generate unique request IDs
    genReqId: () => randomBytes(8).toString('hex'),
    // Trust proxy headers if behind a reverse proxy
    trustProxy: config.isProduction,
  })

  // Expose the app logger as the centralized logger for services
  setLogger(app.log)

  // --- onRequest hook: attach request ID to response headers ---
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id)
  })

  // --- onResponse hook: structured request logging with userId + metrics ---
  app.addHook('onResponse', async (request, reply) => {
    const responseTime = reply.elapsedTime
    const userId = request.user?.id

    // Track in-memory metrics (legacy JSON + Prometheus)
    recordRequest(responseTime)
    recordPrometheusRequest(
      request.method,
      request.routeOptions?.url ?? request.url,
      reply.statusCode,
      responseTime / 1000,
    )

    const logPayload = {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: Math.round(responseTime * 100) / 100,
      requestId: request.id,
      userId: userId ?? undefined,
      ip: request.ip,
    }

    // Log slow requests at warn level
    if (responseTime > SLOW_REQUEST_THRESHOLD_MS) {
      request.log.warn(logPayload, 'slow request')
    } else {
      request.log.info(logPayload, 'request completed')
    }
  })

  // --- Register plugins ---
  await registerPlugins(app)

  // --- Register routes ---
  await registerRoutes(app)

  // --- Global error handler with correlation IDs ---
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    const correlationId = request.id
    const userId = request.user?.id

    // Handle our custom AppError hierarchy
    if (error instanceof AppError) {
      request.log.warn(
        {
          code: error.code,
          statusCode: error.statusCode,
          correlationId,
          userId,
        },
        error.message,
      )

      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          // Strip details in production to avoid leaking internals (Finding 4.1)
          ...(config.isDevelopment && error.details ? { details: error.details } : {}),
          requestId: correlationId,
        },
      })
    }

    // Handle Zod validation errors that might have been thrown directly
    if (error.name === 'ZodError' && 'issues' in error) {
      const zodError = error as unknown as { issues: Array<{ path: (string | number)[]; message: string; code: string }> }
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: {
            issues: zodError.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              code: issue.code,
            })),
          },
          requestId: correlationId,
        },
      })
    }

    // Handle Fastify's built-in validation errors
    if ('validation' in error && error.validation) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          requestId: correlationId,
        },
      })
    }

    // Handle Fastify rate limit errors
    if ('statusCode' in error && error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          requestId: correlationId,
        },
      })
    }

    // Unknown errors — track with full context
    trackError(request.log, error, {
      requestId: correlationId,
      userId,
      route: request.url,
      method: request.method,
    })

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: correlationId,
      },
    })
  })

  // --- Health check route with dependency checks ---
  app.get('/health', async () => {
    let dbOk = false
    let redisOk = false

    // Database connectivity check
    try {
      await pgSql`SELECT 1`
      dbOk = true
    } catch {
      dbOk = false
    }

    // Redis connectivity check
    try {
      const { getRedis } = await import('./lib/redis.js')
      await getRedis().ping()
      redisOk = true
    } catch {
      redisOk = false
    }

    const status = dbOk ? 'ok' : 'degraded'

    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'ok' : 'fail',
        redis: redisOk ? 'ok' : 'fail',
      },
    }
  })

  // --- Metrics endpoint ---
  app.get('/api/metrics', async () => {
    const metrics = getMetrics()

    // Active WebSocket connections count
    let wsConnections = 0
    try {
      const { getIO } = await import('./plugins/socket.js')
      const io = getIO()
      const sockets = await io.fetchSockets()
      wsConnections = sockets.length
    } catch {
      // Socket.io not yet initialized — that's fine
    }

    // Database connectivity check
    let dbOk = false
    try {
      await pgSql`SELECT 1`
      dbOk = true
    } catch {
      dbOk = false
    }

    // Redis connectivity check
    let redisOk = false
    try {
      const { getRedis } = await import('./lib/redis.js')
      await getRedis().ping()
      redisOk = true
    } catch {
      redisOk = false
    }

    return {
      ...metrics,
      websockets: { activeConnections: wsConnections },
      database: { connected: dbOk },
      redis: { connected: redisOk },
    }
  })

  // --- Prometheus metrics endpoint ---
  app.get('/metrics', async (_request, reply) => {
    // Collect runtime state for Prometheus output
    let wsConnections = 0
    try {
      const { getIO } = await import('./plugins/socket.js')
      const io = getIO()
      const sockets = await io.fetchSockets()
      wsConnections = sockets.length
    } catch {
      // Socket.io not yet initialized
    }

    let dbConnected = false
    try {
      await pgSql`SELECT 1`
      dbConnected = true
    } catch {
      // db unreachable
    }

    let redisConnected = false
    try {
      const { getRedis } = await import('./lib/redis.js')
      await getRedis().ping()
      redisConnected = true
    } catch {
      // redis unreachable
    }

    const body = getPrometheusMetrics({ wsConnections, dbConnected, redisConnected })

    return reply
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(body)
  })

  // --- CSP violation report endpoint (spec Section 16.10) ---
  app.post('/api/csp-report', async (request) => {
    request.log.warn(
      { cspReport: request.body },
      'CSP violation report received',
    )
    return { received: true }
  })

  return app
}
