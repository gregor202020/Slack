/**
 * Error tracking utility.
 *
 * Provides structured error logging with correlation IDs (request IDs),
 * and installs global handlers for unhandled rejections and uncaught
 * exceptions.
 *
 * Correlation: every error logged through this module includes the
 * requestId when available, enabling end-to-end tracing.
 */

import type { FastifyBaseLogger } from 'fastify'

/**
 * Log a tracked error with full request context.
 *
 * Called from the global error handler in app.ts to attach
 * request-scoped fields (userId, route, method, correlationId).
 */
export function trackError(
  log: FastifyBaseLogger,
  error: Error,
  context: {
    requestId?: string
    userId?: string
    route?: string
    method?: string
  },
): void {
  log.error(
    {
      err: error,
      correlationId: context.requestId,
      userId: context.userId,
      route: context.route,
      method: context.method,
    },
    'Tracked error',
  )
}

/**
 * Install global process-level error handlers.
 *
 * - unhandledRejection: logged at error level, process continues
 * - uncaughtException: logged at fatal level, process exits
 *
 * Should be called once from server.ts after the app is built.
 */
export function installGlobalErrorHandlers(log: FastifyBaseLogger): void {
  process.on('unhandledRejection', (reason: unknown) => {
    log.error(
      {
        err: reason instanceof Error ? reason : new Error(String(reason)),
        type: 'unhandled_rejection',
      },
      'Unhandled promise rejection',
    )
  })

  process.on('uncaughtException', (error: Error) => {
    log.fatal(
      {
        err: error,
        type: 'uncaught_exception',
      },
      'Uncaught exception — shutting down',
    )
    process.exit(1)
  })
}
