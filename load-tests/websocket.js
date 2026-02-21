/**
 * WebSocket load test — simulates concurrent Socket.io connections.
 *
 * This test:
 *  1. Authenticates via HTTP (POST /api/auth + /api/auth/verify)
 *  2. Opens a WebSocket connection to the Socket.io server
 *  3. Joins a channel room (server-controlled)
 *  4. Sends messages at a steady rate
 *  5. Listens for incoming messages
 *  6. Tracks connection time, message latency, and error rate
 *
 * Usage:
 *   k6 run load-tests/websocket.js
 *
 * Environment variables:
 *   BASE_URL    — HTTP API base URL   (default: http://localhost:4000)
 *   WS_URL      — WebSocket base URL  (default: derived from BASE_URL)
 *   AUTH_TOKEN   — Pre-obtained bearer token (skips auth flow if set)
 *   TEST_PHONE   — Phone number for OTP auth (default: +15550000001)
 *   TEST_OTP     — OTP code for verification  (default: 123456)
 *   CHANNEL_ID   — Channel to join/send msgs  (default: auto-detected)
 */

import { check, sleep, fail } from 'k6'
import { Counter, Trend, Rate } from 'k6/metrics'
import http from 'k6/http'
import ws from 'k6/ws'
import { BASE_URL, WS_URL, AUTH_TOKEN, authHeaders, jsonHeaders } from './config.js'

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const wsConnectionTime = new Trend('ws_connection_time', true)
const wsMessageLatency = new Trend('ws_message_latency', true)
const wsMessagesSent = new Counter('ws_messages_sent')
const wsMessagesReceived = new Counter('ws_messages_received')
const wsErrors = new Counter('ws_errors')
const wsConnectionSuccess = new Rate('ws_connection_success')

// ---------------------------------------------------------------------------
// Options — ramp to 50 concurrent WebSocket connections over 3 minutes
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    websocket_connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },  // Warm up to 10
        { duration: '1m', target: 30 },   // Ramp to 30
        { duration: '30s', target: 50 },  // Ramp to 50
        { duration: '1m', target: 50 },   // Hold at 50
        { duration: '30s', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ws_connection_time: ['p(95)<3000'],
    ws_message_latency: ['p(95)<1000'],
    ws_connection_success: ['rate>0.90'],
    ws_errors: ['count<50'],
    http_req_failed: ['rate<0.05'],
  },
}

// ---------------------------------------------------------------------------
// Auth helper — obtain a bearer token via OTP flow
// ---------------------------------------------------------------------------

function authenticate() {
  // If a token is already provided, use it directly
  if (AUTH_TOKEN) {
    return AUTH_TOKEN
  }

  const phone = __ENV.TEST_PHONE || '+15550000001'
  const otp = __ENV.TEST_OTP || '123456'

  // Step 1: Request OTP
  const otpRes = http.post(
    `${BASE_URL}/api/auth`,
    JSON.stringify({ phone }),
    jsonHeaders()
  )

  const otpOk = check(otpRes, {
    'OTP request status is 2xx': (r) => r.status >= 200 && r.status < 300,
  })

  if (!otpOk) {
    wsErrors.add(1)
    fail(`OTP request failed with status ${otpRes.status}`)
  }

  // Step 2: Verify OTP
  const verifyRes = http.post(
    `${BASE_URL}/api/auth/verify`,
    JSON.stringify({ phone, code: otp }),
    jsonHeaders()
  )

  const verifyOk = check(verifyRes, {
    'OTP verify status is 2xx': (r) => r.status >= 200 && r.status < 300,
  })

  if (!verifyOk) {
    wsErrors.add(1)
    fail(`OTP verify failed with status ${verifyRes.status}`)
  }

  let token = ''
  try {
    const body = JSON.parse(verifyRes.body)
    token = body.accessToken || body.token || ''
  } catch (e) {
    wsErrors.add(1)
    fail('Failed to parse auth response body')
  }

  if (!token) {
    wsErrors.add(1)
    fail('No access token in verify response')
  }

  return token
}

// ---------------------------------------------------------------------------
// Channel helper — pick a channel to send messages in
// ---------------------------------------------------------------------------

