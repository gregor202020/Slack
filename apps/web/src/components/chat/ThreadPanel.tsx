'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '@/stores/chat'
import { useToast } from '@/hooks/useToast'
import { MessageBubble } from './MessageBubble'
import { Spinner } from '@/components/ui/Spinner'

export function ThreadPanel() {
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const threadMessages = useChatStore((s) => s.threadMessages)
  const isLoadingThread = useChatStore((s) => s.isLoadingThread)
  const messages = useChatStore((s) => s.messages)
  const closeThread = useChatStore((s) => s.closeThread)
  const sendThreadReply = useChatStore((s) => s.sendThreadReply)

  const toast = useToast()

  const [body, setBody] = useState('')
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Find the parent message
  const parentMessage = messages.find((m) => m.id === activeThreadId)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMessages])

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    try {
      await sendThreadReply(trimmed)
      setBody('')
    } catch {
      toast.error('Failed to send reply. Please try again.')
    } finally {
      setIsSending(false)
    }
  }, [body, isSending, sendThreadReply, toast])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  if (!activeThreadId) return null

  return (
    <div className="w-96 border-l border-smoke-600 flex flex-col h-full bg-smoke-900 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-smoke-600">
        <h3 className="text-sm font-semibold text-smoke-100">Thread</h3>
        <button
          onClick={closeThread}
          className="p-1 rounded hover:bg-smoke-700 text-smoke-400 hover:text-smoke-200 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Parent message */}
        {parentMessage && (
          <div className="pb-3 mb-3 border-b border-smoke-700">
            <MessageBubble message={parentMessage} isThreadView />
          </div>
        )}

        {/* Thread replies */}
        {isLoadingThread ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : threadMessages.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-smoke-400 text-sm">
            <p>No replies yet. Start the conversation.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {threadMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} isThreadView />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-smoke-600 p-3">
        <div className="flex items-end gap-2 rounded-lg bg-smoke-700 border border-smoke-600 p-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-smoke-100 placeholder:text-smoke-400 resize-none focus:outline-none min-h-[36px] max-h-24"
          />
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || isSending}
            className="shrink-0 p-1.5 rounded-md bg-brand text-white hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
