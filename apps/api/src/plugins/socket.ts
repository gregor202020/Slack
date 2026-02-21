/**
 * Socket.io setup — attached to Fastify's underlying HTTP server.
 *
 * - CORS restricted to WEB_URL
 * - Auth middleware verifies access token on handshake (spec Section 8.2)
 * - WSS transport only in production
 * - Server-controlled room joins only
 */

import { Server as SocketIOServer } from 'socket.io'
import type { Server as HTTPServer } from 'node:http'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import { getConfig, type AppConfig } from '../lib/config.js'
import { verifyToken } from '../lib/jwt.js'
import { db, channelMembers, dmMembers, dms, userSessions } from '@smoker/db'
import { eq, and, isNull } from 'drizzle-orm'
import { logger } from '../lib/logger.js'
import { getRedis } from '../lib/redis.js'

let io: SocketIOServer | null = null
let revalidationInterval: ReturnType<typeof setInterval> | null = null
let heartbeatCleanupInterval: ReturnType<typeof setInterval> | null = null
let adapterPubClient: Redis | null = null
let adapterSubClient: Redis | null = null

// ---------------------------------------------------------------------------
// Redis-backed presence helpers
// ---------------------------------------------------------------------------

const PRESENCE_SET_KEY = 'presence:online'
const PRESENCE_HEARTBEAT_PREFIX = 'presence:heartbeat:'
const HEARTBEAT_TTL_SECONDS = 60

async function presenceAdd(userId: string): Promise<void> {
  const redis = getRedis()
  await redis.sadd(PRESENCE_SET_KEY, userId)
  await redis.set(`${PRESENCE_HEARTBEAT_PREFIX}${userId}`, '1', 'EX', HEARTBEAT_TTL_SECONDS)
}

async function presenceRemove(userId: string): Promise<void> {
  const redis = getRedis()
  await redis.srem(PRESENCE_SET_KEY, userId)
  await redis.del(`${PRESENCE_HEARTBEAT_PREFIX}${userId}`)
}

async function presenceRefreshHeartbeat(userId: string): Promise<void> {
  const redis = getRedis()
  await redis.set(`${PRESENCE_HEARTBEAT_PREFIX}${userId}`, '1', 'EX', HEARTBEAT_TTL_SECONDS)
}

async function presenceMembers(): Promise<Set<string>> {
  const redis = getRedis()
  const members = await redis.smembers(PRESENCE_SET_KEY)
  return new Set(members)
}

/**
 * Clean up stale presence entries whose heartbeat keys have expired.
 */
async function presenceCleanupStale(): Promise<void> {
  const redis = getRedis()
  const members = await redis.smembers(PRESENCE_SET_KEY)

  for (const userId of members) {
    const alive = await redis.exists(`${PRESENCE_HEARTBEAT_PREFIX}${userId}`)
    if (!alive) {
      await redis.srem(PRESENCE_SET_KEY, userId)
      logger.debug({ userId }, 'Cleaned up stale presence entry')
    }
  }
}

export interface AuthenticatedSocket {
  userId: string;
  sessionId: string;
}

/**
 * Build the list of allowed CORS origins for Socket.io in production.
 */
