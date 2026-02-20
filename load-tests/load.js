import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { BASE_URL, AUTH_TOKEN, authHeaders, THRESHOLDS } from './config.js'

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 VUs
    { duration: '5m', target: 50 },   // Stay at 50 VUs
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: THRESHOLDS,
}

// Weighted scenario picker: channels 30%, messages 40%, search 15%, profile 15%
function pickScenario() {
  const roll = Math.random() * 100
  if (roll < 30) return 'channels'
  if (roll < 70) return 'messages'
  if (roll < 85) return 'search'
  return 'profile'
}

export default function () {
  // Always start with a health check
  const healthRes = http.get(`${BASE_URL}/health`)
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  })

  if (!AUTH_TOKEN) {
    sleep(1)
    return
  }

  const scenario = pickScenario()

  if (scenario === 'channels') {
    group('Browse channels', () => {
      const res = http.get(`${BASE_URL}/api/channels`, authHeaders())
      check(res, {
        'channels status is 200': (r) => r.status === 200,
        'channels returns array': (r) => {
          const body = JSON.parse(r.body)
          return Array.isArray(body) || (body.data && Array.isArray(body.data))
        },
      })

      // Also check unread counts when browsing channels
      const unreadRes = http.get(`${BASE_URL}/api/unread`, authHeaders())
      check(unreadRes, {
        'unread status is 200': (r) => r.status === 200,
      })
    })
  }

  if (scenario === 'messages') {
    group('Read and send messages', () => {
      // First get channels to pick one
      const channelsRes = http.get(`${BASE_URL}/api/channels`, authHeaders())
      check(channelsRes, {
        'channels for messages status is 200': (r) => r.status === 200,
      })

      let channels = []
      try {
        const body = JSON.parse(channelsRes.body)
        channels = Array.isArray(body) ? body : body.data || []
      } catch (e) {
        return
      }

      if (channels.length === 0) return

      const channel = channels[Math.floor(Math.random() * channels.length)]
      const channelId = channel.id || channel._id

      // Read messages in the channel
      const messagesRes = http.get(
        `${BASE_URL}/api/messages/channel/${channelId}`,
        authHeaders()
      )
      check(messagesRes, {
        'messages status is 200': (r) => r.status === 200,
      })

      // Send a message ~20% of the time
      if (Math.random() < 0.2) {
        const sendRes = http.post(
          `${BASE_URL}/api/messages/channel/${channelId}`,
          JSON.stringify({
            body: 'Test message from k6 at ' + new Date().toISOString(),
          }),
          authHeaders()
        )
        check(sendRes, {
          'send message status is 2xx': (r) =>
            r.status >= 200 && r.status < 300,
        })
      }
    })
  }

  if (scenario === 'search') {
    group('Search', () => {
      const queries = ['bbq', 'brisket', 'order', 'sauce', 'schedule', 'shift']
      const q = queries[Math.floor(Math.random() * queries.length)]

      const res = http.get(
        `${BASE_URL}/api/search?q=${encodeURIComponent(q)}&scope=messages`,
        authHeaders()
      )
      check(res, {
        'search status is 200': (r) => r.status === 200,
      })
    })
  }

  if (scenario === 'profile') {
    group('Profile and DMs', () => {
      // Get current user profile
      const profileRes = http.get(`${BASE_URL}/api/users/me`, authHeaders())
      check(profileRes, {
        'profile status is 200': (r) => r.status === 200,
      })

      // List DMs
      const dmsRes = http.get(`${BASE_URL}/api/dms`, authHeaders())
      check(dmsRes, {
        'dms status is 200': (r) => r.status === 200,
      })

      // Check unread counts
      const unreadRes = http.get(`${BASE_URL}/api/unread`, authHeaders())
      check(unreadRes, {
        'unread status is 200': (r) => r.status === 200,
      })
    })
  }

  sleep(Math.random() * 3 + 1) // 1-4 seconds think time
}
