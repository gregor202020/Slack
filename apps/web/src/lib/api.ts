const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json()
    accessToken = data.accessToken
    return accessToken
  } catch {
    return null
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  let res = await fetch(url, { ...options, headers, credentials: 'include' })

  // Auto-refresh on 401
  if (res.status === 401 && accessToken) {
    const newToken = await refreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(url, { ...options, headers, credentials: 'include' })
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error?.code || 'UNKNOWN', body.error?.message || res.statusText)
  }

  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
