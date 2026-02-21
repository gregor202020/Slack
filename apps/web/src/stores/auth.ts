import { create } from 'zustand'
import { api, setAccessToken, ApiError } from '@/lib/api'
import { connectSocket, disconnectSocket } from '@/lib/socket'

interface User {
  id: string
  firstName: string
  lastName: string
  displayName: string
  orgRole: string
  avatarUrl: string | null
  status: string
  bio?: string | null
  timezone?: string
  theme?: string
  notificationSound?: boolean
  notificationDesktop?: boolean
}

interface ProfileUpdate {
  displayName?: string
  bio?: string
  timezone?: string
}

interface PreferencesUpdate {
  theme?: string
  notificationSound?: boolean
  notificationDesktop?: boolean
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean

  requestOtp: (phone: string) => Promise<void>
  verifyOtp: (phone: string, code: string) => Promise<{ needsOnboarding: boolean }>
  fetchMe: () => Promise<void>
  logout: () => Promise<void>
  updateProfile: (data: ProfileUpdate) => Promise<void>
  updatePreferences: (data: PreferencesUpdate) => Promise<void>
}

let fetchMePromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  requestOtp: async (phone: string) => {
    await api('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ phone, method: 'sms' }),
    })
  },

  verifyOtp: async (phone: string, code: string) => {
    const data = await api<{
      accessToken: string
      user: User
      needsOnboarding: boolean
    }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    })

    setAccessToken(data.accessToken)
    set({ user: data.user, isAuthenticated: true, isLoading: false })
    connectSocket()

    return { needsOnboarding: data.needsOnboarding }
  },

  fetchMe: () => {
    if (fetchMePromise) return fetchMePromise
    fetchMePromise = (async () => {
      try {
        // Try refresh first
        const refreshRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/refresh`,
          { method: 'POST', credentials: 'include' },
        )

        if (!refreshRes.ok) {
          set({ user: null, isAuthenticated: false, isLoading: false })
          return
        }

        const refreshData = await refreshRes.json()
        setAccessToken(refreshData.accessToken)

        const user = await api<User>('/api/users/me')
        set({ user, isAuthenticated: true, isLoading: false })
        connectSocket()
      } catch {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    })().finally(() => {
      fetchMePromise = null
    })
    return fetchMePromise
  },

  logout: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    setAccessToken(null)
    disconnectSocket()
    set({ user: null, isAuthenticated: false, isLoading: false })
  },

  updateProfile: async (data: ProfileUpdate) => {
    const updated = await api<User>('/api/users/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    set((state) => ({
      user: state.user ? { ...state.user, ...updated } : null,
    }))
  },

  updatePreferences: async (data: PreferencesUpdate) => {
    const updated = await api<User>('/api/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    set((state) => ({
      user: state.user ? { ...state.user, ...updated } : null,
    }))
  },
}))
