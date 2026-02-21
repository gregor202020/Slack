'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { useSocket } from '@/hooks/useSocket'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore()
  const fetchChannels = useChatStore((s) => s.fetchChannels)
  const fetchDms = useChatStore((s) => s.fetchDms)
  const fetchUnreadCounts = useChatStore((s) => s.fetchUnreadCounts)

  useSocket()

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isLoading, isAuthenticated, router])

  useEffect(() => {
    if (isAuthenticated) {
      fetchChannels()
      fetchDms()
      fetchUnreadCounts()
    }
  }, [isAuthenticated, fetchChannels, fetchDms, fetchUnreadCounts])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-smoke-900">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen bg-smoke-900">
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main id="main-content" role="main" className="flex-1 overflow-hidden">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
