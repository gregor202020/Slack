'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { api } from '@/lib/api'
import { useChatStore } from '@/stores/chat'
import { Spinner } from '@/components/ui/Spinner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchMessage {
  id: string
  body: string
  headline: string
  userId: string
  authorName: string
  channelId: string | null
  channelName: string | null
  dmId: string | null
  createdAt: string
}

interface SearchChannel {
  id: string
  name: string
  topic: string | null
  type: string
}

interface SearchUser {
  id: string
  fullName: string
  orgRole: string
}

interface SearchAllResult {
  messages: SearchMessage[]
  channels: SearchChannel[]
  users: SearchUser[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SearchOverlayProps {
  isOpen: boolean
  onClose: () => void
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter()
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const setActiveDm = useChatStore((s) => s.setActiveDm)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchAllResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'messages' | 'channels' | 'users'>('all')

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults(null)
      setActiveTab('all')
    }
  }, [isOpen])

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Debounced search
  const performSearch = useCallback(
    async (q: string, type: string) => {
      if (q.length < 2) {
        setResults(null)
        return
      }

      setIsLoading(true)
      try {
        const params = new URLSearchParams({ q, type })
        const data = await api<SearchAllResult>(`/api/search?${params}`)
        setResults(data)
      } catch {
        setResults(null)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        performSearch(value, activeTab)
      }, 300)
    },
    [activeTab, performSearch],
  )

  const handleTabChange = useCallback(
    (tab: 'all' | 'messages' | 'channels' | 'users') => {
      setActiveTab(tab)
      if (query.length >= 2) {
        performSearch(query, tab)
      }
    },
    [query, performSearch],
  )

  // Navigation handlers
  const handleMessageClick = useCallback(
    (msg: SearchMessage) => {
      onClose()
      if (msg.channelId) {
        setActiveChannel(msg.channelId)
        router.push(`/channels/${msg.channelId}?highlight=${msg.id}`)
      } else if (msg.dmId) {
        setActiveDm(msg.dmId)
        router.push(`/dms/${msg.dmId}?highlight=${msg.id}`)
      }
    },
    [onClose, router, setActiveChannel, setActiveDm],
  )

  const handleChannelClick = useCallback(
    (ch: SearchChannel) => {
      onClose()
      setActiveChannel(ch.id)
      router.push(`/channels/${ch.id}`)
    },
    [onClose, router, setActiveChannel],
  )

  const handleUserClick = useCallback(
    (user: SearchUser) => {
      onClose()
      // Navigate to DM — create or open existing
      router.push(`/dms?userId=${user.id}`)
    },
    [onClose, router],
  )

  if (!isOpen) return null

  const tabs = [
    { key: 'all' as const, label: 'All' },
    { key: 'messages' as const, label: 'Messages' },
    { key: 'channels' as const, label: 'Channels' },
    { key: 'users' as const, label: 'People' },
  ]

  const showMessages = activeTab === 'all' || activeTab === 'messages'
  const showChannels = activeTab === 'all' || activeTab === 'channels'
  const showUsers = activeTab === 'all' || activeTab === 'users'

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className="fixed inset-0 bg-black/60" />

      <div className="relative z-10 w-full max-w-2xl mx-4 rounded-lg bg-smoke-800 border border-smoke-600 shadow-xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-smoke-600">
          <svg
            className="h-5 w-5 text-smoke-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search messages, channels, people..."
            className="flex-1 bg-transparent text-sm text-smoke-100 placeholder:text-smoke-400 outline-none"
          />
          {isLoading && <Spinner size="sm" />}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs text-smoke-400 bg-smoke-700 rounded border border-smoke-600">
            Esc
          </kbd>
        </div>

        {/* Tabs */}
        {query.length >= 2 && (
          <div className="flex gap-1 px-4 py-2 border-b border-smoke-600">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={clsx(
                  'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                  activeTab === tab.key
                    ? 'bg-brand text-white'
                    : 'text-smoke-400 hover:text-smoke-100 hover:bg-smoke-700',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {query.length < 2 && (
            <div className="px-4 py-8 text-center text-sm text-smoke-400">
              Type at least 2 characters to search
            </div>
          )}

          {query.length >= 2 && !isLoading && !results && (
            <div className="px-4 py-8 text-center text-sm text-smoke-400">
              No results found
            </div>
          )}

          {results && (
            <div className="py-2">
              {/* Channels section */}
              {showChannels && results.channels.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-smoke-400">
                    Channels
                  </div>
                  {results.channels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => handleChannelClick(ch)}
                      className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-smoke-700 transition-colors"
                    >
                      <span className="text-smoke-400 shrink-0">#</span>
                      <div className="min-w-0">
                        <span className="text-sm text-smoke-100">{ch.name}</span>
                        {ch.topic && (
                          <span className="ml-2 text-xs text-smoke-400 truncate">
                            {ch.topic}
                          </span>
                        )}
                      </div>
                      {ch.type === 'private' && (
                        <svg className="h-3.5 w-3.5 text-smoke-400 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Users section */}
              {showUsers && results.users.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-smoke-400">
                    People
                  </div>
                  {results.users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleUserClick(user)}
                      className="flex items-center gap-3 w-full px-4 py-2 text-left hover:bg-smoke-700 transition-colors"
                    >
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-smoke-600 text-xs font-medium text-smoke-200 shrink-0">
                        {user.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm text-smoke-100">{user.fullName}</span>
                        {user.orgRole !== 'basic' && (
                          <span className="ml-2 text-xs text-smoke-400">{user.orgRole}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Messages section */}
              {showMessages && results.messages.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-smoke-400">
                    Messages
                  </div>
                  {results.messages.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => handleMessageClick(msg)}
                      className="flex flex-col w-full px-4 py-2 text-left hover:bg-smoke-700 transition-colors gap-0.5"
                    >
                      <div className="flex items-center gap-2 text-xs text-smoke-400">
                        <span className="font-medium text-smoke-200">{msg.authorName}</span>
                        {msg.channelName && (
                          <>
                            <span>in</span>
                            <span className="text-smoke-300">#{msg.channelName}</span>
                          </>
                        )}
                        {msg.dmId && <span>in DM</span>}
                        <span className="ml-auto">
                          {new Date(msg.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div
                        className="text-sm text-smoke-200 line-clamp-2 [&_mark]:bg-brand/30 [&_mark]:text-smoke-100 [&_mark]:rounded-sm [&_mark]:px-0.5"
                        dangerouslySetInnerHTML={{ __html: msg.headline }}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Empty state for filtered views */}
              {results.messages.length === 0 &&
                results.channels.length === 0 &&
                results.users.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-smoke-400">
                    No results found for &ldquo;{query}&rdquo;
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