function getChannelId(token) {
  if (__ENV.CHANNEL_ID) {
    return __ENV.CHANNEL_ID
  }

  const res = http.get(`${BASE_URL}/api/channels`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  check(res, {
    'channels fetch status is 200': (r) => r.status === 200,
  })

  try {
    const body = JSON.parse(res.body)
    const channels = Array.isArray(body) ? body : body.data || []
    if (channels.length > 0) {
      // Pick a random channel
      return channels[Math.floor(Math.random() * channels.length)].id
    }
  } catch (e) {
    // Fall through
  }

  return null
}

// ---------------------------------------------------------------------------
// Socket.io protocol helpers
// ---------------------------------------------------------------------------

// Socket.io uses Engine.io under the hood. The WebSocket upgrade URL includes
// the Engine.io protocol parameters.
function buildSocketUrl(token) {
  // Socket.io v4 handshake: EIO=4, transport=websocket
  const base = WS_URL.replace(/\/$/, '')
  return `${base}/socket.io/?EIO=4&transport=websocket`
}

// Socket.io Engine.io packet types
const EIO_OPEN = '0'
const EIO_CLOSE = '1'
const EIO_PING = '2'
const EIO_PONG = '3'
const EIO_MESSAGE = '4'

// Socket.io packet types (prefixed after EIO message type '4')
const SIO_CONNECT = '0'
const SIO_DISCONNECT = '1'
const SIO_EVENT = '2'
const SIO_ACK = '3'

// Encode a Socket.io event as a raw WebSocket message
function encodeEvent(eventName, data) {
  return `${EIO_MESSAGE}${SIO_EVENT}${JSON.stringify([eventName, data])}`
}

// ---------------------------------------------------------------------------
// Main VU function
// ---------------------------------------------------------------------------

export default function () {
  // 1. Authenticate
  const token = authenticate()

  // 2. Get a channel to interact with
  const channelId = getChannelId(token)

  // 3. Build the Socket.io WebSocket URL
  const socketUrl = buildSocketUrl(token)

  const connectStart = Date.now()
  let connected = false
  let messagesSentThisSession = 0

  const res = ws.connect(socketUrl, null, function (socket) {
    // Track successful open
    socket.on('open', function () {
      const connectDuration = Date.now() - connectStart
      wsConnectionTime.add(connectDuration)

      // Send the Engine.io OPEN acknowledgement is handled by the server.
      // We need to wait for the server's EIO open packet, then send the
      // Socket.io CONNECT packet with our auth token.
    })

    socket.on('message', function (msg) {
      // Handle Engine.io open packet
      if (msg.startsWith(EIO_OPEN)) {
        // Server sent the open handshake — now send Socket.io CONNECT with auth
        socket.send(`${EIO_MESSAGE}${SIO_CONNECT}${JSON.stringify({ token })}`)
        return
      }

      // Handle Engine.io ping — respond with pong
      if (msg === EIO_PING) {
        socket.send(EIO_PONG)
        return
      }

      // Handle Socket.io messages (EIO_MESSAGE prefix)
      if (msg.startsWith(EIO_MESSAGE)) {
        const sioPayload = msg.substring(1) // Remove EIO prefix

        // Socket.io CONNECT ACK (namespace connection confirmed)
        if (sioPayload.startsWith(SIO_CONNECT)) {
          connected = true
          wsConnectionSuccess.add(1)
          return
        }

        // Socket.io EVENT
        if (sioPayload.startsWith(SIO_EVENT)) {
          wsMessagesReceived.add(1)

          // Try to parse the event for latency tracking
          try {
            const eventData = JSON.parse(sioPayload.substring(1))
            if (Array.isArray(eventData)) {
              const eventName = eventData[0]
              const payload = eventData[1]

              // Track message latency for new messages that include a timestamp
              if (
                eventName === 'message:new' &&
                payload &&
                payload.createdAt
              ) {
                const latency = Date.now() - new Date(payload.createdAt).getTime()
                if (latency > 0 && latency < 30000) {
                  wsMessageLatency.add(latency)
                }
              }
            }
          } catch (e) {
            // Not parseable — skip
          }
          return
        }
      }
    })

    socket.on('error', function (e) {
      wsErrors.add(1)
      wsConnectionSuccess.add(0)
    })

    socket.on('close', function () {
      if (!connected) {
        wsConnectionSuccess.add(0)
      }
    })

    // Wait for connection to establish
    sleep(2)

    if (!connected) {
      wsErrors.add(1)
      wsConnectionSuccess.add(0)
      socket.close()
      return
    }

    // 4. Send typing indicator and messages at a steady rate
    // Simulate a user session: send a few messages with think time
    const iterations = Math.floor(Math.random() * 5) + 2 // 2-6 messages

    for (let i = 0; i < iterations; i++) {
      // Send typing:start
      if (channelId) {
        socket.send(encodeEvent('typing:start', { channelId }))
      }

      // Simulate typing delay
      sleep(Math.random() * 2 + 0.5)

      // Send typing:stop
      if (channelId) {
        socket.send(encodeEvent('typing:stop', { channelId }))
      }

      // Send a message via HTTP (messages go through the REST API, not WS)
      if (channelId && Math.random() < 0.5) {
        const sendStart = Date.now()
        const msgRes = http.post(
          `${BASE_URL}/api/messages/channel/${channelId}`,
          JSON.stringify({
            body: `k6 ws load test msg ${__VU}-${__ITER}-${i} at ${new Date().toISOString()}`,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }
        )

        check(msgRes, {
          'send message status is 2xx': (r) => r.status >= 200 && r.status < 300,
        })

        if (msgRes.status >= 200 && msgRes.status < 300) {
          wsMessagesSent.add(1)
          messagesSentThisSession++

          // Track round-trip: time from send to when we got the response
          const sendDuration = Date.now() - sendStart
          wsMessageLatency.add(sendDuration)
        }
      }

      // Think time between messages
      sleep(Math.random() * 3 + 1)
    }

    // Keep connection alive briefly to receive any broadcasted messages
    sleep(3)

    // Close gracefully
    socket.close()
  })

  check(res, {
    'WebSocket handshake status is 101': (r) => r && r.status === 101,
  })

  // Brief pause between VU iterations
  sleep(Math.random() * 2 + 1)
}
