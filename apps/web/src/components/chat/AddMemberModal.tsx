'use client'

import { useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { useChatStore } from '@/stores/chat'
import { api } from '@/lib/api'

interface SearchUser {
  id: string
  fullName: string
  displayName: string | null
  avatarUrl: string | null
}

interface AddMemberModalProps {
  isOpen: boolean
  onClose: () => void
  channelId: string
}

export function AddMemberModal({ isOpen, onClose, channelId }: AddMemberModalProps) {
  const addChannelMembers = useChatStore((s) => s.addChannelMembers)
  const existingMembers = useChatStore((s) => s.channelMembers[channelId] ?? [])

  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [selected, setSelected] = useState<SearchUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingIds = new Set(existingMembers.map((m) => m.userId))

  const handleSearch = useCallback(async (query: string) => {
    setSearch(query)
    if (query.trim().length < 2) {
      setResults([])
      return
    }

    setIsSearching(true)
    try {
      const data = await api<{ data: SearchUser[] }>(`/api/users?q=${encodeURIComponent(query)}`)
      // Filter out users already in the channel or already selected
      const selectedIds = new Set(selected.map((s) => s.id))
      setResults(
        (data.data || []).filter(
          (u) => !existingIds.has(u.id) && !selectedIds.has(u.id),
        ),
      )
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [existingIds, selected])

  const handleSelect = (user: SearchUser) => {
    setSelected((prev) => [...prev, user])
    setResults((prev) => prev.filter((u) => u.id !== user.id))
    setSearch('')
  }

  const handleRemoveSelected = (userId: string) => {
    setSelected((prev) => prev.filter((u) => u.id !== userId))
  }

  const handleSubmit = async () => {
    if (selected.length === 0) return

    setIsSubmitting(true)
    setError(null)
    try {
      await addChannelMembers(channelId, selected.map((u) => u.id))
      setSelected([])
      setSearch('')
      setResults([])
      onClose()
    } catch {
      setError('Failed to add members. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setSelected([])
    setSearch('')
    setResults([])
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Members">
      <div className="space-y-4">
        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand/20 text-brand text-sm"
              >
                {user.fullName || user.displayName}
                <button
                  onClick={() => handleRemoveSelected(user.id)}
                  aria-label={`Remove ${user.fullName || user.displayName}`}
                  className="text-brand hover:text-brand-hover"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search input */}
        <Input
          placeholder="Search users by name..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          aria-label="Search users to add"
        />

        {/* Search results */}
        <div className="max-h-48 overflow-y-auto space-y-1">
          {isSearching && (
            <p className="text-center text-sm text-smoke-400 py-2">Searching...</p>
          )}

          {!isSearching && results.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelect(user)}
              className="flex items-center gap-3 w-full px-2 py-2 rounded-md hover:bg-smoke-700 transition-colors text-left"
            >
              <Avatar src={user.avatarUrl} name={user.fullName || 'User'} size="sm" />
              <span className="text-sm text-smoke-100">
                {user.fullName || user.displayName}
              </span>
            </button>
          ))}

          {!isSearching && search.trim().length >= 2 && results.length === 0 && (
            <p className="text-center text-sm text-smoke-400 py-2">No users found</p>
          )}
        </div>

        {error && (
          <p className="text-sm text-error">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-smoke-600">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={selected.length === 0}
            isLoading={isSubmitting}
          >
            Add {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
