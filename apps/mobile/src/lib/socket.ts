/**
 * Socket.io client — connects to the API server with access-token auth.
 *
 * The server expects `auth.token` in the handshake (see plugins/socket.ts).
 * Reconnection is handled automatically by socket.io-client.
 */

import { io, Socket } from 'socket.io-client'
import { API_URL, getAccessToken } from './api'

// Strip the /api suffix to get the base server URL
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '')

let socket: Socket | null = null

/**
 * Get the current socket instance (may be null if not connected).
 */
export function getSocket(): Socket | null {
  return socket
}

/**
 * Connect to the socket server using the current access token.
 * If already connected, disconnects first and reconnects.
 */
export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) {
    socket.disconnect()
  }

  const token = await getAccessToken()

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  })

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket?.id)
  })

  socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason)
  })

  socket.on('connect_error', (err) => {
    console.warn('[socket] Connection error:', err.message)
  })

  socket.on('session:expired', () => {
    console.warn('[socket] Session expired — disconnecting')
    socket?.disconnect()
  })

  return socket
}

/**
 * Disconnect from the socket server and clean up.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}
