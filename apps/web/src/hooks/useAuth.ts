'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'

export function useAuth(options?: { redirectTo?: string }) {
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) {
      fetchMe()
    }
  }, [isLoading, fetchMe])

  useEffect(() => {
    if (!isLoading && !isAuthenticated && options?.redirectTo) {
      router.push(options.redirectTo)
    }
  }, [isLoading, isAuthenticated, options?.redirectTo, router])

  return { isAuthenticated, isLoading }
}
