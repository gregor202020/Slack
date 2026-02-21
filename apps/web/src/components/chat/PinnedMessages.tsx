'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface PinnedMessage {
  id: string
  channelId: string
  messageId: string
  pinnedBy: string
  pinnedAt: string
  pinnerName: string
  message: {
    id: string
    body: string
    userId: string
    authorName: string | null
    createdAt: string
  }
}

interface PinnedMessagesProps {
  channelId: string
  isOpen: boolean
  onClose: () => void
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function PinnedMessages({ channelId, isOpen, onClose }: PinnedMessagesProps) {
  const [pins, setPins] = useState<PinnedMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [unpinningId, setUnpinningId] = useState<string | null>(null)
  const user = useAuthStore((s) => s.user)
  const toast = useToast()

  const isAdmin = user?.orgRole === 'admin' || user?.orgRole === 'super_admin'

  const fetchPins = useCallback(async () => {
    if (!channelId) return
    setIsLoading(true)
    try {
      const data = await api<PinnedMessage[]>(`/api/channels/${channelId}/pins`)
      setPins(data)
    } catch {
      toast.error('Failed to load pinned messages.')
    } finally {
      setIsLoading(false)
    }
  }, [channelId, toast])

  useEffect(() => {
    if (isOpen) {
      fetchPins()
    }
  }, [isOpen, fetchPins])

  const handleUnpin = useCallback(async (messageId: string) => {
    setUnpinningId(messageId)
    try {
      await api(`/api/channels/${channelId}/pins/${messageId}`, {
        method: 'DELETE',
      })
      setPins((prev) => prev.filter((p) => p.messageId !== messageId))
      toast.success('Message unpinned.')
    } catch {
      toast.error('Failed to unpin message.')
    } finally {
      setUnpinningId(null)
    }
  }, [channelId, toast])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Pinned messages">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md bg-smoke-800 border-l border-smoke-600 shadow-xl flex flex-col h-full animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-smoke-600 px-6 py-4 shrink-0">
          <h2 className="text-lg font-semibold text-smoke-100">Pinned Messages</h2>
          <button
            onClick={onClose}
            aria-label="Close pinned messages"
            className="text-smoke-400 hover:text-smoke-100 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" />
            </div>
          ) : pins.length === 0 ? (
            <div className="text-center py-12">
              <svg className="h-12 w-12 mx-auto text-smoke-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <p className="text-sm text-smoke-400">No pinned messages yet.</p>
              <p className="text-xs text-smoke-500 mt-1">
                Pin important messages so they are easy to find.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pins.map((pin) => (
                <div
                  key={pin.id}
                  className="rounded-lg bg-smoke-700 border border-smoke-600 p-4"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={pin.message.authorName ?? pin.message.userId.slice(0, 8)} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-smoke-100">
                          {pin.message.authorName ?? pin.message.userId.slice(0, 8)}
                        </span>
                        <span className="text-xs text-smoke-400">
                          {formatDate(pin.message.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-smoke-200 whitespace-pre-wrap break-words mt-1 line-clamp-4">
                        {pin.message.body}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-smoke-600">
                    <span className="text-xs text-smoke-500">
                      Pinned by {pin.pinnerName} on {formatDate(pin.pinnedAt)}
                    </span>
                    {(isAdmin || pin.pinnedBy === user?.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUnpin(pin.messageId)}
                        isLoading={unpinningId === pin.messageId}
                      >
                        Unpin
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
