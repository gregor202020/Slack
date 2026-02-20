/**
 * Redis client singleton for the Smoker API.
 *
 * Provides a shared Redis connection for:
 * - OTP storage with TTL
 * - Rate limiting (distributed)
 * - Session caching (future)
 * - Socket.io adapter (future)
 */

import Redis from 'ioredis'
import { getConfig } from './config.js'
import { logger } from './logger.js'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    const config = getConfig()
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 2000)
        return delay
      },
      lazyConnect: false,
    })

    redis.on('connect', () => {
      logger.info('Redis connected')
    })

    redis.on('error', (err) => {
      logger.error({ err }, 'Redis connection error')
    })

    redis.on('close', () => {
      logger.warn('Redis connection closed')
    })
  }

  return redis
}

/**
 * Gracefully close the Redis connection.
 * Call during application shutdown.
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit()
    redis = null
    logger.info('Redis disconnected')
  }
}
