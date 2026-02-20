import http from 'k6/http'
import { check, sleep } from 'k6'
import { BASE_URL, AUTH_TOKEN, authHeaders, THRESHOLDS } from './config.js'

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: THRESHOLDS,
}

export default function () {
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`)
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health body has status ok': (r) => JSON.parse(r.body).status === 'ok',
  })

  // If we have an auth token, test authenticated endpoints
  if (AUTH_TOKEN) {
    const channelsRes = http.get(`${BASE_URL}/api/channels`, authHeaders())
    check(channelsRes, {
      'channels status is 200': (r) => r.status === 200,
    })

    const profileRes = http.get(`${BASE_URL}/api/users/me`, authHeaders())
    check(profileRes, {
      'profile status is 200': (r) => r.status === 200,
    })

    const unreadRes = http.get(`${BASE_URL}/api/unread`, authHeaders())
    check(unreadRes, {
      'unread status is 200': (r) => r.status === 200,
    })
  }

  sleep(1)
}
