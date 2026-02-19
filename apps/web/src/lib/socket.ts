import { io, Socket } from 'socket.io-client'
import { getAccessToken } from './api'

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: {
        token: getAccessToken(),
      },
    })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  // Update auth token before connecting
  s.auth = { token: getAccessToken() }
  if (!s.connected) {
    s.connect()
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
