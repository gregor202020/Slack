// Shared configuration for all load test scenarios

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000'
export const WS_URL = __ENV.WS_URL || BASE_URL.replace(/^http/, 'ws')
export const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

export const THRESHOLDS = {
  http_req_duration: ['p(95)<500', 'p(99)<1500'],
  http_req_failed: ['rate<0.01'],
  http_reqs: ['rate>10'],
}

export function authHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
    },
  }
}

export function jsonHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
    },
  }
}
