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
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean

  requestOtp: (phone: string) => Promise<void>
  verifyOtp: (phone: string, code: string) => Promise<{ needsOnboarding: boolean }>
  fetchMe: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  requestOtp: async (phone: string) => {
    await api('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    })
  },

  verifyOtp: async (phone: string, code: string) => {
    const data = await api<{
      accessToken: string
      user: User
      needsOnboarding: boolean
    }>('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    })

    setAccessToken(data.accessToken)
    set({ user: data.user, isAuthenticated: true, isLoading: false })
    connectSocket()

    return { needsOnboarding: data.needsOnboarding }
  },

  fetchMe: async () => {
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
}))
