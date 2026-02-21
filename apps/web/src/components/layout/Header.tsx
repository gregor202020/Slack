'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { Button } from '@/components/ui/Button'
import { SearchOverlay } from '@/components/search/SearchOverlay'
import { ChannelSettings } from '@/components/chat/ChannelSettings'
import { PinnedMessages } from '@/components/chat/PinnedMessages'

export function Header() {
  const logout = useAuthStore((s) => s.logout)
  const channels = useChatStore((s) => s.channels)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const activeDmId = useChatStore((s) => s.activeDmId)
  const channelMembers = useChatStore((s) => s.channelMembers)

  const activeChannel = channels.find((c) => c.id === activeChannelId)
  const memberCount = activeChannelId ? (channelMembers[activeChannelId]?.length ?? activeChannel?.memberCount ?? 0) : 0

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isPinsOpen, setIsPinsOpen] = useState(false)

  const openSearch = useCallback(() => setIsSearchOpen(true), [])
  const closeSearch = useCallback(() => setIsSearchOpen(false), [])
  const openPins = useCallback(() => setIsPinsOpen(true), [])
  const closePins = useCallback(() => setIsPinsOpen(false), [])

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
      <header className="flex items-center justify-between h-14 px-4 border-b border-smoke-600 bg-smoke-900 shrink-0" role="banner">
        <div className="flex items-center gap-3">
          {activeChannel ? (
            <>
              <h1 className="text-base font-semibold text-smoke-100">
                # {activeChannel.name}
              </h1>
              {activeChannel.topic && (
                <span className="text-sm text-smoke-400 truncate max-w-md hidden sm:inline">
                  {activeChannel.topic}
                </span>
              )}
              {memberCount > 0 && (
                <span className="text-xs text-smoke-500 hidden sm:inline">
                  <svg className="inline h-3.5 w-3.5 mr-0.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {memberCount}
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
          {/* Pinned messages icon for channels */}
          {activeChannel && (
            <button
              onClick={openPins}
              className="flex items-center justify-center h-8 w-8 rounded-md text-smoke-400 hover:text-smoke-200 hover:bg-smoke-700 transition-colors"
              title="Pinned messages"
              aria-label="Pinned messages"
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}

          {/* Settings gear icon for channels */}
          {activeChannel && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center h-8 w-8 rounded-md text-smoke-400 hover:text-smoke-200 hover:bg-smoke-700 transition-colors"
              title="Channel settings"
              aria-label="Channel settings"
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {/* Search bar trigger */}
          <button
            onClick={openSearch}
            aria-label="Search messages, channels, and people"
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

      {activeChannel && (
        <ChannelSettings
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          channel={activeChannel}
        />
      )}

      {activeChannelId && (
        <PinnedMessages
          channelId={activeChannelId}
          isOpen={isPinsOpen}
          onClose={closePins}
        />
      )}
    </>
  )
}
