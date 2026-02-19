/**
 * API client — fetch wrapper with token management via SecureStore.
 *
 * - Stores access + refresh tokens in expo-secure-store
 * - Automatically refreshes on 401 responses
 * - Configurable API_URL (defaults to localhost:3001)
 */

import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

const ACCESS_TOKEN_KEY = 'smoker_access_token'
const REFRESH_TOKEN_KEY = 'smoker_refresh_token'

const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:3001/api'

// ---- Token helpers ----

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
}

export async function setAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token)
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token)
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
}

// ---- Refresh logic ----

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return null

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!res.ok) {
      await clearTokens()
      return null
    }

    const data = (await res.json()) as { accessToken: string }
    await setAccessToken(data.accessToken)
    return data.accessToken
  } catch {
    await clearTokens()
    return null
  }
}

/**
 * Deduplicate concurrent refresh calls so we only hit the server once.
 */
async function ensureFreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// ---- Fetch wrapper ----

interface RequestOptions {
  headers?: Record<string, string>
  body?: unknown
  params?: Record<string, string | number | undefined>
}

async function request<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  let url = `${API_URL}${path}`

  // Append query params
  if (opts.params) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(opts.params)) {
      if (value !== undefined) query.set(key, String(value))
    }
    const qs = query.toString()
    if (qs) url += `?${qs}`
  }

  const accessToken = await getAccessToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers,
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  let res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  // Auto-refresh on 401
  if (res.status === 401 && accessToken) {
    const newToken = await ensureFreshToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      })
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    const error = new Error(
      (errorBody as { message?: string }).message ?? `Request failed: ${res.status}`,
    ) as Error & { status: number; data: unknown }
    error.status = res.status
    error.data = errorBody
    throw error
  }

  return res.json() as Promise<T>
}

// ---- Public API client ----

export const apiClient = {
  get: <T = unknown>(path: string, opts?: RequestOptions) =>
    request<T>('GET', path, opts),

  post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('POST', path, { ...opts, body }),

  put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PUT', path, { ...opts, body }),

  patch: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PATCH', path, { ...opts, body }),

  delete: <T = unknown>(path: string, opts?: RequestOptions) =>
    request<T>('DELETE', path, opts),
}

export { API_URL }
