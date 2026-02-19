/**
 * Test Fastify app builder.
 *
 * Creates a Fastify instance configured the same way as the real app
 * but with Socket.io and Firebase disabled. Uses the actual plugins
 * and routes so that E2E tests exercise the full request pipeline.
 */

import { vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Mock socket.io emitters before importing anything that uses them.
// The real emitters call getIO() which throws without a running server.
vi.mock('../../src/plugins/socket.js', () => ({
  initializeSocketIO: vi.fn(),
  getIO: vi.fn(() => ({
    to: () => ({ emit: vi.fn() }),
    emit: vi.fn(),
  })),
  emitToChannel: vi.fn(),
  emitToDm: vi.fn(),
  emitToUser: vi.fn(),
  disconnectUser: vi.fn(),
  removeFromChannelRoom: vi.fn(),
  getOnlineUsers: vi.fn(() => new Set()),
  shutdownSocketIO: vi.fn(),
}))

// Mock firebase — not needed in tests
vi.mock('../../src/plugins/firebase.js', () => ({
  initFirebase: vi.fn(),
  getFirebaseApp: vi.fn(() => null),
}))

// Load config before building the app — sets the singleton
import { loadConfig } from '../../src/lib/config.js'

export async function buildTestApp(): Promise<FastifyInstance> {
  // Ensure config is loaded (reads from process.env set in setup.ts)
  loadConfig()

  // Import buildApp after mocks and config are set up
  const { buildApp } = await import('../../src/app.js')
  const app = await buildApp()

  await app.ready()
  return app
}
