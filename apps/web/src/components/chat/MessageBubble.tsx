'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useChatStore, type Message, type Reaction } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { EmojiPicker } from './EmojiPicker'
import { ReactionPills } from './ReactionPills'

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface MessageBubbleProps {
  message: Message
  isThreadView?: boolean
}

export function MessageBubble({ message, isThreadView = false }: MessageBubbleProps) {
  const user = useAuthStore((s) => s.user)
  const openThread = useChatStore((s) => s.openThread)
  const editMessage = useChatStore((s) => s.editMessage)
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const reactions = useChatStore((s) => s.reactions[message.id] ?? [])
  const fetchReactions = useChatStore((s) => s.fetchReactions)
  const addReaction = useChatStore((s) => s.addReaction)
  const removeReaction = useChatStore((s) => s.removeReaction)
  const currentUserId = user?.id
  const toast = useToast()

  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editBody, setEditBody] = useState(message.body)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const hasFetchedReactions = useRef(false)

  const isEdited = message.updatedAt !== message.createdAt
  const isOwner = currentUserId === message.userId
  const isAdmin = user?.orgRole === 'admin' || user?.orgRole === 'super_admin'
  const canEdit = isOwner
  const canDelete = isOwner || isAdmin

  // Fetch reactions on first render
  useEffect(() => {
    if (!hasFetchedReactions.current) {
      hasFetchedReactions.current = true
      fetchReactions(message.id)
    }
  }, [message.id, fetchReactions])

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!showEmojiPicker) return

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker])

  // Focus edit textarea
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      editRef.current.setSelectionRange(editBody.length, editBody.length)
    }
  }, [isEditing])

  const handleReply = useCallback(() => {
    openThread(message.id)
  }, [message.id, openThread])

  const handleEmojiSelect = useCallback((emoji: string) => {
    addReaction(message.id, emoji)
    setShowEmojiPicker(false)
  }, [message.id, addReaction])

  const handleReactionToggle = useCallback((emoji: string) => {
    const userReaction = reactions.find(
      (r: Reaction) => r.emoji === emoji && r.userId === currentUserId,
    )
    if (userReaction) {
      removeReaction(message.id, emoji)
    } else {
      addReaction(message.id, emoji)
    }
  }, [message.id, reactions, currentUserId, addReaction, removeReaction])

  // Edit handlers
  const handleStartEdit = () => {
    setEditBody(message.body)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditBody(message.body)
  }

  const handleSaveEdit = async () => {
    const trimmed = editBody.trim()
    if (!trimmed || trimmed === message.body) {
      handleCancelEdit()
      return
    }

    setIsSaving(true)
    try {
      await editMessage(message.id, trimmed)
      setIsEditing(false)
    } catch {
      toast.error('Failed to edit message.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    }
    if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  // Delete handlers
  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteMessage(message.id)
      setShowDeleteModal(false)
    } catch {
      toast.error('Failed to delete message.')
    } finally {
      setIsDeleting(false)
    }
  }

  const replyCount = message.threadReplyCount ?? 0

  return (
    <>
      <div className="group relative flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-smoke-800 transition-colors">
        <Avatar name={message.userId.slice(0, 8)} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-smoke-100">
              {message.userId.slice(0, 8)}
            </span>
            <span className="text-xs text-smoke-400">
              {formatTime(message.createdAt)}
            </span>
            {isEdited && (
              <span className="text-xs text-smoke-500">(edited)</span>
            )}
          </div>

          {isEditing ? (
            <div className="mt-1">
              <textarea
                ref={editRef}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                onKeyDown={handleEditKeyDown}
                rows={2}
                className="w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 py-2 text-sm text-smoke-100 placeholder:text-smoke-400 resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
              <div className="flex items-center gap-2 mt-1">
                <Button size="sm" onClick={handleSaveEdit} isLoading={isSaving}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
                <span className="text-xs text-smoke-500">
                  Esc to cancel, Enter to save
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-smoke-200 whitespace-pre-wrap break-words">
              {message.body}
            </p>
          )}

          {/* Reaction pills */}
          {reactions.length > 0 && (
            <ReactionPills
              reactions={reactions}
              currentUserId={currentUserId}
              onToggle={handleReactionToggle}
            />
          )}

          {/* Thread reply count badge */}
          {!isThreadView && replyCount > 0 && (
            <button
              onClick={handleReply}
              className="mt-1 flex items-center gap-1 text-xs text-brand hover:text-brand-hover transition-colors cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v3m-5-3l5 5m-5-5l5-5" />
              </svg>
              <span>
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </span>
            </button>
          )}
        </div>

        {/* Hover action bar */}
        {!isEditing && (
          <div className="absolute right-2 -top-3 hidden group-hover:flex items-center gap-0.5 bg-smoke-700 border border-smoke-600 rounded-md shadow-lg px-1 py-0.5">
            {/* Emoji picker button */}
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1 rounded hover:bg-smoke-600 text-smoke-400 hover:text-smoke-200 transition-colors"
                title="Add reaction"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {showEmojiPicker && (
                <EmojiPicker onSelect={handleEmojiSelect} />
              )}
            </div>

            {/* Reply button */}
            {!isThreadView && (
              <button
                onClick={handleReply}
                className="p-1 rounded hover:bg-smoke-600 text-smoke-400 hover:text-smoke-200 transition-colors"
                title="Reply in thread"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v3m-5-3l5 5m-5-5l5-5" />
                </svg>
              </button>
            )}

            {/* Edit button — owner only */}
            {canEdit && (
              <button
                onClick={handleStartEdit}
                className="p-1 rounded hover:bg-smoke-600 text-smoke-400 hover:text-smoke-200 transition-colors"
                title="Edit message"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}

            {/* Delete button — owner or admin */}
            {canDelete && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="p-1 rounded hover:bg-smoke-600 text-smoke-400 hover:text-red-400 transition-colors"
                title="Delete message"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete message"
      >
        <div className="space-y-4">
          <p className="text-sm text-smoke-300">
            Are you sure you want to delete this message? This action cannot be undone.
          </p>
          <div className="rounded-md bg-smoke-700 border border-smoke-600 p-3">
            <p className="text-sm text-smoke-200 line-clamp-3 whitespace-pre-wrap">
              {message.body}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={isDeleting}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
