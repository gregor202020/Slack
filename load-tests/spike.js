import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { BASE_URL, AUTH_TOKEN, authHeaders } from './config.js'

export const options = {
  stages: [
    { duration: '1m', target: 10 },     // Warmup at 10 VUs
    { duration: '30s', target: 150 },    // Spike to 150 VUs
    { duration: '2m', target: 150 },     // Hold at 150 VUs
    { duration: '30s', target: 10 },     // Drop back to 10 VUs
    { duration: '1m', target: 10 },      // Hold at 10 VUs (recovery)
    { duration: '30s', target: 200 },    // Second spike to 200 VUs
    { duration: '2m', target: 200 },     // Hold at 200 VUs
    { duration: '1m', target: 0 },       // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.10'],
    http_reqs: ['rate>10'],
  },
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
  // Health check
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

      const unreadRes = http.get(`${BASE_URL}/api/unread`, authHeaders())
      check(unreadRes, {
        'unread status is 200': (r) => r.status === 200,
      })
    })
  }

  if (scenario === 'messages') {
    group('Read and send messages', () => {
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

      const messagesRes = http.get(
        `${BASE_URL}/api/messages/channel/${channelId}`,
        authHeaders()
      )
      check(messagesRes, {
        'messages status is 200': (r) => r.status === 200,
      })

      // Send a message ~15% of the time during spikes
      if (Math.random() < 0.15) {
        const sendRes = http.post(
          `${BASE_URL}/api/messages/channel/${channelId}`,
          JSON.stringify({
            body: 'Spike test message from k6 at ' + new Date().toISOString(),
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
      const profileRes = http.get(`${BASE_URL}/api/users/me`, authHeaders())
      check(profileRes, {
        'profile status is 200': (r) => r.status === 200,
      })

      const dmsRes = http.get(`${BASE_URL}/api/dms`, authHeaders())
      check(dmsRes, {
        'dms status is 200': (r) => r.status === 200,
      })

      const unreadRes = http.get(`${BASE_URL}/api/unread`, authHeaders())
      check(unreadRes, {
        'unread status is 200': (r) => r.status === 200,
      })
    })
  }

  sleep(Math.random() * 2 + 0.5) // 0.5-2.5 seconds think time
}
