/**
 * Sentry client-side configuration for Next.js.
 *
 * This file is automatically loaded by @sentry/nextjs when present.
 * If NEXT_PUBLIC_SENTRY_DSN is not set, Sentry is not initialized
 * and this file has no effect.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV ?? 'development',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
      })
    })
    .catch(() => {
      // @sentry/nextjs not installed — continue without error tracking
    })
}
