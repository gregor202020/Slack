/**
 * Error tracking utility.
 *
 * Provides structured error logging with correlation IDs (request IDs),
 * and installs global handlers for unhandled rejections and uncaught
 * exceptions.
 *
 * Optionally integrates with Sentry when the SENTRY_DSN environment
 * variable is set. If not configured, all errors are simply logged
 * through Pino with zero additional overhead.
 *
 * Correlation: every error logged through this module includes the
 * requestId when available, enabling end-to-end tracing.
 */

import type { FastifyBaseLogger } from 'fastify'

let _sentry: typeof import('@sentry/node') | null = null
let _initialized = false

/**
 * Initialize Sentry if SENTRY_DSN is set.
 *
 * Call once during server startup. Safe to call multiple times — only
 * the first invocation initializes. If SENTRY_DSN is not set, this is
 * a no-op and all subsequent captureException calls are skipped.
 */
export async function initErrorTracking(): Promise<void> {
  if (_initialized) return
  _initialized = true

  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  try {
    const Sentry = await import('@sentry/node')
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // Avoid capturing breadcrumbs for console to prevent log recursion
      integrations: (defaults) =>
        defaults.filter((i) => i.name !== 'Console'),
    })
    _sentry = Sentry
  } catch {
    // @sentry/node not installed or failed to load — continue without it
  }
}

/**
 * Report an error to Sentry (if initialized).
 *
 * Attaches request context as Sentry extras so errors are searchable
 * by userId, route, and correlationId in the Sentry UI.
 */
export function captureException(
  error: Error,
  context?: {
    requestId?: string
    userId?: string
    route?: string
    method?: string
  },
): void {
  if (!_sentry) return

  _sentry.withScope((scope) => {
    if (context?.requestId) scope.setTag('correlationId', context.requestId)
    if (context?.userId) scope.setUser({ id: context.userId })
    if (context?.route) scope.setTag('route', context.route)
    if (context?.method) scope.setTag('method', context.method)
    _sentry!.captureException(error)
  })
}

/**
 * Check whether Sentry has been initialized.
 */
export function isSentryEnabled(): boolean {
  return _sentry !== null
}

/**
 * Log a tracked error with full request context.
 *
 * Called from the global error handler in app.ts to attach
 * request-scoped fields (userId, route, method, correlationId).
 *
 * If Sentry is initialized, the error is also reported there.
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

  // Forward to Sentry when available
  captureException(error, context)
}

/**
 * Install global process-level error handlers.
 *
 * - unhandledRejection: logged at error level, process continues
 * - uncaughtException: logged at fatal level, process exits
 *
 * Both are also reported to Sentry when configured.
 *
 * Should be called once from server.ts after the app is built.
 */
export function installGlobalErrorHandlers(log: FastifyBaseLogger): void {
  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    log.error(
      {
        err: error,
        type: 'unhandled_rejection',
      },
      'Unhandled promise rejection',
    )
    captureException(error)
  })

  process.on('uncaughtException', (error: Error) => {
    log.fatal(
      {
        err: error,
        type: 'uncaught_exception',
      },
      'Uncaught exception — shutting down',
    )
    captureException(error)

    // Flush Sentry events before exiting
    if (_sentry) {
      _sentry.flush(2000).finally(() => process.exit(1))
    } else {
      process.exit(1)
    }
  })
}
