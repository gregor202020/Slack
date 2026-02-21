/**
 * Mock socket.io-client for unit testing.
 *
 * Provides a controllable mock Socket that records event listeners
 * and allows tests to simulate server events.
 */

import { vi } from 'vitest'

type EventHandler = (...args: unknown[]) => void

export class MockSocket {
  id = 'mock-socket-id'
  connected = false
  disconnected = true

  private listeners = new Map<string, EventHandler[]>()
  private onceListeners = new Map<string, EventHandler[]>()

  connect = vi.fn(() => {
    this.connected = true
    this.disconnected = false
    this._emit('connect')
    return this
  })

  disconnect = vi.fn(() => {
    this.connected = false
    this.disconnected = true
    this._emit('disconnect', 'io client disconnect')
    return this
  })

  emit = vi.fn((_event: string, ..._args: unknown[]) => this)

  on = vi.fn((event: string, handler: EventHandler) => {
    const handlers = this.listeners.get(event) ?? []
    handlers.push(handler)
    this.listeners.set(event, handlers)
    return this
  })

  once = vi.fn((event: string, handler: EventHandler) => {
    const handlers = this.onceListeners.get(event) ?? []
    handlers.push(handler)
    this.onceListeners.set(event, handlers)
    return this
  })

  off = vi.fn((event: string, handler?: EventHandler) => {
    if (handler) {
      const handlers = this.listeners.get(event) ?? []
      this.listeners.set(event, handlers.filter((h) => h !== handler))
    } else {
      this.listeners.delete(event)
    }
    return this
  })

  removeAllListeners = vi.fn(() => {
    this.listeners.clear()
    this.onceListeners.clear()
    return this
  })

  /**
   * Test helper: simulate a server event arriving on this socket.
   */
  _emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event) ?? []
    for (const handler of handlers) {
      handler(...args)
    }

    const onceHandlers = this.onceListeners.get(event) ?? []
    for (const handler of onceHandlers) {
      handler(...args)
    }
    this.onceListeners.delete(event)
  }

  /**
   * Test helper: simulate a successful connection.
   */
  _simulateConnect(): void {
    this.connected = true
    this.disconnected = false
    this._emit('connect')
  }

  /**
   * Test helper: simulate a connection error.
   */
  _simulateConnectError(message: string): void {
    this._emit('connect_error', new Error(message))
  }

  /**
   * Test helper: simulate a disconnection from the server side.
   */
  _simulateDisconnect(reason = 'io server disconnect'): void {
    this.connected = false
    this.disconnected = true
    this._emit('disconnect', reason)
  }
}

// The most recently created mock socket, for easy test access
let lastCreatedSocket: MockSocket | null = null

export function io(_url: string, _opts?: unknown): MockSocket {
  const socket = new MockSocket()
  lastCreatedSocket = socket
  return socket
}

export type Socket = MockSocket

/**
 * Test helper: get the last socket created by the mock `io()` function.
 */
export function __getLastSocket(): MockSocket | null {
  return lastCreatedSocket
}

/**
 * Test helper: reset the last-created socket reference.
 */
export function __reset(): void {
  lastCreatedSocket = null
}