function buildSocketCorsOrigins(config: AppConfig): string[] {
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

/**
 * Initialize the Socket.io server on the given HTTP server instance.
 */
export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  const config = getConfig();

  // Build CORS origins — allow all in dev, web + mobile in production
  const socketCorsOrigin = config.isDevelopment
    ? true
    : buildSocketCorsOrigins(config)

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: socketCorsOrigin as string[] | boolean,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // WSS transport only in production; allow polling fallback in dev
    transports: config.isProduction ? ['websocket'] : ['websocket', 'polling'],
    // Ping settings for connection health
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Redis adapter for cross-instance broadcasting (dedicated pub/sub connections)
  adapterPubClient = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 200, 2000)
    },
    lazyConnect: false,
  })
  adapterSubClient = adapterPubClient.duplicate()

  adapterPubClient.on('error', (err) => {
    logger.error({ err }, 'Socket.io Redis adapter pub client error')
  })
  adapterSubClient.on('error', (err) => {
    logger.error({ err }, 'Socket.io Redis adapter sub client error')
  })

  io.adapter(createAdapter(adapterPubClient, adapterSubClient))
  logger.info('Socket.io Redis adapter attached')

  // Auth middleware — verify access token on handshake (spec Section 8.2)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyToken(token);

      // Attach user info to socket data
      (socket.data as AuthenticatedSocket).userId = payload.userId;
      (socket.data as AuthenticatedSocket).sessionId = payload.sessionId;

      // Check if session is revoked or expired
      const [session] = await db
        .select({ revokedAt: userSessions.revokedAt, expiresAt: userSessions.expiresAt })
        .from(userSessions)
        .where(eq(userSessions.id, payload.sessionId))
        .limit(1)

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        return next(new Error('Session revoked or expired'))
      }

      next()
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const { userId } = socket.data as AuthenticatedSocket;

    logger.info({ userId, socketId: socket.id }, 'Socket.io client connected')

    // Join the user's personal room for targeted events
    socket.join(`user:${userId}`);

    // Server-controlled room joins (spec Section 8.2):
    // Clients cannot self-subscribe to arbitrary rooms — server verifies membership.
    const joinRooms = async () => {
      // Join all channel rooms the user is a member of
      const channelRows = await db
        .select({ channelId: channelMembers.channelId })
        .from(channelMembers)
        .where(eq(channelMembers.userId, userId))

      for (const row of channelRows) {
        socket.join(`channel:${row.channelId}`)
      }

      // Join all active (non-dissolved) DM rooms the user is a member of
      const dmRows = await db
        .select({ dmId: dmMembers.dmId })
        .from(dmMembers)
        .innerJoin(dms, eq(dmMembers.dmId, dms.id))
        .where(and(eq(dmMembers.userId, userId), isNull(dms.dissolvedAt)))

      for (const row of dmRows) {
        socket.join(`dm:${row.dmId}`)
      }
    }

    joinRooms().catch((err) => {
      logger.error({ err, userId }, 'Failed to join Socket.io rooms')
    })

    // Presence: mark user as online in Redis and broadcast
    const markOnline = async () => {
      const wasOnline = await getRedis().sismember(PRESENCE_SET_KEY, userId)
      await presenceAdd(userId)
      if (!wasOnline) {
        io!.emit('presence:online', { userId })
      }
    }
    markOnline().catch((err) => {
      logger.error({ err, userId }, 'Failed to set Redis presence on connect')
    })

    socket.on('disconnect', async () => {
      logger.info({ userId, socketId: socket.id }, 'Socket.io client disconnected')

      // Check if the user has any other active sockets before marking offline
      const remaining = await io!.in(`user:${userId}`).fetchSockets()
      if (remaining.length === 0) {
        await presenceRemove(userId)
        io!.emit('presence:offline', { userId })
      }
    })

    // Typing indicators — broadcast to the relevant room
    // Only broadcast if the socket is actually a member of the target room
    // Wrapped with event timing for performance observability
    socket.on('typing:start', (data: { channelId?: string, dmId?: string }) => {
      const start = performance.now()
      if (data.channelId && socket.rooms.has(`channel:${data.channelId}`)) {
        socket.to(`channel:${data.channelId}`).emit('typing:start', {
          userId,
          channelId: data.channelId,
        })
      } else if (data.dmId && socket.rooms.has(`dm:${data.dmId}`)) {
        socket.to(`dm:${data.dmId}`).emit('typing:start', {
          userId,
          dmId: data.dmId,
        })
      }
      const elapsed = performance.now() - start
      if (elapsed > 50) {
        logger.warn({ event: 'typing:start', userId, durationMs: Math.round(elapsed) }, 'Slow Socket.io event')
      }
    })

    socket.on('typing:stop', (data: { channelId?: string, dmId?: string }) => {
      const start = performance.now()
      if (data.channelId && socket.rooms.has(`channel:${data.channelId}`)) {
        socket.to(`channel:${data.channelId}`).emit('typing:stop', {
          userId,
          channelId: data.channelId,
        })
      } else if (data.dmId && socket.rooms.has(`dm:${data.dmId}`)) {
        socket.to(`dm:${data.dmId}`).emit('typing:stop', {
          userId,
          dmId: data.dmId,
        })
      }
      const elapsed = performance.now() - start
      if (elapsed > 50) {
        logger.warn({ event: 'typing:stop', userId, durationMs: Math.round(elapsed) }, 'Slow Socket.io event')
      }
    })
  })

  // Periodic re-validation every 15 minutes (spec Section 8.2)
  // - Re-validate that connected clients still have valid sessions
  // - Re-validate correct room memberships
  // - Disconnect clients with revoked/expired sessions
  const REVALIDATION_INTERVAL_MS = 15 * 60 * 1000

  revalidationInterval = setInterval(async () => {
    if (!io) return

    const sockets = await io.fetchSockets()

    for (const socket of sockets) {
      const { userId, sessionId } = socket.data as AuthenticatedSocket

      try {
        // Re-validate session
        const [session] = await db
          .select({ revokedAt: userSessions.revokedAt, expiresAt: userSessions.expiresAt })
          .from(userSessions)
          .where(eq(userSessions.id, sessionId))
          .limit(1)

        if (!session || session.revokedAt || session.expiresAt < new Date()) {
          socket.emit('session:expired')
          socket.disconnect(true)
          continue
        }

        // Re-validate room memberships — rebuild the correct set of rooms
        const channelRows = await db
          .select({ channelId: channelMembers.channelId })
          .from(channelMembers)
          .where(eq(channelMembers.userId, userId))

        const dmRows = await db
          .select({ dmId: dmMembers.dmId })
          .from(dmMembers)
          .innerJoin(dms, eq(dmMembers.dmId, dms.id))
          .where(and(eq(dmMembers.userId, userId), isNull(dms.dissolvedAt)))

        const expectedRooms = new Set<string>([
          `user:${userId}`,
          ...channelRows.map((r) => `channel:${r.channelId}`),
          ...dmRows.map((r) => `dm:${r.dmId}`),
        ])

        // Leave rooms the user is no longer a member of
        for (const room of socket.rooms) {
          if (room === socket.id) continue // skip the socket's own room
          if (!expectedRooms.has(room)) {
            socket.leave(room)
          }
        }

        // Join rooms the user should be in but isn't
        for (const room of expectedRooms) {
          if (!socket.rooms.has(room)) {
            socket.join(room)
          }
        }
      } catch (err) {
        logger.error({ err, userId }, 'Socket.io session revalidation failed')
      }
    }
  }, REVALIDATION_INTERVAL_MS)

  // Periodic heartbeat refresh for all connected users + stale cleanup
  const HEARTBEAT_INTERVAL_MS = 30 * 1000 // 30 seconds

  heartbeatCleanupInterval = setInterval(async () => {
    if (!io) return

    try {
      // Refresh heartbeats for all currently connected users
      const sockets = await io.fetchSockets()
      const connectedUserIds = new Set<string>()
      for (const socket of sockets) {
        const { userId } = socket.data as AuthenticatedSocket
        connectedUserIds.add(userId)
      }

      for (const userId of connectedUserIds) {
        await presenceRefreshHeartbeat(userId)
      }

      // Clean up stale entries (users whose heartbeat expired)
      await presenceCleanupStale()
    } catch (err) {
      logger.error({ err }, 'Presence heartbeat/cleanup failed')
    }
  }, HEARTBEAT_INTERVAL_MS)

  return io
}

