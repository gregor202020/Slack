/**
 * Centralized logger utility.
 *
 * Re-exports the Fastify app's Pino logger instance so services
 * can emit structured logs without a request context.
 *
 * Usage:
 *   import { logger } from '../lib/logger.js'
 *   logger.info({ userId, channelId }, 'message sent')
 *
 * The logger is initialized lazily once the Fastify app is built.
 * Calling getLogger() before buildApp() will throw.
 */

import type { FastifyBaseLogger } from 'fastify'

let _logger: FastifyBaseLogger | null = null

/**
 * Set the app-level logger. Called once from buildApp().
 */
export function setLogger(instance: FastifyBaseLogger): void {
  _logger = instance
}

/**
 * Get the app-level Pino logger.
 * Throws if called before the Fastify app has been built.
 */
export function getLogger(): FastifyBaseLogger {
  if (!_logger) {
    throw new Error('Logger not initialized. Call setLogger() from buildApp() first.')
  }
  return _logger
}

/**
 * Convenience re-export — a proxy that lazily resolves the logger.
 * Safe to import at module level; will resolve when first used.
 */
export const logger = new Proxy({} as FastifyBaseLogger, {
  get(_target, prop: string) {
    const instance = getLogger()
    const value = (instance as unknown as Record<string, unknown>)[prop]
    if (typeof value === 'function') {
      return value.bind(instance)
    }
    return value
  },
})
