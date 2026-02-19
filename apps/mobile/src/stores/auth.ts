/**
 * Auth store — manages authentication state with Zustand.
 *
 * Handles OTP flow (request -> verify), token storage via SecureStore,
 * fetching the current user, and logout.
 *
 * API endpoints used:
 *   POST /api/auth          — request OTP
 *   POST /api/auth/verify   — verify OTP, receive tokens
 *   POST /api/auth/logout   — invalidate session
 *   GET  /api/users/me      — fetch current user profile
 */

import { create } from 'zustand'
import {
  apiClient,
  setAccessToken,
  setRefreshToken,
  clearTokens,
  getAccessToken,
} from '../lib/api'
import { connectSocket, disconnectSocket } from '../lib/socket'
import {
  registerForPushNotifications,
  registerTokenWithBackend,
} from '../lib/notifications'

export interface User {
  id: string
  phone: string
  fullName: string | null
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  orgRole: 'basic' | 'mid' | 'admin' | 'super_admin'
  status: 'active' | 'suspended' | 'deactivated'
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  /** Request an OTP code be sent to the given phone number. */
  requestOtp: (phone: string, method?: 'sms' | 'email') => Promise<void>

  /** Verify the OTP code and store resulting tokens. */
  verifyOtp: (phone: string, code: string) => Promise<void>

  /** Fetch the current user profile using the stored access token. */
  fetchMe: () => Promise<void>

  /** Check if we have a valid stored session on app launch. */
  initialize: () => Promise<void>

  /** Clear tokens, disconnect socket, reset state. */
  logout: () => Promise<void>

  /** Clear any error state. */
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  requestOtp: async (phone, method = 'sms') => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.post('/auth', { phone, method })
      set({ isLoading: false })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to send verification code'
      set({ isLoading: false, error: message })
      throw err
    }
  },

  verifyOtp: async (phone, code) => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiClient.post<{
        accessToken: string
        refreshToken?: string
        user: User
      }>('/auth/verify', { phone, code })

      await setAccessToken(data.accessToken)
      if (data.refreshToken) {
        await setRefreshToken(data.refreshToken)
      }

      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      })

      // Connect socket after successful auth
      await connectSocket()

      // Register for push notifications in the background
      registerForPushNotifications().then((token) => {
        if (token) registerTokenWithBackend(token)
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Invalid verification code'
      set({ isLoading: false, error: message })
      throw err
    }
  },

  fetchMe: async () => {
    try {
      const user = await apiClient.get<User>('/users/me')
      set({ user, isAuthenticated: true })
    } catch {
      set({ user: null, isAuthenticated: false })
      await clearTokens()
    }
  },

  initialize: async () => {
    set({ isLoading: true })
    const token = await getAccessToken()
    if (!token) {
      set({ isLoading: false, isAuthenticated: false })
      return
    }

    try {
      const user = await apiClient.get<User>('/users/me')
      set({ user, isAuthenticated: true, isLoading: false })

      // Reconnect socket on app relaunch
      await connectSocket()

      // Re-register push token
      registerForPushNotifications().then((pushToken) => {
        if (pushToken) registerTokenWithBackend(pushToken)
      })
    } catch {
      await clearTokens()
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // Ignore errors — we still want to clear local state
    }

    disconnectSocket()
    await clearTokens()
    set({ user: null, isAuthenticated: false, error: null })
  },

  clearError: () => set({ error: null }),
}))