/**
 * Get the initialized Socket.io server instance.
 * Throws if called before initializeSocketIO().
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocketIO() first.');
  }
  return io;
}

/**
 * Disconnect all sockets for a given user (force-logout / suspension / deactivation).
 * Per spec Section 3.5 and 4.5.
 */
export async function disconnectUser(userId: string): Promise<void> {
  const server = getIO();
  const sockets = await server.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.disconnect(true);
  }
}

/**
 * Remove a user from a specific channel room (on membership removal).
 * Per spec Section 8.2.
 */
export async function removeFromChannelRoom(
  userId: string,
  channelId: string,
): Promise<void> {
  const server = getIO();
  const sockets = await server.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.leave(`channel:${channelId}`);
  }
}

/**
 * Emit an event to all members of a channel room.
 */
export function emitToChannel(channelId: string, event: string, data: unknown): void {
  getIO().to(`channel:${channelId}`).emit(event, data);
}

/**
 * Emit an event to all members of a DM room.
 */
export function emitToDm(dmId: string, event: string, data: unknown): void {
  getIO().to(`dm:${dmId}`).emit(event, data);
}

/**
 * Emit an event to a specific user across all their connected sockets.
 */
export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(`user:${userId}`).emit(event, data)
}

/**
 * Get the set of currently online user IDs from Redis.
 */
export async function getOnlineUsers(): Promise<ReadonlySet<string>> {
  return presenceMembers()
}

/**
 * Shut down the Socket.io server and clean up the revalidation interval.
 */
export async function shutdownSocketIO(): Promise<void> {
  if (revalidationInterval) {
    clearInterval(revalidationInterval)
    revalidationInterval = null
  }
  if (heartbeatCleanupInterval) {
    clearInterval(heartbeatCleanupInterval)
    heartbeatCleanupInterval = null
  }
  // Clear Redis presence set on shutdown
  try {
    const redis = getRedis()
    await redis.del(PRESENCE_SET_KEY)
  } catch {
    // Redis may already be disconnected during shutdown
  }
  if (io) {
    io.close()
    io = null
  }
  if (adapterPubClient) {
    await adapterPubClient.quit()
    adapterPubClient = null
  }
  if (adapterSubClient) {
    await adapterSubClient.quit()
    adapterSubClient = null
  }
}
