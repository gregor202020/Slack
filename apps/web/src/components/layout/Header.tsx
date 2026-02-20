'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { Button } from '@/components/ui/Button'
import { SearchOverlay } from '@/components/search/SearchOverlay'

export function Header() {
  const logout = useAuthStore((s) => s.logout)
  const channels = useChatStore((s) => s.channels)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const activeDmId = useChatStore((s) => s.activeDmId)

  const activeChannel = channels.find((c) => c.id === activeChannelId)

  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const openSearch = useCallback(() => setIsSearchOpen(true), [])
  const closeSearch = useCallback(() => setIsSearchOpen(false), [])

  // Cmd+K / Ctrl+K shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <header className="flex items-center justify-between h-14 px-4 border-b border-smoke-600 bg-smoke-900 shrink-0">
        <div className="flex items-center gap-3">
          {activeChannel ? (
            <>
              <h1 className="text-base font-semibold text-smoke-100">
                # {activeChannel.name}
              </h1>
              {activeChannel.topic && (
                <span className="text-sm text-smoke-400 truncate max-w-md">
                  {activeChannel.topic}
                </span>
              )}
            </>
          ) : activeDmId ? (
            <h1 className="text-base font-semibold text-smoke-100">Direct Message</h1>
          ) : (
            <h1 className="text-base font-semibold text-smoke-100">The Smoker</h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search bar trigger */}
          <button
            onClick={openSearch}
            className="flex items-center gap-2 h-8 px-3 rounded-md bg-smoke-700 border border-smoke-600 text-sm text-smoke-400 hover:text-smoke-200 hover:border-smoke-500 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] bg-smoke-800 rounded border border-smoke-600 leading-none">
              {typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '\u2318' : 'Ctrl'}K
            </kbd>
          </button>

          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <SearchOverlay isOpen={isSearchOpen} onClose={closeSearch} />
    </>
  )
}
