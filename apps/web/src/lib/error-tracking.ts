/**
 * Error tracking initialization for the web client.
 *
 * Conditionally initializes Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
 * If the env var is not configured, this module is a complete no-op
 * with zero runtime overhead — no SDK is loaded.
 *
 * Import this module once from the root layout to ensure early init.
 */

export function initErrorTracking(): void {
  // Server-side: no-op (Sentry client config handles browser init)
  if (typeof window === 'undefined') return

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return

  // Dynamically import to avoid bundling Sentry when not configured
  import('@sentry/nextjs')
    .then((Sentry) => {
      if (!Sentry.isInitialized()) {
        Sentry.init({
          dsn,
          environment: process.env.NODE_ENV ?? 'development',
          tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
        })
      }
    })
    .catch(() => {
      // @sentry/nextjs not installed — continue without error tracking
    })
}

// Auto-initialize on import
initErrorTracking()
