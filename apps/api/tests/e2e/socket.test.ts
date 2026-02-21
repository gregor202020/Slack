/**
 * E2E tests for the Socket.io integration.
 *
 * Covers: authenticated connection, rejected connection, room joins,
 * message broadcast, typing indicators, presence events, disconnect cleanup.
 *
 * Unlike other E2E tests these do NOT mock the socket plugin — they start
 * a real HTTP server with Socket.io attached and connect via socket.io-client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import {
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
} from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestChannel,
  addUserToChannel,
  cleanupTestData,
} from '../helpers/db'

// ---------------------------------------------------------------------------
// App builder that does NOT mock socket.io (starts a real server + Socket.io)
// ---------------------------------------------------------------------------

import { loadConfig } from '../../src/lib/config.js'

async function buildSocketTestApp(): Promise<FastifyInstance> {
  loadConfig()

  // We do NOT mock socket.io here — we want the real plugin.
  // We still mock firebase since it's not needed.
  const { vi } = await import('vitest')
  vi.mock('../../src/plugins/firebase.js', () => ({
    initFirebase: vi.fn(),
    getFirebaseApp: vi.fn(() => null),
  }))

  const { buildApp } = await import('../../src/app.js')
  const app = await buildApp()
  return app
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectClient(port: number, token: string): ClientSocket {
  return ioClient(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: false,
    forceNew: true,
  })
}

function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event "${event}"`))
    }, timeoutMs)

    socket.once(event, (data: T) => {
      clearTimeout(timer)
      resolve(data)
    })
  })
}

function waitForConnect(socket: ClientSocket, timeoutMs = 5000): Promise<void> {
  if (socket.connected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for socket connect'))
    }, timeoutMs)

    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })

    socket.once('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function waitForDisconnect(socket: ClientSocket, timeoutMs = 5000): Promise<void> {
  if (socket.disconnected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for socket disconnect'))
    }, timeoutMs)

    socket.once('disconnect', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

// Small delay helper for giving the server time to process async tasks
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Socket.io Integration', () => {
  let app: FastifyInstance
  let port: number
  const clients: ClientSocket[] = []

  beforeAll(async () => {
    app = await buildSocketTestApp()

    // Listen on a random available port
    await app.listen({ port: 0, host: '127.0.0.1' })
    port = (app.server.address() as AddressInfo).port

    // Initialize Socket.io on the running HTTP server
    const { initializeSocketIO } = await import('../../src/plugins/socket.js')
    initializeSocketIO(app.server)
  })

  afterAll(async () => {
    // Disconnect all lingering test clients
    for (const c of clients) {
      if (c.connected) c.disconnect()
    }
    clients.length = 0

    const { shutdownSocketIO } = await import('../../src/plugins/socket.js')
    await shutdownSocketIO()
    await app.close()
    await cleanupTestData()
  })

  afterEach(async () => {
    // Disconnect clients created during each test
    for (const c of clients) {
      if (c.connected) c.disconnect()
    }
    clients.length = 0
  })

  // -----------------------------------------------------------------------
  // 1. Connection with auth token
  // -----------------------------------------------------------------------

  describe('Connection with auth token', () => {
    it('should connect successfully with a valid auth token', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const client = connectClient(port, token)
      clients.push(client)

      await waitForConnect(client)

      expect(client.connected).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // 2. Connection rejection without valid auth
  // -----------------------------------------------------------------------

  describe('Connection rejection without valid auth', () => {
    it('should reject connection without a token', async () => {
      const client = ioClient(`http://127.0.0.1:${port}`, {
        auth: {},
        transports: ['websocket', 'polling'],
        reconnection: false,
        forceNew: true,
      })
      clients.push(client)

      const error = await waitForEvent<Error>(client, 'connect_error')

      expect(error).toBeDefined()
      expect(error.message).toContain('Authentication required')
      expect(client.connected).toBe(false)
    })

    it('should reject connection with an invalid token', async () => {
      const user = await createTestUser()
      const token = generateInvalidToken(user.id)

      const client = connectClient(port, token)
      clients.push(client)

      const error = await waitForEvent<Error>(client, 'connect_error')

      expect(error).toBeDefined()
      expect(error.message).toContain('Invalid or expired token')
      expect(client.connected).toBe(false)
    })

    it('should reject connection with an expired token', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id)
      const token = generateExpiredToken(user.id, session.id)

      // Small delay so the token actually expires
      await delay(50)

      const client = connectClient(port, token)
      clients.push(client)

      const error = await waitForEvent<Error>(client, 'connect_error')

      expect(error).toBeDefined()
      expect(client.connected).toBe(false)
    })

    it('should reject connection with a revoked session', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id, {
        revokedAt: new Date(),
      })
      const token = generateTestToken(user.id, session.id)

      const client = connectClient(port, token)
      clients.push(client)

      const error = await waitForEvent<Error>(client, 'connect_error')

      expect(error).toBeDefined()
      expect(error.message).toContain('Session revoked or expired')
      expect(client.connected).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 3. Joining a channel room
  // -----------------------------------------------------------------------

  describe('Joining a channel room', () => {
    it('should auto-join channel rooms for channels the user is a member of', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id)
      const channel = await createTestChannel({ ownerUserId: user.id })
      await addUserToChannel(channel.id, user.id)

      const token = generateTestToken(user.id, session.id)
      const client = connectClient(port, token)
      clients.push(client)

      await waitForConnect(client)
      // Give the server a moment to process the async room join
      await delay(200)

      // We verify by trying to send a typing event to the channel
      // (the server only broadcasts if the socket is in the room)
      // Create a second user in the same channel to receive the event
      const user2 = await createTestUser()
      const session2 = await createTestSession(user2.id)
      await addUserToChannel(channel.id, user2.id)
      const token2 = generateTestToken(user2.id, session2.id)

      const client2 = connectClient(port, token2)
      clients.push(client2)
      await waitForConnect(client2)
      await delay(200)

      // User1 sends typing:start, user2 should receive it
      const typingPromise = waitForEvent<{ userId: string; channelId: string }>(
        client2,
        'typing:start',
      )
      client.emit('typing:start', { channelId: channel.id })

      const typingData = await typingPromise
      expect(typingData.userId).toBe(user.id)
      expect(typingData.channelId).toBe(channel.id)
    })
  })

  // -----------------------------------------------------------------------
  // 4. Sending a message emits to room members
  // -----------------------------------------------------------------------

  describe('Message broadcast to room members', () => {
    it('should broadcast message:new to channel room when a message is sent via API', async () => {
      const user = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(user.id)
      const channel = await createTestChannel({ ownerUserId: user.id })
      await addUserToChannel(channel.id, user.id)

      const token = generateTestToken(user.id, session.id)

      // Connect socket client and wait for room join
      const client = connectClient(port, token)
      clients.push(client)
      await waitForConnect(client)
      await delay(200)

      // Listen for message:new event
      const messagePromise = waitForEvent<{ id: string; body: string }>(
        client,
        'message:new',
      )

      // Send a message via the HTTP API
      await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Hello from socket test!' },
      })

      const msgData = await messagePromise
      expect(msgData).toBeDefined()
      expect(msgData.body).toBe('Hello from socket test!')
    })
  })

  // -----------------------------------------------------------------------
  // 5. Typing indicator events
  // -----------------------------------------------------------------------

  describe('Typing indicator events', () => {
    it('should broadcast typing:start to other channel members', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const session1 = await createTestSession(user1.id)
      const session2 = await createTestSession(user2.id)
      const channel = await createTestChannel()
      await addUserToChannel(channel.id, user1.id)
      await addUserToChannel(channel.id, user2.id)

      const client1 = connectClient(port, generateTestToken(user1.id, session1.id))
      const client2 = connectClient(port, generateTestToken(user2.id, session2.id))
      clients.push(client1, client2)

      await waitForConnect(client1)
      await waitForConnect(client2)
      await delay(200)

      const typingPromise = waitForEvent<{ userId: string; channelId: string }>(
        client2,
        'typing:start',
      )

      client1.emit('typing:start', { channelId: channel.id })

      const data = await typingPromise
      expect(data.userId).toBe(user1.id)
      expect(data.channelId).toBe(channel.id)
    })

    it('should broadcast typing:stop to other channel members', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const session1 = await createTestSession(user1.id)
      const session2 = await createTestSession(user2.id)
      const channel = await createTestChannel()
      await addUserToChannel(channel.id, user1.id)
      await addUserToChannel(channel.id, user2.id)

      const client1 = connectClient(port, generateTestToken(user1.id, session1.id))
      const client2 = connectClient(port, generateTestToken(user2.id, session2.id))
      clients.push(client1, client2)

      await waitForConnect(client1)
      await waitForConnect(client2)
      await delay(200)

      const typingPromise = waitForEvent<{ userId: string; channelId: string }>(
        client2,
        'typing:stop',
      )

      client1.emit('typing:stop', { channelId: channel.id })

      const data = await typingPromise
      expect(data.userId).toBe(user1.id)
      expect(data.channelId).toBe(channel.id)
    })

    it('should not broadcast typing events to non-members', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const session1 = await createTestSession(user1.id)
      const session2 = await createTestSession(user2.id)
      const channel = await createTestChannel()
      await addUserToChannel(channel.id, user1.id)
      // user2 is NOT a member of the channel

      const client1 = connectClient(port, generateTestToken(user1.id, session1.id))
      const client2 = connectClient(port, generateTestToken(user2.id, session2.id))
      clients.push(client1, client2)

      await waitForConnect(client1)
      await waitForConnect(client2)
      await delay(200)

      let received = false
      client2.on('typing:start', () => {
        received = true
      })

      client1.emit('typing:start', { channelId: channel.id })

      // Wait a reasonable amount of time to ensure the event is NOT received
      await delay(500)

      expect(received).toBe(false)
    })

    it('should not broadcast typing if sender is not in the room', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const session1 = await createTestSession(user1.id)
      const session2 = await createTestSession(user2.id)
      const channel = await createTestChannel()
      // user1 is NOT a member
      await addUserToChannel(channel.id, user2.id)

      const client1 = connectClient(port, generateTestToken(user1.id, session1.id))
      const client2 = connectClient(port, generateTestToken(user2.id, session2.id))
      clients.push(client1, client2)

      await waitForConnect(client1)
      await waitForConnect(client2)
      await delay(200)

      let received = false
      client2.on('typing:start', () => {
        received = true
      })

      // user1 tries to emit typing to a channel they are not in
      client1.emit('typing:start', { channelId: channel.id })

      await delay(500)

      expect(received).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // 6. Presence events
  // -----------------------------------------------------------------------

  describe('Presence events', () => {
    it('should emit presence:online when a user connects', async () => {
      const listener = await createTestUser()
      const sessionL = await createTestSession(listener.id)
      const listenerClient = connectClient(port, generateTestToken(listener.id, sessionL.id))
      clients.push(listenerClient)
      await waitForConnect(listenerClient)
      await delay(200)

      // Listen for presence:online
      const onlinePromise = waitForEvent<{ userId: string }>(
        listenerClient,
        'presence:online',
      )

      // Connect a new user
      const newUser = await createTestUser()
      const sessionN = await createTestSession(newUser.id)
      const newClient = connectClient(port, generateTestToken(newUser.id, sessionN.id))
      clients.push(newClient)
      await waitForConnect(newClient)

      const data = await onlinePromise
      expect(data.userId).toBe(newUser.id)
    })

    it('should emit presence:offline when a user disconnects', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const client = connectClient(port, token)
      clients.push(client)
      await waitForConnect(client)
      await delay(200)

      // Connect a listener to receive the offline event
      const listener = await createTestUser()
      const sessionL = await createTestSession(listener.id)
      const listenerClient = connectClient(port, generateTestToken(listener.id, sessionL.id))
      clients.push(listenerClient)
      await waitForConnect(listenerClient)
      await delay(200)

      // Listen for presence:offline
      const offlinePromise = waitForEvent<{ userId: string }>(
        listenerClient,
        'presence:offline',
      )

      // Disconnect the first user
      client.disconnect()

      const data = await offlinePromise
      expect(data.userId).toBe(user.id)
    })
  })

  // -----------------------------------------------------------------------
  // 7. Disconnect cleanup
  // -----------------------------------------------------------------------

  describe('Disconnect cleanup', () => {
    it('should remove user from presence on disconnect', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const client = connectClient(port, token)
      clients.push(client)
      await waitForConnect(client)
      await delay(200)

      // Verify user is online via the presence helper
      const { getOnlineUsers } = await import('../../src/plugins/socket.js')
      const onlineBefore = await getOnlineUsers()
      expect(onlineBefore.has(user.id)).toBe(true)

      // Disconnect
      client.disconnect()
      await delay(300)

      const onlineAfter = await getOnlineUsers()
      expect(onlineAfter.has(user.id)).toBe(false)
    })

    it('should keep user online if they have other active connections', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      // Connect two sockets for the same user
      const client1 = connectClient(port, token)
      const client2 = connectClient(port, token)
      clients.push(client1, client2)

      await waitForConnect(client1)
      await waitForConnect(client2)
      await delay(200)

      const { getOnlineUsers } = await import('../../src/plugins/socket.js')

      // Disconnect only the first socket
      client1.disconnect()
      await delay(300)

      // User should still be online (second socket is still connected)
      const onlineAfter = await getOnlineUsers()
      expect(onlineAfter.has(user.id)).toBe(true)

      // Disconnect the second socket
      client2.disconnect()
      await delay(300)

      // Now user should be offline
      const onlineFinal = await getOnlineUsers()
      expect(onlineFinal.has(user.id)).toBe(false)
    })

    it('should cleanly handle multiple rapid connects and disconnects', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      // Rapidly connect and disconnect several clients
      for (let i = 0; i < 3; i++) {
        const client = connectClient(port, token)
        clients.push(client)
        await waitForConnect(client)
        client.disconnect()
        await delay(100)
      }

      // Final state: user should be offline
      await delay(300)
      const { getOnlineUsers } = await import('../../src/plugins/socket.js')
      const online = await getOnlineUsers()
      expect(online.has(user.id)).toBe(false)
    })
  })
})
