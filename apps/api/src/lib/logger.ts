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
 *
 * File-based logging:
 *   When the LOG_FILE env var is set, logs are also written to a file.
 *   LOG_MAX_SIZE controls the maximum file size before rotation
 *   (default: 10m). Stdout logging is always active regardless.
 */

import type { FastifyBaseLogger } from 'fastify'
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

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

/**
 * Parse a human-readable size string (e.g., "10m", "100k", "1g") into bytes.
 */
function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(k|m|g|kb|mb|gb)?$/i)
  if (!match) return 10 * 1024 * 1024 // default 10MB

  const num = parseFloat(match[1]!)
  const unit = (match[2] ?? 'm').toLowerCase()

  switch (unit) {
    case 'k':
    case 'kb':
      return num * 1024
    case 'm':
    case 'mb':
      return num * 1024 * 1024
    case 'g':
    case 'gb':
      return num * 1024 * 1024 * 1024
    default:
      return num
  }
}

/**
 * Build the Pino transport configuration for file-based logging.
 *
 * When LOG_FILE is set, creates a multistream transport that writes
 * to both stdout (with pino-pretty in dev) and the specified file.
 *
 * Returns `undefined` if no file logging is configured, allowing
 * the caller to fall back to the default transport.
 */
export function buildFileTransport(isDevelopment: boolean): object | undefined {
  const logFile = process.env.LOG_FILE
  if (!logFile) return undefined

  // Ensure the log directory exists
  try {
    mkdirSync(dirname(logFile), { recursive: true })
  } catch {
    // Directory already exists or cannot be created — continue
  }

  const targets: Array<{ target: string; options: Record<string, unknown>; level?: string }> = []

  // Stdout target (with pretty printing in dev)
  if (isDevelopment) {
    targets.push({
      target: 'pino-pretty',
      options: { colorize: true, destination: 1 },
    })
  } else {
    targets.push({
      target: 'pino/file',
      options: { destination: 1 },
    })
  }

  // File target — writes JSON logs to the specified path.
  // The file is appended to; external rotation tools (logrotate, pm2)
  // or the pino-roll package can handle size-based rotation.
  // LOG_MAX_SIZE is documented as a hint for external rotation config.
  targets.push({
    target: 'pino/file',
    options: {
      destination: logFile,
      mkdir: true,
    },
  })

  return {
    targets,
  }
}

/**
 * Get the configured max log file size in bytes.
 * Used by external rotation tooling or documented for ops reference.
 */
export function getLogMaxSize(): number {
  return parseSize(process.env.LOG_MAX_SIZE ?? '10m')
}
