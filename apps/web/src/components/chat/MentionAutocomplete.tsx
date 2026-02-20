'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { api } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserResult {
  id: string
  fullName: string | null
  displayName: string | null
  orgRole: string
  avatarUrl: string | null
}

interface MentionAutocompleteProps {
  query: string
  onSelect: (mention: string) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Special entries
// ---------------------------------------------------------------------------

const SPECIAL_MENTIONS = [
  { handle: 'channel', label: '@channel', description: 'Notify all channel members' },
  { handle: 'here', label: '@here', description: 'Notify active members' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MentionAutocomplete({ query, onSelect, onClose }: MentionAutocompleteProps) {
  const [users, setUsers] = useState<UserResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Fetch users
  useEffect(() => {
    let cancelled = false

    const fetchUsers = async () => {
      setIsLoading(true)
      try {
        const data = await api<{ data: UserResult[] }>('/api/users/me')
        // The users list endpoint is admin-only, so we fall back to
        // a simpler approach: fetch from the channel context.
        // For now, use the users endpoint if available.
        if (!cancelled) {
          setUsers([])
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          setUsers([])
          setIsLoading(false)
        }
      }
    }

    // Try fetching the user list (admin-only, will gracefully fail for non-admins)
    const fetchUserList = async () => {
      setIsLoading(true)
      try {
        const data = await api<{ data: UserResult[] }>('/api/users?limit=100')
        if (!cancelled) {
          setUsers(data.data ?? [])
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          setUsers([])
          setIsLoading(false)
        }
      }
    }

    fetchUserList()

    return () => {
      cancelled = true
    }
  }, [])

  // Filter results based on query
  const lowerQuery = query.toLowerCase()

  const filteredSpecial = SPECIAL_MENTIONS.filter((m) =>
    m.handle.toLowerCase().startsWith(lowerQuery),
  )

  const filteredUsers = users.filter((u) => {
    const name = (u.displayName ?? u.fullName ?? '').toLowerCase()
    return name.includes(lowerQuery)
  })

  const allResults = [
    ...filteredSpecial.map((s) => ({
      type: 'special' as const,
      handle: s.handle,
      label: s.label,
      description: s.description,
    })),
    ...filteredUsers.map((u) => ({
      type: 'user' as const,
      handle: u.displayName ?? u.fullName ?? u.id.slice(0, 8),
      label: u.displayName ?? u.fullName ?? 'Unknown',
      description: u.orgRole,
      avatarUrl: u.avatarUrl,
      userId: u.id,
    })),
  ]

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (allResults.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % allResults.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + allResults.length) % allResults.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = allResults[selectedIndex]
        if (selected) {
          onSelect(selected.handle)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [allResults, selectedIndex, onSelect, onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined
      selected?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (allResults.length === 0 && !isLoading) {
    return null
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-lg border border-smoke-600 bg-smoke-800 shadow-lg z-50"
    >
      {isLoading && allResults.length === 0 && (
        <div className="px-3 py-2 text-sm text-smoke-400">Loading...</div>
      )}
      {allResults.map((result, idx) => (
        <button
          key={result.type === 'special' ? result.handle : `user-${result.handle}`}
          type="button"
          onClick={() => onSelect(result.handle)}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            idx === selectedIndex
              ? 'bg-smoke-700 text-smoke-100'
              : 'text-smoke-300 hover:bg-smoke-700'
          }`}
        >
          {result.type === 'special' ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/20 text-brand text-xs font-bold">
              @
            </div>
          ) : (
            <Avatar
              name={result.label}
              size="sm"
            />
          )}
          <div className="min-w-0 flex-1">
            <span className="font-medium text-smoke-100">{result.label}</span>
            {result.description && (
              <span className="ml-2 text-xs text-smoke-500">{result.description}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
