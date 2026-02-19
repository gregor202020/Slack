'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useChatStore } from '@/stores/chat'
import { getSocket } from '@/lib/socket'
import { MAX_MESSAGE_LENGTH } from '@smoker/shared'

export function MessageComposer() {
  const sendMessage = useChatStore((s) => s.sendMessage)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const activeDmId = useChatStore((s) => s.activeDmId)
  const [body, setBody] = useState('')
  const [isSending, setIsSending] = useState(false)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current)
      }
    }
  }, [])

  const emitTyping = useCallback((isTyping: boolean) => {
    const socket = getSocket()
    const event = isTyping ? 'typing:start' : 'typing:stop'
    if (activeChannelId) {
      socket.emit(event, { channelId: activeChannelId })
    } else if (activeDmId) {
      socket.emit(event, { dmId: activeDmId })
    }
  }, [activeChannelId, activeDmId])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value)

    // Typing indicator
    emitTyping(true)
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => emitTyping(false), 2000)
  }

  const isOverLimit = body.length > MAX_MESSAGE_LENGTH
  const showCharCount = body.length > MAX_MESSAGE_LENGTH - 500

  const handleSubmit = async () => {
    const trimmed = body.trim()
    if (!trimmed || isSending || isOverLimit) return

    setIsSending(true)
    try {
      await sendMessage(trimmed)
      setBody('')
      emitTyping(false)
    } catch {
      // TODO: show error toast
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isDisabled = !activeChannelId && !activeDmId

  return (
    <div className="border-t border-smoke-600 p-4">
      <div className="flex items-end gap-2 rounded-lg bg-smoke-700 border border-smoke-600 p-2">
        <textarea
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isDisabled ? 'Select a conversation' : 'Type a message...'}
          disabled={isDisabled}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          className="flex-1 bg-transparent text-sm text-smoke-100 placeholder:text-smoke-400 resize-none focus:outline-none min-h-[36px] max-h-32"
        />
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || isSending || isDisabled || isOverLimit}
          className="shrink-0 p-1.5 rounded-md bg-brand text-white hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
      {showCharCount && (
        <p className={`text-xs mt-1 text-right ${isOverLimit ? 'text-error' : 'text-smoke-400'}`}>
          {body.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
        </p>
      )}
    </div>
  )
}
